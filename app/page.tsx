import { connection } from "next/server";

import { auth } from "@/auth";
import { MessengerShell, type SessionUser } from "@/components/messenger-shell";

// The shell needs the session before it can pick the landing screen or the
// mailbox, so this route renders on demand instead of being prerendered.
export const instant = false;

export default async function Home() {
  // Auth.js reads cookies and signs tokens, so the shell has to render per
  // request rather than during a prerender pass.
  await connection();

  let user: SessionUser | null = null;
  let authError = false;

  try {
    const session = await auth();

    if (session?.user) {
      user = {
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      };

      authError = session.error === "RefreshAccessTokenError";
    }
  } catch (error) {
    // Auth is not configured yet (no AUTH_SECRET / Google client): fall back to
    // the signed-out landing screen instead of failing the whole page.
    console.error("Unable to read the session:", error);
  }

  return <MessengerShell user={user} authError={authError} />;
}
