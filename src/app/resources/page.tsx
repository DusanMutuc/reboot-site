'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import PrefetchOnIdle from './PrefetchOnIdle';
import {
  Box,
  Container,
  Stack,
  Typography,
  IconButton,
} from '@mui/material';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';

type ResourceCardProps = {
  href: string;
  gradient: string;
  icon: ReactNode;
  title: string;
  description: string;
  cta: string;
  delay?: number;
};

function ResourceCard({
  href,
  gradient,
  icon,
  title,
  description,
  cta,
  delay = 0,
}: ResourceCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Box
      component={Link}
      href={href}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={(theme) => ({
        position: 'relative',
        p: { xs: 3, md: 4.5 },
        minHeight: { xs: 260, md: 360 }, // bigger card
        borderRadius: 4,
        textDecoration: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        overflow: 'hidden',
        // gradients passed in as background
        backgroundImage: gradient,
        backgroundSize: '140% 140%',
        backgroundPosition: isHovered ? '100% 0%' : '0% 0%',
        color: 'common.white',
        boxShadow: isHovered
          ? '0 26px 70px rgba(15,23,42,0.55)'
          : '0 18px 50px rgba(15,23,42,0.45)',
        transform: isHovered ? 'translateY(-6px) scale(1.02)' : 'translateY(0) scale(1)',
        transition: theme.transitions.create(
          ['transform', 'box-shadow', 'background-position'],
          {
            duration: 300,
            easing: theme.transitions.easing.easeOut,
            delay,
          }
        ),
        border: '1px solid rgba(255,255,255,0.18)',
      })}
    >
      {/* Soft highlight blob */}
      <Box
        sx={{
          position: 'absolute',
          top: -40,
          right: -40,
          width: 180,
          height: 180,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.5), transparent 60%)',
          opacity: 0.7,
        }}
      />

      <Box sx={{ position: 'relative', zIndex: 1 }}>
        <Box
          sx={{
            mb: 2,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 2,
            p: 1.25,
            backgroundColor: 'rgba(15,23,42,0.35)',
            boxShadow: '0 10px 25px rgba(15,23,42,0.6)',
          }}
        >
          {icon}
        </Box>

        <Typography
          variant="h4"
          sx={{
            fontWeight: 800,
            mt: 2,
            mb: 4,
            letterSpacing: 0.2,
          }}
        >
          {title}
        </Typography>

        <Typography
          variant="body1"
          sx={{
            opacity: 0.96,
            lineHeight: 1.7,
            maxWidth: '36rem',
          }}
        >
          {description}
        </Typography>
      </Box>

      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          mt: 3,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 1,
          fontWeight: 600,
          fontSize: '0.98rem',
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          opacity: isHovered ? 1 : 0.9,
        }}
      >
        <span>{cta}</span>
        <span style={{ transform: isHovered ? 'translateX(4px)' : 'translateX(0)', transition: 'transform 0.2s ease-out' }}>
          →
        </span>
      </Box>
    </Box>
  );
}

export default function ResourcesPage() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Sticky header – same styling as Courses */}
      <Box
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          backdropFilter: 'saturate(180%) blur(8px)',
          backgroundColor: 'rgba(255,255,255,0.78)',
          borderBottom: '1px solid',
          borderColor: 'grey.100',
        }}
      >
        <Container maxWidth="lg" sx={{ py: 1 }}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <IconButton
              LinkComponent={Link}
              href="/dashboard"
              aria-label="Back to Home"
              size="medium"
            >
              <ArrowBackIosNewIcon />
            </IconButton>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Resources
            </Typography>
          </Stack>
        </Container>
      </Box>

      {/* Body */}
      <Container
        maxWidth="lg"
        sx={{
          flex: 1,
          py: { xs: 4, md: 6 },
        }}
      >
        <PrefetchOnIdle />

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
            gap: { xs: 3.5, md: 4.5 },
            alignItems: 'stretch',
          }}
        >

<ResourceCard
            href="/courses"
            // MAIN THEME TEAL
            gradient="linear-gradient(135deg, #0F172A 0%, #0F766E 40%, #14B8A6 100%)"
            icon={
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            }
            title="Courses"
            description="Go to the course hub to browse programs and continue where you left off."
            cta="Explore Courses"
          />

<ResourceCard
  href="/library"
  // NOTES YELLOW – dark to light
  gradient="linear-gradient(135deg, #bd9924 0%, #FACC15 40%, #e0b62d 100%)"
  icon={
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  }
  title="Library"
  description="Open the resource library to search playbooks, worksheets, and recordings."
  cta="Browse Library"
/>


        </Box>
      </Container>
    </Box>
  );
}
