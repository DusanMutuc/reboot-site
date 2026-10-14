'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Box, Button, Skeleton, Snackbar, Tab, Tabs, Typography } from '@mui/material';
import ArrowOutwardRoundedIcon from '@mui/icons-material/ArrowOutwardRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import MenuBookOutlinedIcon from '@mui/icons-material/MenuBookOutlined';
import PeopleOutlineRoundedIcon from '@mui/icons-material/PeopleOutlineRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CoachShell, { COACH_MAX_WIDTH } from '@/components/coach/CoachShell';
import PodcastSection from '@/components/podcastSection';
import Search from '@/components/search';
import { brand } from '@/lib/homeTheme';
import { supabase } from '@/lib/supabaseClient';
import { coachResourceGroups, getCoachProfileLinks, sharedCoachResourceLinks, type CoachingLink } from '@/lib/coachResourceLinks';

const accordionSx = {
  bgcolor: 'transparent', boxShadow: 'none', borderBottom: `1px solid ${brand.border}`,
  '&::before': { display: 'none' },
  '& .MuiAccordionSummary-root': { px: 0, minHeight: 86, gap: 2 },
  '& .MuiAccordionSummary-content': { my: 2, alignItems: 'center', gap: 2, minWidth: 0 },
  '& .MuiAccordionDetails-root': { p: 0, pb: 2, pl: { xs: 0, sm: 4.25 } },
};

const compactButtonSx = { fontSize: 12, minHeight: 38, px: 1.5, py: 0.75, color: brand.turquoiseDeep };

