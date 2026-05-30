'use client';

import { Box, Typography } from '@mui/material';
import {
  ASSISTANT_ONBOARDING_URL,
  REFER_AGENT_URL,
  type ProgramLinkUrls,
} from '@/hooks/useProgramLinkUrls';

type MoreProgramLinksProps = {
  linkUrls: ProgramLinkUrls;
};

type ProgramCardProps = {
  eyebrow?: string;
  title: string;
  image: string;
  fallback: string;
  href?: string | null;
  loading?: boolean;
  variant?: 'top' | 'referral';
};

export default function MoreProgramLinks({ linkUrls }: MoreProgramLinksProps) {
  const dynamicLoading = linkUrls.loading;

  return (
    <Box component="section" sx={{ width: '100%', overflow: 'hidden', bgcolor: '#82bfad' }}>
      <Box
        sx={{
          bgcolor: '#000',
          color: '#fff',
          px: { xs: 2, md: 5 },
          pt: { xs: 4, md: 4.5 },
          pb: { xs: 4, md: 3.2 },
        }}
      >
        <Typography
          variant="h2"
          align="center"
          sx={{
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: { xs: 1, md: 4 },
            lineHeight: 0.95,
            mb: { xs: 3, md: 3.5 },
            fontSize: { xs: 'clamp(2.8rem, 12vw, 4.8rem)', md: 'clamp(4.6rem, 4.2vw, 7rem)' },
          }}
        >
          More... Reboot Program Links
        </Typography>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' },
            gap: { xs: 3, md: 3.5 },
            maxWidth: 1120,
            mx: 'auto',
          }}
        >
          <ProgramCard
            eyebrow="One-On-One"
            title="60 Day Sprint Coach"
            image="/Coaching - 8.png"
            fallback="linear-gradient(135deg, rgba(255,255,255,0.88), rgba(40,70,64,0.35)), url('/graph.png')"
            href={linkUrls.m2Url}
            loading={dynamicLoading}
          />
          <ProgramCard
            eyebrow="One-On-One"
            title="Implementation Session"
            image="/Coaching - 9.png"
            fallback="linear-gradient(135deg, rgba(255,255,255,0.88), rgba(40,70,64,0.35)), url('/search-hero.png')"
            href={linkUrls.implUrl}
            loading={dynamicLoading}
          />
          <ProgramCard
            eyebrow="Your Assistant Training"
            title="& Mastermind"
            image="/Coaching - 7.png"
            fallback="linear-gradient(135deg, rgba(255,255,255,0.9), rgba(40,70,64,0.32)), url('/Website - help.png')"
            href={ASSISTANT_ONBOARDING_URL}
          />
        </Box>
      </Box>

      <Box
        sx={{
          position: 'relative',
          bgcolor: '#82bfad',
          color: '#fff',
          px: { xs: 2, md: 5 },
          py: { xs: 6, md: 8 },
        }}
      >
        <ReferralArcs side="left" />
        <ReferralArcs side="right" />

        <Typography
          variant="h2"
          align="center"
          sx={{
            position: 'relative',
            zIndex: 1,
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: { xs: 1, md: 7 },
            lineHeight: 0.95,
            mb: { xs: 4, md: 5 },
            fontSize: { xs: 'clamp(4.4rem, 18vw, 7rem)', md: 'clamp(7rem, 8vw, 12rem)' },
          }}
        >
          Reboot Referrals
        </Typography>

        <Box
          sx={{
            position: 'relative',
            zIndex: 1,
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
            gap: { xs: 4, md: 5 },
            maxWidth: 1220,
            mx: 'auto',
          }}
        >
          <ProgramCard
            title="Refer a Reboot Agent"
            image="/COACHING and MASTERCLASS LOGOS - Reboot Logo Black.png"
            fallback="linear-gradient(135deg, rgba(130,0,0,0.85), rgba(255,70,45,0.54)), url('/Reboot Coaching Logo - White.png')"
            href={REFER_AGENT_URL}
            variant="referral"
          />
          <ProgramCard
            title="Refer the Program"
            image="/referral-program.png"
            fallback="linear-gradient(135deg, rgba(10,25,45,0.9), rgba(255,205,58,0.42)), url('/Website announcement test.png')"
            href={linkUrls.ambassadorHubUrl}
            loading={dynamicLoading}
            variant="referral"
          />
        </Box>
      </Box>
    </Box>
  );
}

