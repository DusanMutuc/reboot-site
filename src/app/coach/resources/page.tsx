'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Alert, Box, Button, Skeleton, Tab, Tabs, Typography } from '@mui/material';
import ArrowOutwardRoundedIcon from '@mui/icons-material/ArrowOutwardRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CoachShell, { COACH_MAX_WIDTH } from '@/components/coach/CoachShell';
import PodcastSection from '@/components/podcastSection';
import Search from '@/components/search';
import { brand } from '@/lib/homeTheme';
import { supabase } from '@/lib/supabaseClient';

type CoachingLink = { label: string; href: string | null; detail: string };
const sharedLinks: CoachingLink[] = [
  { label: 'Training, tools & courses', href: '/resources', detail: 'Browse Reboot training and course materials' },
  { label: 'Reboot calendar', href: 'https://www.addevent.com/calendar/ez616853', detail: 'The full group session calendar' },
  { label: 'Reboot coaching room', href: 'https://zoom.us/j/93233351653', detail: 'Join the group coaching Zoom room' },
  { label: 'Assistant workroom', href: 'https://zoom.us/j/99652221215', detail: 'Join the assistant Zoom room' },
  { label: 'Assistant onboarding', href: 'https://api.leadconnectorhq.com/widget/bookings/assistant_on', detail: 'Book an assistant onboarding session' },
  { label: 'Systems explainers', href: 'https://vimeo.com/showcase/11715034', detail: 'Watch the Reboot system guides' },
  { label: 'Reboot Facebook group', href: 'https://www.facebook.com/groups/realestatereboot', detail: 'Connect with the member community' },
  { label: 'Agent referral directory', href: 'https://rebootmembers.com/legends', detail: 'Find a Reboot agent for client referrals' },
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

function CoachingLinks() {
  const [profileLinks, setProfileLinks] = useState<CoachingLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(false);
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw authError ?? new Error('Sign in required');
        const { data, error: profileError } = await supabase.from('coach_profiles')
          .select('m2_booking_url, call15_url, coaching_notes_url, impl_booking_url')
          .eq('user_id', user.id).maybeSingle();
        if (profileError) throw profileError;
        if (active) setProfileLinks([
          { label: 'Business Review booking link', href: safeUrl(data?.m2_booking_url), detail: 'Your Momentum coaching booking page' },
          { label: 'Implementation booking link', href: safeUrl(data?.impl_booking_url ?? data?.call15_url), detail: 'Your implementation coaching booking page' },
          { label: 'Implementation notes', href: safeUrl(data?.coaching_notes_url), detail: 'Your saved coaching notes link' },
        ]);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [reload]);

  const renderLink = ({ label, href, detail }: CoachingLink) => (
    <Box key={label} sx={{ borderBottom: `1px solid ${brand.border}`, py: 2, minWidth: 0 }}>
      {href ? (
        <Box component={Link} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
          sx={{ display: 'flex', gap: 1.5, justifyContent: 'space-between', alignItems: 'center', color: brand.ink, fontSize: 14, fontWeight: 600, minHeight: 28, '&:hover': { color: brand.turquoiseDeep }, '&:focus-visible': { outline: `2px solid ${brand.turquoiseDeep}`, outlineOffset: 4, borderRadius: '2px' } }}>
          {label}{href.startsWith('http') ? <ArrowOutwardRoundedIcon sx={{ fontSize: 17, flexShrink: 0, color: brand.turquoiseDeep }} /> : <ArrowForwardRoundedIcon sx={{ fontSize: 17, flexShrink: 0, color: brand.turquoiseDeep }} />}
        </Box>
      ) : <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{label}</Typography>}
      <Typography sx={{ color: brand.inkSoft, fontSize: 12, mt: 0.5 }}>{href ? detail : 'No link has been set up for your account.'}</Typography>
    </Box>
  );

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1.5fr' }, gap: { xs: 4, md: 7 } }}>
      <Box component="section" aria-labelledby="personal-coaching-links">
        <Typography component="h2" id="personal-coaching-links" sx={{ fontSize: 18, fontWeight: 600, mb: 1 }}>Your coaching links</Typography>
        {loading ? <Skeleton variant="rounded" height={200} /> : error ? <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => setReload((value) => value + 1)}>Retry</Button>}>Your coaching links could not be loaded.</Alert> : profileLinks.map(renderLink)}
      </Box>
      <Box component="section" aria-labelledby="shared-coaching-links">
        <Typography component="h2" id="shared-coaching-links" sx={{ fontSize: 18, fontWeight: 600, mb: 1 }}>Rooms & member resources</Typography>
        {sharedLinks.map(renderLink)}
      </Box>
    </Box>
  );
}

