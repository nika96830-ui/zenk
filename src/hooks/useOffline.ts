import { useState, useEffect } from 'react';
import type { Meeting } from '../types';
import { useAuth } from './useAuth';
import { fetchMeetings, toggleTaskRemote } from '../services/meetings';
const CACHE_PREFIX = 'zenk-meetings-cache:';
function readCache(userId: string): Meeting[] { try { const cached = localStorage.getItem(`${CACHE_PREFIX}${userId}`); if (cached) return JSON.parse(cached) as Meeting[]; } catch {} return []; }
function clearMeetingCache() { try { for (const key of Object.keys(localStorage)) if (key.startsWith(CACHE_PREFIX)) localStorage.removeItem(key); } catch {} }
export function useOffline() {
  const { isAuthenticated, loading, user } = useAuth();
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  useEffect(() => { const goOnline = () => setIsOnline(true); const goOffline = () => setIsOnline(false); window.addEventListener('online', goOnline); window.addEventListener('offline', goOffline); return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); }; }, []);
  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated || !user) { setMeetings([]); setLoadedUserId(null); clearMeetingCache(); return; }
    let active = true; setMeetings(readCache(user.id)); setLoadedUserId(user.id);
    fetchMeetings().then((rows) => { if (active) setMeetings(rows); }).catch(() => {});
    return () => { active = false; };
  }, [isAuthenticated, loading, user?.id]);
  useEffect(() => { if (!isAuthenticated || !user || loadedUserId !== user.id) return; try { localStorage.setItem(`${CACHE_PREFIX}${user.id}`, JSON.stringify(meetings)); } catch {} }, [isAuthenticated, user?.id, loadedUserId, meetings]);
  const updateMeeting = (id: string, patch: Partial<Meeting>) => { setMeetings((prev) => prev.map((meeting) => meeting.id === id ? { ...meeting, ...patch } : meeting)); };
  const toggleTask = (meetingId: string, taskId: string) => {
    const task = meetings.find((meeting) => meeting.id === meetingId)?.tasks.find((item) => item.id === taskId); if (!task) return;
    const nextDone = !task.done;
    setMeetings((prev) => prev.map((meeting) => meeting.id !== meetingId ? meeting : { ...meeting, tasks: meeting.tasks.map((item) => item.id === taskId ? { ...item, done: nextDone } : item) }));
    toggleTaskRemote(taskId, nextDone).catch(() => {});
  };
  return { isOnline, meetings, setMeetings, updateMeeting, toggleTask };
}
