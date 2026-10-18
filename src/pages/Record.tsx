import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mic, Square, Pause, Play } from 'lucide-react';
import { processRecording } from '../services/ai';
import { hapticLight, hapticMedium, hapticHeavy, hapticSuccess, hapticError } from '../services/haptics';
import { useI18n } from '../i18n/I18nProvider';

// Функция определения поддерживаемого формата аудио (с поддержкой iOS Safari)
function getSupportedMimeType(): string {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/aac',
    'audio/ogg',
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
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

  // Очистка таймера и микрофона при размонтировании
  useEffect(() => {
    if (isRecording && !isPaused) {
      timerRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      // Гасим активный микрофон при уходе со страницы
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, [isRecording, isPaused]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m.toString().padStart(2, '0') + ':' + sec.toString().padStart(2, '0');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(true);
      setIsPaused(false);
      setSeconds(0);
      await hapticLight();
    } catch (err) {
      console.error('Ошибка доступа к микрофону:', err);
      await hapticError();
    }
  };

  const togglePause = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (isPaused) {
      recorder.resume();
      setIsPaused(false);
    } else {
      recorder.pause();
      setIsPaused(true);
    }
    await hapticMedium();
  };

  const stopRecording = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    await hapticHeavy();

    return new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((tr) => tr.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        
        setIsRecording(false);
        setIsPaused(false);
        setProcessing(true);
        setStatusText(t.record.processing);

        try {
          const result = await processRecording(blob, t.meetings.newMeeting, locale);
          await hapticSuccess();
          setStatusText(t.record.done);
          navigate('/meeting/' + result.meeting.id);
        } catch (err) {
          console.error('Ошибка AI-обработки:', err);
          setStatusText(t.record.error);
          await hapticError();
        } finally {
          setProcessing(false);
          setSeconds(0);
          resolve();
        }
      };
      recorder.stop();
    });
  };

  return (
    <div className="record-screen">
      <h1 style={{ fontSize: '1.5rem', color: 'var(--forest)', marginBottom: 8 }}>{t.record.title}</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 40, maxWidth: 280 }}>
        {processing ? statusText : t.record.hint}
      </p>
      
      <div style={{ fontSize: '2.8rem', fontFamily: 'Fraunces, serif', fontWeight: 600, marginBottom: 40 }}>
        {formatTime(seconds)}
      </div>

      {processing ? (
        <div style={{
          width: 96,
          height: 96,
          borderRadius: '50%',
          border: '3px solid var(--border)',
          borderTopColor: 'var(--forest)',
          animation: 'spin 1s linear infinite'
        }} />
      ) : !isRecording ? (
        <button className="record-btn" onClick={startRecording} aria-label={t.record.startAria}>
          <Mic size={40} />
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <button
            className="btn btn-secondary"
            style={{ width: 56, height: 56, borderRadius: '50%', padding: 0 }}
            onClick={togglePause}
          >
            {isPaused ? <Play size={24} /> : <Pause size={24} />}
          </button>
          <button className="record-btn recording" onClick={stopRecording} aria-label={t.record.stopAria}>
            <Square size={32} fill="white" />
          </button>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
