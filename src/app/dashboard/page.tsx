'use client';

import { useEffect, useState } from 'react';
import { Box } from '@mui/material';
import TopNav from '@/components/topNav';
import ImportantLinks from '@/components/importantLinks';
import PodcastSection from '@/components/podcastSection';
import Search from '@/components/search';
import DashboardEmbed from '@/components/dashboardEmbed';
import HelpSteps from '@/components/helpSteps';
import Loading from '@/components/loading';
import ErrorMessage from '@/components/errorMessage';
import { useLookerLink } from '@/hooks/useLookerLink';

export default function DashboardPage() {
  const { lookerLink, loading, error } = useLookerLink();
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

  if (loading)     return <Loading />;
  if (error)       return <ErrorMessage message={error} />;
  if (!lookerLink) return <ErrorMessage message="No Looker Studio link found for your account." />;

  const sectionOffsetStyle = { scrollMarginTop: `${navH}px` } as const;

  return (
    <>
      <TopNav />
      {/* Spacer exactly equal to the current nav height */}
      <Box sx={{ height: navH }} />

      <section id="links" style={sectionOffsetStyle}>
        <ImportantLinks mode="user" />
      </section>

      <section id="podcast" style={sectionOffsetStyle}>
        <PodcastSection />
      </section>

      <section id="library" style={sectionOffsetStyle}>
        <Search />
      </section>

      <section id="dashboard" style={sectionOffsetStyle}>
        <DashboardEmbed src={lookerLink!} />
      </section>

      <section id="help" style={sectionOffsetStyle}>
        <HelpSteps />
      </section>
    </>
  );
}
