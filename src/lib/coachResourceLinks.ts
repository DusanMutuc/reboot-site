export type CoachingLink = {
  label: string;
  href: string | null;
  detail: string;
  copyable?: boolean;
};

// Keep destinations and their existing labels together when arranging the overview.
export const sharedCoachResourceLinks: CoachingLink[] = [
  { label: 'Training, tools & courses', href: '/resources', detail: 'Browse Reboot training and course materials' },
  { label: 'Reboot calendar', href: 'https://www.addevent.com/calendar/ez616853', detail: 'The full group session calendar' },
  { label: 'Reboot coaching room', href: 'https://zoom.us/j/93233351653', detail: 'Join the group coaching Zoom room' },
  { label: 'Assistant workroom', href: 'https://zoom.us/j/99652221215', detail: 'Join the assistant Zoom room' },
  { label: 'Assistant onboarding', href: 'https://api.leadconnectorhq.com/widget/bookings/assistant_on', detail: 'Book an assistant onboarding session' },
  { label: 'Systems explainers', href: 'https://vimeo.com/showcase/11715034', detail: 'Watch the Reboot system guides' },
  { label: 'Reboot Facebook group', href: 'https://www.facebook.com/groups/realestatereboot', detail: 'Connect with the member community' },
  { label: 'Agent referral directory', href: 'https://rebootmembers.com/legends', detail: 'Find a Reboot agent for client referrals' },
];

export const coachResourceGroups = [
  { id: 'rooms', label: 'Rooms & calendar', detail: 'Group coaching, assistant workroom and Reboot events', links: ['Reboot coaching room', 'Assistant workroom', 'Reboot calendar'] },
  { id: 'learning', label: 'Prepare & learn', detail: 'Training, tools, courses and system explainers', links: ['Training, tools & courses', 'Systems explainers'] },
  { id: 'community', label: 'Assistants & community', detail: 'Onboarding, member community and client referrals', links: ['Assistant onboarding', 'Reboot Facebook group', 'Agent referral directory'] },
];

function safeUrl(raw: unknown) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const value = raw.trim();
  const candidate = /^[\w.-]+\.[a-z]{2,}([/:].*)?$/i.test(value) ? `https://${value}` : value;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

type CoachProfileLinks = {
  m2_booking_url?: unknown;
  impl_booking_url?: unknown;
  call15_url?: unknown;
  coaching_notes_url?: unknown;
};

export function getCoachProfileLinks(profile: CoachProfileLinks | null): CoachingLink[] {
  return [
    { label: 'Business Review booking link', href: safeUrl(profile?.m2_booking_url), detail: 'Your Momentum coaching booking page', copyable: true },
    { label: 'Implementation booking link', href: safeUrl(profile?.impl_booking_url ?? profile?.call15_url), detail: 'Your implementation coaching booking page', copyable: true },
    { label: 'Implementation notes', href: safeUrl(profile?.coaching_notes_url), detail: 'Your saved coaching notes link' },
  ];
}
