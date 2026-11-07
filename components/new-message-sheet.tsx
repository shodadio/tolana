"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";

import { sendNewMessage } from "@/lib/messaging";

interface NewMessageSheetProps {
  open: boolean;
  onClose: () => void;
  onCreated: (threadId: string) => void;
}

/**
 * Bottom sheet on phones, centred card above `md`. Sending writes the thread
 * and message to Dexie before the request leaves, so the conversation opens
 * immediately with the message marked "sending".
 */
export function NewMessageSheet({
  open,
  onClose,
  onCreated,
}: NewMessageSheetProps) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const toRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const focus = window.setTimeout(() => toRef.current?.focus(), 0);

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKey);

    return () => {
      window.clearTimeout(focus);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const canSend =
    to.includes("@") && body.trim().length > 0 && !sending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSend) {
      return;
    }

    setSending(true);

    try {
      const threadId = await sendNewMessage({ to, subject, body });
      setTo("");
      setSubject("");
      setBody("");
      onCreated(threadId);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New message"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 md:items-center md:p-6"
    >
      <form
        onSubmit={handleSubmit}
        className="pb-safe w-full max-w-[32rem] rounded-t-[22px] border border-line bg-surface shadow-2xl md:rounded-[22px] md:pb-0"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-serif text-[16px] font-medium">New message</h2>
          <button
            type="button"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-accent-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="h-4 w-4" aria-hidden />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div className="space-y-3 px-4 py-3">
          <div>
            <label
              htmlFor="compose-to"
              className="text-[11px] font-medium uppercase tracking-wide text-muted"
            >
              To
            </label>
            <input
              ref={toRef}
              id="compose-to"
              type="email"
              required
              value={to}
              onChange={(event) => setTo(event.target.value)}
              placeholder="ana@example.com"
              autoComplete="email"
              className="mt-1 w-full rounded-xl border border-line bg-background px-3 py-2.5 text-[15px] text-foreground placeholder:text-muted focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </div>

          <div>
            <label
              htmlFor="compose-subject"
              className="text-[11px] font-medium uppercase tracking-wide text-muted"
            >
              Subject
            </label>
            <input
              id="compose-subject"
              type="text"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Deck review"
              className="mt-1 w-full rounded-xl border border-line bg-background px-3 py-2.5 text-[15px] text-foreground placeholder:text-muted focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </div>

          <div>
            <label
              htmlFor="compose-body"
              className="text-[11px] font-medium uppercase tracking-wide text-muted"
            >
              Message
            </label>
            <textarea
              id="compose-body"
              rows={4}
              required
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Write your message"
              className="mt-1 w-full resize-none rounded-xl border border-line bg-background px-3 py-2.5 text-[15px] leading-snug text-foreground placeholder:text-muted focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-[13px] font-medium text-muted hover:bg-accent-soft hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSend}
            className="rounded-full bg-accent px-5 py-2 text-[13px] font-medium text-accent-contrast transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-40"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}
