// Presentation helpers. UK English, UK date order.

const LONDON = "Europe/London";

function toDate(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// "3 hours ago", "20 minutes ago", "2 days ago".
export function timeAgo(v: string | Date | null | undefined): string | null {
  const d = toDate(v);
  if (!d) return null;

  const secs = Math.floor((Date.now() - d.getTime()) / 1000);
  if (secs < 0) return "just now";
  if (secs < 60) return "just now";

  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;

  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

// "14 Aug", "14 Aug 2026" when it is not this year.
export function shortDate(v: string | Date | null | undefined): string | null {
  const d = toDate(v);
  if (!d) return null;
  const thisYear = new Date().getUTCFullYear() === d.getUTCFullYear();
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    ...(thisYear ? {} : { year: "numeric" }),
    timeZone: LONDON,
  }).format(d);
}

// Day-level recency, for events where the hour is unknown. Deliberately vague
// rather than falsely precise: we genuinely do not know the time.
export function dayAgo(v: string | Date | null | undefined): string | null {
  const d = toDate(v);
  if (!d) return null;

  const startOfDay = (x: Date) =>
    Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate());
  const days = Math.round(
    (startOfDay(new Date()) - startOfDay(d)) / (24 * 60 * 60 * 1000),
  );

  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return `on ${shortDate(d)}`;
}

// The headline recency string. Uses the precise time only when the person who
// logged it actually knew the hour; otherwise falls back to the day. This is
// the payoff for storing occurred_on and occurred_hour separately instead of
// faking a midnight timestamp.
export function firedAgo(
  firedAt: string | Date | null,
  occurredOn: string | Date | null,
): string {
  return timeAgo(firedAt) ?? dayAgo(occurredOn) ?? "at an unknown time";
}

export function hourLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

export function pct(n: number): string {
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)}%`;
}
