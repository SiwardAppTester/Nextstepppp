// Google Calendar API v3 — minimal client wrapping the two endpoints we need.
//
// We pass `singleEvents=true` everywhere so the API expands recurring events
// into individual instances within the requested window. That means we never
// have to parse RRULE strings ourselves — every event we mirror is a concrete
// (start, end) pair.

const BASE = "https://www.googleapis.com/calendar/v3";

export type GoogleCalendarEvent = {
  id: string;
  status: "confirmed" | "tentative" | "cancelled";
  etag?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  // For timed events: dateTime + timeZone. For all-day events: date.
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  recurringEventId?: string;
};

export type EventsListResponse = {
  items: GoogleCalendarEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
};

type ListOpts =
  | {
      mode: "window";
      timeMin: string; // ISO
      timeMax: string; // ISO
      pageToken?: string;
    }
  | {
      mode: "incremental";
      syncToken: string;
      pageToken?: string;
    };

export class CalendarApiError extends Error {
  status: number;
  // 410 GONE on incremental sync means our syncToken expired and we must do
  // a full re-fetch. The caller distinguishes this case to reset sync state.
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function listEvents(
  accessToken: string,
  calendarId: string,
  opts: ListOpts
): Promise<EventsListResponse> {
  const params = new URLSearchParams({
    singleEvents: "true",
    maxResults: "250",
  });
  if (opts.mode === "window") {
    params.set("timeMin", opts.timeMin);
    params.set("timeMax", opts.timeMax);
    params.set("orderBy", "startTime");
  } else {
    params.set("syncToken", opts.syncToken);
  }
  if (opts.pageToken) params.set("pageToken", opts.pageToken);

  const url = `${BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new CalendarApiError(
      `Calendar events.list failed: ${res.status} ${text}`,
      res.status
    );
  }
  return (await res.json()) as EventsListResponse;
}

// Convert a Google event's start/end into our `events` table format.
// All-day events use `date` (YYYY-MM-DD) and our `all_day=true` flag; we
// store start_at at 00:00 in UTC for those — the renderer ignores the time.
export function normalizeEventTimes(g: GoogleCalendarEvent): {
  start_at: string;
  end_at: string | null;
  all_day: boolean;
} | null {
  const s = g.start;
  const e = g.end;
  if (!s) return null;

  if (s.date) {
    // All-day event. Google's end.date is exclusive (the day after), so we
    // subtract one day to match our inclusive end_at convention.
    const start = new Date(`${s.date}T00:00:00Z`);
    const endExclusive = e?.date ? new Date(`${e.date}T00:00:00Z`) : null;
    const endInclusive = endExclusive
      ? new Date(endExclusive.getTime() - 24 * 60 * 60 * 1000)
      : null;
    return {
      start_at: start.toISOString(),
      end_at: endInclusive ? endInclusive.toISOString() : null,
      all_day: true,
    };
  }

  if (s.dateTime) {
    return {
      start_at: new Date(s.dateTime).toISOString(),
      end_at: e?.dateTime ? new Date(e.dateTime).toISOString() : null,
      all_day: false,
    };
  }

  return null;
}
