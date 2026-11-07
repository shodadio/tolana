import "server-only";

import { JSDOM } from "jsdom";

/**
 * Structural subset of Gmail's `messages.get` payload (`gmail_v1.Schema$MessagePart`)
 * so this module does not depend on the full googleapis type surface.
 */
export interface GmailPartBody {
  data?: string | null;
  size?: number | null;
  attachmentId?: string | null;
}

export interface GmailPayloadPart {
  mimeType?: string | null;
  body?: GmailPartBody | null;
  parts?: GmailPayloadPart[] | null;
}

/** Containers Gmail uses for quoted history, forwarded chains and signatures. */
const QUOTE_SELECTORS = [
  ".gmail_quote",
  ".gmail_signature",
  ".gmail_extra",
  "blockquote",
];

/** Block level tags that should become line breaks once flattened to text. */
const BLOCK_ELEMENTS =
  "p, div, li, tr, h1, h2, h3, h4, h5, h6, section, article, header, footer";

/** The RFC 3676 signature separator: a line containing only "--". */
const SIGNATURE_DELIMITER = /\r?\n--\s*\r?\n/;

/**
 * Decodes a base64url encoded Gmail body. Gmail uses the URL safe alphabet
 * (`-` and `_`) without padding, which Node's base64 decoder rejects.
 */
export function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

export interface ExtractedBodies {
  html: string | null;
  plain: string | null;
}

function collectBodies(part: GmailPayloadPart, bodies: ExtractedBodies): void {
  const mimeType = part.mimeType ?? "";
  const data = part.body?.data;

  if (data) {
    if (mimeType === "text/html" && bodies.html === null) {
      bodies.html = decodeBase64Url(data);
    } else if (mimeType === "text/plain" && bodies.plain === null) {
      bodies.plain = decodeBase64Url(data);
    }
  }

  for (const child of part.parts ?? []) {
    collectBodies(child, bodies);
  }
}

/**
 * Walks `payload.parts` recursively and returns the first `text/html` and
 * `text/plain` bodies it finds. Single part messages (the body sits directly on
 * the payload) are handled too.
 */
export function extractEmailBodies(
  payload: GmailPayloadPart | null | undefined,
): ExtractedBodies {
  const bodies: ExtractedBodies = { html: null, plain: null };
  if (payload) {
    collectBodies(payload, bodies);
  }
  return bodies;
}

function htmlToText(html: string): string {
  const dom = new JSDOM(html);
  const { document } = dom.window;

  try {
    document.querySelectorAll("script, style").forEach((el) => el.remove());

    for (const selector of QUOTE_SELECTORS) {
      document.querySelectorAll(selector).forEach((el) => el.remove());
    }

    document.querySelectorAll("br").forEach((el) => {
      el.replaceWith(document.createTextNode("\n"));
    });

    document.querySelectorAll(BLOCK_ELEMENTS).forEach((el) => {
      el.append("\n");
    });

    return document.body?.textContent ?? "";
  } finally {
    dom.window.close();
  }
}

/**
 * Trims the signature block, collapses the whitespace that survives HTML email
 * markup, and keeps at most one blank line between paragraphs.
 */
function normalizeText(text: string): string {
  const withoutSignature = text.replace(/\r\n/g, "\n").split(SIGNATURE_DELIMITER)[0];

  return withoutSignature
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Flattens an HTML body into bubble text with quotes and signature removed. */
export function cleanEmailHtml(html: string): string {
  return normalizeText(htmlToText(html));
}

/** Trims a plain text body, dropping the signature block. */
export function cleanEmailText(text: string): string {
  return normalizeText(text);
}

/**
 * Turns a Gmail message payload into clean, trimmed text for a chat bubble.
 * Prefers the HTML part and falls back to `text/plain`.
 */
export function cleanEmailBody(
  payload: GmailPayloadPart | null | undefined,
): string {
  const { html, plain } = extractEmailBodies(payload);

  if (html?.trim()) {
    return cleanEmailHtml(html);
  }

  if (plain?.trim()) {
    return cleanEmailText(plain);
  }

  return "";
}