function ProgramCard({
  eyebrow,
  title,
  image,
  fallback,
  href,
  loading = false,
  variant = 'top',
}: ProgramCardProps) {
  const disabled = !href;
  const ctaLabel = href ? 'Click Here' : loading ? 'Loading' : 'Unavailable';
  const isReferral = variant === 'referral';

  const content = (
    <>
      <Box
        sx={{
          width: '100%',
          aspectRatio: isReferral ? '2 / 1' : '2.1 / 1',
          borderRadius: isReferral ? 0 : 4,
          overflow: 'hidden',
          backgroundColor: isReferral ? '#101010' : '#f2f2f2',
          backgroundImage: `linear-gradient(rgba(0,0,0,0.02), rgba(0,0,0,0.14)), url('${image}'), ${fallback}`,
          backgroundSize: 'cover, cover, cover',
          backgroundPosition: 'center',
          border: isReferral ? '1px solid rgba(0,0,0,0.28)' : '1px solid rgba(255,255,255,0.16)',
        }}
      />

      {isReferral ? (
        <Typography
          sx={{
            color: '#fff',
            textAlign: 'center',
            textTransform: 'uppercase',
            letterSpacing: { xs: 1.5, md: 2.2 },
            fontWeight: 500,
            fontSize: { xs: '1.6rem', md: '2rem' },
            lineHeight: 1.1,
            mt: 2,
          }}
        >
          {title}
        </Typography>
      ) : (
        <Box
          sx={{
            minHeight: 60,
            display: 'grid',
            placeItems: 'center',
            bgcolor: '#82bfad',
            color: '#050505',
            borderRadius: 999,
            px: 2,
            mt: 0.8,
          }}
        >
          <Typography
            sx={{
              textAlign: 'center',
              textTransform: 'uppercase',
              letterSpacing: 2,
              fontWeight: 900,
              fontSize: { xs: '1.05rem', md: '1.18rem' },
              lineHeight: 1.35,
            }}
          >
            {eyebrow ? (
              <>
                <Box component="span" sx={{ display: 'block' }}>
                  {eyebrow}
                </Box>
                <Box component="span" sx={{ display: 'block' }}>
                  {title}
                </Box>
              </>
            ) : (
              title
            )}
          </Typography>
        </Box>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'center', mt: isReferral ? 1.8 : 1.4 }}>
        <Box
          component="span"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: isReferral ? 40 : 28,
            px: isReferral ? 2 : 1.25,
            borderRadius: 999,
            border: isReferral ? 0 : '1px solid rgba(255,255,255,0.78)',
            bgcolor: isReferral ? '#050505' : '#ffb700',
            color: isReferral ? '#fff' : '#050505',
            fontWeight: 900,
            textTransform: 'uppercase',
            letterSpacing: isReferral ? 1.2 : 0,
            fontSize: isReferral ? { xs: '1.45rem', md: '1.75rem' } : { xs: '1rem', md: '1.08rem' },
            lineHeight: 1,
            opacity: disabled ? 0.66 : 1,
          }}
        >
          {ctaLabel}
        </Box>
      </Box>
    </>
  );

  const sx = {
    display: 'block',
    color: 'inherit',
    textDecoration: 'none',
    border: 0,
    p: 0,
    bgcolor: 'transparent',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.72 : 1,
    transition: 'transform 180ms ease, opacity 180ms ease',
    '&:hover': {
      transform: disabled ? 'none' : 'translateY(-4px)',
    },
    '&:focus-visible': {
      outline: '4px solid rgba(255,183,0,0.5)',
      outlineOffset: 6,
    },
  } as const;

  if (!href) {
    return (
      <Box aria-disabled sx={sx}>
        {content}
      </Box>
    );
  }

  return (
    <Box component="a" href={href} target="_blank" rel="noopener noreferrer" sx={sx}>
      {content}
    </Box>
  );
}

function ReferralArcs({ side }: { side: 'left' | 'right' }) {
  const isLeft = side === 'left';

  return (
    <Box
      aria-hidden
      sx={{
        position: 'absolute',
        width: { xs: 190, md: 300 },
        height: { xs: 160, md: 230 },
        top: { xs: -76, md: -96 },
        left: isLeft ? { xs: -122, md: -145 } : 'auto',
        right: isLeft ? 'auto' : { xs: -122, md: -145 },
        border: '2px solid #050505',
        borderRadius: '0 0 999px 999px',
        transform: isLeft ? 'rotate(0deg)' : 'rotate(0deg)',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: { xs: 24, md: 34 },
          border: '2px solid #050505',
          borderRadius: '0 0 999px 999px',
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: { xs: 48, md: 68 },
          border: '2px solid #050505',
          borderRadius: '0 0 999px 999px',
        },
      }}
    />
  );
}