function HelpContacts() {
  return (
    <Box component="section" aria-labelledby="coach-help-heading">
      <Typography component="h2" id="coach-help-heading" sx={{ fontSize: 20, fontWeight: 600, mb: 2 }}>Quick contacts</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 4 }}>
        {[{ name: 'Bri', phone: '250-609-8330', email: 'admin@agentfromwithin.com' }, { name: 'Jelena', phone: '778-658-5329', email: 'admin@rebootmembers.com' }].map((contact) => (
          <Box key={contact.name} sx={{ borderTop: `1px solid ${brand.border}`, pt: 2 }}>
            <Typography sx={{ fontSize: 16, fontWeight: 600, mb: 1 }}>{contact.name}</Typography>
            <Box component="a" href={`tel:${contact.phone.replaceAll('-', '')}`} sx={{ display: 'block', width: 'fit-content', py: 0.75, fontSize: 14, color: brand.turquoiseDeep, '&:hover': { textDecoration: 'underline' } }}>{contact.phone}</Box>
            <Box component="a" href={`mailto:${contact.email}`} sx={{ display: 'block', width: 'fit-content', py: 0.75, fontSize: 14, overflowWrap: 'anywhere', color: brand.turquoiseDeep, '&:hover': { textDecoration: 'underline' } }}>{contact.email}</Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

const resourceViews = [
  { value: 'links', label: 'Coaching links' },
  { value: 'library', label: 'Resource library' },
  { value: 'podcast', label: 'Private podcast' },
  { value: 'help', label: 'Help' },
];

function ResourceViews() {
  const searchParams = useSearchParams();
  const requestedView = searchParams.get('view');
  const view = resourceViews.some((item) => item.value === requestedView) ? requestedView! : 'links';
  return (
    <>
      <Tabs value={view} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile aria-label="Coach resources" sx={{ mb: 3, borderBottom: `1px solid ${brand.border}`, '& .MuiTab-root': { fontSize: 14, textTransform: 'none', px: 2, minHeight: 48 }, '& .Mui-selected': { color: `${brand.turquoiseDeep} !important` } }}>
        {resourceViews.map((item) => <Tab key={item.value} component={Link} href={`/coach/resources?view=${item.value}`} value={item.value} label={item.label} id={`resources-${item.value}-tab`} aria-controls={`resources-${item.value}-panel`} />)}
      </Tabs>
      <Box role="tabpanel" id={`resources-${view}-panel`} aria-labelledby={`resources-${view}-tab`}>
        {view === 'links' ? <CoachingLinks /> : null}
        {view === 'library' ? <Box sx={{ '& > .MuiBox-root': { bgcolor: 'transparent', minHeight: 'auto', py: 0 }, '& > .MuiBox-root > .MuiStack-root': { maxWidth: 'none', px: 0 }, '& .MuiPaper-root': { boxShadow: 'none' } }}><Search /></Box> : null}
        {view === 'podcast' ? <Box sx={{ overflow: 'hidden', borderRadius: '12px', '& > section > .MuiBox-root:first-of-type': { minHeight: { xs: 160, md: 190 }, py: 3 }, '& > section h2': { fontSize: { xs: 28, md: 34 } }, '& > section > .MuiBox-root:first-of-type .MuiTypography-subtitle1': { fontSize: 14, maxWidth: '60ch' }, '& > section > .MuiButton-root': { fontSize: 15 }, '& > section > .MuiTypography-root': { fontSize: 14 } }}><PodcastSection /></Box> : null}
        {view === 'help' ? <HelpContacts /> : null}
      </Box>
    </>
  );
}

export default function CoachResourcesPage() {
  return (
    <CoachShell>
      <Box component="main" sx={{ maxWidth: COACH_MAX_WIDTH, mx: 'auto', px: { xs: 2.5, md: 4 }, py: { xs: 3, md: 4 } }}>
        <Typography component="h1" variant="h2" sx={{ mb: 0.75 }}>Resources</Typography>
        <Typography sx={{ color: brand.inkSoft, fontSize: 14, mb: 2.5 }}>Coaching links, training, replays, and support.</Typography>
        <Suspense fallback={<Skeleton variant="rounded" height={250} />}><ResourceViews /></Suspense>
      </Box>
    </CoachShell>
  );
}
