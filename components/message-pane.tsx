"use client";

import { useEffect, useMemo, useRef } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ChevronLeft, CircleAlert, MailOpen } from "lucide-react";

import { MessageComposer } from "@/components/message-composer";
import { db, type Message } from "@/lib/db";
import { formatClockTime, formatDayLabel, initials } from "@/lib/format";
import { retryOutgoingMessage } from "@/lib/messaging";
import { cn } from "@/lib/utils";

interface MessagePaneProps {
  threadId: string | null;
  onBack: () => void;
}

type PaneItem =
  | { kind: "day"; key: string; label: string }
  | { kind: "message"; key: string; message: Message };

function groupByDay(messages: Message[]): PaneItem[] {
  const items: PaneItem[] = [];
  let currentDay = "";

  for (const message of messages) {
    const label = formatDayLabel(message.timestamp);

    if (label !== currentDay) {
      currentDay = label;
      items.push({ kind: "day", key: `day-${message.id}`, label });
    }

    items.push({ kind: "message", key: message.id, message });
  }

  return items;
}

export function MessagePane({ threadId, onBack }: MessagePaneProps) {
  const thread = useLiveQuery(
    () => (threadId ? db.threads.get(threadId) : undefined),
    [threadId],
  );

  const messages = useLiveQuery(
    () =>
      threadId
        ? db.messages.where("threadId").equals(threadId).sortBy("timestamp")
        : [],
    [threadId],
  );

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = scrollRef.current;

    if (element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [threadId, messages?.length]);

  const items = useMemo(() => groupByDay(messages ?? []), [messages]);

  if (!threadId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <MailOpen className="h-6 w-6 text-muted" aria-hidden strokeWidth={1.5} />
        <h2 className="font-serif text-[17px] font-medium">
          Choose a conversation
        </h2>
        <p className="max-w-[30ch] text-[13px] leading-relaxed text-muted">
          Threads and messages render from the copy saved on this device.
        </p>
      </div>
    );
  }

  if (!thread) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-[13px] text-muted">
        Loading conversation…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-3">
        <button
          type="button"
          onClick={onBack}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-foreground hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent md:hidden"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          <span className="sr-only">Back to conversations</span>
        </button>

        <span
          aria-hidden
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft font-serif text-[12px] font-medium text-accent"
        >
          {initials(thread.senderName || thread.senderEmail)}
        </span>

        <div className="min-w-0">
          <h1 className="truncate font-serif text-[16px] font-medium leading-tight">
            {thread.subject}
          </h1>
          <p className="truncate text-[12px] leading-tight text-muted">
            {thread.senderEmail}
          </p>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4"
      >
        {items.length === 0 ? (
          <p className="mx-auto mt-10 max-w-[28ch] text-center text-[13px] leading-relaxed text-muted">
            No messages in this thread yet.
          </p>
        ) : (
          <ul className="mx-auto flex max-w-[68ch] flex-col gap-2">
            {items.map((item) =>
              item.kind === "day" ? (
                <li
                  key={item.key}
                  className="my-3 flex items-center gap-3 first:mt-0"
                >
                  <span aria-hidden className="h-px flex-1 bg-line" />
                  <span className="font-serif text-[11px] leading-none text-muted">
                    {item.label}
                  </span>
                  <span aria-hidden className="h-px flex-1 bg-line" />
                </li>
              ) : (
                <li key={item.key}>
                  <Bubble message={item.message} />
                </li>
              ),
            )}
          </ul>
        )}
      </div>

      <MessageComposer threadId={thread.id} to={thread.senderEmail} />
    </div>
  );
}

function Bubble({ message }: { message: Message }) {
  const isMine = message.isFromMe;

  return (
    <div
      className={cn(
        "flex flex-col",
        isMine ? "items-end" : "items-start",
      )}
    >
      {!isMine && (
        <span className="mb-1 px-1 font-serif text-[11px] leading-none text-muted">
          {message.senderName || message.senderEmail}
        </span>
      )}

      <div
        className={cn(
          "max-w-[85%] whitespace-pre-line px-3.5 py-2.5 text-[15px] leading-[1.45]",
          isMine
            ? "rounded-[18px] rounded-br-[6px] bg-bubble-out text-bubble-ink"
            : "rounded-[18px] rounded-bl-[6px] border border-line bg-bubble-in text-foreground",
        )}
      >
        {message.cleanBody || (
          <span className="text-[13px] italic text-muted">Empty message</span>
        )}
      </div>

      <div
        className={cn(
          "mt-1 flex items-center gap-1.5 px-1 text-[11px] leading-none tabular-nums text-muted",
          isMine && "flex-row-reverse",
        )}
      >
        <time dateTime={new Date(message.timestamp).toISOString()}>
          {formatClockTime(message.timestamp)}
        </time>
        {message.status === "sending" && <span>Sending…</span>}
        {message.status === "failed" && (
          <span className="flex items-center gap-1 text-red-700 dark:text-red-400">
            <CircleAlert className="h-3 w-3" aria-hidden />
            Not sent
          </span>
        )}
        {isMine && message.status === "failed" && (
          <button
            type="button"
            onClick={() => void retryOutgoingMessage(message)}
            className="rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-foreground hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
