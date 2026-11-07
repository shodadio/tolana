"use client";

import { useEffect } from "react";
import { migrateLegacyDatabase } from "@/lib/db";

/**
 * Moves pre-rename local data as soon as the app boots, so cached threads are
 * in place whether or not a session is active. Shared with the sync engine, so
 * this cannot run the migration twice.
 */
export function LocalDataMigration() {
  useEffect(() => {
    void migrateLegacyDatabase();
  }, []);

  return null;
}
