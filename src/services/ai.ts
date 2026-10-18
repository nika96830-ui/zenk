import { supabase } from '../lib/supabase';
import { mapMeeting } from '../lib/mapMeeting';
import type { Meeting } from '../types';

export type ProcessResult = { meeting: Meeting };

export async function processRecording(
  audioBlob: Blob,
  title = 'New meeting',
  language = 'az'
): Promise<ProcessResult> {
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error('AUTH_REQUIRED');

  const audioPath = `${user.id}/${Date.now()}.webm`;
  const { error: uploadError } = await supabase.storage
    .from('recordings')
    .upload(audioPath, audioBlob, { contentType: audioBlob.type || 'audio/webm', upsert: false });
  if (uploadError) throw new Error('UPLOAD_FAILED');

  const { data: meetingRow, error: insertError } = await supabase
    .from('meetings')
    .insert({ user_id: user.id, title, status: 'processing', audio_path: audioPath })
    .select()
    .single();
  if (insertError) throw new Error('SAVE_FAILED');

  const { data, error } = await supabase.functions.invoke('process-meeting', {
    body: { meetingId: meetingRow.id, audioPath, language },
  });

  if (error || data?.error) {
    await supabase.from('meetings').update({ status: 'failed' }).eq('id', meetingRow.id);
    throw new Error('PROCESS_FAILED');
  }

  return { meeting: mapMeeting(data?.meeting ?? meetingRow, data?.tasks || []) };
}
