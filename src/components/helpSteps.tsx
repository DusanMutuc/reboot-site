'use client';

import { Box, Typography } from '@mui/material';

const steps = [
  {
    title: 'Search The Facebook Group',
    subtitle: 'Search past questions or post a question and tag team',
  },
  {
    title: 'Search on the Reboot members dashboard',
    subtitle:
      'Find the right replay podcasts or the right systems for the right solution',
  },
  {
    title: 'Weekly Group Coaching',
    subtitle: 'Ask a coach or mastermind with a tribe',
  },
  {
    title: 'Email Program Manager',
    subtitle: 'admin@rebootmembers.com',
  },
  {
    title: 'Attend your M2 Coaching Session',
    subtitle: 'Prepare a 1-3-1 – review your tracker – get one-to-one advice',
  },
];

/** White “Follow these steps to get help” guide. */
export default function HelpSteps() {
  return (
    <section
      style={{
        backgroundColor: 'white',
        width: '100%',
        scrollSnapAlign: 'start',
      }}
    >
      {/* ─────────── Full-width banner ─────────── */}
      <Box
        sx={{
          width: '100%',
          backgroundColor: '#5cbca8',
          py: '2.625rem', // 42px
        }}
      >
        <Box
          sx={{
            maxWidth: '100rem', // 1400px
            mx: 'auto',
            px: 3,
          }}
        >
          <Typography
            variant="h3"
            sx={{
              color: '#000',
              fontWeight: 800,
              lineHeight: 1.1,
              textTransform: 'uppercase',
              letterSpacing: 1,
              m: 0,
              textAlign: 'left',
              fontSize: {
                xs: 'clamp(2.2rem, 6vw, 4rem)',
                lg: 'clamp(4rem, 8vw, 8rem)',
              },
            }}
          >
            STEPS TO GET HELP
          </Typography>
        </Box>
      </Box>

      {/* ─────────── Main flex row ─────────── */}
      <Box
        sx={{
          display: 'flex',
          position: 'relative',
          width: '100%',
          pt: '2.5rem',
        }}
      >
        <Box
          sx={{
            maxWidth: '100rem',
            mx: 'auto',
            display: 'flex',
            gap: '2rem',
            px: 3,
          }}
        >
          {/* Left column: steps list */}
          <Box sx={{ flex: 1 }}>
            {steps.map((s, idx) => (
              <Box
                key={s.title}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  mb: '2.5rem', // 40px
                }}
              >
                {/* number badge */}
                <Box
                  component="img"
                  src={`/${idx + 1}.png`}
                  alt={`Step ${idx + 1}`}
                  sx={{
                    width: '5rem', // 80px
                    height: '5rem',
                    objectFit: 'contain',
                    mr: '1.5rem', // 24px
                    flexShrink: 0,
                  }}
                />

                {/* titles */}
                <Box sx={{ flex: 1 }}>
                  <Typography
                    variant="h5"
                    sx={{
                      fontWeight: 800,
                      mb: 1,
                      fontSize: { xs: '2rem', md: '3rem' },
                    }}
                  >
                    {s.title}
                  </Typography>

                  <Typography
                    variant="body1"
                    sx={{
                      color: '#555',
                      fontSize: { xs: '1.5rem', md: '2rem' },
                    }}
                  >
                    {s.subtitle}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Box>

          {/* Right column: arrow + “HELP!” art */}
          <Box
            sx={{
              flexShrink: 0,
              width: 260,
              position: 'relative',
            }}
          >
            <Box
              component="img"
              src="/Website%20-%20help%20arrow.png"
              alt=""
              sx={{
                position: 'absolute',
                top: -150,
                right: 0,
                width: 'auto',
                height: '100%',
                maxWidth: 260,
                pointerEvents: 'none',
              }}
            />
            <Box
              component="img"
              src="/Website%20-%20help.png"
              alt="Help!"
              sx={{
                position: 'absolute',
                bottom: 20,
                right: 0,
                width: '80%',
                maxWidth: 180,
                pointerEvents: 'none',
              }}
            />
          </Box>
        </Box>
      </Box>

      {/* ─────────── Placeholder footer ─────────── */}
      <Box
        sx={{
          width: '100%',
          backgroundColor: '#2a2a2a',
          p: 3,
          mt: '3.75rem',
          textAlign: 'center',
        }}
      >
        <Typography variant="body2" sx={{ color: '#aaa', fontSize: 14 }}>
          © 2025 Reboot • All rights reserved (placeholder text)
        </Typography>
      </Box>
    </section>
  );
}
