import { supabase } from '../lib/supabase';
import { mapMeeting } from '../lib/mapMeeting';
import type { Meeting } from '../types';
export type ProcessResult = { meeting: Meeting };
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string,string> = {'audio/webm':'webm','audio/mp4':'m4a','audio/aac':'aac','audio/ogg':'ogg','audio/wav':'wav','audio/x-wav':'wav','audio/mpeg':'mp3'};
export async function processRecording(audioBlob: Blob,title='New meeting',language='az'): Promise<ProcessResult> {
  if(audioBlob.size>MAX_AUDIO_BYTES)throw new Error('AUDIO_TOO_LARGE');
  const {data:{user},error:userError}=await supabase.auth.getUser();if(userError||!user)throw new Error('AUTH_REQUIRED');
  const mimeType=(audioBlob.type||'audio/webm').split(';')[0].toLowerCase();const extension=MIME_EXTENSIONS[mimeType];if(!extension)throw new Error('UNSUPPORTED_AUDIO_TYPE');
  const audioPath=`${user.id}/${Date.now()}.${extension}`;const {error:uploadError}=await supabase.storage.from('recordings').upload(audioPath,audioBlob,{contentType:mimeType,upsert:false});if(uploadError)throw new Error('UPLOAD_FAILED');
  const {data:meetingRow,error:insertError}=await supabase.from('meetings').insert({user_id:user.id,title,status:'processing',audio_path:audioPath}).select().single();if(insertError)throw new Error('SAVE_FAILED');
  const {data,error}=await supabase.functions.invoke('process-meeting',{body:{meetingId:meetingRow.id,audioPath,language}});
  if(error||data?.error){await supabase.from('meetings').update({status:'failed'}).eq('id',meetingRow.id);throw new Error('PROCESS_FAILED');}
  return {meeting:mapMeeting(data?.meeting??meetingRow,data?.tasks??[])};
}
