'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Box, Button, Container, Typography } from '@mui/material';

/** A direct route to help from the member dashboard. */
export default function HelpSteps() {
  const pathname = usePathname();
  const href = `/support?from=${encodeURIComponent(pathname || '/dashboard')}`;

  return (
    <Box component="section" sx={{ bgcolor: '#f2f8f6', color: '#24302d', py: { xs: 5, md: 7 } }}>
      <Container maxWidth="lg">
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 3 }}>
          <Box sx={{ maxWidth: 560 }}>
            <Typography component="h2" variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
              Need a hand?
            </Typography>
            <Typography sx={{ color: '#53635d', lineHeight: 1.65 }}>
              Ask a question or report a problem. Tell us what happened and we’ll help you take the next step.
            </Typography>
          </Box>
          <Button component={Link} href={href} variant="contained" sx={{ minHeight: 48, px: 3, flexShrink: 0, bgcolor: '#236f60', color: '#fff', textTransform: 'none', '&:hover': { bgcolor: '#19584b' } }}>
            Get help
          </Button>
        </Box>
      </Container>
    </Box>
  );
}
