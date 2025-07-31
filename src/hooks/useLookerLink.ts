import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';   // adjust path alias if you’re not using “@”

type UseLookerLinkResult = {
  lookerLink: string | null;
  loading: boolean;
  error: string | null;
};

export function useLookerLink(): UseLookerLinkResult {
  const [lookerLink, setLookerLink] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLink = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

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

    fetchLink();
  }, []);

  return { lookerLink, loading, error };
}
