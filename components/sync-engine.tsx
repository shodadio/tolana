"use client";

import { useEffect } from "react";

import { runSync } from "@/lib/sync";

const DELTA_INTERVAL_MS = 30_000;

/**
 * Invisible driver mounted once by the shell. `runSync()` reads
 * `db.syncState.get("gmail_sync")` and picks bootstrap or delta from it, so the
 * engine only has to decide when to run.
 */
export function SyncEngine() {
  useEffect(() => {
    let cancelled = false;

    function tick() {
      if (cancelled || document.visibilityState !== "visible") {
        return;
      }

      void runSync();
    }

    // Deferred a tick so the shell paints before Gmail is contacted.
    const initial = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, DELTA_INTERVAL_MS);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        tick();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.clearTimeout(initial);
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  return null;
}
