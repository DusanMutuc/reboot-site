'use client';

import { useMemo, useState } from 'react';
import NextLink from 'next/link';
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Link as MuiLink,
  Stack,
  Typography,
  alpha,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import {
  ASSISTANT_ONBOARDING_URL,
  ASSISTANT_WORKROOM_URL,
  FACEBOOK_GROUP_URL,
  REFER_AGENT_URL,
  REBOOT_CALENDAR_URL,
  REBOOT_COACHING_URL,
  REBOOT_TRAINING_URL,
  SYSTEMS_EXPLAINERS_URL,
  type ProgramLinkUrls,
  useProgramLinkUrls,
} from '@/hooks/useProgramLinkUrls';

type LinkGroup = 'live' | 'support' | 'tools' | 'community' | 'referrals' | 'coach';
type LinkItem = {
  id: string;
  label: string;
  href?: string;
  icon: number;
  group: LinkGroup;
};

const BOOKING_LABEL = 'MOMENTUM COACH \nBOOKING LINK';
const IMPL_LABEL = 'IMPLEMENTATION COACH \nBOOKING LINK';
const REFERRAL_PILL_LABEL = 'REFER AN AGENT TO OUR PROGRAM';
const COACH_NOTES_LABEL = 'COACHING NOTES';
const LIVE_MODAL_LINK_IDS = new Set(['calendar', 'assistant-workroom', 'coaching-zoom', 'facebook']);

const baseLinks: LinkItem[] = [
  {
    id: 'training',
    label: 'REBOOT TRAINING,\nTOOLS & COURSE',
    href: REBOOT_TRAINING_URL,
    icon: 5,
    group: 'tools',
  },
  {
    id: 'calendar',
    label: 'REBOOT CALENDAR',
    href: REBOOT_CALENDAR_URL,
    icon: 6,
    group: 'live',
  },
  { id: 'momentum-booking', label: BOOKING_LABEL, icon: 7, group: 'support' },
  { id: 'implementation-booking', label: IMPL_LABEL, icon: 9, group: 'support' },
  {
    id: 'assistant-workroom',
    label: 'ASSISTANT WORKROOM \nZOOM LINK',
    href: ASSISTANT_WORKROOM_URL,
    icon: 8,
    group: 'live',
  },
  {
    id: 'coaching-zoom',
    label: 'REBOOT COACHING \nZOOM LINK',
    href: REBOOT_COACHING_URL,
    icon: 8,
    group: 'live',
  },
  {
    id: 'assistant-onboarding',
    label: 'ASSISTANT ONBOARDING',
    href: ASSISTANT_ONBOARDING_URL,
    icon: 10,
    group: 'support',
  },
  {
    id: 'systems-explainers',
    label: 'REBOOT SYSTEMS EXPLAINERS',
    href: SYSTEMS_EXPLAINERS_URL,
    icon: 11,
    group: 'tools',
  },
  {
    id: 'facebook',
    label: 'REBOOT FACEBOOK GROUP',
    href: FACEBOOK_GROUP_URL,
    icon: 12,
    group: 'community',
  },
  {
    id: 'find-agent',
    label: 'FIND A REBOOT AGENT TO REFER YOUR CLIENTS',
    href: REFER_AGENT_URL,
    icon: 13,
    group: 'community',
  },
];

const LINK_GROUPS: { id: LinkGroup; title: string }[] = [
  { id: 'live', title: 'Live Calls' },
  { id: 'support', title: 'Coach Support' },
  { id: 'tools', title: 'Tools & Training' },
  { id: 'community', title: 'Community' },
  { id: 'referrals', title: 'Referrals' },
  { id: 'coach', title: 'Coach Tools' },
];

type Props = {
  mode?: 'user' | 'coach';
  courseId?: number | null;
  linkUrls?: ProgramLinkUrls;
  modalVariant?: 'all' | 'live-only';
};

