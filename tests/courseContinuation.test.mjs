import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { courseLessons, courseContinuation, nextCourseLesson, explainCourseLocks, progressByNode } from '../src/lib/courseContinuation.ts';
import { renderComponent } from './helpers/componentHarness.mjs';

const node=(id,slug,children=[],extra={})=>({node:{id,slug,title:slug,node_type:id===1?'course':'lesson',state:'published',...extra},
  blocks:[],children:children.map((subtree,index)=>({edge:{position:index+1,is_required:true},subtree}))});
const course=()=>node(1,'course',[node(2,'first'),node(3,'nested',[node(4,'part one',[],{node_type:'chapter'}),node(5,'part-two',[],{node_type:'chapter'})]),node(6,'last')]);
const progress=(node_id,status='in_progress',updated_at='2026-10-16T12:00:00Z')=>({node_id,status,updated_at});
const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const plain=(data)=>JSON.parse(JSON.stringify(data));

test('start follows ordered nested lessons and continuation chooses latest unfinished visit across reloads',()=>{
  const lessons=courseLessons(course(),{});
  assert.deepEqual(lessons.map((item)=>item.nodeId),[2,4,5,6]);
  assert.equal(lessons[1].href,'/courses/course/nested/part%20one');
  assert.equal(courseContinuation(lessons,[]).target.nodeId,2);
  const saved=[progress(2),progress(5,'in_progress','2026-10-16T13:00:00Z')];
  assert.equal(courseContinuation(lessons,JSON.parse(JSON.stringify(saved))).target.nodeId,5);
  // Reviewing an already completed lesson later cannot move continuation.
  saved.push(progress(6,'completed','2026-10-16T14:00:00Z'));
  assert.equal(courseContinuation(lessons,saved).target.nodeId,5);
});

test('continuation skips locked ancestors, unpublished paths and unavailable old progress',()=>{
  const tree=course();tree.children.push({edge:{position:5},subtree:node(7,'hidden',[node(8,'private')],{state:'draft'})});
  const lessons=courseLessons(tree,{1:[{child_id:3,locked:true,reason:'waiting_for_required_previous'}]});
  assert.equal(lessons.find((item)=>item.nodeId===4).locked,true);
  assert.equal(lessons.some((item)=>item.nodeId===8),false);
  const saved=[progress(2,'completed'),progress(4),progress(8),progress(999)];
  assert.equal(courseContinuation(lessons,saved).target.nodeId,6);
  assert.match(lessons[1].lockReason,/earlier required/);
});

test('next skips completed lessons, wraps to unfinished work and completed courses return an outline',()=>{
  const lessons=courseLessons(course(),{});
  const saved=[progress(2,'completed'),progress(4,'completed')];
  assert.equal(nextCourseLesson(lessons,saved,2).nodeId,5);
  assert.equal(nextCourseLesson(lessons,saved,6).nodeId,5);
  const done=lessons.map((item)=>progress(item.nodeId,'completed'));
  assert.equal(courseContinuation(lessons,done).complete,true);
  assert.equal(courseContinuation(lessons,done).target,null);
  assert.equal(nextCourseLesson(lessons,done,6),null);
  assert.equal(courseContinuation([],[]).complete,false);
});

test('outline groups reflect child progress and locked lessons name visible prerequisites',()=>{
  const tree=course();
  assert.equal(progressByNode([progress(4)],tree)[3],'in_progress');
  assert.equal(progressByNode([progress(4,'completed'),progress(5,'completed')],tree)[3],'completed');
  const locks=explainCourseLocks(tree,{1:[{child_id:6,child_position:3,locked:true,reason:'waiting_for_required_previous'}]},[progress(2,'completed')]);
  assert.equal(locks[1][0].reason,'Complete “nested” to unlock this lesson.');
});

