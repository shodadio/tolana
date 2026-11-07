import {
  db,
  migrateLegacyDatabase,
  type Message,
  type Thread,
} from "@/lib/db";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const VIEWER_NAME = "You";
const VIEWER_EMAIL = "you@tolana.app";

/**
 * Sample conversations for the empty state, so the thread list and bubbles can
 * be reviewed before Gmail sync lands. Everything is written to the local
 * IndexedDB, which means the live queries update exactly like real data would.
 */
export async function seedDemoConversations(): Promise<void> {
  await migrateLegacyDatabase();

  const now = Date.now();

  const threads: Thread[] = [
    {
      id: "demo-thread-ana",
      snippet: "Perfect, thank you!",
      senderName: "Ana Ruiz",
      senderEmail: "ana.ruiz@northwind.co",
      lastMessageTimestamp: now - 2 * MINUTE,
      unreadCount: 1,
      subject: "Deck review before Monday",
    },
    {
      id: "demo-thread-sam",
      snippet: "Two slides need numbers, the rest reads fine.",
      senderName: "Sam Patel",
      senderEmail: "sam@harborlane.studio",
      lastMessageTimestamp: now - 3 * HOUR,
      unreadCount: 0,
      subject: "Notes from Thursday",
    },
  ];

  const messages: Message[] = [
    {
      id: "demo-msg-ana-1",
      threadId: "demo-thread-ana",
      senderName: "Ana Ruiz",
      senderEmail: "ana.ruiz@northwind.co",
      cleanBody:
        "Hi Sam — the board read is Monday morning. Could you send the latest deck by Friday?",
      timestamp: now - 26 * HOUR,
      isFromMe: false,
      status: "sent",
    },
    {
      id: "demo-msg-ana-2",
      threadId: "demo-thread-ana",
      senderName: VIEWER_NAME,
      senderEmail: VIEWER_EMAIL,
      cleanBody:
        "Yes. I'll cut the appendix and send it tonight — the appendix is what dragged last time.",
      timestamp: now - 25 * HOUR,
      isFromMe: true,
      status: "sent",
    },
    {
      id: "demo-msg-ana-3",
      threadId: "demo-thread-ana",
      senderName: "Ana Ruiz",
      senderEmail: "ana.ruiz@northwind.co",
      cleanBody:
        "Got the new cut. The opening is much clearer without the appendix.",
      timestamp: now - 2 * HOUR,
      isFromMe: false,
      status: "sent",
    },
    {
      id: "demo-msg-ana-4",
      threadId: "demo-thread-ana",
      senderName: "Ana Ruiz",
      senderEmail: "ana.ruiz@northwind.co",
      cleanBody: "Perfect, thank you!",
      timestamp: now - 2 * MINUTE,
      isFromMe: false,
      status: "sent",
    },
    {
      id: "demo-msg-sam-1",
      threadId: "demo-thread-sam",
      senderName: "Sam Patel",
      senderEmail: "sam@harborlane.studio",
      cleanBody:
        "Left comments on the two slides we discussed — mainly the numbers on slide 6.",
      timestamp: now - 30 * HOUR,
      isFromMe: false,
      status: "sent",
    },
    {
      id: "demo-msg-sam-2",
      threadId: "demo-thread-sam",
      senderName: VIEWER_NAME,
      senderEmail: VIEWER_EMAIL,
      cleanBody: "Read them. I'll pull the figures from the Q3 review.",
      timestamp: now - 4 * HOUR,
      isFromMe: true,
      status: "sent",
    },
    {
      id: "demo-msg-sam-3",
      threadId: "demo-thread-sam",
      senderName: "Sam Patel",
      senderEmail: "sam@harborlane.studio",
      cleanBody: "Two slides need numbers, the rest reads fine.",
      timestamp: now - 3 * HOUR,
      isFromMe: false,
      status: "sent",
    },
  ];

  await db.transaction("rw", db.threads, db.messages, async () => {
    await db.threads.bulkPut(threads);
    await db.messages.bulkPut(messages);
  });
}
