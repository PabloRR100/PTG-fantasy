"use client";

import { useState } from "react";
import { initialsOf } from "@/lib/avatar";

/** Profile photo, or the team's initials when there is no photo or it fails to load. */
export function Avatar({ url, name, size }: { url: string | null; name: string; size: "xs" | "sm" | "lg" }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={`avatar avatar-${size}`}>
      {url && !failed ? (
        // referrerPolicy: Google's photo host rejects some cross-site referrers.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden="true">{initialsOf(name)}</span>
      )}
    </span>
  );
}
