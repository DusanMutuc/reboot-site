/**
 * The saved LeadConnector custom-slug booking page is also its iframe URL.
 * Keep the allowlist deliberately narrow; other safe booking links can still
 * be offered as external links without loading arbitrary pages in the app.
 */
export function getCoachBookingEmbedUrl(raw: string | null | undefined, memberName?: string | null, memberEmail?: string | null): string | null {
  const value = raw?.trim();
  if (!value || !/^https:\/\//i.test(value) || /[\s\\]/.test(value)) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'api.leadconnectorhq.com'
      || url.port || url.username || url.password
      || !/^\/widget\/bookings\/[a-zA-Z0-9_-]+\/?$/.test(url.pathname)) return null;
    // Add member details only after the provider allowlist has passed.
    if (memberName?.trim()) url.searchParams.set('full_name', memberName.trim());
    if (memberEmail?.trim()) url.searchParams.set('email', memberEmail.trim());
    return url.href;
  } catch {
    return null;
  }
}
