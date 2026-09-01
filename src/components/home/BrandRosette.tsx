'use client';

import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';

/**
 * The logo's rosette, used large and faint as texture.
 *
 * This is the answer to "the page needs imagery" that does not cost anything.
 * There are three usable photographs in `public/`, all 2560x680, already
 * stretched across twelve thumbnail crops — adding more photographic surfaces
 * from that pool would make the page look cheaper, not richer. The mark itself
 * is the one piece of artwork the brand owns outright, and at 4-8% opacity
 * behind a heading it reads as a watermark rather than a second logo.
 *
 * Cropping is done in CSS rather than by exporting a new asset. In
 * `Reboot Logo - Color.png` (1080x228) the rosette occupies x 0-199 at full
 * height, so it sits flush in the top-left corner: sizing the background to
 * `auto 100%` and pinning it left, inside a box of the rosette's own 200:228
 * aspect, lands the crop exactly. The masthead already loads this file, so the
 * watermark adds no request.
 *
 * The mark is red on transparency with its window shapes knocked out and no
 * white pixels anywhere, which is what makes `brightness(0) invert(1)` a clean
 * recolour to white — the cut-outs stay cut out instead of filling in.
 */
const ROSETTE_ASPECT = '200 / 228';

export default function BrandRosette({
  height,
  tone = 'white',
  opacity = 0.07,
  sx,
}: {
  /** Rendered height in px. Width follows the mark's aspect. */
  height: number | Record<string, number>;
  /** `white` for dark fields, `brand` for the mark in its own reds on light. */
  tone?: 'white' | 'brand';
  opacity?: number;
  sx?: SxProps<Theme>;
}) {
  return (
    <Box
      aria-hidden="true"
      sx={[
        {
          position: 'absolute',
          height,
          aspectRatio: ROSETTE_ASPECT,
          backgroundImage: 'url("/Reboot Logo - Color.png")',
          backgroundSize: 'auto 100%',
          backgroundPosition: 'left center',
          backgroundRepeat: 'no-repeat',
          filter: tone === 'white' ? 'brightness(0) invert(1)' : 'none',
          opacity,
          pointerEvents: 'none',
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
}
