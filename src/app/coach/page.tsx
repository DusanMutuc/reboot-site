'use client';

import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import TopNav from '@/components/topNav/topNav';
import ImportantLinks from '@/components/importantLinks';
import PodcastSection from '@/components/podcastSection';
import Search from '@/components/search';
import CoachSchedule from '@/components/coach/CoachSchedule';
import HelperContacts from '@/components/coach/HelperContacts';
import StudentStatusOverview from '@/components/StudentStatusOverview';

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
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const sectionOffsetStyle = { scrollMarginTop: `${navH}px` } as const;

  return (
    <>
      <TopNav
        role="coach" // ← force coach-like buttons; no fetch, no flicker
        sections={[
          { id: 'links',     label: 'COACHING LINKS' },
          { id: 'podcast',   label: 'PRIVATE PODCAST' },
          { id: 'library',   label: 'RESOURCE LIBRARY' },
          { id: 'dashboard', label: 'STUDENT STATUS' },
          { id: 'calendar',  label: 'CALENDAR' },
          { id: 'help',      label: 'HELP' },
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
        <StudentStatusOverview courseId={2} workspaceMode="coach" />
      </section>

      <section id="calendar" style={sectionOffsetStyle}>
        <CoachSchedule />
      </section>

      <section id="help" style={sectionOffsetStyle}>
        <HelperContacts />
      </section>
    </>
  );
}