function CoachingLinks() {
  const [profileLinks, setProfileLinks] = useState<CoachingLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);
  const [coachingExpanded, setCoachingExpanded] = useState(false);
  const coachingSummaryRef = useRef<HTMLDivElement>(null);
  const [copyMessage, setCopyMessage] = useState<{ text: string; severity: 'success' | 'warning' } | null>(null);

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
        if (active) setProfileLinks(getCoachProfileLinks(data));
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [reload]);

  const copyLink = async ({ label, href }: CoachingLink) => {
    if (!href) return;
    try {
      await navigator.clipboard.writeText(href);
      setCopyMessage({ text: `${label} copied.`, severity: 'success' });
    } catch {
      setCopyMessage({ text: 'The link could not be copied. Open the booking page to copy its address.', severity: 'warning' });
    }
  };

  const renderLink = (link: CoachingLink) => {
    const { label, href, detail, copyable } = link;
    return (
    <Box key={label} sx={{ display: 'flex', alignItems: 'center', flexWrap: { xs: 'wrap', sm: 'nowrap' }, gap: 1.5, borderBottom: `1px solid ${brand.border}`, py: 2, minWidth: 0, '&:last-child': { borderBottom: 0 } }}>
      {href ? (
        <Box component={Link} href={href} aria-label={label} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}
          sx={{ display: 'flex', flex: 1, gap: 1.5, justifyContent: 'space-between', alignItems: 'center', color: brand.ink, minWidth: { xs: '100%', sm: 0 }, '&:hover': { color: brand.turquoiseDeep }, '&:focus-visible': { outline: `2px solid ${brand.turquoiseDeep}`, outlineOffset: 4, borderRadius: '2px' } }}>
          <Box sx={{ minWidth: 0 }}><Typography sx={{ fontSize: 14, fontWeight: 600 }}>{label}</Typography><Typography sx={{ color: brand.inkSoft, fontSize: 12, mt: 0.5 }}>{detail}</Typography></Box>
          <Box component="span" sx={{ display: 'inline-flex', gap: 0.5, alignItems: 'center', color: brand.turquoiseDeep, fontSize: 12 }}>Open{href.startsWith('http') ? <ArrowOutwardRoundedIcon sx={{ fontSize: 17, flexShrink: 0 }} /> : <ArrowForwardRoundedIcon sx={{ fontSize: 17, flexShrink: 0 }} />}</Box>
        </Box>
      ) : <Box><Typography sx={{ fontSize: 14, fontWeight: 600 }}>{label}</Typography><Typography sx={{ color: brand.inkSoft, fontSize: 12, mt: 0.5 }}>No link has been set up for your account.</Typography></Box>}
      {href && copyable ? <Button variant="outlined" aria-label={`Copy ${label}`} startIcon={<ContentCopyRoundedIcon sx={{ fontSize: 15 }} />} onClick={() => void copyLink(link)} sx={{ ...compactButtonSx, flexShrink: 0, borderColor: brand.border }}>Copy link</Button> : null}
    </Box>
    );
  };

  const coachingRoom = sharedCoachResourceLinks.find((link) => link.label === 'Reboot coaching room')!;
  const calendar = sharedCoachResourceLinks.find((link) => link.label === 'Reboot calendar')!;
  const groupIcons = { rooms: <VideocamOutlinedIcon />, learning: <MenuBookOutlinedIcon />, community: <PeopleOutlineRoundedIcon /> };
  const shortcutSx = { display: 'flex', textAlign: 'left', alignItems: 'center', justifyContent: 'flex-start', gap: 1.5, minWidth: 0, p: 2, bgcolor: brand.card, border: `1px solid ${brand.border}`, borderRadius: '12px', color: brand.ink, '&:hover': { bgcolor: brand.turquoiseTint, borderColor: brand.borderStrong }, '& > .MuiSvgIcon-root': { color: brand.turquoiseDeep, fontSize: 22, flexShrink: 0 } };

  return (
    <Box>
      <Typography component="h2" sx={{ fontFamily: 'Poppins, Arial, sans-serif', fontSize: 18, fontWeight: 600, mb: 2 }}>Everyday shortcuts</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5, mb: 4 }}>
        <Button aria-controls="personal-coaching-links-panel" aria-expanded={coachingExpanded} onClick={() => { setCoachingExpanded(true); coachingSummaryRef.current?.focus(); }} sx={shortcutSx}>
          <LinkRoundedIcon /><Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontSize: 14, fontWeight: 600 }}>Your booking links</Typography><Typography sx={{ fontSize: 12, color: brand.inkSoft, mt: 0.5 }}>Open or copy a link for a member</Typography></Box><ArrowForwardRoundedIcon sx={{ fontSize: '17px !important' }} />
        </Button>
        <Button component={Link} href={coachingRoom.href!} target="_blank" rel="noopener noreferrer" sx={shortcutSx}>
          <VideocamOutlinedIcon /><Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontSize: 14, fontWeight: 600 }}>{coachingRoom.label}</Typography><Typography sx={{ fontSize: 12, color: brand.inkSoft, mt: 0.5 }}>{coachingRoom.detail}</Typography></Box><ArrowOutwardRoundedIcon sx={{ fontSize: '17px !important' }} />
        </Button>
        <Button component={Link} href={calendar.href!} target="_blank" rel="noopener noreferrer" sx={shortcutSx}>
          <CalendarMonthOutlinedIcon /><Box sx={{ flex: 1, minWidth: 0 }}><Typography sx={{ fontSize: 14, fontWeight: 600 }}>{calendar.label}</Typography><Typography sx={{ fontSize: 12, color: brand.inkSoft, mt: 0.5 }}>View or subscribe to Reboot events</Typography></Box><ArrowOutwardRoundedIcon sx={{ fontSize: '17px !important' }} />
        </Button>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: { xs: 'flex-start', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' }, mb: 1.5 }}>
        <Typography component="h2" sx={{ fontFamily: 'Poppins, Arial, sans-serif', fontSize: 18, fontWeight: 600 }}>Browse by task</Typography>
        <Button component={Link} href="/coach/resources?view=library" endIcon={<ArrowForwardRoundedIcon />} sx={compactButtonSx}>Search the resource library</Button>
      </Box>
      <Box sx={{ borderTop: `1px solid ${brand.border}` }}>
        <Accordion expanded={coachingExpanded} onChange={(_, expanded) => setCoachingExpanded(expanded)} disableGutters elevation={0} sx={accordionSx}>
          <AccordionSummary ref={coachingSummaryRef} expandIcon={<ExpandMoreRoundedIcon />} id="personal-coaching-links" aria-controls="personal-coaching-links-panel">
            <LinkRoundedIcon sx={{ color: brand.turquoiseDeep, fontSize: 21 }} /><Box sx={{ flex: 1, minWidth: 0 }}><Typography component="span" sx={{ fontSize: 14, fontWeight: 600 }}>Your coaching tools</Typography><Typography sx={{ fontSize: 12, color: brand.inkSoft, mt: 0.5 }}>Your booking links and implementation notes</Typography></Box><Typography sx={{ fontSize: 12, color: brand.inkSoft }}>3</Typography>
          </AccordionSummary>
          <AccordionDetails><Box sx={{ bgcolor: brand.card, px: 2, borderRadius: '10px' }}>{loading ? <Skeleton variant="rounded" height={180} sx={{ my: 2 }} /> : error ? <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => setReload((value) => value + 1)}>Retry</Button>}>Your coaching links could not be loaded.</Alert> : profileLinks.map(renderLink)}</Box></AccordionDetails>
        </Accordion>
        {coachResourceGroups.map((group) => (
          <Accordion key={group.id} disableGutters elevation={0} sx={accordionSx}>
            <AccordionSummary expandIcon={<ExpandMoreRoundedIcon />} id={`resource-group-${group.id}`} aria-controls={`resource-group-${group.id}-panel`}>
              <Box sx={{ display: 'flex', color: brand.turquoiseDeep, '& .MuiSvgIcon-root': { fontSize: 21 } }}>{groupIcons[group.id as keyof typeof groupIcons]}</Box><Box sx={{ flex: 1, minWidth: 0 }}><Typography component="span" sx={{ fontSize: 14, fontWeight: 600 }}>{group.label}</Typography><Typography sx={{ fontSize: 12, color: brand.inkSoft, mt: 0.5 }}>{group.detail}</Typography></Box><Typography sx={{ fontSize: 12, color: brand.inkSoft }}>{group.links.length}</Typography>
            </AccordionSummary>
            <AccordionDetails><Box sx={{ bgcolor: brand.card, px: 2, borderRadius: '10px' }}>{group.links.map((label) => sharedCoachResourceLinks.find((link) => link.label === label)!).map(renderLink)}</Box></AccordionDetails>
          </Accordion>
        ))}
      </Box>
      <Snackbar open={Boolean(copyMessage)} autoHideDuration={4000} onClose={() => setCopyMessage(null)}><Alert severity={copyMessage?.severity ?? 'success'} onClose={() => setCopyMessage(null)}>{copyMessage?.text}</Alert></Snackbar>
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
  { value: 'links', label: 'Overview' },
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
