import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CourseNodeProgress } from './courseContinuation';

/** IDs must come from the authenticated member's sanitized course tree. Read
 * only that member, even when a coach/partner can read other progress via RLS. */
export async function loadCourseProgress(client: SupabaseClient, userId: string, nodeIds: number[]): Promise<CourseNodeProgress[]> {
  const rows: CourseNodeProgress[] = [];
  const ids = [...new Set(nodeIds)];
  for (let offset = 0; offset < ids.length; offset += 200) {
    const { data, error } = await client.from('user_node_progress')
      .select('node_id,status,updated_at').eq('user_id', userId)
      .in('node_id', ids.slice(offset, offset + 200)).order('node_id').range(0, 199);
    if (error) throw new Error(`Could not load course progress: ${error.message}`);
    rows.push(...(data ?? []) as CourseNodeProgress[]);
  }
  return rows;
}
