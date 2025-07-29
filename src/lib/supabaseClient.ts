import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  'https://zmkmgxrnhdnbpiblkkkk.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpta21neHJuaGRuYnBpYmxra2trIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMxNjg3NjksImV4cCI6MjA2ODc0NDc2OX0.VJ5kH4EojH4Ga5DWSWzsFawAlnRU0mka4KLabG-yqSg'
);