export default function ImportantLinks({
  mode = 'user',
  courseId = null,
  linkUrls,
  modalVariant = 'all',
}: Props) {
  const fallbackLinkUrls = useProgramLinkUrls({ mode, courseId, enabled: !linkUrls });
  const resolvedLinkUrls = linkUrls ?? fallbackLinkUrls;
  const [modalOpen, setModalOpen] = useState(false);

  const resolvedLinks = useMemo(() => {
    const items = baseLinks.map((item) => ({ ...item }));

    const bookingIdx = items.findIndex((l) => l.id === 'momentum-booking');
    const implIdx = items.findIndex((l) => l.id === 'implementation-booking');
    if (bookingIdx >= 0) items[bookingIdx].href = resolvedLinkUrls.m2Url ?? items[bookingIdx].href;
    if (implIdx >= 0) items[implIdx].href = resolvedLinkUrls.implUrl ?? items[implIdx].href;

    items.push({
      id: 'refer-agent-program',
      label: REFERRAL_PILL_LABEL,
      href: mode === 'user' ? resolvedLinkUrls.ambassadorHubUrl ?? undefined : undefined,
      icon: 14,
      group: 'referrals',
    });

    if (mode === 'coach') {
      items.push({
        id: 'coaching-notes',
        label: COACH_NOTES_LABEL,
        href: resolvedLinkUrls.coachNotesUrl ?? undefined,
        icon: 15,
        group: 'coach',
      });
    }

    return items;
  }, [mode, resolvedLinkUrls]);

  const modalLinks = useMemo(() => {
    if (modalVariant !== 'live-only') return resolvedLinks;
    return resolvedLinks.filter((link) => LIVE_MODAL_LINK_IDS.has(link.id));
  }, [modalVariant, resolvedLinks]);

  return (
    <Box
      component="section"
      sx={{
        position: 'relative',
        width: '100%',
        overflow: 'hidden',
        bgcolor: '#82bfad',
        px: { xs: 2, md: 5 },
        py: { xs: 7, md: 11 },
      }}
    >
      <DecorativeArc side="left" />

      <Typography
        variant="h2"
        align="center"
        sx={{
          position: 'relative',
          zIndex: 1,
          color: '#050505',
          fontWeight: 900,
          lineHeight: 0.95,
          letterSpacing: { xs: 0, md: 7 },
          textTransform: 'uppercase',
          fontSize: { xs: 'clamp(2.8rem, 13vw, 4.8rem)', md: 'clamp(5rem, 6vw, 9rem)' },
          mb: { xs: 5, md: 7 },
        }}
      >
        Important Program Links
      </Typography>

      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
          gap: { xs: 4, md: 5.5 },
          maxWidth: '156rem',
          mx: 'auto',
        }}
      >
        <LinkCard
          title="Group Coaching"
          caption="Wednesday - Group Coaching Friday - Drop In With Ben"
          image="/Coaching - 1.png"
          fallback="linear-gradient(135deg, rgba(221,244,235,0.9), rgba(37,71,63,0.86)), url('/graph.png')"
          actionLabel="Click Here"
          onClick={() => setModalOpen(true)}
        />
        <LinkCard
          title="Progress Tracker"
          caption="Revenue, 15/30 pipeline, systems built, attendance, your 60-day plan and wins."
          image="/Coaching - 3.png"
          fallback="linear-gradient(135deg, rgba(218,240,232,0.9), rgba(31,64,58,0.86)), url('/graph.png')"
          actionLabel="Click Here"
          href="/tracker"
        />
        <LinkCard
          title="Systems Library & Training"
          caption="Access all pre-built systems and training"
          image="/Coaching - 4.png"
          fallback="linear-gradient(135deg, rgba(220,243,235,0.9), rgba(28,65,58,0.86)), url('/search-hero.png')"
          actionLabel="Click Here"
          href="/resources"
        />
      </Box>

      <CoachingLinksModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalVariant === 'live-only' ? 'Live Coaching Links' : 'Member Links'}
        links={modalLinks}
      />
    </Box>
  );
}

