import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Only same-site paths: an open redirect here would turn the login into a phishing relay. */
function safeRedirect(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safeRedirect(searchParams.get("redirect"))}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
