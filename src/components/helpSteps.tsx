'use client';

import { Box, Typography, Link as MuiLink } from '@mui/material';

const steps = [
  { title: 'Search The Facebook Group', subtitle: 'Search past questions or post a question and tag team' },
  { title: 'Search on the Reboot members dashboard', subtitle: 'Find the right replay podcasts or the right systems for the right solution' },
  { title: 'Weekly Group Coaching', subtitle: 'Ask a coach or mastermind with a tribe' },
  { title: 'Email Program Manager', subtitle: 'admin@rebootmembers.com' },
  { title: 'Attend your M2 Coaching Session', subtitle: 'Prepare a 1-3-1 – review your tracker – get one-to-one advice' },
];

/** White “Follow these steps to get help” guide. */
export default function HelpSteps() {
  return (
    <section style={{ backgroundColor: 'white', width: '100%', scrollSnapAlign: 'start' }}>
      {/* ─────────── Full-width banner ─────────── */}
      <Box sx={{ width: '100%', backgroundColor: '#5cbca8', py: '2.625rem'}}>
        <Box sx={{ maxWidth: '100rem', mx: 'auto', px: 3 }}>
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
              fontSize: { xs: 'clamp(2rem, 6vw, 3rem)', lg: 'clamp(4rem, 8vw, 8rem)' },
            }}
          >
            STEPS TO GET HELP
          </Typography>
        </Box>
      </Box>

      {/* ─────────── Main row (stacks on mobile) ─────────── */}
      <Box sx={{ display: 'flex', position: 'relative', width: '100%', pt: { xs: '1.5rem', md: '2.5rem' } }}>
        <Box
          sx={{
            maxWidth: '100rem',
            mx: 'auto',
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },   // stack on mobile
            gap: { xs: '1.5rem', md: '2rem' },
            px: 3,
          }}
        >
          {/* Left column: steps list */}
          <Box sx={{ flex: 1 }}>
            {steps.map((s, idx) => {
              const isEmail = /@/.test(s.subtitle);

              return (
                <Box
                  key={s.title}
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: { xs: '0.75rem', md: '1.5rem' },
                    mb: { xs: '1.5rem', md: '2.5rem' },
                    pb: { xs: '1rem', md: 0 },
                    borderBottom: { xs: '1px solid #eee', md: 'none' }, // subtle rhythm on mobile
                  }}
                >
                  {/* number badge (PNG) */}
                  <Box
                    component="img"
                    src={`/${idx + 1}.png`}
                    alt={`Step ${idx + 1}`}
                    sx={{
                      width: { xs: '2.75rem', md: '5rem' },   // 44px → 80px
                      height: { xs: '2.75rem', md: '5rem' },
                      objectFit: 'contain',
                      flexShrink: 0,
                    }}
                  />

                  {/* titles */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      variant="h5"
                      sx={{
                        fontWeight: 800,
                        mb: 0.5,
                        fontSize: { xs: '1.25rem', md: '2rem', lg: '3rem' },
                        lineHeight: 1.2,
                      }}
                    >
                      {s.title}
                    </Typography>

                    {isEmail ? (
                      <Typography sx={{ color: '#555', fontSize: { xs: '1rem', md: '1.25rem', lg: '2rem' } }}>
                        <MuiLink href={`mailto:${s.subtitle}`} sx={{ color: '#2b2b2b' }}>
                          {s.subtitle}
                        </MuiLink>
                      </Typography>
                    ) : (
                      <Typography sx={{ color: '#555', fontSize: { xs: '1rem', md: '1.25rem', lg: '2rem' } }}>
                        {s.subtitle}
                      </Typography>
                    )}
                  </Box>
                </Box>
              );
            })}
          </Box>

          {/* Right column: arrow + “HELP!” art — hidden on mobile */}
          <Box sx={{ flexShrink: 0, width: 260, position: 'relative', display: { xs: 'none', md: 'block' } }}>
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

      {/* ─────────── Footer ─────────── */}
      <Box sx={{ width: '100%', backgroundColor: '#2a2a2a', p: 3, mt: { xs: 4, md: '3.75rem' }, textAlign: 'center' }}>
        
      </Box>
    </section>
  );
}
