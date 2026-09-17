import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/requireUser';
import { getAdminClient } from '@/lib/supabaseAdmin';

/** Read-only staff preview. Never relax the member course/library access endpoints. */
export async function GET(request: NextRequest) {
  const guard = await requireUser(request);
  if (!guard.ok) return guard.res;
  if (!guard.roleCodes.some(code => ['admin', 'superadmin'].includes(code))) {
    return NextResponse.json({ error: 'Admin privileges required' }, { status: 403 });
  }
  const id = Number(request.nextUrl.searchParams.get('nodeId'));
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Invalid learning item' }, { status: 400 });
  const admin = getAdminClient();
  const [node, blocks, parents, children] = await Promise.all([
    admin.from('content_nodes').select('id,title,node_type,state,description').eq('id', id).maybeSingle(),
    admin.from('content_blocks').select('id,block_type,position,text_md,resource_id,smart_doc_id,start_ms,end_ms,label,settings')
      .eq('node_id', id).order('position'),
    admin.from('node_children').select('parent_id,position').eq('child_id', id).order('position'),
    admin.from('node_children').select('child_id,position').eq('parent_id', id).order('position'),
  ]);
  if ([node, blocks, parents, children].some(result => result.error)) {
    return NextResponse.json({ error: 'The preview could not be loaded. Please try again.' }, { status: 503 });
  }
  if (!node.data) return NextResponse.json({ error: 'Learning item not found' }, { status: 404 });
  const resourceIds = [...new Set((blocks.data ?? []).flatMap(block => block.resource_id ? [block.resource_id] : []))];
  const relationIds = [...new Set([...(parents.data ?? []).map(row => row.parent_id), ...(children.data ?? []).map(row => row.child_id)])];
  const [resources, relations] = await Promise.all([
    resourceIds.length ? admin.from('resources').select('id,title,type,state,url,thumbnail,duration,storage_bucket,storage_path').in('id', resourceIds)
      : Promise.resolve({ data: [], error: null }),
    relationIds.length ? admin.from('content_nodes').select('id,title,node_type,state').in('id', relationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (resources.error || relations.error) return NextResponse.json({ error: 'Some preview material could not be loaded.' }, { status: 503 });
  const related = new Map((relations.data ?? []).map(row => [row.id, row]));
  return NextResponse.json({ node: node.data, blocks: blocks.data,
    resources: Object.fromEntries((resources.data ?? []).map(({ storage_bucket, storage_path, ...resource }) => [resource.id, {
      ...resource, url: storage_bucket && storage_path ? `/r/${resource.id}` : resource.url,
    }])),
    parents: (parents.data ?? []).map(row => related.get(row.parent_id)).filter(Boolean),
    children: (children.data ?? []).map(row => related.get(row.child_id)).filter(Boolean),
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
