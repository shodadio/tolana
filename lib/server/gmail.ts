import "server-only";

import type { Message, Thread } from "@/lib/db";
import { cleanEmailBody, type GmailPayloadPart } from "@/lib/server/cleanEmail";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailHeader {
  name?: string | null;
  value?: string | null;
}

export interface GmailPayload extends GmailPayloadPart {
  headers?: GmailHeader[] | null;
}

export interface GmailMessage {
  id?: string | null;
  threadId?: string | null;
  labelIds?: string[] | null;
  snippet?: string | null;
  internalDate?: string | null;
  payload?: GmailPayload | null;
}

export interface GmailThread {
  id?: string | null;
  snippet?: string | null;
  historyId?: string | null;
  messages?: GmailMessage[] | null;
}

export interface GmailThreadList {
  threads?: { id?: string | null; snippet?: string | null }[] | null;
}

export interface GmailHistoryRecord {
  messagesAdded?: { message?: GmailMessage | null }[] | null;
}

export interface GmailHistoryResponse {
  history?: GmailHistoryRecord[] | null;
  historyId?: string | null;
}

export class GmailApiError extends Error {
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, details: unknown) {
    super(`Gmail API request failed with status ${status}`);
    this.name = "GmailApiError";
    this.status = status;
    this.details = details;
  }
}

/** JSON response that is never cached: mailbox contents are private. */
export function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Maps a failure onto an HTTP response. A Gmail 401 means the grant was revoked
 * or the token is unusable, so it is surfaced to the client as a 401.
 */
export function gmailErrorResponse(error: unknown, message: string): Response {
  if (error instanceof GmailApiError) {
    if (error.status === 401) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }
    console.error(message, error.status, error.details);
    return jsonResponse({ error: message, status: error.status }, 502);
  }

  console.error(message, error);
  return jsonResponse({ error: message }, 500);
}

/** Authenticated call against the Gmail REST API using a bearer token. */
export async function gmailFetch<T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);

  const response = await fetch(`${GMAIL_API}/${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new GmailApiError(response.status, body);
  }

  return body as T;
}

export interface ParsedAddress {
  name: string;
  email: string;
}

const ANGLE_ADDRESS = /^\s*"?([^"<]*)"?\s*<([^>]+)>\s*$/;

/**
 * Parses a `From` header (`"Ana Ruiz" <ana@example.com>` or `ana@example.com`)
 * into a display name and a lowercased email. Bare addresses use the address as
 * the display name so bubbles always have something to show.
 */
export function parseAddress(raw: string | null | undefined): ParsedAddress {
  const value = (raw ?? "").trim();

  if (!value) {
    return { name: "", email: "" };
  }

  const match = ANGLE_ADDRESS.exec(value);

  if (match) {
    const email = match[2].trim().toLowerCase();
    return { name: match[1].trim() || email, email };
  }

  const email = value.toLowerCase();
  return { name: email, email };
}

export function getHeader(
  headers: GmailHeader[] | null | undefined,
  name: string,
): string | null {
  const target = name.toLowerCase();

  for (const header of headers ?? []) {
    if ((header.name ?? "").toLowerCase() === target) {
      return header.value ?? null;
    }
  }

  return null;
}

function timestampOf(message: GmailMessage | undefined): number {
  const raw = message?.internalDate;
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

/** Converts one Gmail message into the row shape stored in Dexie. */
export function toStoredMessage(
  message: GmailMessage,
  viewerEmail: string | null | undefined,
): Message | null {
  if (!message.id) {
    return null;
  }

  const from = parseAddress(getHeader(message.payload?.headers, "From"));

  return {
    id: message.id,
    threadId: message.threadId ?? "",
    senderName: from.name,
    senderEmail: from.email,
    cleanBody: cleanEmailBody(message.payload),
    timestamp: timestampOf(message),
    isFromMe: Boolean(viewerEmail) && from.email === viewerEmail?.toLowerCase(),
    status: "sent",
  };
}

export interface StoredThreadResult {
  thread: Thread;
  messages: Message[];
}

/**
 * Builds a thread row plus its messages from raw Gmail messages. Delta sync only
 * receives the added messages, so `unreadCount` reflects those messages alone.
 */
export function toStoredThread(
  threadId: string,
  snippet: string | null | undefined,
  rawMessages: GmailMessage[],
  viewerEmail: string | null | undefined,
): StoredThreadResult {
  const ordered = [...rawMessages].sort(
    (a, b) => timestampOf(a) - timestampOf(b),
  );

  const messages = ordered
    .map((message) => toStoredMessage(message, viewerEmail))
    .filter((message): message is Message => message !== null);

  const latest = messages.at(-1);
  const latestRaw = ordered.at(-1);

  return {
    thread: {
      id: threadId,
      snippet: snippet ?? latest?.cleanBody ?? "",
      senderName: latest?.senderName ?? "",
      senderEmail: latest?.senderEmail ?? "",
      lastMessageTimestamp: latest?.timestamp ?? (latestRaw ? timestampOf(latestRaw) : 0),
      unreadCount: rawMessages.filter((message) =>
        (message.labelIds ?? []).includes("UNREAD"),
      ).length,
      subject: getHeader(latestRaw?.payload?.headers, "Subject") ?? "(no subject)",
    },
    messages,
  };
}
