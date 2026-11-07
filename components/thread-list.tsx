"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Inbox, Plus } from "lucide-react";

import { seedDemoConversations } from "@/lib/demo-data";
import { db } from "@/lib/db";
import { formatRelativeTime, initials } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ThreadListProps {
  selectedThreadId: string | null;
  onSelectThread: (threadId: string) => void;
  onCompose: () => void;
}

export function ThreadList({
  selectedThreadId,
  onSelectThread,
  onCompose,
}: ThreadListProps) {
  const threads = useLiveQuery(
    () => db.threads.orderBy("lastMessageTimestamp").reverse().toArray(),
    [],
  );
  const [seeding, setSeeding] = useState(false);

  async function handleSeed() {
    setSeeding(true);

    try {
      await seedDemoConversations();
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {threads === undefined ? (
        <ThreadListSkeleton />
      ) : threads.length === 0 ? (
        <EmptyState seeding={seeding} onSeed={handleSeed} />
      ) : (
        <nav
          aria-label="Conversations"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-24"
        >
          <ul className="divide-y divide-line-soft">
            {threads.map((thread) => {
              const isSelected = thread.id === selectedThreadId;
              const isUnread = thread.unreadCount > 0;

              return (
                <li key={thread.id}>
                  <button
                    type="button"
                    onClick={() => onSelectThread(thread.id)}
                    aria-current={isSelected ? "true" : undefined}
                    className={cn(
                      "relative flex w-full gap-3 px-4 py-3.5 text-left transition-colors",
                      "hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
                      isSelected && "bg-surface",
                    )}
                  >
                    {isSelected && (
                      <span
                        aria-hidden
                        className="absolute inset-y-0 left-0 w-[3px] bg-accent"
                      />
                    )}

                    <span
                      aria-hidden
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft font-serif text-[13px] font-medium text-accent"
                    >
                      {initials(thread.senderName || thread.senderEmail)}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span
                          className={cn(
                            "truncate font-serif text-[15px] leading-tight",
                            isUnread ? "font-medium" : "font-normal",
                          )}
                        >
                          {thread.senderName || thread.senderEmail}
                        </span>
                        <time
                          dateTime={new Date(
                            thread.lastMessageTimestamp,
                          ).toISOString()}
                          className="shrink-0 text-[11px] tabular-nums leading-none text-muted"
                        >
                          {formatRelativeTime(thread.lastMessageTimestamp)}
                        </time>
                      </span>

                      <span className="mt-1 flex items-center gap-1.5">
                        <span
                          className={cn(
                            "truncate text-[13px] leading-snug",
                            isUnread
                              ? "font-medium text-foreground"
                              : "text-muted",
                          )}
                        >
                          {thread.subject}
                        </span>
                        {isUnread && (
                          <span className="ml-auto flex shrink-0 items-center gap-1 text-accent">
                            <span
                              aria-hidden
                              className="h-1.5 w-1.5 rounded-full bg-accent"
                            />
                            <span className="sr-only">
                              {thread.unreadCount} unread
                            </span>
                            {thread.unreadCount > 1 && (
                              <span className="text-[11px] font-medium tabular-nums">
                                {thread.unreadCount}
                              </span>
                            )}
                          </span>
                        )}
                      </span>

                      <span className="mt-0.5 line-clamp-1 text-[13px] leading-snug text-muted">
                        {thread.snippet}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      )}

      <button
        type="button"
        onClick={onCompose}
        title="New message"
        className="absolute bottom-4 right-4 grid h-12 w-12 place-items-center rounded-full bg-accent text-accent-contrast shadow-lg shadow-black/20 transition-transform hover:opacity-90 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-panel md:bottom-5 md:right-5"
      >
        <Plus className="h-5 w-5" aria-hidden />
        <span className="sr-only">New message</span>
      </button>
    </div>
  );
}

function EmptyState({
  seeding,
  onSeed,
}: {
  seeding: boolean;
  onSeed: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
      <Inbox className="h-6 w-6 text-muted" aria-hidden strokeWidth={1.5} />
      <div className="space-y-1.5">
        <h2 className="font-serif text-[17px] font-medium">
          No conversations yet
        </h2>
        <p className="mx-auto max-w-[28ch] text-[13px] leading-relaxed text-muted">
          Threads appear here once the inbox syncs. Sample conversations show
          how threads and messages render.
        </p>
      </div>
      <button
        type="button"
        onClick={onSeed}
        disabled={seeding}
        className="rounded-full bg-accent px-4 py-2 text-[13px] font-medium text-accent-contrast transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
      >
        {seeding ? "Adding samples…" : "Load sample conversations"}
      </button>
    </div>
  );
}

function ThreadListSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading conversations"
      className="min-h-0 flex-1 space-y-4 p-4"
    >
      {[0, 1, 2, 3, 4].map((row) => (
        <div
          key={row}
          className="flex animate-pulse gap-3 motion-reduce:animate-none"
        >
          <div className="h-10 w-10 shrink-0 rounded-full bg-line-soft" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-2.5 w-1/3 rounded-full bg-line-soft" />
            <div className="h-2.5 w-2/3 rounded-full bg-line-soft" />
          </div>
        </div>
      ))}
    </div>
  );
}
