import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// We need real Web Crypto for the actual P-256/ECDH/AES operations.
// Node.js >=16 has globalThis.crypto built-in (Web Crypto).
// We mock only fetch to test sendWebPush end-to-end.
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

import { createVAPIDToken, sendWebPush } from "@/lib/webpush";

// ---------------------------------------------------------------------------
// Generate real P-256 key pair for tests (base64url encoded)
// ---------------------------------------------------------------------------

function b64uEncode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

async function generateTestVAPIDKeys(): Promise<{
  publicKey: string;
  privateKey: string;
}> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const pubRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", keyPair.publicKey)
  ); // 65 bytes: 0x04 || x(32) || y(32)
  const jwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  // VAPID private key = raw d parameter (32 bytes, base64url)
  return {
    publicKey: b64uEncode(pubRaw),
    privateKey: jwk.d!,
  };
}

async function generateTestSubscriptionKeys(): Promise<{
  p256dh: string;
  auth: string;
}> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const pubRaw = new Uint8Array(
    await crypto.subtle.exportKey("raw", keyPair.publicKey)
  );
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    p256dh: b64uEncode(pubRaw),
    auth: b64uEncode(auth),
  };
}

// ---------------------------------------------------------------------------
// createVAPIDToken
// ---------------------------------------------------------------------------

describe("createVAPIDToken", () => {
  it("creates a valid JWT with three base64url-encoded parts", async () => {
    const { publicKey, privateKey } = await generateTestVAPIDKeys();

    const token = await createVAPIDToken(
      "https://push.example.com",
      "mailto:admin@betcomm.app",
      publicKey,
      privateKey
    );

    const parts = token.split(".");
    expect(parts).toHaveLength(3);

    // Decode header
    const header = JSON.parse(
      atob(parts[0].replace(/-/g, "+").replace(/_/g, "/"))
    );
    expect(header.typ).toBe("JWT");
    expect(header.alg).toBe("ES256");

    // Decode payload
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
    expect(payload.aud).toBe("https://push.example.com");
    expect(payload.sub).toBe("mailto:admin@betcomm.app");
    expect(payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("sets expiration to ~12 hours in the future", async () => {
    const { publicKey, privateKey } = await generateTestVAPIDKeys();

    const token = await createVAPIDToken(
      "https://push.example.com",
      "mailto:admin@betcomm.app",
      publicKey,
      privateKey
    );

    const payload = JSON.parse(
      atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
    const now = Math.floor(Date.now() / 1000);
    // Should be within 12h +/- 60s tolerance
    expect(payload.exp).toBeGreaterThanOrEqual(now + 43200 - 60);
    expect(payload.exp).toBeLessThanOrEqual(now + 43200 + 60);
  });
});

// ---------------------------------------------------------------------------
// sendWebPush — end-to-end with real crypto but mocked fetch
// ---------------------------------------------------------------------------

describe("sendWebPush", () => {
  it("sends an encrypted push and succeeds with 201", async () => {
    const { publicKey, privateKey } = await generateTestVAPIDKeys();
    const subKeys = await generateTestSubscriptionKeys();

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 201,
    } as Response);

    await sendWebPush(
      {
        endpoint: "https://push.example.com/send/abc123",
        keys: subKeys,
      },
      JSON.stringify({ title: "Test", body: "Hello" }),
      publicKey,
      privateKey,
      "mailto:admin@betcomm.app"
    );

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(url).toBe("https://push.example.com/send/abc123");
    expect((opts as RequestInit).method).toBe("POST");
    const headers = (opts as RequestInit).headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/octet-stream");
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers["TTL"]).toBe("86400");
    expect(headers["Authorization"]).toMatch(/^vapid t=.+,k=.+$/);
    // Body should be an ArrayBuffer
    expect((opts as RequestInit).body).toBeInstanceOf(ArrayBuffer);
  });

  it("throws when push endpoint returns non-ok", async () => {
    const { publicKey, privateKey } = await generateTestVAPIDKeys();
    const subKeys = await generateTestSubscriptionKeys();

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 410,
      text: () => Promise.resolve("Gone"),
    } as unknown as Response);

    await expect(
      sendWebPush(
        {
          endpoint: "https://push.example.com/send/abc123",
          keys: subKeys,
        },
        "test payload",
        publicKey,
        privateKey,
        "mailto:admin@betcomm.app"
      )
    ).rejects.toThrow("Push failed 410: Gone");
  });

  it("throws when push endpoint returns non-ok and text() fails", async () => {
    const { publicKey, privateKey } = await generateTestVAPIDKeys();
    const subKeys = await generateTestSubscriptionKeys();

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.reject(new Error("cannot read body")),
    } as unknown as Response);

    await expect(
      sendWebPush(
        {
          endpoint: "https://push.example.com/send/abc123",
          keys: subKeys,
        },
        "test payload",
        publicKey,
        privateKey,
        "mailto:admin@betcomm.app"
      )
    ).rejects.toThrow("Push failed 500:");
  });

  it("constructs correct audience from endpoint URL", async () => {
    const { publicKey, privateKey } = await generateTestVAPIDKeys();
    const subKeys = await generateTestSubscriptionKeys();

    vi.mocked(globalThis.fetch).mockResolvedValue({
      ok: true,
      status: 201,
    } as Response);

    await sendWebPush(
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/some-token",
        keys: subKeys,
      },
      "{}",
      publicKey,
      privateKey,
      "mailto:admin@betcomm.app"
    );

    // The Authorization header should contain a JWT whose audience is https://fcm.googleapis.com
    const headers = (vi.mocked(globalThis.fetch).mock.calls[0][1] as RequestInit)
      .headers as Record<string, string>;
    const authHeader = headers["Authorization"];
    // Extract the JWT token
    const jwtMatch = authHeader.match(/vapid t=([^,]+)/);
    expect(jwtMatch).not.toBeNull();
    const jwt = jwtMatch![1];
    const payload = JSON.parse(
      atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
    expect(payload.aud).toBe("https://fcm.googleapis.com");
  });

  it("encrypts different payloads to different ciphertexts", async () => {
    const { publicKey, privateKey } = await generateTestVAPIDKeys();
    const subKeys = await generateTestSubscriptionKeys();

    const bodies: ArrayBuffer[] = [];

    vi.mocked(globalThis.fetch).mockImplementation(async (_url, opts) => {
      bodies.push((opts as RequestInit).body as ArrayBuffer);
      return { ok: true, status: 201 } as Response;
    });

    await sendWebPush(
      { endpoint: "https://push.example.com/send/1", keys: subKeys },
      "payload-1",
      publicKey,
      privateKey,
      "mailto:admin@betcomm.app"
    );

    await sendWebPush(
      { endpoint: "https://push.example.com/send/1", keys: subKeys },
      "payload-2",
      publicKey,
      privateKey,
      "mailto:admin@betcomm.app"
    );

    // Due to random ephemeral keys and salt, bodies should differ
    expect(bodies).toHaveLength(2);
    const b1 = new Uint8Array(bodies[0]);
    const b2 = new Uint8Array(bodies[1]);
    // Extremely unlikely to be equal with random salt/keys
    const same = b1.length === b2.length && b1.every((v, i) => v === b2[i]);
    expect(same).toBe(false);
  });
});
