'use client';

import { useLookerLink } from '@/hooks/useLookerLink';
import Loading from '@/components/loading';
import ErrorMessage from '@/components/errorMessage';
import TopNav         from '@/components/topNav';
import DashboardEmbed from '@/components/dashboardEmbed';
import EventsCalendar from '@/components/eventsCalendar';
import NewsPanel from '@/components/newsPanel';
import PodcastSection from '@/components/podcastSection';
import ImportantLinks from '@/components/importantLinks';
import Search from '@/components/search';
import HelpSteps from '@/components/helpSteps';
import { Toolbar } from '@mui/material';

export default function DashboardPage() {
  const { lookerLink, loading, error } = useLookerLink();

  if (loading)     return <Loading />;
  if (error)       return <ErrorMessage message={error} />;
  if (!lookerLink) return <ErrorMessage message="No Looker Studio link found for your account." />;
  return (
    <>
      {/* sticky nav bar */}
      <TopNav />
      <Toolbar /> 
      {/* each block wrapped in a <section id=""> */}

      <section id="calendar" style={{ display: 'flex', minHeight: '100vh' }}>
        <EventsCalendar />
        <NewsPanel />
      </section>

      <section id="dashboard">
        <DashboardEmbed src={lookerLink!} />
      </section>


      <section id="podcast">
        <PodcastSection />
      </section>

      <section id="links">
        <ImportantLinks />
      </section>

      <section id="library">
        <Search />
      </section>

      <section id="help">
        <HelpSteps />
      </section>
    </>
  );

}
