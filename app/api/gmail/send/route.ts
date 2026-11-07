import type { NextRequest } from "next/server";

import { auth } from "@/auth";
import {
  gmailErrorResponse,
  gmailFetch,
  getHeader,
  jsonResponse,
  type GmailThread,
  type GmailMessage,
} from "@/lib/server/gmail";

interface SendRequestBody {
  threadId?: string;
  to?: string;
  subject?: string;
  body?: string;
}

interface GmailSendResponse {
  id?: string | null;
  threadId?: string | null;
}

/** Removes CR/LF so header values cannot inject extra headers. */
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** RFC 2047 encodes non-ASCII header values, e.g. a UTF-8 subject line. */
function encodeHeaderValue(value: string): string {
  return /^[\x20-\x7E]*$/.test(value)
    ? value
    : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function withReplyPrefix(subject: string): string {
  const trimmed = subject.trim();

  if (!trimmed) {
    return "Re:";
  }

  return /^re\s*:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

interface RawEmailOptions {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string | null;
  references?: string | null;
}

/** Builds an RFC 2822 message with CRLF line endings, ready to base64url. */
function buildRawEmail({
  to,
  subject,
  body,
  inReplyTo,
  references,
}: RawEmailOptions): string {
  const headers = [
    `To: ${sanitizeHeaderValue(to)}`,
    `Subject: ${encodeHeaderValue(sanitizeHeaderValue(subject))}`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ];

  if (inReplyTo) {
    headers.push(`In-Reply-To: ${sanitizeHeaderValue(inReplyTo)}`);
  }

  if (references) {
    headers.push(`References: ${sanitizeHeaderValue(references)}`);
  }

  const normalizedBody = body.replace(/\r?\n/g, "\r\n");

  return `${headers.join("\r\n")}\r\n\r\n${normalizedBody}\r\n`;
}

function timestampOf(message: GmailMessage): number {
  const parsed = message.internalDate ? Number(message.internalDate) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.accessToken) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let payload: SendRequestBody;

  try {
    payload = (await request.json()) as SendRequestBody;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const threadId = payload.threadId?.trim();
  const to = payload.to?.trim();
  const body = payload.body;

  if (!to || typeof body !== "string" || !to.includes("@")) {
    return jsonResponse({ error: "to and body are required" }, 400);
  }

  if (typeof body !== "string" || body.trim().length === 0) {
    return jsonResponse({ error: "body is required" }, 400);
  }

  const accessToken = session.accessToken;

  try {
    let rawEmail: RawEmailOptions;

    if (threadId) {
      // Reply: metadata only, since the last Message-ID threads it in Gmail.
      const thread = await gmailFetch<GmailThread>(
        `threads/${encodeURIComponent(threadId)}?format=metadata` +
          "&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=References",
        accessToken,
      );

      const threadMessages = [...(thread.messages ?? [])].sort(
        (a, b) => timestampOf(a) - timestampOf(b),
      );
      const lastMessage = threadMessages.at(-1);
      const lastHeaders = lastMessage?.payload?.headers ?? [];

      const messageId = getHeader(lastHeaders, "Message-ID");
      const previousReferences = getHeader(lastHeaders, "References");

      const references = messageId
        ? [previousReferences, messageId].filter(Boolean).join(" ")
        : previousReferences;

      const subject =
        payload.subject?.trim() ||
        getHeader(lastHeaders, "Subject") ||
        thread.snippet ||
        "";

      rawEmail = {
        to,
        subject: withReplyPrefix(subject),
        body,
        inReplyTo: messageId,
        references,
      };
    } else {
      // Brand-new conversation: no thread id, no reply headers.
      rawEmail = { to, subject: payload.subject?.trim() ?? "", body };
    }

    const raw = Buffer.from(buildRawEmail(rawEmail), "utf8").toString(
      "base64url",
    );

    const sent = await gmailFetch<GmailSendResponse>(
      "messages/send",
      accessToken,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(threadId ? { raw, threadId } : { raw }),
      },
    );

    if (!sent.id) {
      return jsonResponse({ error: "Gmail did not return a message id" }, 502);
    }

    return jsonResponse({
      realMessageId: sent.id,
      realThreadId: sent.threadId ?? null,
    });
  } catch (error) {
    return gmailErrorResponse(error, "Failed to send message");
  }
}
