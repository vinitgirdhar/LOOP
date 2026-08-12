/**
 * Deep links into Google's own surfaces.
 *
 * No API key and no OAuth: these are documented URL formats that open a
 * pre-filled Google Calendar event or a fresh Meet room in the reader's own
 * account. That is the difference between integrating with Google and merely
 * claiming to — the reader ends up in their real calendar either way, and
 * nothing here needs a token this app does not have.
 */

/** Google Calendar's template format wants UTC basic-ISO: 20260812T140000Z. */
function toCalendarStamp(value: string | Date): string {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export interface CalendarEventInput {
  title: string;
  startsAt: string | Date;
  endsAt: string | Date;
  details?: string | null;
  location?: string | null;
  meetingUrl?: string | null;
}

/**
 * "Add to Google Calendar" — opens the compose screen with everything filled.
 *
 * The join link goes in the details rather than the location field so it stays
 * clickable in the Google Calendar mobile app, which renders location as a maps
 * lookup and mangles a URL put there.
 */
export function googleCalendarUrl(event: CalendarEventInput): string {
  const details = [event.details?.trim(), event.meetingUrl ? `Join: ${event.meetingUrl}` : null]
    .filter(Boolean)
    .join('\n\n');

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${toCalendarStamp(event.startsAt)}/${toCalendarStamp(event.endsAt)}`,
  });
  if (details) params.set('details', details);
  if (event.location) params.set('location', event.location);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Google's instant-meeting entry point. Creates a room in the user's account. */
export const NEW_MEET_URL = 'https://meet.google.com/new';

const MEET_PATTERN = /^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\?.*)?$/i;

export type ConferenceProvider = 'google_meet' | 'zoom' | 'teams' | 'other';

/** Which service a pasted link belongs to, so the Join button can say so. */
export function detectProvider(url: string | null | undefined): ConferenceProvider | null {
  if (!url) return null;
  const value = url.trim().toLowerCase();
  if (value.includes('meet.google.com')) return 'google_meet';
  if (value.includes('zoom.us')) return 'zoom';
  if (value.includes('teams.microsoft.com') || value.includes('teams.live.com')) return 'teams';
  return 'other';
}

export const PROVIDER_LABELS: Record<ConferenceProvider, string> = {
  google_meet: 'Google Meet',
  zoom: 'Zoom',
  teams: 'Microsoft Teams',
  other: 'Video call',
};

/** A Meet code is xxx-xxxx-xxx; anything else is accepted but not called Meet. */
export const isMeetLink = (url: string | null | undefined): boolean => Boolean(url && MEET_PATTERN.test(url.trim()));
