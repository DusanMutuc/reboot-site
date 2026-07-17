// src/app/dashboard/page.tsx
'use client';

import { useEffect, useState } from 'react';
import TopNav from '@/components/topNav/topNav';
import ImportantLinks from '@/components/importantLinks';
import MoreProgramLinks from '@/components/moreProgramLinks';
import PodcastSection from '@/components/podcastSection';
import Search from '@/components/search';
import HelpSteps from '@/components/helpSteps';
import Loading from '@/components/loading';
import ErrorMessage from '@/components/errorMessage';
import UserDashboard from '@/components/user/dashboard/UserDashboard';
import UserDashboardBanner from '@/components/user/dashboard/UserDashboardBanner';
import AssistantInfoPanel from '@/components/user/dashboard/AssistantInfo';
import AnnouncementBanner from '@/components/AnnouncementBanner';
import { supabase } from '@/lib/supabaseClient';
import { useProgramLinkUrls } from '@/hooks/useProgramLinkUrls';

type AnnouncementData = {
  message: string;
  background_color: string | null;
  text_color: string | null;
  button_label: string | null;
  button_url: string | null;
  button_color: string | null;
};

const DASHBOARD_SECTIONS = [
  { id: 'links', label: 'COACHING LINKS' },
  { id: 'library', label: 'SEARCH ENGINE' },
  { id: 'program-links', label: 'PROGRAM LINKS' },
  { id: 'podcast', label: 'PRIVATE PODCAST' },
  { id: 'dashboard', label: 'TRACKER' },
  { id: 'help', label: 'HOW TO GET HELP' },
];

export default function DashboardPage() {
  const [navH, setNavH] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [userError, setUserError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<AnnouncementData | null>(null);
  const programLinkUrls = useProgramLinkUrls({ mode: 'user' });

  // Measure nav height once when #appbar exists
  useEffect(() => {
    const el = document.getElementById('appbar');
    if (!el) return;

    const update = () => setNavH(el.offsetHeight || 0);
    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  // Fetch current user id from Supabase
  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      try {
        setUserLoading(true);
        setUserError(null);

        const { data, error } = await supabase.auth.getUser();
        if (error) {
          console.error('Error fetching user', error);
          if (!cancelled) setUserError('Could not load user information.');
          return;
        }

        if (!cancelled) setUserId(data.user?.id ?? null);
      } catch (err) {
        console.error('Unexpected error fetching user', err);
        if (!cancelled) setUserError('Could not load user information.');
      } finally {
        if (!cancelled) setUserLoading(false);
      }
    }

    loadUser();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch latest active announcement (if any)
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from('site_announcements')
        .select(
          'message, background_color, text_color, button_label, button_url, button_color'
        )
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error('Error fetching announcement', error);
        setAnnouncement(null);
        return;
      }

      setAnnouncement(data ? (data as AnnouncementData) : null);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const sectionOffsetStyle = { scrollMarginTop: `${navH + 8}px` } as const;

  return (
    <>
      <TopNav sections={DASHBOARD_SECTIONS} />

      {/* Push content (announcement + sections) below the fixed TopNav */}
      <div style={{ marginTop: navH }}>
        <AnnouncementBanner
          message={announcement?.message}
          backgroundColor={announcement?.background_color ?? undefined}
          textColor={announcement?.text_color ?? undefined}
          buttonLabel={announcement?.button_label ?? undefined}
          buttonUrl={announcement?.button_url ?? undefined}
          buttonColor={announcement?.button_color ?? undefined}
        />

        <section id="links" style={sectionOffsetStyle}>
          <ImportantLinks mode="user" linkUrls={programLinkUrls} modalVariant="live-only" compact />
        </section>

        <section id="library" style={sectionOffsetStyle}>
          <Search compact />
        </section>

        <section id="program-links" style={sectionOffsetStyle}>
          <MoreProgramLinks linkUrls={programLinkUrls} />
        </section>

        <section id="podcast" style={sectionOffsetStyle}>
          <PodcastSection compact />
        </section>

        <section id="dashboard" style={sectionOffsetStyle}>
          {userLoading && <Loading />}

          {!userLoading && userError && <ErrorMessage message={userError} />}

          {!userLoading && !userError && !userId && (
            <ErrorMessage message="No authenticated user found." />
          )}

          {!userLoading && !userError && userId && (
            <>
              <UserDashboardBanner />
              <UserDashboard userId={userId} />
              <AssistantInfoPanel />
            </>
          )}
        </section>

        <section id="help" style={sectionOffsetStyle}>
          <HelpSteps />
        </section>
      </div>
    </>
  );
}
