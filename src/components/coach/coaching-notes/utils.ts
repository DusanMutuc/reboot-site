import type { CoachingNoteComment } from '@/types/coaching';

export function formatShortDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

export function formatAuthorName(comment: CoachingNoteComment) {
  const first = comment.author?.first_name?.trim() ?? '';
  const last = comment.author?.last_name?.trim() ?? '';
  const fullName = `${first} ${last}`.trim();
  return fullName || 'Unknown author';
}

export function formatDistanceFromNow(iso: string) {
  const now = new Date();
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return '';

  let diffMs = now.getTime() - then.getTime();
  if (diffMs < 0) diffMs = 0;

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const months = Math.floor(days / 30);
  const remDays = days % 30;

  const parts: string[] = [];
  if (months > 0) parts.push(`${months} month${months > 1 ? 's' : ''}`);
  if (remDays > 0 || parts.length === 0) {
    parts.push(`${remDays} day${remDays === 1 ? '' : 's'}`);
  }
  return `${parts.join(', ')} ago`;
}
