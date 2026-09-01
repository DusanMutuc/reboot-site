'use client';

import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  Box,
  Button,
  Chip,
  Container,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';

import { supabase } from '@/lib/supabaseClient';
import type { NinetyDayProgrammePayload, NinetyDaySystem } from '@/lib/ninetyDayProgramme';

const palette = {
  page: '#f4f6f4',
  paper: '#ffffff',
  ink: '#17201f',
  soft: '#5b6865',
  line: '#dbe2df',
  teal: '#12a594',
  deepTeal: '#087d72',
  tint: '#e7f7f3',
  dark: '#17201f',
};

export default function NinetyDayDashboard({
  memberFirstName,
  programme,
}: {
  memberFirstName: string;
  programme: NinetyDayProgrammePayload;
}) {
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: palette.page, color: palette.ink }}>
      <Box
        component="header"
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 20,
          bgcolor: 'rgba(255,255,255,.94)',
          backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${palette.line}`,
        }}
      >
        <Container maxWidth="xl" sx={{ py: 1.25 }}>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Box component={Link} href="/home/ninety-day" sx={{ display: 'inline-flex' }}>
              <Image src="/Reboot Logo - Color.png" alt="Reboot" width={118} height={44} style={{ objectFit: 'contain' }} />
            </Box>
            <Chip label="90-day programme" size="small" sx={{ bgcolor: palette.tint, color: palette.deepTeal, fontWeight: 700 }} />
            <Box sx={{ flex: 1 }} />
            <Stack direction="row" spacing={0.25} sx={{ display: { xs: 'none', md: 'flex' } }}>
              <Button component={Link} href="/courses/set-your-compass" color="inherit">Course</Button>
              <Button component={Link} href="/library" color="inherit">Library</Button>
              <Button component={Link} href="/home/ninety-day/tracker" color="inherit">Tracker</Button>
              <Button component={Link} href="/support" color="inherit">Support</Button>
            </Stack>
            <Button color="inherit" onClick={() => void signOut()} startIcon={<LogoutRoundedIcon />} sx={{ minWidth: { xs: 40, sm: 'auto' } }}>
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Sign out</Box>
            </Button>
          </Stack>
        </Container>
      </Box>

      {programme.nextMeeting ? (
        <Box sx={{ bgcolor: programme.nextMeeting.imminent ? palette.teal : palette.dark, color: '#fff' }}>
          <Container maxWidth="xl" sx={{ py: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
              <CalendarMonthOutlinedIcon />
              <Box sx={{ flex: 1 }}>
                <Typography fontWeight={800}>{programme.nextMeeting.title}</Typography>
                <Typography variant="body2" sx={{ opacity: 0.8 }}>
                  {programme.nextMeeting.whenLabel}
                  {programme.nextMeeting.relativeLabel ? ` · ${programme.nextMeeting.relativeLabel}` : ''}
                </Typography>
              </Box>
              {programme.nextMeeting.joinUrl ? (
                <Button
                  href={programme.nextMeeting.joinUrl}
                  target="_blank"
                  rel="noreferrer"
                  variant="contained"
                  sx={{ bgcolor: '#fff', color: palette.dark, '&:hover': { bgcolor: '#edf4f2' } }}
                >
                  {programme.nextMeeting.imminent ? 'Join now' : 'Meeting link'}
                </Button>
              ) : null}
            </Stack>
          </Container>
        </Box>
      ) : null}

      <Container component="main" maxWidth="xl" sx={{ py: { xs: 4, md: 6 } }}>
        <Stack spacing={{ xs: 4, md: 6 }}>
          <Box>
            <Typography variant="overline" sx={{ color: palette.deepTeal, fontWeight: 800, letterSpacing: 1.2 }}>
              {programme.cycle.name} · Week {programme.week.current} of {programme.week.total}
            </Typography>
            <Typography component="h1" sx={{ mt: 0.5, fontSize: { xs: 34, md: 50 }, lineHeight: 1.08, fontWeight: 850, letterSpacing: '-.035em' }}>
              Good to see you, {memberFirstName}.
            </Typography>
            <Typography sx={{ mt: 1.5, color: palette.soft, fontSize: { xs: 16, md: 18 } }}>
              One group, one current system, and the eight systems included in your programme.
            </Typography>
          </Box>

          <Box
            component="section"
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1.45fr) minmax(320px, .75fr)' },
              gap: 2.5,
            }}
          >
            <Box sx={{ bgcolor: palette.paper, border: `1px solid ${palette.line}`, borderRadius: 4, p: { xs: 3, md: 4 } }}>
              <Typography variant="overline" sx={{ color: palette.deepTeal, fontWeight: 800 }}>Your current focus</Typography>
              {programme.currentSystem ? (
                <>
                  <Typography component="h2" sx={{ mt: 1, fontSize: { xs: 28, md: 38 }, fontWeight: 850, letterSpacing: '-.025em' }}>
                    {programme.currentSystem.title}
                  </Typography>
                  <Typography sx={{ mt: 1.5, maxWidth: 700, color: palette.soft, lineHeight: 1.7 }}>
                    {programme.currentSystem.description || 'This is the system your group is working on now.'}
                  </Typography>
                  <Button
                    component={Link}
                    href={programme.currentSystem.href}
                    variant="contained"
                    endIcon={<ArrowForwardRoundedIcon />}
                    sx={{ mt: 3, bgcolor: palette.dark, px: 3, py: 1.25, '&:hover': { bgcolor: '#000' } }}
                  >
                    Open the system
                  </Button>
                </>
              ) : (
                <Typography sx={{ mt: 1.5, color: palette.soft }}>
                  Your group coach has not selected the current system yet.
                </Typography>
              )}
            </Box>

            <Box sx={{ bgcolor: palette.dark, color: '#fff', borderRadius: 4, p: { xs: 3, md: 4 }, display: 'flex', flexDirection: 'column' }}>
              <Typography variant="overline" sx={{ color: '#71dacd', fontWeight: 800 }}>Your course for all 90 days</Typography>
              <Typography component="h2" sx={{ mt: 1, fontSize: 27, fontWeight: 800 }}>{programme.course.title}</Typography>
              <Typography sx={{ mt: 1.25, color: 'rgba(255,255,255,.7)', lineHeight: 1.65 }}>
                {programme.course.description || 'Set your direction and use it throughout the programme.'}
              </Typography>
              <Button
                component={Link}
                href={programme.course.href}
                variant="contained"
                endIcon={<ArrowForwardRoundedIcon />}
                sx={{ mt: 'auto', pt: 1.2, pb: 1.2, top: 20, mb: 2.5, bgcolor: palette.teal, '&:hover': { bgcolor: palette.deepTeal } }}
              >
                Continue Set Your Compass
              </Button>
            </Box>
          </Box>

          <Box component="section" sx={{ bgcolor: palette.paper, border: `1px solid ${palette.line}`, borderRadius: 4, p: { xs: 3, md: 4 } }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
              <Box sx={{ flex: 1 }}>
                <Typography component="h2" sx={{ fontSize: { xs: 25, md: 30 }, fontWeight: 850 }}>Your tracker</Typography>
                <Typography sx={{ mt: 0.75, color: palette.soft }}>Keep your monthly numbers current throughout the programme.</Typography>
              </Box>
              <Button component={Link} href="/home/ninety-day/tracker" variant="outlined" endIcon={<ArrowForwardRoundedIcon />} sx={{ borderColor: palette.dark, color: palette.dark }}>
                Open tracker
              </Button>
            </Stack>
            <LinearProgress
              variant="determinate"
              value={(programme.week.current / programme.week.total) * 100}
              sx={{ mt: 3, height: 8, borderRadius: 8, bgcolor: palette.line, '& .MuiLinearProgress-bar': { bgcolor: palette.teal } }}
            />
          </Box>

          <Box component="section">
            <Typography variant="overline" sx={{ color: palette.deepTeal, fontWeight: 800 }}>The complete programme library</Typography>
            <Typography component="h2" sx={{ mt: 0.5, fontSize: { xs: 28, md: 38 }, fontWeight: 850, letterSpacing: '-.025em' }}>
              Your eight systems
            </Typography>
            <Typography sx={{ mt: 1, color: palette.soft }}>These are the only systems included in this 90-day cycle.</Typography>
            <Box
              sx={{
                mt: 3,
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
                gap: 2,
              }}
            >
              {programme.systems.map((system) => <SystemCard key={system.id} system={system} />)}
            </Box>
          </Box>
        </Stack>
      </Container>

      <Box component="footer" sx={{ mt: 4, borderTop: `1px solid ${palette.line}`, bgcolor: palette.paper }}>
        <Container maxWidth="xl" sx={{ py: 3 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Reboot 90-Day Programme</Typography>
            <Button component={Link} href="/support" size="small" color="inherit">Get help</Button>
          </Stack>
        </Container>
      </Box>
    </Box>
  );
}

function SystemCard({ system }: { system: NinetyDaySystem }) {
  return (
    <Box
      component={Link}
      href={system.href}
      sx={{
        minWidth: 0,
        overflow: 'hidden',
        borderRadius: 3,
        bgcolor: palette.paper,
        border: `1px solid ${system.isActive ? palette.teal : palette.line}`,
        color: palette.ink,
        textDecoration: 'none',
        transition: 'transform .16s ease, border-color .16s ease',
        '&:hover': { transform: 'translateY(-3px)', borderColor: palette.teal },
      }}
    >
      <Box sx={{ position: 'relative', aspectRatio: '16 / 9', bgcolor: '#dfe8e5', overflow: 'hidden' }}>
        {system.heroUrl ? (
          <Box component="img" src={system.heroUrl} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <Box sx={{ width: '100%', height: '100%', background: `linear-gradient(135deg, ${palette.dark}, ${palette.teal})` }} />
        )}
        {system.isActive ? (
          <Chip label="Current" size="small" sx={{ position: 'absolute', top: 10, left: 10, bgcolor: palette.teal, color: '#fff', fontWeight: 800 }} />
        ) : null}
        {system.progressPct !== null ? (
          <LinearProgress
            variant="determinate"
            value={system.progressPct}
            sx={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, bgcolor: 'rgba(0,0,0,.25)', '& .MuiLinearProgress-bar': { bgcolor: palette.teal } }}
          />
        ) : null}
      </Box>
      <Box sx={{ p: 2 }}>
        <Typography variant="overline" sx={{ color: palette.soft, fontSize: 11 }}>System {system.position}</Typography>
        <Typography sx={{ mt: 0.25, fontWeight: 750, lineHeight: 1.35 }}>{system.title}</Typography>
      </Box>
    </Box>
  );
}
