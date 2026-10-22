import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Square, Pause, Play, Upload } from 'lucide-react';
import { processRecording } from '../services/ai';
import { hapticLight, hapticMedium, hapticHeavy, hapticSuccess, hapticError } from '../services/haptics';
import { useI18n } from '../i18n/I18nProvider';

function getSupportedMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/ogg'];
  for (const type of types) if (MediaRecorder.isTypeSupported(type)) return type;
  return '';
}

export function RecordPage() {
  const navigate = useNavigate();
  const { t, locale } = useI18n();
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [processing, setProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(()=>{if(isRecording&&!isPaused)timerRef.current=window.setInterval(()=>setSeconds((s)=>s+1),1000);else if(timerRef.current)clearInterval(timerRef.current);return()=>{if(timerRef.current)clearInterval(timerRef.current);};},[isRecording,isPaused]);
  useEffect(()=>()=>{streamRef.current?.getTracks().forEach((track)=>track.stop());},[]);

  const formatTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const processAudio = async (audio: Blob, title: string) => {
    setProcessing(true);
    setStatusText(t.record.processing);
    try {
      const result = await processRecording(audio, title, locale);
      await hapticSuccess();
      setStatusText(t.record.done);
      navigate('/meeting/' + result.meeting.id);
    } catch (err) {
      const code = err instanceof Error ? err.message : 'PROCESS_FAILED';
      const localized: Record<string, string> = {
        AUDIO_TOO_LARGE: t.record.audioTooLarge,
        UNSUPPORTED_AUDIO_TYPE: t.record.unsupportedAudioType,
        UPLOAD_FAILED: t.record.uploadFailed,
        SAVE_FAILED: t.record.saveFailed,
        PROCESS_FAILED: t.record.processFailed,
        MEETING_QUOTA_EXCEEDED: t.record.quotaExceeded,
        AI_INSUFFICIENT_BALANCE: t.record.insufficientBalance,
        AI_CONFIGURATION_ERROR: t.record.aiConfiguration,
        AUTH_REQUIRED: t.record.authRequired,
      };
      setStatusText(localized[code] || t.record.error);
      await hapticError();
    } finally {
      setProcessing(false);
      setSeconds(0);
    }
  };

  const startRecording = async () => {
    setStatusText('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setStatusText(t.record.micDenied);
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      streamRef.current = stream;
      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(true);
      setIsPaused(false);
      setSeconds(0);
      await hapticLight();
    } catch (err) {
      console.error('Microphone access failed:', err);
      // If MediaRecorder construction/start or haptic setup fails after permission is granted,
      // release the device immediately instead of leaving the microphone active in the background.
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // Stopping tracks below still releases the microphone if MediaRecorder.stop() throws.
      }
      mediaRecorderRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setIsRecording(false);
      setIsPaused(false);
      setStatusText(t.record.micDenied);
      await hapticError();
    }
  };

  const togglePause = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (isPaused) { recorder.resume(); setIsPaused(false); }
    else { recorder.pause(); setIsPaused(true); }
    await hapticMedium();
  };

  const stopRecording = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    await hapticHeavy();
    return new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setIsRecording(false);
        setIsPaused(false);
        await processAudio(blob, t.meetings.newMeeting);
        resolve();
      };
      recorder.stop();
    });
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setStatusText('');
    const title = file.name.replace(/\.[^.]+$/, '').trim() || t.meetings.newMeeting;
    await processAudio(file, title);
  };

  return (
    <div className="record-screen">
      <h1 style={{ fontSize: '1.5rem', color: 'var(--forest)', marginBottom: 8 }}>{t.record.title}</h1>
      <p role={statusText ? 'status' : undefined} style={{ color: statusText && !processing ? 'var(--danger)' : 'var(--muted)', marginBottom: 24, maxWidth: 320 }}>
        {statusText || t.record.hint}
      </p>
      <div style={{ fontSize: '2.8rem', fontFamily: 'Fraunces, serif', fontWeight: 600, marginBottom: 32 }}>{formatTime(seconds)}</div>
      {processing ? (
        <div aria-label={t.record.processing} style={{ width: 96, height: 96, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--forest)', animation: 'spin 1s linear infinite' }} />
      ) : !isRecording ? (
        <button className="record-btn" onClick={startRecording} aria-label={t.record.startAria}><Mic size={40} /></button>
      ) : (
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <button className="btn btn-secondary" style={{ width: 56, height: 56, borderRadius: '50%', padding: 0 }} onClick={togglePause} aria-label={isPaused ? t.record.recording : t.record.pause}>{isPaused ? <Play size={24} /> : <Pause size={24} />}</button>
          <button className="record-btn recording" onClick={stopRecording} aria-label={t.record.stopAria}><Square size={32} fill="white" /></button>
        </div>
      )}
      {!processing && !isRecording && (
        <>
          <input ref={fileInputRef} type="file" accept="audio/*,.m4a,.mp3,.wav,.webm,.ogg,.aac" onChange={handleFileSelected} style={{ display: 'none' }} />
          <button className="btn btn-secondary" style={{ marginTop: 20 }} onClick={() => fileInputRef.current?.click()}><Upload size={18} style={{ marginRight: 8 }} />{t.record.uploadAudio}</button>
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
