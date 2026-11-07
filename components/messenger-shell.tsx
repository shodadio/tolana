"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

import { MessagePane } from "@/components/message-pane";
import { NewMessageSheet } from "@/components/new-message-sheet";
import { ReconnectBanner } from "@/components/reconnect-banner";
import { SignInScreen } from "@/components/sign-in-screen";
import { SyncEngine } from "@/components/sync-engine";
import { ThreadList } from "@/components/thread-list";
import { formatRelativeTime, initials } from "@/lib/format";
import { markThreadRead } from "@/lib/read-state";
import { runSync } from "@/lib/sync";
import { useSyncSnapshot } from "@/lib/sync-store";
import { cn } from "@/lib/utils";

export interface SessionUser {
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

interface MessengerShellProps {
  user: SessionUser | null;
  authError?: boolean;
}

export function MessengerShell({
  user,
  authError = false,
}: MessengerShellProps) {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const { status, lastSyncedAt } = useSyncSnapshot();

  function openThread(threadId: string) {
    setSelectedThreadId(threadId);
    void markThreadRead(threadId);
  }

  if (!user) {
    return <SignInScreen />;
  }

  // Either the JWT could not be refreshed server-side, or a Gmail route
  // rejected the stored token: both mean the grant needs renewed consent.
  const needsReconnect = authError || status === "unauthorized";

  const syncLabel =
    status === "syncing"
      ? "Syncing…"
      : status === "error"
        ? "Retry sync"
        : lastSyncedAt
          ? `Synced ${formatRelativeTime(lastSyncedAt)}`
          : "Sync now";

  return (
    <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background text-foreground">
      <SyncEngine />

      <header className="pt-safe shrink-0 border-b border-line bg-surface">
        <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <span className="font-serif text-[19px] font-medium leading-none tracking-tight">
              Tolana
            </span>
            <span className="hidden text-[12px] leading-none text-muted sm:inline">
              mail, as conversation
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {!needsReconnect && (
              <button
                type="button"
                onClick={() => void runSync()}
                disabled={status === "syncing"}
                title="Sync the inbox from Gmail"
                className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] leading-none text-muted transition-colors hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-70"
              >
                <span
                  aria-hidden
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    status === "error" ? "bg-amber-500" : "bg-accent",
                    status === "syncing" &&
                      "animate-pulse motion-reduce:animate-none",
                  )}
                />
                <span aria-live="polite">{syncLabel}</span>
              </button>
            )}

            <div className="flex items-center gap-2 border-l border-line pl-2">
              {user.image ? (
                // Remote Google avatar; next/image would need a remotePatterns
                // entry for this one 28px image.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.image}
                  alt=""
                  width={28}
                  height={28}
                  referrerPolicy="no-referrer"
                  className="h-7 w-7 shrink-0 rounded-full border border-line object-cover"
                />
              ) : (
                <span
                  aria-hidden
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft font-serif text-[11px] font-medium text-accent"
                >
                  {initials(user.name || user.email || "?")}
                </span>
              )}

              <span className="hidden max-w-[16ch] truncate text-[11px] leading-none text-muted sm:inline">
                {user.email}
              </span>

              <button
                type="button"
                onClick={() => void signOut({ redirectTo: "/" })}
                title="Sign out"
                className="grid h-7 w-7 place-items-center rounded-full text-muted transition-colors hover:bg-accent-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                <span className="sr-only">Sign out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {needsReconnect && <ReconnectBanner />}

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "min-h-0 w-full flex-col bg-panel md:flex md:w-[21rem] md:border-r md:border-line",
            selectedThreadId ? "hidden" : "flex",
          )}
        >
          <ThreadList
            selectedThreadId={selectedThreadId}
            onSelectThread={openThread}
            onCompose={() => setComposing(true)}
          />
        </aside>

        <main
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col",
            selectedThreadId ? "flex" : "hidden md:flex",
          )}
        >
          <MessagePane
            threadId={selectedThreadId}
            onBack={() => setSelectedThreadId(null)}
          />
        </main>
      </div>

      <NewMessageSheet
        open={composing}
        onClose={() => setComposing(false)}
        onCreated={(threadId) => {
          setComposing(false);
          setSelectedThreadId(threadId);
        }}
      />
    </div>
  );
}
