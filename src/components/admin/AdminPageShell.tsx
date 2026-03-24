'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter, useSearchParams } from 'next/navigation';
import Loading from '@/components/loading';
import AddUserForm from '@/components/admin/AddUserForm';
import AssignAssistantPanel from '@/components/admin/AssignAssistantPanel';
import AssignCoachPanel from '@/components/admin/AssignCoachPanel';
import CoachRosters from '@/components/admin/CoachRosters';
import ResourceLibraryAdmin from '@/components/admin/ResourceLibraryAdmin';
import CourseEditor from '@/components/admin/courseEditor';
import LibraryEditor from '@/components/admin/libraryEditor';
import CoachProfilesAdmin from '@/components/admin/CoachProfilesAdmin';
import UserProfilesAdmin from '@/components/admin/UserProfilesAdmin';
import AdminMeetingsPanel from '@/components/admin/meetings/AdminMeetingsPanel';
import AchievementsAdminPanel from '@/components/admin/achievements/AchievementsAdminPanel';
import ManualAwardPanel from '@/components/admin/achievements/ManualAwardPanel';
import StudentStatusOverview from '@/components/StudentStatusOverview';
import SiteAnnouncementAdmin from '@/components/admin/SiteAnnouncementAdmin';
import PartnershipsAdmin from '@/components/admin/PartnershipsAdmin';
import StudentWorkspace from '@/components/student/StudentWorkspace';
import UserDataTransfer from '@/components/admin/UserDataTransfer';
import { SwapHoriz as SwapHorizIcon } from '@mui/icons-material';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import {
  Box,
  Container,
  Paper,
  Typography,
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

type AdminNavChild = {
  id: string;
  label: string;
  icon: typeof PersonAddIcon;
  component: string;
};

type AdminNavSection = {
  id: string;
  label: string;
  icon: typeof PeopleIcon;
  children: AdminNavChild[];
};

const DEFAULT_ADMIN_VIEW = 'add-user';

const navigationStructure: AdminNavSection[] = [
  {
    id: 'user-management',
    label: 'User Management',
    icon: PeopleIcon,
    children: [
      { id: 'add-user', label: 'Onboard User', icon: PersonAddIcon, component: 'AddUserForm' },
      { id: 'assign-assistant', label: 'Assign Assistant', icon: AssignmentIndIcon, component: 'AssignAssistantPanel' },
      { id: 'user-profiles', label: 'User Profiles', icon: PeopleIcon, component: 'UserProfilesAdmin' },
      { id: 'user-partnerships', label: 'User Partnerships', icon: GroupAdd, component: 'PartnershipsAdmin' },
      { id: 'user-data-transfer', label: 'User Data Transfer', icon: SwapHorizIcon, component: 'UserDataTransfer' },
    ],
  },
  {
    id: 'coaching',
    label: 'Coaching',
    icon: SchoolIcon,
    children: [
      { id: 'assign-coach', label: 'Assign/Change Coach', icon: AssignmentIndIcon, component: 'AssignCoachPanel' },
      { id: 'coach-profiles', label: 'Coach Profiles', icon: PeopleIcon, component: 'CoachProfilesAdmin' },
      { id: 'coach-rosters', label: 'Coach Rosters', icon: PeopleIcon, component: 'CoachRosters' },
    ],
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
    ],
  },
  {
    id: 'student-tracking',
    label: 'Student Tracking',
    icon: AssessmentIcon,
    children: [
      { id: 'status-overview', label: 'Status Overview', icon: AssessmentIcon, component: 'StudentStatusOverview' },
      { id: 'student-workspace', label: 'Student Workspace', icon: AssessmentIcon, component: 'StudentWorkspace' },
    ],
  },
  {
    id: 'scheduling',
    label: 'Scheduling',
    icon: EventIcon,
    children: [
      { id: 'meetings', label: 'Meetings', icon: EventIcon, component: 'AdminMeetingsPanel' },
    ],
  },
  {
    id: 'achievements',
    label: 'Achievements',
    icon: EmojiEventsIcon,
    children: [
      { id: 'achievements-admin', label: 'Manage Achievements', icon: EmojiEventsIcon, component: 'AchievementsAdminPanel' },
      { id: 'achievements-manual', label: 'Manual Awards', icon: EmojiEventsIcon, component: 'ManualAwardPanel' },
    ],
  },
];

