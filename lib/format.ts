const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Compact age for the thread list: "now", "12m", "3h", "5d", "Nov 2". */
export function formatRelativeTime(
  timestamp: number,
  now = Date.now(),
): string {
  const elapsed = now - timestamp;

  if (elapsed < MINUTE) {
    return "now";
  }

  if (elapsed < HOUR) {
    return `${Math.floor(elapsed / MINUTE)}m`;
  }

  if (elapsed < DAY) {
    return `${Math.floor(elapsed / HOUR)}h`;
  }

  if (elapsed < 7 * DAY) {
    return `${Math.floor(elapsed / DAY)}d`;
  }

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function formatClockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Header label for a day of messages: "Today", "Yesterday", "Tuesday", "November 2". */
export function formatDayLabel(timestamp: number, now = Date.now()): string {
  const date = new Date(timestamp);
  const elapsedDays = Math.round(
    (startOfDay(new Date(now)) - startOfDay(date)) / DAY,
  );

  if (elapsedDays <= 0) {
    return "Today";
  }

  if (elapsedDays === 1) {
    return "Yesterday";
  }

  if (elapsedDays < 7) {
    return date.toLocaleDateString(undefined, { weekday: "long" });
  }

  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
  });
}

/** Two letters for an avatar: "Ana Ruiz" → "AR", "ana@northwind.co" → "AN". */
export function initials(value: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return "?";
  }

  const words = trimmed.split(/\s+/).filter(Boolean);

  if (words.length >= 2) {
    return `${words[0][0]}${words[1][0]}`.toUpperCase();
  }

  return trimmed.slice(0, 2).toUpperCase();
}
