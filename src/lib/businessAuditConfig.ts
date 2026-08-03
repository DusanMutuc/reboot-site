export const BUSINESS_AUDIT_SYNC_FROM = '2026-08-06T00:00:00-06:00';
export const BUSINESS_AUDIT_TIMEZONE = 'America/Edmonton';

export function getBusinessAuditLocalDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_AUDIT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const partByType = new Map(parts.map((part) => [part.type, part.value]));

  return `${partByType.get('year')}-${partByType.get('month')}-${partByType.get('day')}`;
}
