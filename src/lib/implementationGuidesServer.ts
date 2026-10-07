import type { SupabaseClient } from '@supabase/supabase-js';
import type { ImplementationGuide, ImplementationGuideAudience, ImplementationGuideStep, ImplementationGuidesAdminResponse } from '@/types/implementationGuides';

export async function loadImplementationGuides(client: SupabaseClient): Promise<Map<string, ImplementationGuide>> {
  const headers = await client.from('system_implementation_guides').select('id,audience,system_key,current_revision,updated_at');
  if (headers.error) throw headers.error;
  if (!headers.data?.length) return new Map();
  // Match exact revision pairs; independent IN filters pull historical versions
  // too and can exhaust the API row limit after many admin edits.
  const groups = new Map<number, string[]>();
  for (const row of headers.data) groups.set(row.current_revision, [...(groups.get(row.current_revision) ?? []), row.id]);
  const versionResults = await Promise.all([...groups].map(([revision, ids]) => client
    .from('system_implementation_guide_versions').select('guide_id,revision,steps').eq('revision', revision).in('guide_id', ids)));
  for (const result of versionResults) if (result.error) throw result.error;
  const versions = versionResults.flatMap((result) => result.data ?? []);
  return new Map(headers.data.map((header) => {
    const version = versions.find((row) => row.guide_id === header.id && row.revision === header.current_revision);
    if (!version) throw new Error('Implementation guide revision is missing.');
    return [`${header.audience}:${header.system_key}`, {
      id: header.id, revision: header.current_revision, updatedAt: header.updated_at, steps: version.steps as ImplementationGuideStep[],
    }];
  }));
}

export async function loadImplementationGuidesAdmin(client: SupabaseClient): Promise<ImplementationGuidesAdminResponse> {
  const templates = await client.from('system_scorecard_templates').select('key,audience').eq('is_active', true);
  if (templates.error) throw templates.error;
  const activeKeys = templates.data.map((row) => row.key);
  const [categories, systems, guides] = await Promise.all([
    activeKeys.length ? client.from('system_scorecard_categories').select('id,label,position').in('template_key', activeKeys) : Promise.resolve({ data: [], error: null }),
    activeKeys.length ? client.from('system_scorecard_systems').select('id,key,label,category_id,template_key,position').in('template_key', activeKeys) : Promise.resolve({ data: [], error: null }),
    loadImplementationGuides(client),
  ]);
  for (const result of [categories, systems]) if (result.error) throw result.error;
  const resources: ImplementationGuidesAdminResponse['resources'] = [];
  for (let offset = 0; ; offset += 1000) {
    const page = await client.from('resources').select('id,title,type,state').order('id').range(offset, offset + 999);
    if (page.error) throw page.error;
    resources.push(...page.data);
    if (page.data.length < 1000) break;
  }
  const audiences = new Map(templates.data!.map((row) => [row.key, row.audience as ImplementationGuideAudience]));
  const categoryMap = new Map(categories.data!.map((row) => [Number(row.id), row]));
  return { resources, systems: systems.data!.filter((row) => audiences.has(row.template_key)).map((row) => {
    const audience = audiences.get(row.template_key)!;
    const category = categoryMap.get(Number(row.category_id));
    return { id: Number(row.id), key: row.key, label: row.label, audience, categoryId: Number(row.category_id),
      categoryLabel: category?.label ?? '', categoryPosition: category?.position ?? 0, position: row.position,
      guide: guides.get(`${audience}:${row.key}`) ?? null };
  }) };
}
