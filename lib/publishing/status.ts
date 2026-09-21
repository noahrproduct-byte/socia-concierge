// Aggregating N destination statuses into the one parent status the calendar,
// dashboard and shell already read. Pure.

import type { Destination, DestinationStatus, ContentItem } from "./types";

export type ParentStatus = ContentItem["status"];

const IN_FLIGHT: DestinationStatus[] = ["uploading", "processing"];

/**
 * Rules, in order: anything in flight -> publishing; every live one published
 * -> published; any failed (and nothing in flight) -> failed; any scheduled ->
 * scheduled; all cancelled -> cancelled; otherwise draft. Cancelled rows are
 * ignored when other rows exist.
 */
export function aggregateStatus(destinations: Pick<Destination, "status">[]): ParentStatus {
  const live = destinations.filter((d) => d.status !== "cancelled");
  if (!live.length) return destinations.length ? "cancelled" : "draft";
  if (live.some((d) => IN_FLIGHT.includes(d.status))) return "publishing";
  if (live.every((d) => d.status === "published")) return "published";
  if (live.some((d) => d.status === "failed")) return "failed";
  if (live.some((d) => d.status === "scheduled")) return "scheduled";
  return "draft";
}

export type StatusSummary = {
  total: number;
  published: number;
  failed: number;
  scheduled: number;
  inFlight: number;
  draft: number;
  /** "3 of 4 published", "1 of 2 failed" ... for compact chips. */
  line: string;
};

export function summarize(destinations: Pick<Destination, "status">[]): StatusSummary {
  const live = destinations.filter((d) => d.status !== "cancelled");
  const count = (s: DestinationStatus[]) => live.filter((d) => s.includes(d.status)).length;
  const s: StatusSummary = {
    total: live.length,
    published: count(["published"]),
    failed: count(["failed"]),
    scheduled: count(["scheduled"]),
    inFlight: count(IN_FLIGHT),
    draft: count(["draft", "ready"]),
    line: "",
  };
  if (!s.total) s.line = "No destinations";
  else if (s.inFlight) s.line = `Publishing ${s.inFlight} of ${s.total}`;
  else if (s.published === s.total) s.line = s.total === 1 ? "Published" : `Published to ${s.total}`;
  else if (s.failed) s.line = `${s.failed} of ${s.total} failed`;
  else if (s.scheduled === s.total) s.line = s.total === 1 ? "Scheduled" : `Scheduled to ${s.total}`;
  else if (s.scheduled) s.line = `${s.scheduled} of ${s.total} scheduled`;
  else s.line = "Draft";
  return s;
}

/** The first non-cancelled error, for the calendar's one-line failure text. */
export function firstError(destinations: Pick<Destination, "status" | "errorMessage" | "platform">[]): string | null {
  const f = destinations.find((d) => d.status === "failed" && d.errorMessage);
  return f ? `${f.platform}: ${f.errorMessage}` : null;
}
