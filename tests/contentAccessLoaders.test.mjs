import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { parseResourceId, resolveResourceRedirectTarget } from '../src/lib/resourceRedirect.ts';

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require('next/server');
const load = (relative,imports) => {
  const source=ts.transpileModule(fs.readFileSync(new URL(`../${relative}`,import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
  }).outputText;
  const exports={};
  vm.runInNewContext(source,{exports,console,process,URL,require:(name)=>name==='server-only'?{}:imports[name]??require(name)});
  return exports;
};
const plain = (value) => JSON.parse(JSON.stringify(value));
class CourseBuilderError extends Error { constructor(message,status=500){super(message);this.status=status;} }
const builder = (client) => ({adminClient:client,CourseBuilderError,
  handleCourseBuilderError:(error)=>NextResponse.json({error:error.message},{status:error.status??500})});

function fixture({inventoryError=false,roles=['user'],extraInventory=[]}={}) {
  const nodes=[
    {id:1,slug:'library',node_type:'collection',state:'published'},
    {id:2,slug:'assistant-library',node_type:'collection',state:'published'},
    {id:3,slug:'legends-library',node_type:'collection',state:'published'},
    {id:10,slug:'published',node_type:'lesson',state:'published'},
    {id:11,slug:'draft',node_type:'lesson',state:'draft'},
    {id:12,slug:'hidden-child',node_type:'chapter',state:'published'},
    {id:13,slug:'shared-child',node_type:'chapter',state:'published'},
    {id:14,slug:'archived-child',node_type:'chapter',state:'archived'},
    {id:15,slug:'legend-guide',node_type:'lesson',state:'published'},
  ].map((n)=>({...n,title:n.slug,description:null,hero_image:null}));
  const links=[{parent_id:1,child_id:10,position:1},{parent_id:1,child_id:11,position:2},
    {parent_id:11,child_id:12,position:1},{parent_id:11,child_id:13,position:2},
    {parent_id:10,child_id:13,position:1},{parent_id:10,child_id:14,position:2},
    {parent_id:3,child_id:15,position:1}];
  const inventory=[1,10,13].map((node_id)=>({node_id,root_id:1,open_path:'/library/test'}));
  if(roles.includes('legend')) inventory.push({node_id:3,root_id:3,open_path:'/legends-library'},
    {node_id:15,root_id:3,open_path:'/legends-library/legend-guide'});
  inventory.push(...extraInventory);
  const calls=[];
  class Query {
    constructor(data,table){this.data=data;this.table=table;}
    select(){return this;}
    eq(key,value){this.data=this.data.filter((r)=>r[key]===value);return this;}
    in(key,values){this.data=this.data.filter((r)=>values.includes(r[key]));return this;}
    order(){return this;}
    range(start,end){calls.push({range:[start,end]});this.data=this.data.slice(start,end+1);return this;}
    maybeSingle(){this.single=true;return this;}
    then(resolve,reject){return Promise.resolve({data:this.single?this.data[0]??null:this.data,
      error:this.table==='inventory'&&inventoryError?{message:'offline'}:null}).then(resolve,reject);}
  }
  const client={
    from(table){calls.push({table});return new Query({content_nodes:nodes,node_children:links,
      user_roles:roles.map((code)=>({user_id:'viewer',roles:{code}})),
      content_blocks:[{id:100,node_id:10,block_type:'text',text_md:'Visible text',resource_id:null},
        {id:101,node_id:11,block_type:'text',text_md:'DRAFT SECRET',resource_id:null}],resources:[]}[table]??[],table);},
    rpc(name,args){calls.push({name,args});assert.equal(name,'accessible_discovery_nodes');return new Query([...inventory],'inventory');},
  };
  const access=load('src/lib/contentEntitlements.ts',{'@/lib/supabaseAdmin':{getAdminClient:()=>client}});
  const library=load('src/lib/libraryAccess.ts',{'@/lib/courseBuilder':builder(client),'@/lib/contentEntitlements':access});
  return {client,calls,access,library};
}

test('member collection and sidebar loaders exclude drafts, archived children and draft ancestors',async()=>{
  const {library}=fixture();
  assert.deepEqual(plain((await library.fetchLibraryCollectionItemsForScope('viewer','main')).map((r)=>r.child_id)),[10]);
  const sidebar=await library.fetchLibrarySidebarItemsForScope('viewer','main');
  assert.deepEqual(plain(sidebar.map((r)=>r.id)),[10]);
  assert.deepEqual(plain(sidebar[0].children.map((r)=>r.id)),[13]);
});
test('detail rejects draft paths before reading blocks and permits a shared published placement',async()=>{
  const {library,calls}=fixture();
  for(const id of [11,12,14]) await assert.rejects(()=>library.fetchLibraryDetailDataForScope('viewer','main',{id}),{status:404});
  assert.equal(calls.some((c)=>c.table==='content_blocks'),false);
  const visible=await library.fetchLibraryDetailDataForScope('viewer','main',{slug:'published'});
  assert.equal(visible.blocks[0].text_md,'Visible text');
  assert.equal((await library.fetchLibraryDetailDataForScope('viewer','main',{id:13})).node.id,13);
  assert.equal(await library.resolveAccessibleLibrarySlugFromNodeId('viewer','main',12),null);
});
test('Legends scope includes only authorized placements and never unlocks another scope',async()=>{
  const {library}=fixture({roles:['legend']});
  assert.deepEqual(plain((await library.fetchLibraryCollectionItemsForScope('viewer','legend')).map((r)=>r.child_id)),[10,15]);
  await assert.rejects(()=>library.fetchLibraryDetailDataForScope('viewer','main',{id:15}),{status:404});
  assert.equal((await library.fetchLibraryDetailDataForScope('viewer','legend',{id:15})).node.id,15);
  await assert.rejects(()=>fixture().library.fetchLibraryCollectionItemsForScope('viewer','legend'),{status:403});
});
test('failed entitlement reads stop service loaders; inventory pagination includes all allowed nodes',async()=>{
  const broken=fixture({inventoryError:true});
  await assert.rejects(()=>broken.library.fetchLibraryCollectionItemsForScope('viewer','main'),/offline/);
  assert.equal(broken.calls.some((c)=>c.table==='content_blocks'),false);
  const many=fixture({extraInventory:Array.from({length:1000},(_,i)=>({node_id:1000+i,root_id:1,open_path:'/library/a'}))});
  assert.equal((await many.access.fetchAccessibleContentNodes('viewer')).length,1003);
  assert.deepEqual(plain(many.calls.filter((c)=>c.range).map((c)=>c.range)),[[0,999],[1000,1999]]);
});
test('course access always uses database entitlements, including programme membership',async()=>{
  const calls=[];
  const client={rpc:async(name,args)=>{calls.push({name,args});return {data:false,error:null};}};
  const access=load('src/lib/courseAccess.ts',{'@/lib/courseBuilder':builder(client)});
  assert.equal(await access.canUserAccessCourse('programme',120),false);
  assert.equal(await access.canUserAccessNodeViaCourse('programme',123),false);
  assert.deepEqual(calls.map((c)=>c.name),['can_user_access_course','can_user_access_node_via_course']);
});
test('node block endpoint cannot load draft or unavailable content through a service client',async()=>{
  let reads=0;
  const client={from:()=>{reads++;throw new Error('must not read blocks');}};
  const api=load('src/app/api/nodes/[nodeId]/blocks/route.ts',{
    '@/lib/requireUser':{requireUser:async()=>({ok:true,user:{id:'viewer'}})},
    '@/lib/courseBuilder':builder(client), '@/lib/courseAccess':{canUserAccessNodeViaCourse:async()=>false},
  });
  assert.equal((await api.GET(new NextRequest('https://example.test/api/nodes/123/blocks'),
    {params:Promise.resolve({nodeId:'123'})})).status,404);
  assert.equal(reads,0);
});
test('course tree service loader removes nodes outside the selected published entitlement path',async()=>{
  const node=(id,state='published',children=[])=>({node:{id,state},blocks:[],children:children.map((subtree)=>({edge:{},subtree}))});
  const tree=node(120,'published',[node(121,'draft',[node(124)]),node(122,'published',[node(123)]),node(125)]);
  const api=load('src/app/api/courses/[courseSlug]/route.ts',{
    '@/lib/requireUser':{requireUser:async()=>({ok:true,user:{id:'viewer'}})},
    '@/lib/courseBuilder':{...builder({rpc:async()=>({data:[],error:null})}),fetchNodeSubtree:async()=>tree},
    '@/lib/courseAccess':{resolveAccessibleCourseBySlug:async()=>({id:120})},
    '@/lib/contentEntitlements':{fetchAccessibleContentNodes:async()=>[
      {node_id:120,root_id:120},{node_id:122,root_id:120},{node_id:123,root_id:120},
      {node_id:125,root_id:130},{node_id:124,root_id:120}]},
  });
  const response=await api.GET(new NextRequest('https://example.test/api/courses/compass'),{params:Promise.resolve({courseSlug:'compass'})});
  assert.equal(response.status,200);
  const {course}=await response.json();
  assert.deepEqual(course.children.map((child)=>child.subtree.node.id),[122]);
  assert.deepEqual(course.children[0].subtree.children.map((child)=>child.subtree.node.id),[123]);
});
test('resource download uses shared entitlement, honors denied guards, and fails closed on database errors',async()=>{
  for(const outcome of ['legend','denied','past','error']) {
    const calls=[];
    const query={select(){return this;},eq(){return this;},single:async()=>({data:{id:202,state:'published',
      url:'https://example.test/legend.pdf',storage_bucket:null,storage_path:null},error:null})};
    const supabase={from:()=>{calls.push('resource');return query;}};
    const api=load('src/app/r/[id]/route.ts',{
      '@/lib/resourceRedirect':{parseResourceId,resolveResourceRedirectTarget},
      '@/lib/requireUser':{requireUser:async()=>outcome==='past'?{ok:false,res:NextResponse.json({}, {status:403})}:
        {ok:true,user:{id:'legend'},roleCodes:['legend'],supabase}},
      '@/lib/courseBuilder':builder({rpc:async(name,args)=>{calls.push({name,args});return {
        data:outcome==='legend',error:outcome==='error'?{message:'offline'}:null};}}),
    });
    const result=await api.GET(new NextRequest('https://example.test/r/202'));
    assert.equal(result.status,{legend:302,denied:404,past:403,error:503}[outcome]);
    assert.equal(calls.includes('resource'),outcome==='legend');
    if(outcome==='legend') assert.equal(result.headers.get('location'),'https://example.test/legend.pdf');
  }
});
test('unlock refresh awaits Next route params before resolving the course',async()=>{
  const calls=[];
  const api=load('src/app/api/courses/[courseSlug]/unlocks/route.ts',{
    '@/lib/requireUser':{requireUser:async()=>({ok:true,user:{id:'viewer'}})},
    '@/lib/courseBuilder':{adminClient:{rpc:async()=>({data:[],error:null})},fetchNodeSubtree:async()=>({})},
    '@/lib/courseAccess':{resolveAccessibleCourseBySlug:async(_,slug)=>{calls.push(slug);return {id:120};},collectSubtreeNodeIds:()=>new Set([120])},
  });
  const response=await api.POST(new NextRequest('https://example.test/api/courses/compass/unlocks',{
    method:'POST',body:JSON.stringify({parentIds:[120]})}),{params:Promise.resolve({courseSlug:'compass'})});
  assert.equal(response.status,200);assert.deepEqual(calls,['compass']);
});
