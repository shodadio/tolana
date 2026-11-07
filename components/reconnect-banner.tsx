"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { CircleAlert } from "lucide-react";

/**
 * Shown when the stored Google grant can no longer be used: the refresh token
 * failed server-side, or a Gmail route answered 401.
 */
export function ReconnectBanner() {
  const [pending, setPending] = useState(false);

  async function handleReconnect() {
    setPending(true);

    try {
      await signIn("google", { redirectTo: "/" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      role="status"
      className="shrink-0 border-b border-amber-500/40 bg-amber-500/10"
    >
      <div className="flex items-center gap-2.5 px-4 py-2.5 md:px-6">
        <CircleAlert
          className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
        <p className="min-w-0 flex-1 text-[12px] leading-snug text-foreground">
          Gmail access has expired. Sign in again to keep syncing and sending.
        </p>
        <button
          type="button"
          onClick={() => void handleReconnect()}
          disabled={pending}
          className="shrink-0 rounded-full bg-foreground px-3 py-1.5 text-[12px] font-medium leading-none text-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
        >
          {pending ? "Opening…" : "Reconnect"}
        </button>
      </div>
    </div>
  );
}
