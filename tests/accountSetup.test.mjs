import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const { NextRequest, NextResponse } = require('next/server');
const root = fileURLToPath(new URL('../', import.meta.url));
const user = { id:'11111111-1111-4111-8111-111111111111', email:'member@example.invalid',
  app_metadata:{must_reset_password:true,setup_required_at:'2026-10-08T12:00:00.100Z',retained:'value'},user_metadata:{} };
const claims = { sub:user.id, amr:[{method:'otp',timestamp:Math.floor(Date.now()/1000)}] };
const quiet = { log() {},warn() {},error() {} };

function loader(imports = {}, environment = {}) {
  const modules = new Map();
  const context = vm.createContext({ console:quiet,process:{env:environment},Buffer,URL,Date });
  function load(relativePath) {
    const filename = path.resolve(root,relativePath);
    if (modules.has(filename)) return modules.get(filename);
    const exports = {}; modules.set(filename,exports);
    const source = ts.transpileModule(fs.readFileSync(filename,'utf8'), {
      compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
    }).outputText;
    const localRequire = (name) => {
      if (name in imports) return imports[name];
      if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`);
      if (name.startsWith('.')) return load(path.resolve(path.dirname(filename),`${name}.ts`));
      return require(name);
    };
    vm.runInContext(`(function(exports,require){${source}\n})`,context,{filename})(exports,localRequire);
    return exports;
  }
  return load;
}

test('setup credentials are independent, unguessable and satisfy password character policies', () => {
  const {createSetupCredential} = loader()('src/lib/accountSetupServer.ts');
  const generated = Array.from({length:128},()=>createSetupCredential());
  assert.equal(new Set(generated).size,128);
  for (const credential of generated) {
    assert.ok(credential.length >= 64);
    for (const characterClass of [/[a-z]/,/[A-Z]/,/\d/,/[^a-zA-Z0-9]/]) assert.match(credential,characterClass);
  }
});

test('setup email always uses the configured application recovery destination and reports delivery failures', async () => {
  const {sendAccountSetupEmail} = loader()('src/lib/accountSetupServer.ts');
  const calls=[];
  const client={auth:{async resetPasswordForEmail(email,options){calls.push({email,options});return {error:null};}}};
  assert.equal(await sendAccountSetupEmail(client,user.email),true);
  assert.deepEqual(JSON.parse(JSON.stringify(calls)),[{email:user.email,options:{redirectTo:'https://hub.rebootmembers.com/reset-password'}}]);
  client.auth.resetPasswordForEmail=async()=>({error:{message:'throttled'}});
  assert.equal(await sendAccountSetupEmail(client,user.email),false);
  client.auth.resetPasswordForEmail=async()=>{throw new Error('unavailable');};
  assert.equal(await sendAccountSetupEmail(client,user.email),false);
});

test('pending setup requires the same identity and a fresh verified email authentication method', () => {
  const {hasVerifiedSetupSession,requiresAccountSetup}=loader()('src/lib/accountSetup.ts');
  const now=Date.parse('2026-10-08T12:01:00Z');
  assert.equal(requiresAccountSetup(user),true);
  assert.equal(requiresAccountSetup({...user,app_metadata:{must_reset_password:false}}),false);
  for (const method of ['otp','recovery','invite','magiclink']) {
    assert.equal(hasVerifiedSetupSession({sub:user.id,amr:[{method,timestamp:now/1000}]},user,now),true);
  }
  for (const invalid of [
    {}, {sub:'different',amr:claims.amr}, {sub:user.id,amr:'otp'},
    {sub:user.id,amr:[{method:'password',timestamp:2000000000}]},
    {sub:user.id,amr:[{method:'oauth',timestamp:2000000000}]},
    {sub:user.id,amr:[{method:'otp',timestamp:'2000000000'}]},
    {sub:user.id,amr:[{method:'otp',timestamp:Date.parse('2026-10-08T11:59:59Z')/1000}]},
  ]) assert.equal(hasVerifiedSetupSession(invalid,user,now),false,JSON.stringify(invalid));
});

test('setup proof expires after one hour, rejects future proof, and respects verified MFA factors', () => {
  const {hasVerifiedSetupSession}=loader()('src/lib/accountSetup.ts');
  const now=Date.parse('2026-10-08T14:00:00Z');
  const proof=(timestamp,aal)=>({sub:user.id,amr:[{method:'otp',timestamp}],aal});
  assert.equal(hasVerifiedSetupSession(proof(now/1000-3600),user,now),true);
  assert.equal(hasVerifiedSetupSession(proof(now/1000-3601),user,now),false);
  assert.equal(hasVerifiedSetupSession(proof(now/1000+60),user,now),true);
  assert.equal(hasVerifiedSetupSession(proof(now/1000+61),user,now),false);
  const withMfa={...user,factors:[{status:'verified',factor_type:'totp'}]};
  assert.equal(hasVerifiedSetupSession(proof(now/1000,'aal1'),withMfa,now),false);
  assert.equal(hasVerifiedSetupSession(proof(now/1000,'aal2'),withMfa,now),true);
  assert.equal(hasVerifiedSetupSession(proof(now/1000,'aal1'),{...user,factors:[{status:'unverified',factor_type:'totp'}]},now),true);
});

function resetFixture({authUser=user,verifiedClaims=claims,claimsError=null,updateError=null,denied=null}={}) {
  const calls={updates:[],claims:[],guards:[]};
  const client={auth:{
    async getClaims(token){calls.claims.push(token);return {data:{claims:verifiedClaims},error:claimsError};},
    admin:{async updateUserById(id,changes){calls.updates.push({id,changes:JSON.parse(JSON.stringify(changes))});return {error:updateError};}},
  }};
  const load=loader({
    '@/lib/requireUser':{async requireUser(request,options){calls.guards.push(options);return denied ? {ok:false,res:denied} : {ok:true,user:authUser,supabase:client};}},
    '@/lib/supabaseAdmin':{getAdminClient:()=>client},
  });
  const post=load('src/app/api/auth/clear-first-login-flag/route.ts').POST;
  return {calls,post:(body,token)=>post(new NextRequest('https://hub.example.invalid/api/auth/clear-first-login-flag',{
    method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body),
  }))};
}

test('password setup verifies signed claims then atomically updates credential and server metadata', async () => {
  const env=resetFixture();
  const response=await env.post({password:'OwnerVerified123!'},'verified-token');
  assert.equal(response.status,200);
  assert.deepEqual(env.calls.claims,['verified-token']);
  assert.equal(env.calls.updates.length,1);
  assert.equal(env.calls.updates[0].id,user.id);
  assert.equal(env.calls.updates[0].changes.password,'OwnerVerified123!');
  assert.equal(env.calls.updates[0].changes.app_metadata.must_reset_password,false);
  assert.equal(env.calls.updates[0].changes.app_metadata.retained,'value');
  assert.ok(env.calls.updates[0].changes.app_metadata.setup_completed_at);
  assert.equal(response.headers.get('cache-control'),'no-store');
});

test('pending users cannot clear setup through password sessions, invalid signatures, old OTPs, or another identity', async () => {
  for (const options of [
    {verifiedClaims:null}, {claimsError:{message:'bad signature'}},
    {verifiedClaims:{sub:user.id,amr:[{method:'password',timestamp:2000000000}]}},
    {verifiedClaims:{sub:user.id,amr:[{method:'otp',timestamp:1}]}},
    {verifiedClaims:{sub:user.id,amr:[{method:'otp',timestamp:Math.floor(Date.now()/1000)-3601}]}},
    {verifiedClaims:{sub:user.id,amr:[{method:'otp',timestamp:Math.floor(Date.now()/1000)+120}]}},
    {verifiedClaims:{...claims,sub:'another-user'}},
  ]) {
    const env=resetFixture(options);
    assert.equal((await env.post({password:'OwnerVerified123!'})).status,403);
    assert.equal(env.calls.updates.length,0);
  }
});

test('reset validation, rejected session, and Auth write failures never clear setup separately', async () => {
  for (const body of [null,{}, {password:'short'}, {password:'x'.repeat(1025)}, {password:3}]) {
    const env=resetFixture();
    assert.equal((await env.post(body)).status,400);
    assert.equal(env.calls.updates.length,0);
    assert.equal(env.calls.claims.length,0);
  }
  const denied=resetFixture({denied:NextResponse.json({error:'Account merged'},{status:403})});
  assert.equal((await denied.post({password:'OwnerVerified123!'})).status,403);
  assert.equal(denied.calls.updates.length,0);
  const failed=resetFixture({updateError:{message:'Password policy rejected'}});
  assert.equal((await failed.post({password:'OwnerVerified123!'})).status,400);
  assert.equal(failed.calls.updates.length,1);
});

test('setup endpoint cannot be used as an admin password-change bypass by established accounts', async () => {
  const env=resetFixture({authUser:{...user,app_metadata:{must_reset_password:false}},verifiedClaims:null});
  assert.equal((await env.post({password:'NewPassword123!'})).status,409);
  assert.equal(env.calls.claims.length,0);
  assert.equal(env.calls.updates.length,0);
});

test('pending MFA users require verified AAL2 before an atomic setup password update', async () => {
  const authUser={...user,factors:[{status:'verified',factor_type:'totp'}]};
  for (const aal of [undefined,'aal1']) {
    const env=resetFixture({authUser,verifiedClaims:{...claims,aal}});
    const response=await env.post({password:'NewPassword123!'});
    assert.equal(response.status,403);
    assert.equal((await response.json()).code,'ACCOUNT_SETUP_MFA_REQUIRED');
    assert.equal(env.calls.updates.length,0);
  }
  const elevated=resetFixture({authUser,verifiedClaims:{...claims,aal:'aal2'}});
  assert.equal((await elevated.post({password:'NewPassword123!'})).status,200);
  assert.equal(elevated.calls.updates.length,1);
});

function provisioningFixture({denied=false,duplicate=false,existingUser=user,emailError=null,roleError=null,profileError=null}={}) {
  const calls={creates:[],updates:[],emails:[],writes:[],clients:0};
  const client={
    auth:{
      async resetPasswordForEmail(email,options){calls.emails.push({email,options});return {error:emailError};},
      admin:{
        async createUser(body){calls.creates.push(JSON.parse(JSON.stringify(body)));return {data:{user:{id:user.id}},error:duplicate?{message:'User already registered'}:null};},
        async listUsers(){return {data:{users:[existingUser]},error:null};},
        async updateUserById(id,changes){calls.updates.push({id,changes:JSON.parse(JSON.stringify(changes))});return {error:null};},
      },
    },
    from(table){
      const query={
        select(){return query;},eq(){return query;},
        async maybeSingle(){return {data:{id:7,code:'user'},error:roleError};},
        async upsert(payload){calls.writes.push({table,payload});return {error:table==='profiles'?profileError:null};},
      };return query;
    },
  };
  const load=loader({
    '@/lib/supabaseAdmin':{getAdminClient(){calls.clients+=1;return client;}},
    '@/lib/requireAdmin':{requireAdmin:async()=>denied?{ok:false,res:NextResponse.json({error:'Forbidden'},{status:403})}:{ok:true,user:{id:'admin'}}},
    '@/lib/adminAccountGuard':{archivedAccountWriteResponse:async()=>null},
    '@/lib/adminUserDirectory':{invalidateAdminUserDirectory(){}},
  },{GHL_ASSISTANT_WEBHOOK_SECRET:'test-webhook-secret'});
  const invoke=(route,body,secret='test-webhook-secret')=>load(route).POST(new NextRequest('https://hostile.example.invalid/api/provision',{
    method:'POST',headers:{'content-type':'application/json','x-ghl-secret':secret},body:JSON.stringify(body),
  }));
  return {calls,admin:(body={email:user.email,role:'user'})=>invoke('src/app/api/admin/create-user/route.ts',body),
    webhook:(body={email:user.email,tags:['assistant agreement']},secret)=>invoke('src/app/api/ghl/create-assistant/route.ts',body,secret)};
}

test('admin provisioning uses an undisclosed random credential and sends owner setup only after profile and role creation', async () => {
  const env=provisioningFixture();
  const response=await env.admin();
  assert.equal(response.status,200);
  const result=await response.json();
  assert.equal(result.setup_email_sent,true);
  assert.equal(Object.hasOwn(result,'password'),false);
  assert.ok(env.calls.creates[0].password.length>=64);
  assert.equal(env.calls.creates[0].app_metadata.must_reset_password,true);
  assert.ok(env.calls.creates[0].app_metadata.setup_required_at);
  assert.deepEqual(env.calls.writes.map((write)=>write.table),['profiles','user_roles']);
  assert.equal(env.calls.emails.length,1);
  assert.equal(env.calls.emails[0].options.redirectTo,'https://hub.rebootmembers.com/reset-password');
});

test('provisioning denial and database failure do not send setup links; email outage retains created account with a retry warning', async () => {
  const denied=provisioningFixture({denied:true});
  assert.equal((await denied.admin()).status,403);
  assert.equal(denied.calls.clients,0);
  const broken=provisioningFixture({profileError:{message:'unavailable'}});
  assert.equal((await broken.admin()).status,400);
  assert.equal(broken.calls.emails.length,0);
  const mailFailure=provisioningFixture({emailError:{message:'throttled'}});
  const response=await mailFailure.admin();
  assert.equal(response.status,200);
  const body=await response.json();
  assert.equal(body.ok,true);
  assert.equal(body.setup_email_sent,false);
  assert.match(body.warning,/reset|retry/i);
});

test('new assistant webhook accounts get distinct random credentials and setup email', async () => {
  const env=provisioningFixture();
  assert.equal((await env.webhook()).status,201);
  assert.equal(env.calls.creates[0].app_metadata.must_reset_password,true);
  assert.ok(env.calls.creates[0].password.length>=64);
  assert.equal(env.calls.emails.length,1);
});

test('webhook retry preserves an established password and setup state; pending retries can resend email only', async () => {
  for (const pending of [true,false]) {
    const env=provisioningFixture({duplicate:true,existingUser:{...user,app_metadata:{...user.app_metadata,must_reset_password:pending}}});
    assert.equal((await env.webhook()).status,200);
    assert.equal(env.calls.updates.length,1);
    assert.equal(Object.hasOwn(env.calls.updates[0].changes,'password'),false);
    assert.equal(Object.hasOwn(env.calls.updates[0].changes,'app_metadata'),false);
    assert.equal(env.calls.emails.length,pending?1:0);
  }
});

test('unauthorized and unmatched GHL webhooks perform no provisioning or email', async () => {
  const unauthorized=provisioningFixture();
  assert.equal((await unauthorized.webhook(undefined,'invalid-secret')).status,401);
  assert.equal(unauthorized.calls.creates.length,0);
  assert.equal(unauthorized.calls.emails.length,0);
  const ignored=provisioningFixture();
  assert.equal((await ignored.webhook({email:user.email,tags:['not assistant']})).status,202);
  assert.equal(ignored.calls.creates.length,0);
});
