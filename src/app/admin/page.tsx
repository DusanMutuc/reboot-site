// app/admin/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import adminTheme from '@/lib/admintheme';
import AddUserForm from '@/components/admin/AddUserForm';
import AssignAssistantPanel from '@/components/admin/AssignAssistantPanel';
import AssignCoachPanel from '@/components/admin/AssignCoachPanel';
import CoachRosters from '@/components/admin/CoachRosters';
import { ThemeProvider, CssBaseline } from '@mui/material';
import ResourceLibraryAdmin from '@/components/admin/ResourceLibraryAdmin';
import CourseEditor from '@/components/admin/courseEditor';
import StudentProgressView from '@/components/coach/StudentProgressView';
import LibraryEditor from '@/components/admin/libraryEditor';
import CoachProfilesAdmin from '@/components/admin/CoachProfilesAdmin';
import UserProfilesAdmin from '@/components/admin/UserProfilesAdmin';
import AdminMeetingsPanel from '@/components/admin/meetings/AdminMeetingsPanel';
import AchievementsAdminPanel from '@/components/admin/achievements/AchievementsAdminPanel';
import ManualAwardPanel from '@/components/admin/achievements/ManualAwardPanel'; // 👈 NEW
import StudentStatusOverview from '@/components/StudentStatusOverview';
import SiteAnnouncementAdmin from '@/components/admin/SiteAnnouncementAdmin';
import PartnershipsAdmin from '@/components/admin/PartnershipsAdmin';
import AdminStudentTracker from '@/components/admin/AdminStudentTracker'; // 👈 NEW
// app/admin/page.tsx (top of file, with the other admin imports)
import UserDataTransfer from '@/components/admin/UserDataTransfer';
import AdminHome from '@/components/admin/AdminHome';
import { SwapHoriz as SwapHorizIcon } from '@mui/icons-material';

import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import {
  Box,
  Container,
  Paper,
  Typography,
  CircularProgress,
  Alert,
  Button,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Collapse,
  TextField,
  Autocomplete,
  Chip,
} from '@mui/material';

import {
  Home as HomeIcon,
  PersonAdd as PersonAddIcon,
  People as PeopleIcon,
  SchoolOutlined as SchoolIcon,
  AssignmentInd as AssignmentIndIcon,
  MenuBook as MenuBookIcon,
  LibraryBooks as LibraryBooksIcon,
  Assessment as AssessmentIcon,
  Event as EventIcon,
  EmojiEvents as EmojiEventsIcon,
  ExpandLess,
  ExpandMore,
  Campaign as CampaignIcon,
  GroupAdd,
  Security as SecurityIcon,
} from '@mui/icons-material';

type AdminUserOption = {
  id: string;
  label: string;
};

type NavigationItem = {
  id: string;
  label: string;
  icon: typeof PersonAddIcon;
  component: string;
  description: string;
};

type NavigationSection = {
  id: string;
  label: string;
  icon: typeof PersonAddIcon;
  children: NavigationItem[];
};

