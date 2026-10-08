import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { renderComponent } from './helpers/componentHarness.mjs';

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const response=(body={},status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
function hook(fetch) {
  const refs=[];let cursor=0;
  const react={useRef(initial){const index=cursor++;return refs[index]??(refs[index]={current:initial});},useCallback:fn=>fn};
  const exports={};
  const source=ts.transpileModule(fs.readFileSync(new URL('../src/hooks/useNodeProgress.ts',import.meta.url),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
  }).outputText;
  vm.runInNewContext(source,{exports,fetch,console,require:(name)=>{assert.equal(name,'react');return react;}});
  return (id)=>{cursor=0;return exports.useNodeProgress(id);};
}
test('progress hook records each visited node and deduplicates acknowledged writes per node',async()=>{
  const calls=[];const render=hook(async(_,options)=>{calls.push(JSON.parse(options.body));return response();});
  const first=render(1);await first.markStarted();await first.markCompleted();
  const second=render(2);await second.markStarted();await second.markCompleted();
  await render(1).markStarted();await render(1).markCompleted();await render(null).markCompleted();
  assert.deepEqual(calls,[{action:'start',nodeId:1},{action:'complete',nodeId:1},{action:'start',nodeId:2},{action:'complete',nodeId:2}]);
});
test('concurrent completion callers await the same pending write and can retry after HTTP failure',async()=>{
  const pending=deferred();let count=0;
  const render=hook(async()=>{count++;return count===1?pending.promise:response();});
  const current=render(1);const a=current.markCompleted(),b=current.markCompleted();
  assert.equal(a,b);assert.equal(count,1);
  const failed=assert.rejects(a,/Failed to save progress/);
  pending.resolve(response({error:'offline'},503));await failed;
  await current.markCompleted();assert.equal(count,2);
});
test('an old node failure cannot reset a newer node in-flight completion',async()=>{
  const first=deferred(),second=deferred();const calls=[];
  const render=hook(async(_,options)=>{const payload=JSON.parse(options.body);calls.push(payload);return payload.nodeId===1?first.promise:second.promise;});
  const old=render(1).markCompleted();const failure=assert.rejects(old,/offline/);
  const current=render(2);const next=current.markCompleted();
  first.reject(new Error('offline'));await failure;
  assert.equal(current.markCompleted(),next);assert.equal(calls.length,2);
  second.resolve(response());await next;
});

function lesson({complete=()=>response(),start=()=>response(),loadBlocks=()=>response({blocks:[{id:4,block_type:'text',text_md:'Body',position:1}]}),scrollHeight=100}={}) {
  const calls=[],completed=[];
  const props=(id)=>({lesson:{node:{id,node_type:'lesson',title:`Lesson ${id}`},children:[]},loading:false,onCompleted:(node)=>completed.push(node)});
  const rendered=renderComponent('src/components/course/LessonContent.tsx',props(1),{
    '@/components/course/BlockRenderer':{BlockRenderer:()=>null},'@/lib/supabaseClient':{supabase:{}},
  },{
    fetch:async(url,options)=>{
      if(url.includes('/blocks')) return loadBlocks(url);
      assert.equal(url,'/api/progress');const body=JSON.parse(options.body);calls.push(body);
      return body.action==='complete'?complete(body):start(body);
    },
    console:{debug(){},error(){},warn(){}},setInterval:()=>1,clearInterval(){},
    document:{addEventListener(){},removeEventListener(){},documentElement:{scrollHeight,clientHeight:100}},
    window:{addEventListener(){},removeEventListener(){}},
  });
  return {...rendered,calls,completed,props,retry:()=>rendered.all((n)=>n.type==='Button'&&n.props.children==='Retry progress save')[0]};
}
test('lesson shows failed completion and retries without falsely notifying completed',async()=>{
  let attempts=0;const r=lesson({complete:()=>response({},++attempts===1?503:200)});
  await r.flush();assert.equal(attempts,1);assert.deepEqual(r.completed,[]);
  assert.match(r.text(),/completion could not be saved/);
  await r.act(()=>r.retry().props.onClick());
  assert.equal(attempts,2);assert.deepEqual(r.completed,[1]);assert.equal(r.retry(),undefined);r.unmount();
});
test('changing lessons does not use the previous lesson content to start or complete the new node',async()=>{
  const pending=deferred();const r=lesson({loadBlocks:(url)=>url.includes('/2/')?pending.promise:response({blocks:[]})});
  await r.flush();assert.deepEqual(r.completed,[1]);
  await r.updateProps(r.props(2));
  assert.equal(r.calls.some((c)=>c.nodeId===2),false,'new content must finish loading');
  pending.resolve(response({blocks:[]}));await r.flush();
  assert.deepEqual(r.completed,[1,2]);r.unmount();
});
test('a completion failure after navigation cannot put the current lesson in an error state',async()=>{
  const pending=deferred();const r=lesson({complete:({nodeId})=>nodeId===1?pending.promise:response()});
  await r.flush();await r.updateProps(r.props(2));assert.deepEqual(r.completed,[2]);
  pending.resolve(response({},503));await r.flush();
  assert.equal(r.retry(),undefined);assert.doesNotMatch(r.text(),/could not be saved/);r.unmount();
});
test('failed started writes are handled and retryable while a longer lesson remains incomplete',async()=>{
  let attempts=0;const r=lesson({scrollHeight:1000,start:()=>response({},++attempts===1?503:200)});
  await r.flush();assert.deepEqual(r.completed,[]);assert.match(r.text(),/progress could not be saved/);
  await r.act(()=>r.retry().props.onClick());assert.equal(attempts,2);assert.equal(r.retry(),undefined);r.unmount();
});
