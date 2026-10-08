import assert from 'node:assert/strict';
import test from 'node:test';
import { renderComponent } from './helpers/componentHarness.mjs';

async function setup({query='',hash='',exchangeError=null,saveStatus=200,saveBody={ok:true},pending=true,userUpdateError=null}={}) {
  const calls={exchanges:[],sessions:[],cleaned:[],saves:[],redirects:[],signouts:[],checks:[],selfUpdates:[]};
  const auth={
    async exchangeCodeForSession(code){calls.exchanges.push(code);return {error:exchangeError};},
    async setSession(tokens){calls.sessions.push(JSON.parse(JSON.stringify(tokens)));return {error:exchangeError};},
    async getUser(){return {data:{user:{email:'owner@example.invalid',app_metadata:{must_reset_password:pending}}},error:null};},
    async getSession(){return {data:{session:{access_token:'verified-token'}}};},
    async signOut(options){calls.signouts.push(options.scope);return {error:null};},
    async updateUser(changes){calls.selfUpdates.push(JSON.parse(JSON.stringify(changes)));return {error:userUpdateError};},
  };
  const search=new URLSearchParams(query);
  const ui=renderComponent('src/app/reset-password/ResetPasswordClient.tsx',{}, {
    'next/navigation':{useRouter:()=>({replace:(url)=>calls.redirects.push(url)}),useSearchParams:()=>search},
    '@supabase/ssr':{createBrowserClient:()=>({auth})},
    '@/lib/accountLifecycleClient':{async assertAccountSessionAllowed(_client,options){calls.checks.push(options);}},
  },{
    process:{env:{}},URLSearchParams,
    window:{location:{hash,pathname:'/reset-password'},history:{replaceState(_state,_title,url){calls.cleaned.push(url);}}},
    fetch:async (url,options)=>{calls.saves.push({url,options:{...options,body:JSON.parse(options.body)}});
      return {ok:saveStatus>=200&&saveStatus<300,json:async()=>saveBody};},
  });
  await ui.flush();
  return {ui,calls,setPending(value){pending=value;}};
}

async function enterAndSubmit(ui) {
  for (const label of ['New password','Confirm new password']) {
    await ui.act(()=>ui.all((node)=>node.props.label===label)[0].props.onChange({target:{value:'ChosenPassword123!'}}));
  }
  await ui.act(()=>ui.all((node)=>node.type==='form')[0].props.onSubmit({preventDefault(){}}));
}

test('implicit recovery consumes fragment tokens once and strips credentials without placing them in a query', async (t) => {
  const env=await setup({hash:'#access_token=fragment-access&refresh_token=fragment-refresh&type=recovery'});
  t.after(()=>env.ui.unmount());
  assert.deepEqual(env.calls.sessions,[{access_token:'fragment-access',refresh_token:'fragment-refresh'}]);
  assert.deepEqual(env.calls.cleaned,['/reset-password']);
  assert.equal(env.calls.checks[0].allowPendingSetup,true);
  await env.ui.updateProps({});
  assert.equal(env.calls.sessions.length,1);
});

test('PKCE recovery exchanges its code before revealing the password form', async (t) => {
  const env=await setup({query:'code=recovery-code'});t.after(()=>env.ui.unmount());
  assert.deepEqual(env.calls.exchanges,['recovery-code']);
  assert.equal(env.ui.all((node)=>node.type==='form').length,1);
});

test('expired or invalid recovery shows a new-link route and never allows password submission', async (t) => {
  for (const options of [{hash:'#error_description=Expired'},{query:'code=expired',exchangeError:{message:'expired'}}]) {
    const env=await setup(options);t.after(()=>env.ui.unmount());
    assert.match(env.ui.text(),/invalid or expired/);
    assert.equal(env.ui.all((node)=>node.type==='form').length,0);
    assert.equal(env.calls.saves.length,0);
  }
});

test('reset submits password and verified bearer together, then returns to login only on success', async (t) => {
  const env=await setup();t.after(()=>env.ui.unmount());
  await enterAndSubmit(env.ui);
  assert.equal(env.calls.saves.length,1);
  assert.equal(env.calls.saves[0].url,'/api/auth/clear-first-login-flag');
  assert.equal(env.calls.saves[0].options.headers.Authorization,'Bearer verified-token');
  assert.deepEqual(env.calls.saves[0].options.body,{password:'ChosenPassword123!'});
  assert.deepEqual(env.calls.signouts,['local']);
  assert.deepEqual(env.calls.redirects,['/login?passwordUpdated=1']);
  assert.equal(env.calls.selfUpdates.length,0);
});

test('established users use the normal Auth password-change flow without the privileged setup endpoint', async (t) => {
  const env=await setup({pending:false});t.after(()=>env.ui.unmount());
  await enterAndSubmit(env.ui);
  assert.deepEqual(env.calls.selfUpdates,[{password:'ChosenPassword123!'}]);
  assert.equal(env.calls.saves.length,0);
  assert.deepEqual(env.calls.redirects,['/login?passwordUpdated=1']);
});

test('GoTrue MFA or reauthentication failures remain enforced for established users', async (t) => {
  for (const message of ['AAL2 session is required','Reauthentication nonce is required']) {
    const env=await setup({pending:false,userUpdateError:{message}});t.after(()=>env.ui.unmount());
    await enterAndSubmit(env.ui);
    assert.ok(env.ui.text().includes(message));
    assert.equal(env.calls.saves.length,0);
    assert.equal(env.calls.redirects.length,0);
    assert.equal(env.calls.signouts.length,0);
  }
});

test('reset chooses its operation using live Auth setup state at submission', async (t) => {
  const env=await setup({pending:false});t.after(()=>env.ui.unmount());
  env.setPending(true);
  await enterAndSubmit(env.ui);
  assert.equal(env.calls.saves.length,1);
  assert.equal(env.calls.selfUpdates.length,0);
});

test('failed verified reset retains the form and shows server rejection without signing out', async (t) => {
  const env=await setup({saveStatus:403,saveBody:{error:'Open a fresh setup link'}});t.after(()=>env.ui.unmount());
  await enterAndSubmit(env.ui);
  assert.match(env.ui.text(),/Open a fresh setup link/);
  assert.equal(env.calls.redirects.length,0);
  assert.equal(env.calls.signouts.length,0);
  assert.equal(env.ui.all((node)=>node.props.label==='New password')[0].props.value,'ChosenPassword123!');
});