function viewer({rows=[],slugParts=[],flush=async()=>{},load}={}) {
  const redirects=[],pushes=[];
  const router={replace:(url)=>redirects.push(url),push:(url)=>pushes.push(url)};
  const rendered=renderComponent('src/components/course/CourseViewer.tsx',{courseSlug:'course',slugParts},{
    'next/navigation':{useRouter:()=>router},
    '@/lib/smartDocSaves':{flushPendingSmartDocSaves:flush},
    './StudentCourseTree':{default:'CourseTree',__esModule:true},'./LessonContent':{default:'Lesson',__esModule:true},
  },{process:{env:{NODE_ENV:'production'}},fetch:load??(async()=>response({course:course(),unlockStatuses:{},progress:rows})),
    console:{error(){},warn(){},debug(){}}});
  return {...rendered,redirects,pushes};
}

test('course root waits for account progress before redirecting and completed courses stay on the outline',async()=>{
  let resolve;const pending=new Promise((done)=>{resolve=done;});
  const r=viewer({load:()=>pending});await r.flush();assert.deepEqual(r.redirects,[]);
  resolve(response({course:course(),unlockStatuses:{},progress:[progress(5)]}));await r.flush();
  assert.equal(r.redirects.at(-1),'/courses/course/nested/part-two');r.unmount();
  const done=viewer({rows:[2,4,5,6].map((id)=>progress(id,'completed'))});await done.flush();
  assert.deepEqual(done.redirects,[]);assert.match(done.text(),/Course completed/);done.unmount();
});

test('next lesson uses acknowledged completion and flushes SmartDocs before navigation',async()=>{
  let fail=true,flushes=0;
  const rows=[progress(2,'completed')];
  const r=viewer({rows,slugParts:['first'],flush:async()=>{flushes++;if(fail)throw new Error('Answers still saving');}});
  await r.flush();assert.deepEqual(r.redirects,[]);
  const lesson=r.all((item)=>item.type==='Lesson')[0];assert.equal(lesson.props.completed,true);
  const next=()=>r.all((item)=>item.type==='Button'&&String(item.props.children).includes('Next lesson'))[0];
  await r.act(()=>next().props.onClick());assert.deepEqual(r.pushes,[]);assert.match(r.text(),/Answers still saving/);
  fail=false;await r.act(()=>next().props.onClick());assert.equal(flushes,2);
  assert.deepEqual(r.pushes,['/courses/course/nested/part%20one']);r.unmount();
});

test('successful completion refreshes unlocks and exposes the next lesson; failed refresh is retryable',async()=>{
  let refreshes=0;
  const r=viewer({slugParts:['first'],load:async(url)=>url.endsWith('/unlocks')
    ? ++refreshes===1?response({},503):response({unlockStatuses:{},progress:[progress(2,'completed')]})
    :response({course:course(),unlockStatuses:{},progress:[progress(2)]})});
  await r.flush();await r.act(()=>r.all((item)=>item.type==='Lesson')[0].props.onCompleted(2));
  assert.match(r.text(),/completion is saved/);
  assert.equal(r.all((item)=>item.type==='Button'&&String(item.props.children).includes('Next lesson'))[0].props.disabled,true);
  await r.act(()=>r.all((item)=>item.type==='Button'&&item.props.children==='Retry')[0].props.onClick());
  assert.equal(refreshes,2);assert.doesNotMatch(r.text(),/Refresh the course/);r.unmount();
});

test('older same-course refresh cannot undo a later acknowledged completion or unlock',async()=>{
  let resolveFirst;const first=new Promise((resolve)=>{resolveFirst=resolve;});let refreshes=0;
  const r=viewer({slugParts:['first'],load:async(url)=>url.endsWith('/unlocks')
    ? ++refreshes===1?first:response({unlockStatuses:{1:[{child_id:6,locked:false}]},progress:[progress(2,'completed'),progress(4,'completed')]})
    :response({course:course(),unlockStatuses:{},progress:[]})});
  await r.flush();await r.act(()=>r.all((item)=>item.type==='Lesson')[0].props.onCompleted(2));
  await r.act(()=>r.all((item)=>item.type==='Lesson')[0].props.onCompleted(4));
  resolveFirst(response({unlockStatuses:{1:[{child_id:6,locked:true}]},progress:[progress(2,'completed')]}));await r.flush();
  const outline=r.all((item)=>item.type==='CourseTree')[0];
  assert.equal(outline.props.progress[4],'completed');assert.equal(outline.props.lockStatuses[1][6].locked,false);r.unmount();
});

