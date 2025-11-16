// src/app/dashboard/page.tsx
'use client';

import { useEffect, useState } from 'react';
import TopNav from '@/components/topNav';
import ImportantLinks from '@/components/importantLinks';
import PodcastSection from '@/components/podcastSection';
import Search from '@/components/search';
import DashboardEmbed from '@/components/dashboardEmbed';
import HelpSteps from '@/components/helpSteps';
import Loading from '@/components/loading';
import ErrorMessage from '@/components/errorMessage';
import { useLookerLink } from '@/hooks/useLookerLink';
import CoachSchedule from '@/components/coach/CoachSchedule';
import UserDashboard from '@/components/user/dashboard/UserDashboard';
import { supabase } from '@/lib/supabaseClient';

export default function DashboardPage() {
  const { lookerLink, loading, error } = useLookerLink();
  const [navH, setNavH] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);
  const [userLoading, setUserLoading] = useState(true);
  const [userError, setUserError] = useState<string | null>(null);

  // Track nav height (existing logic)
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

        if (!cancelled) {
          setUserId(data.user?.id ?? null);
        }
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

  // Existing Looker loading / error states
  if (loading) return <Loading />;
  if (error) return <ErrorMessage message={error} />;
  if (!lookerLink)
    return <ErrorMessage message="No Looker Studio link found for your account." />;

  const sectionOffsetStyle = { scrollMarginTop: `${navH}px` } as const;

  return (
    <>
      <TopNav />

      <section id="links" style={sectionOffsetStyle}>
        <ImportantLinks mode="user" />
      </section>

      <section id="schedule" style={sectionOffsetStyle}>
        <CoachSchedule />
      </section>

      <section id="podcast" style={sectionOffsetStyle}>
        <PodcastSection />
      </section>

      <section id="library" style={sectionOffsetStyle}>
        <Search />
      </section>


      {/* NEW: Reboot User Dashboard test section */}
      <section id="reboot-dashboard" style={sectionOffsetStyle}>
        {userLoading && <Loading />}

        {!userLoading && userError && (
          <ErrorMessage message={userError} />
        )}

        {!userLoading && !userError && !userId && (
          <ErrorMessage message="No authenticated user found." />
        )}

        {!userLoading && !userError && userId && (
          <UserDashboard userId={userId} />
        )}
      </section>

      <section id="help" style={sectionOffsetStyle}>
        <HelpSteps />
      </section>
    </>
  );
}
