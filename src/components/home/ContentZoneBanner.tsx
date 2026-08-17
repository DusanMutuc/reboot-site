'use client';

import Image from 'next/image';
import { Box, Container, Typography } from '@mui/material';
import banner from '/public/search-hero.png';
import { brand, HOME_MAX_WIDTH } from '@/lib/homeTheme';

/**
 * Marks the boundary between the two halves of the page.
 *
 * A bare tonal step read as a rendering artifact rather than a decision — the
 * eye registered a change but had nothing confirming it was authored. A banner
 * gives the boundary an author, and matches the brand's existing device of
 * display type over imagery.
 *
 * Deliberately short. The sections this replaces on the live site spend a full
 * screen saying one thing.
 */
export default function ContentZoneBanner() {
  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        bgcolor: brand.slate,
        minHeight: { xs: 128, md: 156 },
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <Image
        src={banner}
        alt=""
        aria-hidden="true"
        fill
        quality={55}
        sizes="100vw"
        placeholder="blur"
        style={{ objectFit: 'cover', objectPosition: 'center 40%' }}
      />

      {/* Scrim, so the heading holds contrast wherever the crop lands. */}
      <Box
        aria-hidden="true"
        sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(16,20,19,0.62)' }}
      />

      <Container
        maxWidth={false}
        sx={{ position: 'relative', zIndex: 1, maxWidth: HOME_MAX_WIDTH, px: { xs: 2.5, md: 4 } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
          <Box
            aria-hidden="true"
            sx={{ width: 18, height: 3, bgcolor: brand.turquoise, borderRadius: 2 }}
          />
          <Typography
            variant="sectionLabel"
            sx={{
              display: 'block',
              fontSize: 12.5,
              letterSpacing: '0.14em',
              color: brand.turquoise,
            }}
          >
            Training resources
          </Typography>
        </Box>

        <Typography
          variant="slabTitle"
          component="h2"
          sx={{ fontSize: { xs: 27, md: 34 }, color: '#ffffff', mb: 0.75 }}
        >
          Have a look around
        </Typography>

        <Typography sx={{ fontSize: 15, color: 'rgba(255,255,255,0.74)' }}>
          Trainings, playbooks, replays and the podcast.
        </Typography>
      </Container>
    </Box>
  );
}
