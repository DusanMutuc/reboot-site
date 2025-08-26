'use client';

import { useEffect, useState } from 'react';
import { Box, Alert } from '@mui/material';
import TopNav from '@/components/topNav';
import ImportantLinks from '@/components/importantLinks';
import PodcastSection from '@/components/podcastSection';
import Search from '@/components/search';
import DashboardEmbed from '@/components/dashboardEmbed';

import StudentsPanel from '@/components/coach/StudentsPanel';
import CoachCalendar from '@/components/coach/CoachCalendar';
import HelperContacts from '@/components/coach/HelperContacts';

export default function CoachPage() {
  const [navH, setNavH] = useState(0);

  useEffect(() => {
    const el = document.getElementById('appbar');
    if (!el) return;
    const update = () => setNavH(el.offsetHeight || 0);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('resize', update);
    return () => { ro.disconnect(); window.removeEventListener('resize', update); };
  }, []);

  const sectionOffsetStyle = { scrollMarginTop: `${navH}px` } as const;

  // Shared coaching dashboard for now (can switch to per‑coach later)
  const coachingDashboardUrl =
    (process.env.NEXT_PUBLIC_COACHING_DASHBOARD_URL || '').trim() || null;

  return (
    <>
      <TopNav
    sections={[
        { id: 'links',     label: 'COACHING LINKS' },
        { id: 'podcast',   label: 'PODCAST' },
        { id: 'library',   label: 'LIBRARY' },
        { id: 'dashboard', label: 'COACHING DASHBOARD' },
        { id: 'calendar',  label: 'CALENDAR' },
        ]}
    />

      <Box sx={{ height: navH }} />

      <section id="links" style={sectionOffsetStyle}>
      <ImportantLinks mode="coach" />
      </section>

      <section id="podcast" style={sectionOffsetStyle}>
        <PodcastSection />
      </section>

      <section id="library" style={sectionOffsetStyle}>
        <Search />
      </section>

      <section id="dashboard" style={sectionOffsetStyle}>
        {coachingDashboardUrl
          ? <DashboardEmbed src={coachingDashboardUrl} />
          : <Alert severity="warning">No Coaching Dashboard URL set (NEXT_PUBLIC_COACHING_DASHBOARD_URL).</Alert>}
      </section>

      <section id="students" style={sectionOffsetStyle}>
        {/* courseId null ⇒ all active students; add a course picker later if you want */}
        <StudentsPanel courseId={null} />
      </section>

      <section id="calendar" style={sectionOffsetStyle}>
        <CoachCalendar />
      </section>

      <section id="help" style={sectionOffsetStyle}>
        <HelperContacts />
      </section>
    </>
  );
}