// Navigation structure (workflow-oriented)
const navigationStructure: NavigationSection[] = [
  {
    id: 'overview',
    label: 'Overview',
    icon: HomeIcon,
    children: [
      {
        id: 'admin-home',
        label: 'Admin Home',
        icon: HomeIcon,
        component: 'AdminHome',
        description: 'Quick actions and a high-level admin snapshot.',
      },
    ],
  },
  {
    id: 'onboarding-access',
    label: 'Onboarding & Access',
    icon: PeopleIcon,
    children: [
      { id: 'add-user', label: 'Create User', icon: PersonAddIcon, component: 'AddUserForm', description: 'Create a new user account and assign a role.' },
      { id: 'assign-coach', label: 'Assign/Change Coach', icon: AssignmentIndIcon, component: 'AssignCoachPanel', description: 'Set primary or implementation coach relationships.' },
      { id: 'assign-assistant', label: 'Assign Assistant', icon: AssignmentIndIcon, component: 'AssignAssistantPanel', description: 'Grant assistant access and assign assistant-to-user support.' },
      { id: 'user-profiles', label: 'User Profiles', icon: PeopleIcon, component: 'UserProfilesAdmin', description: 'Search and edit core user profile attributes.' },
      { id: 'coach-profiles', label: 'Coach Profiles', icon: PeopleIcon, component: 'CoachProfilesAdmin', description: 'Manage coach profile details and booking links.' },
      { id: 'coach-rosters', label: 'Coach Rosters', icon: PeopleIcon, component: 'CoachRosters', description: 'Review each coach roster and student assignments.' },
      { id: 'user-partnerships', label: 'Partnerships', icon: GroupAdd, component: 'PartnershipsAdmin', description: 'Manage user partnerships and their statuses.' },
    ],
  },
  {
    id: 'student-insights',
    label: 'Student Insights',
    icon: AssessmentIcon,
    children: [
      { id: 'student-progress', label: 'Student Detail View', icon: AssessmentIcon, component: 'StudentProgressView', description: 'Open per-student progress details and recent activity.' },
      { id: 'status-overview', label: 'Course Status Overview', icon: SchoolIcon, component: 'StudentStatusOverview', description: 'Scan completion and health by course cohort.' },
      { id: 'student-tracker', label: 'KPI & Dashboard Editor', icon: AssessmentIcon, component: 'AdminStudentTracker', description: 'Edit KPI data and review the selected student dashboard.' },
      { id: 'achievements-admin', label: 'Manage Achievements', icon: EmojiEventsIcon, component: 'AchievementsAdminPanel', description: 'Create and maintain available achievement definitions.' },
      { id: 'achievements-manual', label: 'Manual Awards', icon: EmojiEventsIcon, component: 'ManualAwardPanel', description: 'Award or revoke user achievements manually.' },
    ],
  },
  {
    id: 'content-communications',
    label: 'Content & Communications',
    icon: MenuBookIcon,
    children: [
      { id: 'course-builder', label: 'Course Builder', icon: MenuBookIcon, component: 'CourseEditor', description: 'Build and organize course structures and blocks.' },
      { id: 'resource-library', label: 'Resource Library', icon: LibraryBooksIcon, component: 'ResourceLibraryAdmin', description: 'Maintain published resource-library entries.' },
      { id: 'library-editor', label: 'Library Editor', icon: LibraryBooksIcon, component: 'LibraryEditor', description: 'Edit raw library records and ordering.' },
      { id: 'site-announcement', label: 'Home Announcement', icon: CampaignIcon, component: 'SiteAnnouncementAdmin', description: 'Publish announcements on the user home page.' },
    ],
  },
  {
    id: 'operations',
    label: 'Operations',
    icon: EventIcon,
    children: [
      { id: 'meetings', label: 'Meetings', icon: EventIcon, component: 'AdminMeetingsPanel', description: 'Create, edit, and track meeting attendance records.' },
    ],
  },
  {
    id: 'danger-zone',
    label: 'Danger Zone',
    icon: SecurityIcon,
    children: [
      { id: 'user-data-transfer', label: 'User Data Transfer', icon: SwapHorizIcon, component: 'UserDataTransfer', description: 'Copy or merge data between users (high impact).' },
    ],
  },
];

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState('admin-home');
  const [expandedSections, setExpandedSections] = useState<string[]>(['overview', 'onboarding-access']);
  const [userOptions, setUserOptions] = useState<AdminUserOption[]>([]);
  const [activeUser, setActiveUser] = useState<AdminUserOption | null>(null);

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
          .select('user_id, roles!inner(code)')
          .eq('user_id', session.user.id)
          .eq('roles.code', 'admin')
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

  useEffect(() => {
    if (!isAdmin) return;

    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/list-users');
        const data = (await res.json()) as { items?: Array<{ id: string; name?: string; email?: string }> };
        if (!alive) return;
        const items = (data.items || []).map((u) => ({
          id: u.id,
          label: `${u.name || 'Unnamed user'} — ${u.email || 'no-email'}`,
        }));
        setUserOptions(items);
      } catch {
        setUserOptions([]);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isAdmin]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev =>
      prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };


  const syncActiveUserFromId = (userId: string | null | undefined) => {
    const found = userOptions.find((u) => u.id === userId) || null;
    setActiveUser(found);
  };

  const renderContent = () => {
    switch (selectedView) {
      case 'add-user':
        return <AddUserForm />;
      case 'assign-assistant':
        return <AssignAssistantPanel activeUserId={activeUser?.id} onActiveUserChange={(selected) => syncActiveUserFromId(selected?.id)} />;
      case 'user-profiles':
        return <UserProfilesAdmin />;
      case 'user-partnerships':
        return <PartnershipsAdmin />;
      case 'user-data-transfer':
        return <UserDataTransfer />; 
      case 'assign-coach':
        return <AssignCoachPanel activeUserId={activeUser?.id} onActiveUserChange={(selected) => syncActiveUserFromId(selected?.id)} />;
      case 'coach-profiles':
        return <CoachProfilesAdmin />;
      case 'coach-rosters':
        return <CoachRosters />;
      case 'course-builder':
        return <CourseEditor />;
      case 'resource-library':
        return <ResourceLibraryAdmin />;
      case 'library-editor':
        return <LibraryEditor />;
      case 'site-announcement':
        return <SiteAnnouncementAdmin />;
      case 'student-progress':
        return <StudentProgressView mode="admin" preselectedUserId={activeUser?.id} onSelectedUserChange={(userId) => {
          syncActiveUserFromId(userId)
        }} />;
      case 'status-overview':
        return <StudentStatusOverview courseId={2} />;
      case 'student-tracker':
        return <AdminStudentTracker activeUserId={activeUser?.id} onActiveUserChange={(selected) => syncActiveUserFromId(selected?.id)} />;
      case 'meetings':
        return <AdminMeetingsPanel />;
      case 'achievements-admin':
        return <AchievementsAdminPanel />;
      case 'achievements-manual':
        return <ManualAwardPanel activeUserId={activeUser?.id} onActiveUserChange={(selected) => syncActiveUserFromId(selected?.id)} />; // 👈 NEW
      case 'admin-home':
        return <AdminHome onNavigate={setSelectedView} />;
      default:
        return <AdminHome onNavigate={setSelectedView} />;
    }
  };

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
      <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'grey.50' }}>
        {/* Sidebar */}
        <Paper
          elevation={0}
          sx={{
            width: 260,
            flexShrink: 0,
            borderRight: 1,
            borderColor: 'divider',
            bgcolor: 'background.paper',
            overflowY: 'auto',
          }}
        >
          <Box sx={{ p: 2.5, pb: 2 }}>
            <Typography variant="h6" fontWeight={700} sx={{ fontSize: '1.1rem' }}>
              Admin Panel
            </Typography>
          </Box>

          <List component="nav" sx={{ px: 1.5, py: 0 }}>
            {navigationStructure.map((section) => {
              const SectionIcon = section.icon;
              const isExpanded = expandedSections.includes(section.id);

              return (
                <Box key={section.id} sx={{ mb: 0.5 }}>
                  <ListItemButton
                    onClick={() => toggleSection(section.id)}
                    sx={{ 
                      borderRadius: 1, 
                      py: 0.75,
                      px: 1.5,
                      minHeight: 0,
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 36 }}>
                      <SectionIcon sx={{ fontSize: 20 }} />
                    </ListItemIcon>
                    <ListItemText
                      primary={section.label}
                      primaryTypographyProps={{ 
                        fontWeight: 600, 
                        fontSize: '1rem',
                        lineHeight: 1.4
                      }}
                    />
                    {isExpanded ? (
                      <ExpandLess sx={{ fontSize: 20 }} />
                    ) : (
                      <ExpandMore sx={{ fontSize: 20 }} />
                    )}
                  </ListItemButton>

                  <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                    <List component="div" disablePadding sx={{ mt: 0.5 }}>
                      {section.children.map((child) => {
                        const ChildIcon = child.icon;
                        const isSelected = selectedView === child.id;
                        return (
                          <ListItemButton
                            key={child.id}
                            selected={isSelected}
                            onClick={() => setSelectedView(child.id)}
                            sx={{
                              pl: 5,
                              pr: 1.5,
                              py: 0.625,
                              borderRadius: 1,
                              mb: 0.25,
                              minHeight: 0,
                              '&.Mui-selected': {
                                bgcolor: 'primary.main',
                                color: 'white',
                                '&:hover': {
                                  bgcolor: 'primary.dark',
                                },
                                '& .MuiListItemIcon-root': {
                                  color: 'white',
                                },
                              },
                            }}
                          >
                            <ListItemIcon sx={{ minWidth: 32 }}>
                              <ChildIcon sx={{ fontSize: 18 }} />
                            </ListItemIcon>
                            <ListItemText
                              primary={child.label}
                              secondary={child.description}
                              primaryTypographyProps={{ 
                                fontSize: '1rem',
                                lineHeight: 1.4
                              }}
                              secondaryTypographyProps={{
                                fontSize: '0.76rem',
                                lineHeight: 1.25,
                                sx: { color: isSelected ? 'rgba(255,255,255,0.82)' : 'text.secondary' },
                              }}
                            />
                          </ListItemButton>
                        );
                      })}
                    </List>
                  </Collapse>
                </Box>
              );
            })}
          </List>
        </Paper>

        {/* Main Content */}
        <Box sx={{ flex: 1, overflow: 'auto' }}>
          <Container maxWidth="xl" sx={{ py: 4 }}>
            <Typography variant="h4" fontWeight={700} gutterBottom>
              {navigationStructure
                .flatMap(s => s.children)
                .find(c => c.id === selectedView)?.label || 'Admin'}
            </Typography>

            <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <Autocomplete
                options={userOptions}
                value={activeUser}
                onChange={(_, value) => setActiveUser(value)}
                sx={{ minWidth: 320, maxWidth: 480 }}
                renderInput={(params) => <TextField {...params} label="Active user context" size="small" />}
              />
              <Chip size="small" label={activeUser ? 'User selected' : 'No user selected'} color={activeUser ? 'primary' : 'default'} />
            </Box>

            {['student-progress', 'status-overview', 'student-tracker'].includes(selectedView) ? (
              <Alert severity="info" sx={{ mb: 2 }}>
                Student Insights workflow: Use <strong>Course Status Overview</strong> to scan cohorts, then open <strong>Student Detail View</strong> for per-user progress, and finish in <strong>KPI &amp; Dashboard Editor</strong> for updates.
              </Alert>
            ) : null}

            <Paper elevation={1} sx={{ borderRadius: 2, p: 3, mt: 3 }}>
              {renderContent()}
            </Paper>
          </Container>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
