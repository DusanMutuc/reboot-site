// app/admin/page.tsx
'use client';

import { useEffect, useState, type ReactNode } from 'react';
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
} from '@mui/material';

import {
  PersonAdd as PersonAddIcon,
  People as PeopleIcon,
  Warning as WarningIcon,
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
} from '@mui/icons-material';

// Navigation structure
const navigationStructure = [
  {
    id: 'user-management',
    label: 'User Management',
    icon: PeopleIcon,
    children: [
      { id: 'add-user', label: 'Add User', icon: PersonAddIcon, component: 'AddUserForm' },
      { id: 'assign-assistant', label: 'Assign Assistant', icon: AssignmentIndIcon, component: 'AssignAssistantPanel' },
      { id: 'user-profiles', label: 'User Profiles', icon: PeopleIcon, component: 'UserProfilesAdmin' },
      { id: 'user-partnerships', label: 'User Partnerships', icon: GroupAdd, component: 'PartnershipsAdmin' },
      { id: 'user-data-transfer', label: 'User Data Transfer', icon: SwapHorizIcon, component: 'UserDataTransfer' },
    ]
  },
  {
    id: 'coaching',
    label: 'Coaching',
    icon: SchoolIcon,
    children: [
      { id: 'assign-coach', label: 'Assign/Change Coach', icon: AssignmentIndIcon, component: 'AssignCoachPanel' },
      { id: 'coach-profiles', label: 'Coach Profiles', icon: PeopleIcon, component: 'CoachProfilesAdmin' },
      { id: 'coach-rosters', label: 'Coach Rosters', icon: PeopleIcon, component: 'CoachRosters' }
    ]
  },
  {
    id: 'content',
    label: 'Content Management',
    icon: MenuBookIcon,
    children: [
      { id: 'course-builder', label: 'Course Builder', icon: MenuBookIcon, component: 'CourseEditor' },
      { id: 'resource-library', label: 'Resource Library', icon: LibraryBooksIcon, component: 'ResourceLibraryAdmin' },
      { id: 'library-editor', label: 'Library Editor', icon: LibraryBooksIcon, component: 'LibraryEditor' },
      { id: 'site-announcement', label: 'Home Announcement', icon: CampaignIcon, component: 'SiteAnnouncementAdmin' },
    ]
  },
  {
    id: 'student-tracking',
    label: 'Student Tracking',
    icon: AssessmentIcon,
    children: [
      { id: 'student-progress', label: 'Student Progress', icon: AssessmentIcon, component: 'StudentProgressView' },
      { id: 'status-overview', label: 'Status Overview', icon: AssessmentIcon, component: 'StudentStatusOverview' },
      { id: 'student-tracker', label: 'Student Tracker', icon: AssessmentIcon, component: 'AdminStudentTracker' }, // 👈 NEW
    ]
  },
  {
    id: 'scheduling',
    label: 'Scheduling',
    icon: EventIcon,
    children: [
      { id: 'meetings', label: 'Meetings', icon: EventIcon, component: 'AdminMeetingsPanel' }
    ]
  },
  {
    id: 'achievements',
    label: 'Achievements',
    icon: EmojiEventsIcon,
    children: [
      { id: 'achievements-admin', label: 'Manage Achievements', icon: EmojiEventsIcon, component: 'AchievementsAdminPanel' },
      { id: 'achievements-manual', label: 'Manual Awards', icon: EmojiEventsIcon, component: 'ManualAwardPanel' }, // 👈 NEW
    ]
  }
];

export default function AdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedView, setSelectedView] = useState('add-user');
  const [expandedSections, setExpandedSections] = useState<string[]>(['user-management']);

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

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev =>
      prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const renderContent = () => {
    switch (selectedView) {
      case 'add-user':
        return <AddUserForm />;
      case 'assign-assistant':
        return <AssignAssistantPanel />;
      case 'user-profiles':
        return <UserProfilesAdmin />;
      case 'user-partnerships':
        return <PartnershipsAdmin />;
      case 'user-data-transfer':
        return <UserDataTransfer />; 
      case 'assign-coach':
        return <AssignCoachPanel />;
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
        return <StudentProgressView mode="admin" />;
      case 'status-overview':
        return <StudentStatusOverview courseId={2} />;
      case 'student-tracker':
        return <AdminStudentTracker />; // 👈 NEW
      case 'meetings':
        return <AdminMeetingsPanel />;
      case 'achievements-admin':
        return <AchievementsAdminPanel />;
      case 'achievements-manual':
        return <ManualAwardPanel />; // 👈 NEW
      default:
        return <AddUserForm />;
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
                              primaryTypographyProps={{ 
                                fontSize: '1rem',
                                lineHeight: 1.4
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

            <Paper elevation={1} sx={{ borderRadius: 2, p: 3, mt: 3 }}>
              {renderContent()}
            </Paper>
          </Container>
        </Box>
      </Box>
    </ThemeProvider>
  );
}
