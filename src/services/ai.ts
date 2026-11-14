import { supabase } from '../lib/supabase';
import { mapMeeting } from '../lib/mapMeeting';
import type { Meeting } from '../types';
export type ProcessResult = { meeting: Meeting };
const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string,string> = {'audio/webm':'webm','audio/mp4':'m4a','audio/aac':'aac','audio/ogg':'ogg','audio/wav':'wav','audio/x-wav':'wav','audio/mpeg':'mp3'};
export async function processRecording(audioBlob: Blob,title='New meeting',language='az'): Promise<ProcessResult> {
  if (!audioBlob.size) throw new Error('UNSUPPORTED_AUDIO_TYPE');
  if(audioBlob.size>MAX_AUDIO_BYTES)throw new Error('AUDIO_TOO_LARGE');
  const {data:{user},error:userError}=await supabase.auth.getUser();if(userError||!user)throw new Error('AUTH_REQUIRED');
  let mimeType=audioBlob.type.split(';')[0].trim().toLowerCase();
  if (mimeType === 'audio/x-m4a' || mimeType === 'audio/m4a') mimeType = 'audio/mp4';
  // iOS file providers may omit MIME metadata. Only infer from a known file extension.
  if ((!mimeType || mimeType === 'application/octet-stream') && audioBlob instanceof File) {
    const suffix = audioBlob.name.split('.').pop()?.toLowerCase();
    mimeType = Object.entries(MIME_EXTENSIONS).find(([, ext]) => ext === suffix)?.[0] || '';
  }
  const extension=MIME_EXTENSIONS[mimeType];if(!extension)throw new Error('UNSUPPORTED_AUDIO_TYPE');
  const audioPath=`${user.id}/${crypto.randomUUID()}.${extension}`;const {error:uploadError}=await supabase.storage.from('recordings').upload(audioPath,audioBlob.slice(0,audioBlob.size,mimeType),{contentType:mimeType,upsert:false});if(uploadError)throw new Error('UPLOAD_FAILED');
  const {data:meetingRow,error:insertError}=await supabase.from('meetings').insert({user_id:user.id,title,status:'processing',audio_path:audioPath}).select().single();if(insertError)throw new Error('SAVE_FAILED');
  const {data,error}=await supabase.functions.invoke('process-meeting',{body:{meetingId:meetingRow.id,audioPath,language}});
  if(error||data?.error){
    // supabase-js returns data:null for non-2xx responses. Read the response body
    // without leaking provider text to the UI or consuming the original response.
    let failure = data;
    if (error?.context instanceof Response) {
      failure = await error.context.clone().json().catch(() => null);
    }
    const providerMessage = typeof failure?.error === 'string' ? failure.error : '';
    // A concurrent winner owns the status; a replay must not mark it failed.
    if (providerMessage === 'MEETING_ALREADY_CLAIMED') throw new Error('MEETING_ALREADY_CLAIMED');
    await supabase.from('meetings').update({status:'failed'}).eq('id',meetingRow.id).eq('user_id',user.id);
    if (/monthly meeting quota exceeded/i.test(providerMessage)) throw new Error('MEETING_QUOTA_EXCEEDED');
    if (/insufficient_quota|billing|credit balance|insufficient balance/i.test(providerMessage)) throw new Error('AI_INSUFFICIENT_BALANCE');
    if (/openai_api_key is not configured|invalid_api_key|supabase configuration is missing|OPENAI_ACCESS_DENIED|OPENAI_MODEL_UNAVAILABLE/i.test(providerMessage)) throw new Error('AI_CONFIGURATION_ERROR');
    if (providerMessage === 'OPENAI_RATE_LIMITED') throw new Error('AI_RATE_LIMITED');
    throw new Error('PROCESS_FAILED');
  }
  return {meeting:mapMeeting(data?.meeting??meetingRow,data?.tasks??[])};
}
