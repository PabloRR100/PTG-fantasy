/**
 * Web Push implementation using native Web Crypto API (no npm deps).
 * Implements VAPID signing (RFC 8292) + aes128gcm payload encryption (RFC 8291).
 */

type PushSubscription = {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** Push gateway rejection, carrying the HTTP status so callers can branch on it
 *  instead of pattern-matching a human-readable message. */
export class PushError extends Error {
  readonly status: number
  constructor(status: number, body: string) {
    super(`Push failed ${status}: ${body}`)
    this.name = 'PushError'
    this.status = status
  }
}

// ─── Encoding helpers ─────────────────────────────────────────────────────────

function b64uDecode(s: string): Uint8Array {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : ''
  return Uint8Array.from(
    atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad),
    c => c.charCodeAt(0),
  )
}

function b64uEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const a of arrays) { out.set(a, offset); offset += a.length }
  return out
}

// ─── HMAC-SHA256 ──────────────────────────────────────────────────────────────

// TypeScript 5.x requires ArrayBuffer (not SharedArrayBuffer) for Web Crypto APIs.
// All Uint8Arrays here come from new Uint8Array() or slice(), so this cast is safe.
const asAB = (u: Uint8Array): ArrayBuffer =>
  u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    'raw', asAB(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, asAB(data)))
}

// HKDF-Expand T(1): HMAC(PRK, info || 0x01)   (sufficient for output ≤ 32 bytes)
async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  return (await hmac(prk, concat(info, new Uint8Array([0x01])))).slice(0, length)
}

// ─── VAPID JWT (RFC 8292) ─────────────────────────────────────────────────────

export async function createVAPIDToken(
  audience: string,
  subject: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
): Promise<string> {
  const enc = (s: string) => b64uEncode(new TextEncoder().encode(s))
  const header = enc(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))
  const payload = enc(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 43200, // 12 h
    sub: subject,
  }))
  const sigInput = `${header}.${payload}`

  // VAPID keys from web-push are base64url: pubkey = 0x04 | x(32) | y(32), privkey = d(32)
  const pub = b64uDecode(vapidPublicKey)
  const priv = b64uDecode(vapidPrivateKey)

  const key = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC', crv: 'P-256',
      x: b64uEncode(pub.slice(1, 33)),
      y: b64uEncode(pub.slice(33, 65)),
      d: b64uEncode(priv),
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )

  // Web Crypto returns raw r||s (64 bytes) — exactly what JWT ES256 needs
  const sigInputBytes = new TextEncoder().encode(sigInput)
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    asAB(sigInputBytes),
  )

  return `${sigInput}.${b64uEncode(sig)}`
}

// ─── RFC 8291 aes128gcm payload encryption ───────────────────────────────────

async function encryptPushPayload(
  plaintext: string,
  subscription: PushSubscription,
): Promise<{ body: Uint8Array }> {
  const uaPublic = b64uDecode(subscription.keys.p256dh)   // subscriber P-256 public key
  const authSecret = b64uDecode(subscription.keys.auth)   // 16-byte auth secret

  // Ephemeral ECDH key pair (app server side)
  const serverKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'],
  )
  const serverPublic = new Uint8Array(
    await crypto.subtle.exportKey('raw', serverKeyPair.publicKey),
  ) // 65 bytes uncompressed

  // ECDH shared secret
  const uaKey = await crypto.subtle.importKey(
    'raw', asAB(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  )
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'ECDH', public: uaKey }, serverKeyPair.privateKey, 256,
    ),
  )

  // RFC 8291 §3.3 two-step HKDF key derivation
  // Step 1: IKM = HKDF(salt=auth_secret, IKM=ecdh_secret, info="WebPush: info\x00" || ua_public || as_public, L=32)
  const prkKey = await hmac(authSecret, ecdhSecret) // HKDF-Extract
  const keyInfo = concat(
    new TextEncoder().encode('WebPush: info\x00'),
    uaPublic,
    serverPublic,
  )
  const ikm = await hkdfExpand(prkKey, keyInfo, 32) // HKDF-Expand

  // Step 2: derive CEK and NONCE from salt + IKM
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const prk = await hmac(salt, ikm) // HKDF-Extract

  const cek = await hkdfExpand(
    prk,
    new TextEncoder().encode('Content-Encoding: aes128gcm\x00'),
    16,
  )
  const nonce = await hkdfExpand(
    prk,
    new TextEncoder().encode('Content-Encoding: nonce\x00'),
    12,
  )

  // Encrypt: content + 0x02 (padding delimiter for last/only record)
  const cekKey = await crypto.subtle.importKey('raw', asAB(cek), { name: 'AES-GCM' }, false, ['encrypt'])
  const recordPlaintext = concat(new TextEncoder().encode(plaintext), new Uint8Array([0x02]))
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: asAB(nonce) }, cekKey, asAB(recordPlaintext)),
  )

  // aes128gcm content header: salt(16) + rs(4 BE) + keylen(1) + server_public(65)
  const header = new Uint8Array(16 + 4 + 1 + 65)
  header.set(salt, 0)
  new DataView(header.buffer).setUint32(16, 4096, false) // rs = 4096 (well above payload)
  header[20] = 65                                         // keylen
  header.set(serverPublic, 21)

  return { body: concat(header, ciphertext) }
}

// ─── Main send function ───────────────────────────────────────────────────────

export async function sendWebPush(
  subscription: PushSubscription,
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
  vapidSubject: string,
): Promise<void> {
  const endpoint = new URL(subscription.endpoint)
  const audience = `${endpoint.protocol}//${endpoint.host}`

  const [token, { body }] = await Promise.all([
    createVAPIDToken(audience, vapidSubject, vapidPublicKey, vapidPrivateKey),
    encryptPushPayload(payload, subscription),
  ])

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
      'Authorization': `vapid t=${token},k=${vapidPublicKey}`,
    },
    body: asAB(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    // Typed, with the status as a field. Callers used to classify by substring
    // (`msg.includes('410')`) over a message that interpolates the GATEWAY'S
    // response body — so a `Push failed 400: {"trace":"…a410b…"}` could be read as
    // a 410. That was harmless while the 410 cleanup silently matched nothing;
    // once the delete actually worked it became "permanently remove a live
    // subscription". (Betcomm incident 022.)
    throw new PushError(res.status, text)
  }
}
