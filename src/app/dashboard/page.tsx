'use client';

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export default function DashboardPage() {
  const [lookerLink, setLookerLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLookerLink = async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setError('Could not get user. Please log in.');
        setLoading(false);
        return;
      }
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('looker_link')
        .eq('id', user.id)
        .single();
      if (profileError) {
        setError('Could not fetch Looker Studio link.');
      } else {
        setLookerLink(data.looker_link);
      }
      setLoading(false);
    };
    fetchLookerLink();
  }, []);

  if (loading) {
    return <div style={{ padding: 40 }}><p>Loading...</p></div>;
  }
  if (error) {
    return <div style={{ padding: 40 }}><p style={{ color: 'red' }}>{error}</p></div>;
  }
  if (!lookerLink) {
    return <div style={{ padding: 40 }}><p>No Looker Studio link found for your account.</p></div>;
  }
  return (
    <div style={{ padding: 40 }}>
      <h1>Dashboard</h1>
      <iframe
        width="100%"
        height="800"
        src={lookerLink}
        frameBorder="0"
        style={{ border: 0 }}
        allowFullScreen
        sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        title="Looker Studio Report"
      ></iframe>
    </div>
  );
}
