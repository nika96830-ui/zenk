import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(url && anonKey && serviceRoleKey, 'local Supabase URL and keys must be supplied by the ephemeral stack');

assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname), 'test must target an ephemeral local stack');

const authOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(url, serviceRoleKey, authOptions);
const password = 'ZangLocalE2E!2026';
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const createdUserIds = [];
const createdAudioPaths = [];

async function createTestUser(label) {
  const email = `zang-${label}-${suffix}@example.test`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `ZANG Local Test ${label}` },
  });
  assert.equal(error, null, `admin create user ${label}: ${error?.message || ''}`);
  assert.ok(data.user?.id, `user ${label} must be created`);
  createdUserIds.push(data.user.id);
  return { ...data.user, email };
}

try {
  const userA = await createTestUser('A');
  const userB = await createTestUser('B');
  const clientA = createClient(url, anonKey, authOptions);
  const clientB = createClient(url, anonKey, authOptions);

  for (const [client, user] of [[clientA, userA], [clientB, userB]]) {
    const { data, error } = await client.auth.signInWithPassword({ email: user.email, password });
    assert.equal(error, null, `password sign-in ${user.email}: ${error?.message || ''}`);
    assert.equal(data.user?.id, user.id, 'signed-in user id must match created account');
  }
  console.log('PASS local Supabase Auth: two isolated temporary users sign in');

  const { data: profileA, error: profileError } = await clientA
    .from('profiles').select('id, plan').eq('id', userA.id).single();
  assert.equal(profileError, null, `signup profile trigger: ${profileError?.message || ''}`);
  assert.equal(profileA.plan, 'free', 'new profile must start on free plan');

  const { data: meetingA, error: meetingAError } = await clientA
    .from('meetings').insert({ user_id: userA.id, title: 'Synthetic meeting A', status: 'ready' }).select('*').single();
  assert.equal(meetingAError, null, 'user A meeting insert: ' + (meetingAError?.message || ''));
  const { data: meetingB, error: meetingBError } = await clientB
    .from('meetings').insert({ user_id: userB.id, title: 'Synthetic meeting B', status: 'ready' }).select('*').single();
  assert.equal(meetingBError, null, 'user B meeting insert: ' + (meetingBError?.message || ''));

  const { data: taskA, error: taskAError } = await clientA
    .from('tasks').insert({ meeting_id: meetingA.id, user_id: userA.id, title: 'A private task' }).select('*').single();
  assert.equal(taskAError, null, 'user A task insert: ' + (taskAError?.message || ''));

  const hiddenMeeting = await clientB.from('meetings').select('id').eq('id', meetingA.id);
  assert.equal(hiddenMeeting.error, null, 'RLS should hide rather than expose another owner meeting');
  assert.deepEqual(hiddenMeeting.data, [], 'user B must not see user A meeting');

  const hiddenTask = await clientB.from('tasks').select('id').eq('id', taskA.id);
  assert.equal(hiddenTask.error, null, 'RLS should hide rather than expose another owner task');
  assert.deepEqual(hiddenTask.data, [], 'user B must not see user A task');

  const crossOwnerInsert = await clientB.from('tasks').insert({
    meeting_id: meetingA.id, user_id: userB.id, title: 'Cross-owner attempt',
  });
  assert.ok(crossOwnerInsert.error, 'cross-owner task insert must be rejected');

  const crossOwnerUpdate = await clientB.from('tasks').update({ completed: true }).eq('id', taskA.id).select('id');
  assert.equal(crossOwnerUpdate.error, null, 'RLS should silently filter unauthorized task update');
  assert.deepEqual(crossOwnerUpdate.data, [], 'user B must not update user A task');

  const validUpdate = await clientA.from('tasks').update({ completed: true }).eq('id', taskA.id).select('id').single();
  assert.equal(validUpdate.error, null, 'owner task update: ' + (validUpdate.error?.message || ''));
  assert.equal(validUpdate.data.id, taskA.id);

  assert.equal((await clientA.auth.signOut()).error, null);
  assert.equal((await clientA.auth.signInWithPassword({ email: userA.email, password })).error, null);
  const persistedMeeting = await clientA.from('meetings').select('title').eq('id', meetingA.id).single();
  assert.equal(persistedMeeting.error, null);
  assert.equal(persistedMeeting.data.title, 'Synthetic meeting A');
  const persistedTask = await clientA.from('tasks').select('completed').eq('id', taskA.id).single();
  assert.equal(persistedTask.error, null);
  assert.equal(persistedTask.data.completed, true);
  console.log('PASS local Supabase persistence: meeting and task update survive sign-out and sign-in');

  const planEscalation = await clientA.from('profiles').update({ plan: 'pro' }).eq('id', userA.id).select('plan').single();
  assert.ok(planEscalation.error, 'authenticated user must not elevate their own plan');
  console.log('PASS local Supabase RLS: meeting/task reads and writes are owner-scoped; plan escalation blocked');

  const audioPath = `${userA.id}/qa.m4a`;
  const uploaded = await clientA.storage.from('recordings').upload(audioPath, new Blob(['synthetic fixture'], { type: 'audio/mp4' }), { contentType: 'audio/mp4' });
  assert.equal(uploaded.error, null, 'owner may upload M4A');
  createdAudioPaths.push(audioPath);
  assert.equal((await clientA.storage.from('recordings').download(audioPath)).error, null, 'owner may read recording');
  assert.ok((await clientB.storage.from('recordings').download(audioPath)).error, 'other user may not read recording');
  assert.ok((await clientB.storage.from('recordings').upload(`${userA.id}/forged.m4a`, new Blob(['synthetic']), { contentType: 'audio/mp4' })).error, 'other user may not upload into owner folder');
  const publicUrl = clientA.storage.from('recordings').getPublicUrl(audioPath).data.publicUrl;
  assert.equal((await fetch(publicUrl)).ok, false, 'private recording must not be publicly downloadable');
  console.log('PASS local Storage: owner M4A upload/download, cross-user and public access denied');

  const period = new Date();
  period.setUTCDate(1);
  period.setUTCHours(0, 0, 0, 0);
  const periodStart = period.toISOString().slice(0, 10);
  const firstReservation = await admin.rpc('reserve_meeting_usage', {
    p_user_id: userA.id, p_meeting_id: meetingA.id, p_period_start: periodStart, p_quota: 1,
  });
  assert.equal(firstReservation.error, null, 'service-role usage reservation: ' + (firstReservation.error?.message || ''));
  assert.equal(firstReservation.data, true, 'first usage reservation must succeed');

  const secondReservation = await admin.rpc('reserve_meeting_usage', {
    p_user_id: userA.id,
    p_meeting_id: '55555555-5555-4555-8555-555555555555',
    p_period_start: periodStart,
    p_quota: 1,
  });
  assert.equal(secondReservation.error, null, 'quota check: ' + (secondReservation.error?.message || ''));
  assert.equal(secondReservation.data, false, 'quota must reject the second distinct meeting at limit 1');

  const clientReservation = await clientA.rpc('reserve_meeting_usage', {
    p_user_id: userA.id, p_meeting_id: meetingA.id, p_period_start: periodStart, p_quota: 1,
  });
  assert.ok(clientReservation.error, 'authenticated clients must not call service-only usage reservation');
  console.log('PASS local Supabase quota RPC: service role allowed; client role denied; quota enforced');
} finally {
  if (createdAudioPaths.length) {
    const { error } = await admin.storage.from('recordings').remove(createdAudioPaths);
    assert.equal(error, null, 'remove synthetic audio fixtures');
  }
  await Promise.all(createdUserIds.map(async (id) => {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error(`cleanup temporary user ${id}: ${error.message}`);
  }));
}