function LinkCard({
  title,
  caption,
  image,
  fallback,
  actionLabel,
  href,
  onClick,
}: {
  title: string;
  caption: string;
  image: string;
  fallback: string;
  actionLabel: string;
  href?: string;
  onClick?: () => void;
}) {
  const cardContent = (
    <>
      <Box
        sx={{
          position: 'relative',
          aspectRatio: { xs: '1.65 / 1', md: '2.08 / 1' },
          border: '5px solid #27433d',
          overflow: 'hidden',
          backgroundColor: '#24463f',
          backgroundImage: `linear-gradient(rgba(116,164,151,0.18), rgba(14,36,32,0.42)), url('${image}'), ${fallback}`,
          backgroundSize: 'cover, cover, cover',
          backgroundPosition: 'center',
          filter: 'saturate(0.92)',
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'grid',
            placeItems: 'center',
            px: 3,
            bgcolor: 'rgba(5,20,17,0.18)',
          }}
        >
          <Typography
            sx={{
              color: '#fff',
              fontFamily: '"League Spartan", "Roboto", "Helvetica", "Arial", sans-serif',
              fontWeight: 900,
              textAlign: 'center',
              textTransform: 'uppercase',
              textShadow: '0 3px 0 rgba(0,0,0,0.4)',
              letterSpacing: { xs: 1.5, md: 3 },
              lineHeight: 0.96,
              fontSize: { xs: 'clamp(3rem, 11vw, 5.2rem)', md: 'clamp(3.6rem, 3.3vw, 6rem)' },
              maxWidth: '12ch',
            }}
          >
            {title}
          </Typography>
        </Box>
      </Box>

      <Box
        sx={{
          minHeight: { xs: 84, md: 104 },
          display: 'grid',
          placeItems: 'center',
          bgcolor: '#050505',
          px: { xs: 2, md: 4 },
          py: 2.25,
        }}
      >
        <Typography
          sx={{
            color: '#fff',
            fontWeight: 600,
            textAlign: 'center',
            textTransform: 'uppercase',
            letterSpacing: { xs: 1.5, md: 3.5 },
            lineHeight: 1.06,
            fontSize: { xs: '1.45rem', md: 'clamp(1.45rem, 1.2vw, 2.1rem)' },
          }}
        >
          {caption}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2.2 }}>
        <Box
          component="span"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 42,
            px: 2,
            borderRadius: 999,
            border: '2px solid rgba(255,255,255,0.92)',
            bgcolor: '#ffb700',
            color: '#050505',
            fontWeight: 900,
            textTransform: 'uppercase',
            fontSize: { xs: '1.35rem', md: '1.55rem' },
            lineHeight: 1,
            boxShadow: '0 5px 0 rgba(0,0,0,0.16)',
            transition: 'transform 160ms ease, box-shadow 160ms ease',
          }}
        >
          {actionLabel}
        </Box>
      </Box>
    </>
  );

  const commonSx = {
    appearance: 'none',
    border: 0,
    bgcolor: 'transparent',
    p: 0,
    color: 'inherit',
    textDecoration: 'none',
    textAlign: 'initial',
    cursor: 'pointer',
    transition: 'transform 180ms ease',
    '&:hover': {
      transform: 'translateY(-5px)',
      '& span': {
        transform: 'translateY(-1px)',
        boxShadow: '0 7px 0 rgba(0,0,0,0.18)',
      },
    },
    '&:focus-visible': {
      outline: '4px solid rgba(255,183,0,0.58)',
      outlineOffset: 6,
    },
  } as const;

  if (href) {
    return (
      <Box component={NextLink} href={href} prefetch={false} sx={commonSx}>
        {cardContent}
      </Box>
    );
  }

  return (
    <Box component="button" type="button" onClick={onClick} sx={commonSx}>
      {cardContent}
    </Box>
  );
}

function CoachingLinksModal({
  open,
  onClose,
  title,
  links,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  links: LinkItem[];
}) {
  const groupedLinks = useMemo(() => {
    const map = new Map<LinkGroup, LinkItem[]>();
    links.forEach((link) => {
      const groupLinks = map.get(link.group) ?? [];
      groupLinks.push(link);
      map.set(link.group, groupLinks);
    });
    return map;
  }, [links]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="lg"
      PaperProps={{
        sx: {
          bgcolor: '#07100e',
          color: '#fff',
          borderRadius: 2,
          border: '1px solid rgba(130,191,173,0.45)',
          boxShadow: '0 28px 90px rgba(0,0,0,0.65)',
          overflow: 'hidden',
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 2,
          bgcolor: '#000',
          borderBottom: '1px solid rgba(130,191,173,0.35)',
          px: { xs: 2.25, md: 4 },
          py: { xs: 2, md: 3 },
        }}
      >
        <Box>
          <Typography
            component="span"
            sx={{
              display: 'block',
              color: '#82bfad',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: 2,
              fontSize: '1rem',
              mb: 0.75,
            }}
          >
            Group Coaching
          </Typography>
          <Typography
            component="span"
            sx={{
              display: 'block',
              fontFamily: '"League Spartan", "Roboto", "Helvetica", "Arial", sans-serif',
              fontWeight: 900,
              textTransform: 'uppercase',
              lineHeight: 0.96,
              fontSize: { xs: '2.8rem', md: '4.8rem' },
            }}
          >
            {title}
          </Typography>
        </Box>

        <IconButton
          aria-label="Close member links"
          onClick={onClose}
          sx={{
            color: '#fff',
            bgcolor: 'rgba(255,255,255,0.08)',
            '&:hover': { bgcolor: 'rgba(255,255,255,0.16)' },
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: { xs: 2.25, md: 4 } }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
            gap: { xs: 2.5, md: 3 },
          }}
        >
          {LINK_GROUPS.map((group) => {
            const groupLinks = groupedLinks.get(group.id) ?? [];
            if (!groupLinks.length) return null;

            return (
              <Box
                key={group.id}
                sx={{
                  p: { xs: 2, md: 2.5 },
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 1,
                  bgcolor: 'rgba(255,255,255,0.035)',
                }}
              >
                <Typography
                  sx={{
                    color: '#82bfad',
                    fontWeight: 900,
                    textTransform: 'uppercase',
                    letterSpacing: 1.6,
                    mb: 1.5,
                    fontSize: '1.15rem',
                  }}
                >
                  {group.title}
                </Typography>

                <Stack spacing={1.15}>
                  {groupLinks.map((link) => (
                    <ModalLink key={link.id} link={link} />
                  ))}
                </Stack>
              </Box>
            );
          })}
        </Box>
      </DialogContent>
    </Dialog>
  );
}

