import { createClient } from "@supabase/supabase-js";

/**
 * A client with the service role: it bypasses RLS. Server only, and only for jobs that act for the system
 * (the notification dispatcher), never for a request that a user could steer.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("push dispatcher needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, { auth: { persistSession: false } });
}
