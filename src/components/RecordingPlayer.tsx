import { useEffect, useRef, useState } from 'react';
import { getRecordingUrl } from '../services/meetings';
import { useI18n } from '../i18n/I18nProvider';
import { meetingTools } from '../i18n/meetingTools';

export function RecordingPlayer({ meetingId }: { meetingId: string }) {
  const { locale } = useI18n();
  const t = meetingTools[locale];
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const generation = useRef(0);
  useEffect(() => { generation.current++; setUrl(''); setFailed(false); setLoading(false); return () => { generation.current++; }; }, [meetingId]);
  const load = async () => {
    const request = ++generation.current;
    setLoading(true); setFailed(false); setUrl('');
    try { const signedUrl = await getRecordingUrl(meetingId); if (request === generation.current) setUrl(signedUrl); }
    catch { if (request === generation.current) setFailed(true); }
    finally { if (request === generation.current) setLoading(false); }
  };
  return <section aria-label={t.audio}>
    <h2>{t.audio}</h2>
    <button className="btn btn-secondary" disabled={loading} onClick={load}>{t.loadAudio}</button>
    {failed && <p role="alert">{t.audioError}</p>}
    {url && <audio key={url} aria-label={t.audio} controls preload="none" src={url} style={{ display: 'block', width: '100%', marginTop: 12 }} onError={() => { setUrl(''); setFailed(true); }} />}
  </section>;
}
