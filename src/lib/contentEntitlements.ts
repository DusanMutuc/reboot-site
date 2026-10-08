import 'server-only';

import { getAdminClient } from '@/lib/supabaseAdmin';

export type AccessibleContentNode = { node_id: number; root_id: number; open_path: string };

/** The service client bypasses RLS, so every member loader uses the DB's caller-bound inventory. */
export async function fetchAccessibleContentNodes(userId: string): Promise<AccessibleContentNode[]> {
  const client = getAdminClient();
  const nodes: AccessibleContentNode[] = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.rpc('accessible_discovery_nodes', { _user_id: userId })
      .order('node_id').order('root_id').order('open_path').range(offset, offset + pageSize - 1);
    if (error) throw new Error(`Failed to verify content access: ${error.message}`);
    const page = (data ?? []) as AccessibleContentNode[];
    nodes.push(...page);
    if (page.length < pageSize) return nodes;
  }
}
