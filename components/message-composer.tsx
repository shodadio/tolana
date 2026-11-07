"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUp } from "lucide-react";

import { sendOutgoingMessage } from "@/lib/messaging";

const MAX_TEXTAREA_HEIGHT = 128;

interface MessageComposerProps {
  threadId: string;
  to: string;
}

export function MessageComposer({ threadId, to }: MessageComposerProps) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const canSend = draft.trim().length > 0;

  function resize(element: HTMLTextAreaElement) {
    element.style.height = "auto";
    element.style.height = `${Math.min(
      element.scrollHeight,
      MAX_TEXTAREA_HEIGHT,
    )}px`;
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setDraft(event.target.value);
    resize(event.target);
  }

  async function submit() {
    const body = draft.trim();

    if (!body) {
      return;
    }

    setDraft("");

    const textarea = textareaRef.current;

    if (textarea) {
      textarea.style.height = "auto";
    }

    await sendOutgoingMessage({ threadId, body });
    textareaRef.current?.focus();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Reply"
      className="pb-safe shrink-0 border-t border-line bg-surface"
    >
      <div className="flex items-end gap-2 px-4 py-3">
        <label htmlFor="composer" className="sr-only">
          Reply to {to}
        </label>
        <textarea
          ref={textareaRef}
          id="composer"
          name="body"
          rows={1}
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Write a reply"
          enterKeyHint="send"
          autoComplete="off"
          spellCheck
          className="min-h-10 flex-1 resize-none rounded-[20px] border border-line bg-background px-3.5 py-2.5 text-[15px] leading-snug text-foreground placeholder:text-muted focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        <button
          type="submit"
          disabled={!canSend}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent text-accent-contrast transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-40"
        >
          <ArrowUp className="h-4 w-4" aria-hidden />
          <span className="sr-only">Send message</span>
        </button>
      </div>
    </form>
  );
}
