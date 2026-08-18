'use client';

import Image from 'next/image';
import { Box, Container, Typography } from '@mui/material';
import banner from '/public/search-hero.png';
import { brand, HOME_MAX_WIDTH } from '@/lib/homeTheme';
import { useIsBrandAccent } from './accent';
import BrandRosette from './BrandRosette';

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
 *
 * On the brand accent this is where red does its most useful work. The page
 * has two halves — what the member owes, and what the library offers — and the
 * seam between them was being carried by a five-point tonal step that the
 * review harness still has a whole row of experiments for. A saturated field
 * ends that argument: the reader cannot miss a chapter break they can see from
 * across the room. It is also the one large surface on the page with no datum
 * on it, which is precisely why it can afford the colour.
 */
export default function ContentZoneBanner() {
  const isBrand = useIsBrandAccent();

  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        bgcolor: isBrand ? brand.redDeep : brand.slate,
        backgroundImage: isBrand
          ? `linear-gradient(104deg, ${brand.red} 0%, ${brand.redDeep} 52%, ${brand.redShadow} 100%)`
          : 'none',
        minHeight: isBrand ? { xs: 150, md: 190 } : { xs: 128, md: 156 },
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {/* The photograph survives on the brand accent, but as grain rather than
          as a picture: soft-light against a dark base can only modulate what is
          already there, so it lends the field depth without ever lifting it far
          enough to threaten the white type. */}
      <Image
        src={banner}
        alt=""
        aria-hidden="true"
        fill
        quality={55}
        sizes="100vw"
        placeholder="blur"
        style={{
          objectFit: 'cover',
          objectPosition: 'center 40%',
          opacity: isBrand ? 0.2 : 1,
          mixBlendMode: isBrand ? 'soft-light' : 'normal',
        }}
      />

      {isBrand ? (
        <>
          {/* Weights the left, where the heading sits, and lets the texture
              come up on the right. */}
          <Box
            aria-hidden="true"
            sx={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `linear-gradient(90deg, ${brand.redShadow} 0%, rgba(94,19,20,0.55) 52%, rgba(94,19,20,0.12) 100%)`,
              opacity: 0.72,
            }}
          />
          {/* Hidden on narrow screens rather than shrunk: at 375px the copy
              wraps across the full width, so anything behind it is sitting
              behind text. Decoration gives way, the colour does not. */}
          <BrandRosette
            height={268}
            tone="white"
            opacity={0.08}
            sx={{
              display: { xs: 'none', md: 'block' },
              right: 64,
              top: '50%',
              transform: 'translateY(-50%)',
            }}
          />
        </>
      ) : (
        /* Scrim, so the heading holds contrast wherever the crop lands. */
        <Box
          aria-hidden="true"
          sx={{ position: 'absolute', inset: 0, bgcolor: 'rgba(16,20,19,0.62)' }}
        />
      )}

      <Container
        maxWidth={false}
        sx={{ position: 'relative', zIndex: 1, maxWidth: HOME_MAX_WIDTH, px: { xs: 2.5, md: 4 } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, mb: 1 }}>
          <Box
            aria-hidden="true"
            sx={{
              width: 18,
              height: 3,
              bgcolor: isBrand ? 'rgba(255,255,255,0.92)' : brand.turquoise,
              borderRadius: 2,
            }}
          />
          {/* Not turquoise on the red field: at 12px it is body-sized for
              contrast purposes, and turquoise on this red lands at 4.49:1 —
              under the 4.5 it would need. White clears it outright. */}
          <Typography
            variant="eyebrow"
            sx={{
              display: 'block',
              color: isBrand ? 'rgba(255,255,255,0.92)' : brand.turquoise,
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