test('pending refresh from a previous course cannot change the current course',async()=>{
  let resolveOld;const old=new Promise((resolve)=>{resolveOld=resolve;});
  const r=viewer({slugParts:['first'],load:async(url)=>url.endsWith('/unlocks')?old:response({
    course:url.endsWith('/other')?{...course(),node:{...course().node,slug:'other'}}:course(),unlockStatuses:{},progress:[]})});
  await r.flush();await r.act(()=>r.all((item)=>item.type==='Lesson')[0].props.onCompleted(2));
  await r.updateProps({courseSlug:'other',slugParts:['first']});
  resolveOld(response({unlockStatuses:{},progress:[progress(2,'completed')]}));await r.flush();
  assert.equal(r.all((item)=>item.type==='Lesson')[0].props.completed,false);r.unmount();
});

test('Get help includes the current lesson and waits for the SmartDoc save guard',async()=>{
  let resolveSave;const pending=new Promise((resolve)=>{resolveSave=resolve;});
  const r=viewer({slugParts:['nested','part one'],flush:()=>pending});await r.flush();
  await r.act(()=>r.all((item)=>item.type==='CourseTree')[0].props.onGetHelp());assert.deepEqual(r.pushes,[]);
  resolveSave();await r.flush();
  assert.equal(r.pushes[0],'/support?from=%2Fcourses%2Fcourse%2Fnested%2Fpart%2520one');r.unmount();
});

test('a saved callback from a previous course cannot start a new refresh or change current progress',async()=>{
  let refreshes=0;
  const r=viewer({slugParts:['first'],load:async(url)=>{
    if(url.endsWith('/unlocks'))refreshes++;
    return response({course:{...course(),node:{...course().node,slug:url.endsWith('/other')?'other':'course'}},unlockStatuses:{},progress:[]});
  }});
  await r.flush();const oldLesson=r.all((item)=>item.type==='Lesson')[0];
  await r.updateProps({courseSlug:'other',slugParts:['first']});
  await r.act(()=>{oldLesson.props.onStarted(2);oldLesson.props.onCompleted(2);});
  assert.equal(refreshes,0);
  assert.equal(r.all((item)=>item.type==='Lesson')[0].props.completed,false);
  assert.equal(r.all((item)=>item.type==='CourseTree')[0].props.progress[2],undefined);r.unmount();
});

test('own-progress loader scopes and chunks reads without dropping a large course',async()=>{
  const exports={};const source=ts.transpileModule(fs.readFileSync(new URL('../src/lib/courseProgressServer.ts',import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  vm.runInNewContext(source,{exports,require:(name)=>{assert.equal(name,'server-only');return {};}});
  const calls=[];const client={from(table){const call={table};calls.push(call);return {
    select(){return this;},eq(key,value){call[key]=value;return this;},in(key,values){call[key]=values;return this;},order(){return this;},
    async range(){return {data:call.node_id.map((id)=>progress(id)),error:null};}};}};
  const ids=Array.from({length:455},(_,i)=>i+1);
  const rows=await exports.loadCourseProgress(client,'member-a',ids);
  assert.equal(rows.length,455);assert.deepEqual(calls.map((item)=>item.node_id.length),[200,200,55]);
  assert.equal(calls.every((item)=>item.user_id==='member-a'),true);
  assert.deepEqual(plain(rows.map((item)=>item.node_id)),ids);
});