function ModalLink({ link }: { link: LinkItem }) {
  const content = (
    <>
      <Box
        component="img"
        src={`/${link.icon}.svg`}
        alt=""
        sx={{
          width: { xs: 42, md: 48 },
          height: { xs: 42, md: 48 },
          borderRadius: '50%',
          flexShrink: 0,
          bgcolor: 'rgba(255,255,255,0.08)',
        }}
      />
      <Typography
        sx={{
          flex: 1,
          minWidth: 0,
          whiteSpace: 'pre-line',
          color: '#fff',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          lineHeight: 1.15,
          fontSize: { xs: '1.05rem', md: '1.18rem' },
        }}
      >
        {link.label}
      </Typography>
      {link.href ? (
        <OpenInNewIcon sx={{ color: '#82bfad', fontSize: 20, flexShrink: 0 }} />
      ) : (
        <Typography
          component="span"
          sx={{
            color: 'rgba(255,255,255,0.52)',
            fontWeight: 800,
            textTransform: 'uppercase',
            fontSize: '0.85rem',
            flexShrink: 0,
          }}
        >
          Soon
        </Typography>
      )}
    </>
  );

  const sx = {
    display: 'flex',
    alignItems: 'center',
    gap: 1.5,
    minHeight: 66,
    borderRadius: 1,
    px: 1.25,
    py: 1,
    border: '1px solid rgba(255,255,255,0.08)',
    bgcolor: link.href ? 'rgba(255,255,255,0.055)' : 'rgba(255,255,255,0.025)',
    opacity: link.href ? 1 : 0.62,
    textDecoration: 'none',
    transition: 'background-color 160ms ease, transform 160ms ease, border-color 160ms ease',
    '&:hover': {
      bgcolor: link.href ? alpha('#82bfad', 0.16) : 'rgba(255,255,255,0.025)',
      borderColor: link.href ? 'rgba(130,191,173,0.52)' : 'rgba(255,255,255,0.08)',
      transform: link.href ? 'translateY(-1px)' : 'none',
    },
    '&:focus-visible': {
      outline: '3px solid rgba(130,191,173,0.5)',
      outlineOffset: 2,
    },
  } as const;

  if (!link.href) {
    return <Box sx={sx}>{content}</Box>;
  }

  return (
    <MuiLink
      component={NextLink}
      href={link.href}
      target={link.href.startsWith('/') ? undefined : '_blank'}
      rel={link.href.startsWith('/') ? undefined : 'noopener noreferrer'}
      underline="none"
      sx={sx}
    >
      {content}
    </MuiLink>
  );
}

function DecorativeArc({ side }: { side: 'left' | 'right' }) {
  const isLeft = side === 'left';

  return (
    <Box
      aria-hidden
      sx={{
        position: 'absolute',
        width: { xs: 220, md: 360 },
        height: { xs: 420, md: 680 },
        top: { xs: -70, md: -130 },
        left: isLeft ? { xs: -180, md: -245 } : 'auto',
        right: isLeft ? 'auto' : { xs: -180, md: -245 },
        border: '3px solid rgba(0,0,0,0.86)',
        borderRadius: '50%',
        transform: isLeft ? 'rotate(5deg)' : 'rotate(-5deg)',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: { xs: 28, md: 42 },
          border: '3px solid rgba(0,0,0,0.86)',
          borderRadius: '50%',
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: { xs: 56, md: 84 },
          border: '3px solid rgba(0,0,0,0.86)',
          borderRadius: '50%',
        },
      }}
    />
  );
}
