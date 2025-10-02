// app/admin/page.tsx
'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import adminTheme from '@/lib/admintheme';
import AddUserForm from '@/components/admin/AddUserForm';
import AssignCoachPanel from '@/components/admin/AssignCoachPanel';
import CoachRosters from '@/components/admin/CoachRosters';
import { ThemeProvider, CssBaseline } from '@mui/material';
import ResourceLibraryAdmin from '@/components/admin/ResourceLibraryAdmin';
import AdminActionRequired from '@/components/admin/AdminActionRequired';
import CourseNodeManager from '@/components/admin/CourseNodeManager';


import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import {
  Box,
  Container,
  Tabs,
  Tab,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  Button,
} from '@mui/material';

function TabPanel({ index, value, children }: { index: number; value: number; children: ReactNode }) {
  if (value !== index) return null;
  return <Box sx={{ mt: 2 }}>{children}</Box>;
}

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    async function checkAuth() {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError) {
          setError('Session error');
          setLoading(false);
          return;
        }
        if (!session?.user) {
          setLoading(false);
          return;
        }

        setUser(session.user);

        const { data: adminRow, error: roleError } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('user_id', session.user.id)
          .eq('role_id', 1)
          .maybeSingle();

        if (roleError) {
          setError('Role check failed');
          setLoading(false);
          return;
        }

        setIsAdmin(!!adminRow);
        setLoading(false);
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : typeof err === 'string'
            ? err
            : 'Unknown error';
        setError(message);
        setLoading(false);
      }
    }

    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        if (event === 'SIGNED_OUT') router.push('/login');
        if (event === 'SIGNED_IN' && session) checkAuth();
      }
    );

    return () => subscription.unsubscribe();
  }, [router]);

  if (loading) {
    return (
      <Container
        maxWidth="lg"
        sx={{ py: 6, display: 'grid', placeItems: 'center', minHeight: '60vh' }}
      >
        <CircularProgress />
        <Typography sx={{ mt: 2 }} variant="body2">
          Checking access…
        </Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Alert severity="error" sx={{ mb: 2 }}>
          Error: {error}
        </Alert>
        <Button variant="contained" onClick={() => router.push('/login')}>
          Go to Login
        </Button>
      </Container>
    );
  }

  if (!user) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          You must be logged in.
        </Alert>
        <Button variant="contained" onClick={() => router.push('/login')}>
          Log in
        </Button>
      </Container>
    );
  }

  if (!isAdmin) {
    return (
      <Container maxWidth="sm" sx={{ py: 6 }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Access denied — Admin privileges required.
        </Alert>
        <Button variant="outlined" onClick={() => router.push('/dashboard')}>
          Go to Dashboard
        </Button>
      </Container>
    );
  }

  return (
    <ThemeProvider theme={adminTheme}>
      <CssBaseline />
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Admin
        </Typography>

        <Paper elevation={1} sx={{ borderRadius: 2 }}>
          <Tabs
            value={tab}
            onChange={(_, v) => setTab(v)}
            variant="scrollable"
            textColor="primary"
            indicatorColor="primary"
            sx={{ borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab label="Add User" />
            <Tab label="Assign / Change Coach" />
            <Tab label="Coach Rosters" />
            <Tab label="Resource Library" />
            <Tab label="Action Required" />
            <Tab label="Course Nodes" />
          </Tabs>

          <Box sx={{ p: 3 }}>
            <TabPanel value={tab} index={0}>
              <AddUserForm />
            </TabPanel>
            <TabPanel value={tab} index={1}>
              <AssignCoachPanel />
            </TabPanel>
            <TabPanel value={tab} index={2}>
              <CoachRosters />
            </TabPanel>
            <TabPanel value={tab} index={3}>
              {/* New admin panel for resources */}
              <ResourceLibraryAdmin />
            </TabPanel>
            <TabPanel value={tab} index={4}>
              <AdminActionRequired />
            </TabPanel>
            <TabPanel value={tab} index={5}>
              <CourseNodeManager />
            </TabPanel>
          </Box>
        </Paper>
      </Container>
    </ThemeProvider>
  );
}
