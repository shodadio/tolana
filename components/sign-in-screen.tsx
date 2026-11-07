"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

export function SignInScreen() {
  const [pending, setPending] = useState(false);

  async function handleSignIn() {
    setPending(true);

    try {
      await signIn("google", { redirectTo: "/" });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      <main className="pt-safe pb-safe flex flex-1 flex-col items-center justify-center gap-10 px-8 text-center">
        <div className="space-y-3">
          <h1 className="font-serif text-[34px] font-medium leading-none tracking-tight">
            Tolana
          </h1>
          <p className="mx-auto max-w-[26ch] text-[15px] leading-relaxed text-muted">
            Your inbox, read as conversations. Sign in with Google to bring in
            your threads.
          </p>
        </div>

        <div className="w-full max-w-[20rem] space-y-4">
          <button
            type="button"
            onClick={() => void handleSignIn()}
            disabled={pending}
            className="flex w-full items-center justify-center gap-3 rounded-full border border-line bg-surface px-5 py-3.5 text-[15px] font-medium text-foreground transition-colors hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
          >
            <span
              aria-hidden
              className="grid h-6 w-6 place-items-center rounded-full bg-foreground font-serif text-[12px] leading-none text-background"
            >
              G
            </span>
            {pending ? "Opening Google…" : "Sign in with Google"}
          </button>

          <p className="text-[11px] leading-relaxed text-muted">
            Needs Gmail read and send access. Sign-in is handled by Google.
          </p>
        </div>
      </main>
    </div>
  );
}