const validAdminViews = new Set(
  navigationStructure.flatMap((section) => section.children.map((child) => child.id)),
);
const ADMIN_VIEW_ALIASES: Record<string, string> = {
  'student-overview-new': 'student-workspace',
  'student-tracker': 'student-workspace',
};
const knownAdminViews = new Set([...validAdminViews, ...Object.keys(ADMIN_VIEW_ALIASES)]);

function getAdminViewPath(viewId: string, queryString?: string): string {
  const basePath = `/admin/${viewId}`;
  return queryString ? `${basePath}?${queryString}` : basePath;
}

function normalizeAdminView(viewId?: string | null): string {
  if (viewId && ADMIN_VIEW_ALIASES[viewId]) {
    return ADMIN_VIEW_ALIASES[viewId];
  }
  if (viewId && validAdminViews.has(viewId)) {
    return viewId;
  }
  return DEFAULT_ADMIN_VIEW;
}

function getSectionIdForView(viewId: string): string | null {
  return navigationStructure.find((section) =>
    section.children.some((child) => child.id === viewId),
  )?.id ?? null;
}

export default function AdminPageShell({ currentView }: { currentView?: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedView = useMemo(() => normalizeAdminView(currentView), [currentView]);
  const [expandedSections, setExpandedSections] = useState<string[]>(() => {
    const sectionId = getSectionIdForView(selectedView);
    return sectionId ? [sectionId] : ['user-management'];
  });

  useEffect(() => {
    if (!currentView) {
      return;
    }

    const canonicalView = normalizeAdminView(currentView);
    if (!knownAdminViews.has(currentView) || canonicalView !== currentView) {
      router.replace(getAdminViewPath(canonicalView, searchParams.toString()));
    }
  }, [currentView, router, searchParams]);

  useEffect(() => {
    const activeSection = getSectionIdForView(selectedView);
    if (!activeSection) return;

    setExpandedSections((prev) => (
      prev.includes(activeSection) ? prev : [...prev, activeSection]
    ));
  }, [selectedView]);

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
      },
    );

    return () => subscription.unsubscribe();
  }, [router]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => (
      prev.includes(sectionId)
        ? prev.filter((id) => id !== sectionId)
        : [...prev, sectionId]
    ));
  };

  const navigateToView = (viewId: string) => {
    if (viewId === selectedView) return;
    router.push(getAdminViewPath(viewId));
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
      case 'status-overview':
        return <StudentStatusOverview courseId={2} workspaceMode="admin" />;
      case 'student-workspace':
        return <StudentWorkspace mode="admin" />;
      case 'meetings':
        return <AdminMeetingsPanel />;
      case 'achievements-admin':
        return <AchievementsAdminPanel />;
      case 'achievements-manual':
        return <ManualAwardPanel />;
      default:
        return <AddUserForm />;
    }
  };

  const currentLabel =
    navigationStructure
      .flatMap((section) => section.children)
      .find((child) => child.id === selectedView)?.label ?? 'Admin';
  const isWorkspaceView = selectedView === 'student-workspace';

  if (loading) {
    return <Loading message="Checking access..." minHeight="60vh" />;
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
          Access denied - Admin privileges required.
        </Alert>
        <Button variant="outlined" onClick={() => router.push('/dashboard')}>
          Go to Dashboard
        </Button>
      </Container>
    );
  }

  return (
    <Box className="admin-page-shell" sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'grey.50' }}>
      <Paper
        className="admin-page-sidebar"
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
          <Typography variant="adminSectionTitle">
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
                      variant: 'body1',
                      fontWeight: 600,
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
                          onClick={() => navigateToView(child.id)}
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
                              variant: 'body2',
                              fontWeight: 500,
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

      <Box className="admin-page-main" sx={{ flex: 1, overflow: 'auto' }}>
        <Container className="admin-page-container" maxWidth="xl" sx={{ py: isWorkspaceView ? 2 : 4 }}>
          {!isWorkspaceView ? (
            <>
              <Typography className="admin-page-title" variant="adminPageTitle" gutterBottom>
                {currentLabel}
              </Typography>

              <Paper className="admin-page-content" elevation={1} sx={{ borderRadius: 2, p: 3, mt: 3 }}>
                {renderContent()}
              </Paper>
            </>
          ) : (
            renderContent()
          )}
        </Container>
      </Box>
    </Box>
  );
}
