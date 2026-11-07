import { db, type Message, type Thread } from "@/lib/db";
import { publishSync } from "@/lib/sync-store";

const SNIPPET_LENGTH = 120;
const PENDING_PREFIX = "pending-";

function pendingId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${PENDING_PREFIX}${crypto.randomUUID()}`;
  }

  return `${PENDING_PREFIX}${Date.now().toString(36)}`;
}

function pendingThreadId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `pending-thread-${crypto.randomUUID()}`;
  }

  return `pending-thread-${Date.now().toString(36)}`;
}

interface SendResponse {
  realMessageId?: string;
  realThreadId?: string | null;
}

async function postSend(payload: unknown): Promise<SendResponse> {
  const response = await fetch("/api/gmail/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (response.status === 401) {
    publishSync({ status: "unauthorized" });
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    throw new Error(`Send failed with status ${response.status}`);
  }

  return (await response.json()) as SendResponse;
}

/**
 * Posts an existing-thread reply and reconciles the local copy: the pending id
 * is swapped for Gmail's message id once the send lands, and the row is flagged
 * "failed" (body intact) when it does not.
 */
async function deliver(message: Message): Promise<void> {
  const thread = await db.threads.get(message.threadId);

  try {
    const data = await postSend({
      threadId: message.threadId,
      to: thread?.senderEmail ?? "",
      subject: thread?.subject ?? "",
      body: message.cleanBody,
    });

    const finalId = data.realMessageId || message.id;

    await db.transaction("rw", db.messages, async () => {
      if (finalId !== message.id) {
        await db.messages.delete(message.id);
      }

      await db.messages.put({ ...message, id: finalId, status: "sent" });
    });
  } catch (error) {
    console.error("Message send failed:", error);
    await db.messages.update(message.id, { status: "failed" });
  }
}

/**
 * Sends a brand-new message: no thread metadata, no In-Reply-To. Once Gmail
 * answers with the real thread and message ids the placeholder rows are
 * rewritten so later syncs merge into the same conversation.
 */
async function deliverNew(
  thread: Thread,
  message: Message,
): Promise<string> {
  try {
    const data = await postSend({
      to: thread.senderEmail,
      subject: thread.subject,
      body: message.cleanBody,
    });

    const finalId = data.realMessageId || message.id;
    const finalThreadId = data.realThreadId || thread.id;

    await db.transaction("rw", db.threads, db.messages, async () => {
      await db.messages.delete(message.id);
      await db.messages.put({
        ...message,
        id: finalId,
        threadId: finalThreadId,
        status: "sent",
      });
      await db.threads.delete(thread.id);
      await db.threads.put({ ...thread, id: finalThreadId });
    });

    return finalThreadId;
  } catch (error) {
    console.error("New message send failed:", error);
    await db.messages.update(message.id, { status: "failed" });
    return thread.id;
  }
}

export interface OutgoingMessage {
  threadId: string;
  body: string;
}

/**
 * Writes the message to IndexedDB first so it appears in the thread
 * immediately, then hands it to the network in the background.
 * `senderEmail` stays empty until sync returns the canonical message.
 */
export async function sendOutgoingMessage({
  threadId,
  body,
}: OutgoingMessage): Promise<void> {
  const cleanBody = body.trim();

  if (!cleanBody) {
    return;
  }

  const timestamp = Date.now();

  const message: Message = {
    id: pendingId(),
    threadId,
    senderName: "You",
    senderEmail: "",
    cleanBody,
    timestamp,
    isFromMe: true,
    status: "sending",
  };

  await db.transaction("rw", db.threads, db.messages, async () => {
    await db.messages.add(message);
    await db.threads.update(threadId, {
      snippet: cleanBody.slice(0, SNIPPET_LENGTH),
      lastMessageTimestamp: timestamp,
    });
  });

  await deliver(message);
}

export interface NewMessage {
  to: string;
  subject: string;
  body: string;
}

/**
 * Starts a conversation from scratch. The thread row is created locally with a
 * placeholder id so the list and pane fill immediately; returns the id to open.
 */
export async function sendNewMessage({
  to,
  subject,
  body,
}: NewMessage): Promise<string> {
  const cleanTo = to.trim();
  const cleanSubject = subject.trim() || "(no subject)";
  const cleanBody = body.trim();

  if (!cleanTo.includes("@") || !cleanBody) {
    throw new Error("A recipient and a message body are required");
  }

  const timestamp = Date.now();
  const threadId = pendingThreadId();

  const thread: Thread = {
    id: threadId,
    snippet: cleanBody.slice(0, SNIPPET_LENGTH),
    senderName: cleanTo,
    senderEmail: cleanTo,
    lastMessageTimestamp: timestamp,
    unreadCount: 0,
    subject: cleanSubject,
  };

  const message: Message = {
    id: pendingId(),
    threadId,
    senderName: "You",
    senderEmail: "",
    cleanBody,
    timestamp,
    isFromMe: true,
    status: "sending",
  };

  await db.transaction("rw", db.threads, db.messages, async () => {
    await db.threads.put(thread);
    await db.messages.add(message);
  });

  return await deliverNew(thread, message);
}

/**
 * Re-runs delivery for a message parked in the "failed" state. A message from a
 * brand-new conversation has no Gmail thread yet, so it goes back through the
 * new-message path instead of being sent as a reply.
 */
export async function retryOutgoingMessage(message: Message): Promise<void> {
  await db.messages.update(message.id, { status: "sending" });

  const thread = await db.threads.get(message.threadId);

  if (message.threadId.startsWith("pending-thread-") && thread) {
    await deliverNew(thread, { ...message, status: "sending" });
    return;
  }

  await deliver({ ...message, status: "sending" });
}
