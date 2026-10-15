/** Synthetic LOCAL-ONLY coach fixtures and read-only GHL calendar stub.
 * Run: node tools/coach-preview.mjs --seed --supabase-bin <path-to-supabase>
 * Then: node tools/coach-preview.mjs --serve
 * Generated credentials/config live only in gitignored .env.coach-preview files.
 */
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { DateTime } from 'luxon';

const root = resolve(import.meta.dirname, '..');
const configPath = resolve(root, '.env.coach-preview');
const fixturePath = resolve(root, '.env.coach-preview-fixture.json');
const args = process.argv.slice(2);
const port = 54329;
const base = 910000;
const loopback = (raw) => {
  const url = new URL(raw);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Coach preview refuses any Supabase URL that is not loopback.');
  }
  return url.origin;
};

function localStatus() {
  const index = args.indexOf('--supabase-bin');
  const binary = index >= 0 ? args[index + 1] : 'supabase';
  const command = process.platform === 'win32'
    ? ['powershell.exe', ['-NoProfile', '-Command', `& '${binary.replaceAll("'", "''")}' status -o json`]]
    : [binary, ['status', '-o', 'json']];
  const result = JSON.parse(execFileSync(command[0], command[1], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  loopback(result.API_URL);
  return result;
}

async function seed() {
  const status = localStatus();
  const supabaseUrl = loopback(status.API_URL);
  const headers = { apikey: status.SERVICE_ROLE_KEY, Authorization: `Bearer ${status.SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
  const previous = existsSync(fixturePath) ? JSON.parse(readFileSync(fixturePath, 'utf8')) : null;
  const password = previous?.password || `Local-Coach-${randomBytes(9).toString('base64url')}!`;
  async function request(path, init = {}) {
    const response = await fetch(`${supabaseUrl}${path}`, { ...init, headers: { ...headers, ...init.headers }, redirect: 'error' });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`${path.split('?')[0]}: ${response.status} ${payload?.message || payload?.msg || payload?.error_description || payload?.error || 'request failed'}`);
    return payload;
  }
  async function upsert(table, rows, conflict = 'id') {
    return request(`/rest/v1/${table}?on_conflict=${conflict}`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(rows) });
  }
  const roles = await upsert('roles', [{ code: 'coach' }, { code: 'implementation_coach' }, { code: 'user' }], 'code');
  const roleId = (code) => roles.find((role) => role.code === code).id;
  const users = (await request('/auth/v1/admin/users?per_page=1000')).users;
  const identities = [
    { email: 'implementation.coach@preview.invalid', name: 'Casey Implementation', role: 'implementation_coach', ghl: 'preview-implementation-coach' },
    { email: 'momentum.coach@preview.invalid', name: 'Morgan Momentum', role: 'coach', ghl: 'preview-momentum-coach' },
    ...['Alex Morgan', 'Jamie Reed', 'Sam Taylor', 'Jordan Ellis', 'Robin Lee', 'Taylor Brooks', 'Riley Quinn', 'Drew Avery'].map((name, index) => ({ email: `member${index + 1}@preview.invalid`, name, role: 'user', ghl: `preview-member-${index + 1}` })),
  ];
  for (const identity of identities) {
    const existing = users.find((user) => user.email === identity.email);
    const user = existing ?? await request('/auth/v1/admin/users', { method: 'POST', body: JSON.stringify({ email: identity.email, password, email_confirm: true, user_metadata: { first_name: identity.name.split(' ')[0], last_name: identity.name.split(' ').slice(1).join(' ') } }) });
    identity.id = user.id;
    if (existing) await request(`/auth/v1/admin/users/${identity.id}`, { method: 'PUT', body: JSON.stringify({ password, email_confirm: true }) });
    await upsert('profiles', { id: identity.id, first_name: identity.name.split(' ')[0], last_name: identity.name.split(' ').slice(1).join(' '), ghl_user_id: identity.ghl, ghl_contact_id: identity.role === 'user' ? identity.ghl : null });
    await upsert('user_roles', { user_id: identity.id, role_id: roleId(identity.role) }, 'user_id,role_id');
    if (identity.role === 'implementation_coach') await upsert('user_roles', { user_id: identity.id, role_id: roleId('coach') }, 'user_id,role_id');
  }
  const [implementation, momentum, ...members] = identities;
  await upsert('courses', { id: 2, name: 'Reboot coaching preview' });
  await upsert('coach_profiles', [implementation, momentum].map((coach) => ({ user_id: coach.id, m2_booking_url: `http://127.0.0.1:${port}/preview/booking`, impl_booking_url: `http://127.0.0.1:${port}/preview/booking`, coaching_notes_url: 'http://127.0.0.1:3015/coach/students-overview' })), 'user_id');
  await upsert('user_coaches', members.flatMap((member, index) => [
    { id: base + index * 2, user_id: member.id, coach_id: implementation.id, relationship_type: 'implementation', course_id: 2, is_active: true, assigned_at: DateTime.utc().minus({ days: 90 }).toISO() },
    { id: base + index * 2 + 1, user_id: member.id, coach_id: momentum.id, relationship_type: 'primary', course_id: 2, is_active: true, assigned_at: DateTime.utc().minus({ days: 90 }).toISO() },
  ]));
  const meetingTypes = await upsert('meeting_types', [{ code: 'IMPLEMENTATION_MEETING', name: 'Implementation meeting', counts_toward_engagement: true }, { code: 'M2_MEETING', name: 'Business Review', counts_toward_engagement: true }], 'code');
  const meetingTypeId = (code) => meetingTypes.find((type) => type.code === code).id;
  await upsert('focus_finder_templates', { key: 'focus_finder_v1', name: 'Preview Focus Finder', version: 1, is_active: true }, 'key');
  await upsert('system_scorecard_templates', { key: 'preview_foundation_v1', audience: 'foundation', name: 'Preview foundation systems', version: base, is_active: false }, 'key');
  await upsert('system_scorecard_categories', { id: base, template_key: 'preview_foundation_v1', key: 'preview_growth', label: 'Business growth', position: 1 });
  const systems = ['Follow-up', 'Referrals', 'Listing presentation', 'Lead generation'];
  await upsert('system_scorecard_systems', systems.map((label, index) => ({ id: base + index, template_key: 'preview_foundation_v1', category_id: base, key: `preview_system_${index}`, label, position: index + 1 })));
  const now = DateTime.now().setZone('Europe/Belgrade');
  const week = now.startOf('week');
  const events = [];
  const addEvent = (member, index, kind, start, suffix = '') => {
    const coach = kind === 'implementation' ? implementation : momentum;
    const event = { id: `preview-${kind}-${index}${suffix}`, userId: coach.ghl, calendarId: `preview-${kind}-calendar`, contactId: member.ghl, contact: { id: member.ghl, name: member.name, email: member.email }, title: `${member.name} ${kind === 'implementation' ? 'Implementation Meeting' : 'Business Review'} with ${coach.name}`, startTime: start.toISO(), endTime: start.plus({ minutes: 45 }).toISO(), appointmentStatus: start < now ? 'showed' : 'confirmed', meetingLocation: `http://127.0.0.1:${port}/preview/meeting`, timezone: 'Europe/Belgrade' };
    events.push(event);
    return event;
  };
  for (const [index, member] of members.entries()) {
    const noteId = base + index;
    const reviewDate = now.minus({ days: 30 }).toISODate();
    await upsert('coaching_notes_base', { id: noteId, user_id: member.id, coach_id: momentum.id, created_at: now.minus({ days: 30 }).toISO() });
    await upsert('business_reviews', { id: base + index, user_id: member.id, coach_id: momentum.id, coaching_note_id: noteId, review_date: reviewDate, system_scorecard_template_key: 'preview_foundation_v1', status: 'completed', completed_at: now.minus({ days: 30 }).toISO(), completed_by: momentum.id });
    const priorityIds = [index % 4, (index + 1) % 4];
    for (const [position, systemIndex] of priorityIds.entries()) {
      const actionId = base + index * 3 + position;
      await upsert('coaching_note_action_steps', { id: actionId, coaching_note_id: noteId, label: `Prepare ${systems[systemIndex].toLowerCase()} plan`, status: 'not_started' });
      await upsert('business_review_system_ratings', { business_review_id: base + index, template_key: 'preview_foundation_v1', system_id: base + systemIndex, status: 'started' }, 'business_review_id,system_id');
      await upsert('business_review_system_priorities', { business_review_id: base + index, system_id: base + systemIndex, position: position + 1, action_step_id: actionId, starting_status: 'started' }, 'business_review_id,system_id');
    }
    // Keep 3 members without future implementation bookings for the follow-up queue.
    if (index < 5) {
      for (let weekOffset = 0; weekOffset < 2; weekOffset += 1) {
        const start = week.plus({ weeks: weekOffset, days: index, hours: index === 4 ? 18 : 10 + index });
        const event = addEvent(member, index, 'implementation', start, `-week${weekOffset}`);
        const meetingId = base + 100 + index + weekOffset * 20;
        await upsert('meetings', { id: meetingId, meeting_type_id: meetingTypeId('IMPLEMENTATION_MEETING'), date: start.toISODate(), title: event.title, starts_at: event.startTime, ends_at: event.endTime, ghl_appointment_id: event.id, ghl_calendar_id: event.calendarId, ghl_status: event.appointmentStatus, meeting_timezone: 'Europe/Belgrade' });
        await upsert('meeting_attendance_base', { user_id: member.id, meeting_id: meetingId, attended: start < now }, 'user_id,meeting_id');
      }
    }
    if (index < 4) {
      const start = week.plus({ days: index + 1, hours: 17 });
      const event = addEvent(member, index, 'business_review', start);
      const meetingId = base + 200 + index;
      const futureNoteId = base + 100 + index;
      await upsert('meetings', { id: meetingId, meeting_type_id: meetingTypeId('M2_MEETING'), date: start.toISODate(), title: event.title, starts_at: event.startTime, ends_at: event.endTime, ghl_appointment_id: event.id, ghl_calendar_id: event.calendarId, ghl_status: event.appointmentStatus, meeting_timezone: 'Europe/Belgrade' });
      await upsert('meeting_attendance_base', { user_id: member.id, meeting_id: meetingId, attended: start < now }, 'user_id,meeting_id');
      await upsert('coaching_notes_base', { id: futureNoteId, user_id: member.id, coach_id: momentum.id, m2_meeting_id: meetingId });
      await upsert('business_reviews', { id: base + 100 + index, user_id: member.id, coach_id: momentum.id, coaching_note_id: futureNoteId, meeting_id: meetingId, review_date: start.toISODate(), system_scorecard_template_key: 'preview_foundation_v1' });
      // A review earlier this week is already the active cycle; give it priorities too.
      for (const [position, systemIndex] of priorityIds.entries()) {
        const actionId = base + 100 + index * 3 + position;
        await upsert('coaching_note_action_steps', { id: actionId, coaching_note_id: futureNoteId, label: `Build the ${systems[systemIndex].toLowerCase()} habit`, status: 'not_started' });
        await upsert('business_review_system_ratings', { business_review_id: base + 100 + index, template_key: 'preview_foundation_v1', system_id: base + systemIndex, status: 'started' }, 'business_review_id,system_id');
        await upsert('business_review_system_priorities', { business_review_id: base + 100 + index, system_id: base + systemIndex, position: position + 1, action_step_id: actionId, starting_status: 'started' }, 'business_review_id,system_id');
      }
      if (index % 2 === 0) await upsert('business_review_preparation_responses', { business_review_id: base + 100 + index, business_forward_wins: 'Built a consistent follow-up routine.', personal_forward_wins: 'Protected family time every weekend.', greatest_business_challenge: 'Creating a reliable referral habit.', greatest_personal_challenge: 'Keeping energy steady during busy weeks.', desired_call_outcome: 'Agree two clear priorities for the next cycle.', topics_to_discuss: 'Follow-up and referrals.', business_rating: 8, personal_rating: 6 }, 'business_review_id');
    }
    if (index !== 6) {
      addEvent(member, index, 'implementation', now.minus({ days: 14 + index }).set({ hour: 11 }), '-history');
      addEvent(member, index, 'business_review', now.minus({ days: 40 + index }).set({ hour: 12 }), '-history');
    }
  }
  // The public published group calendar remains visible through the normal read-only integration.
  const fixture = { createdAt: now.toISO(), password, users: identities, events };
  writeFileSync(fixturePath, JSON.stringify(fixture, null, 2));
  writeFileSync(configPath, [
    '# Generated local-only synthetic preview. Gitignored. Never use against a hosted project.',
    `NEXT_PUBLIC_SUPABASE_URL=${supabaseUrl}`, `NEXT_PUBLIC_SUPABASE_ANON_KEY=${status.ANON_KEY}`, `SUPABASE_SERVICE_ROLE_KEY=${status.SERVICE_ROLE_KEY}`,
    `GHL_API_BASE=http://127.0.0.1:${port}`, 'GHL_PRIVATE_TOKEN=local-preview-only', 'GHL_VERSION=2021-07-28', 'GHL_LOCATION_ID=preview-location',
    `COACH_PREVIEW_PASSWORD=${password}`, '',
  ].join('\n'));
  console.log(`Local coach fixtures ready. Implementation: ${implementation.email}; Momentum: ${momentum.email}. Password is in .env.coach-preview. Calendar stub: http://127.0.0.1:${port}.`);
}

function serve() {
  if (!existsSync(fixturePath)) throw new Error('Seed the local preview fixtures before starting the calendar stub.');
  const server = createServer((request, response) => {
    if (request.method !== 'GET') { response.writeHead(405); response.end('Read-only preview'); return; }
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (url.pathname === '/health') { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ ok: true, synthetic: true })); return; }
    if (url.pathname.startsWith('/preview/')) { response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); response.end('<!doctype html><title>Local coaching preview</title><main style="font:18px system-ui;max-width:600px;margin:80px auto"><h1>Local coaching preview</h1><p>This is a synthetic meeting or booking link for testing. No real call or booking is created.</p><a href="http://127.0.0.1:3015/coach">Back to coach home</a></main>'); return; }
    const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
    let payload;
    if (url.pathname.startsWith('/calendars/events/appointments/')) {
      const event = fixture.events.find((item) => item.id === decodeURIComponent(url.pathname.split('/').at(-1)));
      if (!event) { response.writeHead(404); response.end('Unknown preview appointment'); return; }
      payload = { event };
    } else if (url.pathname === '/calendars/events') {
      const from = Number(url.searchParams.get('startTime')) || 0;
      const to = Number(url.searchParams.get('endTime')) || Infinity;
      const userId = url.searchParams.get('userId');
      payload = { events: fixture.events.filter((event) => (!userId || event.userId === userId) && Date.parse(event.startTime) >= from && Date.parse(event.startTime) < to) };
    } else if (url.pathname.startsWith('/contacts/')) {
      const user = fixture.users.find((item) => item.ghl === url.pathname.split('/')[2]);
      payload = { contact: user ? { id: user.ghl, locationId: 'preview-location', name: user.name, email: user.email } : null };
    } else if (url.pathname === '/calendars/' || url.pathname === '/calendars') {
      payload = { calendars: ['implementation', 'business_review'].map((kind) => ({ id: `preview-${kind}-calendar`, name: `Preview ${kind}` })) };
    } else { response.writeHead(404); response.end('Unknown local preview endpoint'); return; }
    response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(payload));
  });
  server.listen(port, '127.0.0.1', () => console.log(`Synthetic GHL calendar listening at http://127.0.0.1:${port}`));
}

if (args.includes('--seed')) await seed();
if (args.includes('--serve')) serve();
if (!args.includes('--seed') && !args.includes('--serve')) console.log('Use --seed (local Supabase only) or --serve (read-only synthetic GHL).');
