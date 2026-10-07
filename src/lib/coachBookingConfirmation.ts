type BookingMessage = {
  data: unknown;
  origin: string;
  source: unknown;
};

/**
 * Both GHL Classic and Neo emit this message from their booking completion
 * handler. It confirms a booking in this frame, but contains no member or
 * appointment identity. Do not treat unrelated form/resize messages as success.
 */
export function isCoachBookingConfirmation(
  event: BookingMessage,
  frameWindow: unknown,
  embedUrl: string,
): boolean {
  if (!frameWindow || event.source !== frameWindow) return false;
  const origin = 'https://api.leadconnectorhq.com';
  if (event.origin !== origin) return false;

  try {
    const url = new URL(embedUrl);
    if (url.origin !== origin || url.username || url.password
      || !/^\/widget\/bookings\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) return false;
  } catch {
    return false;
  }

  if (!Array.isArray(event.data) || event.data.length !== 2
    || event.data[0] !== 'msgsndr-booking-complete') return false;
  const payload: unknown = event.data[1];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const calendarId = (payload as Record<string, unknown>).calendarId;
  return typeof calendarId === 'string' && calendarId.trim().length > 0;
}
