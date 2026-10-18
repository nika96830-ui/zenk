import { useState, useEffect } from 'react';
import type { Meeting } from '../types';
import { DEMO_MEETINGS } from '../data/demo';
import { useAuth } from './useAuth';
import { fetchMeetings, toggleTaskRemote } from '../services/meetings';

const CACHE_KEY = 'zang-meetings-cache';

export function useOffline() {
  const { isAuthenticated } = useAuth();
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [meetings, setMeetings] = useState<Meeting[]>(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) return JSON.parse(cached) as Meeting[];
    } catch {}
    return [];
  });

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchMeetings()
      .then((rows) => setMeetings(rows.length ? rows : []))
      .catch(() => { if (!meetings.length) setMeetings(DEMO_MEETINGS); });
  }, [isAuthenticated]);

  useEffect(() => {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(meetings)); } catch {}
  }, [meetings]);

  const updateMeeting = (id: string, patch: Partial<Meeting>) => {
    setMeetings((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const toggleTask = (meetingId: string, taskId: string) => {
    let nextDone = false;
    setMeetings((prev) => prev.map((m) => {
      if (m.id !== meetingId) return m;
      return {
        ...m,
        tasks: m.tasks.map((t) => {
          if (t.id !== taskId) return t;
          nextDone = !t.done;
          return { ...t, done: nextDone };
        }),
      };
    }));
    toggleTaskRemote(taskId, nextDone).catch(() => {});
  };

  return { isOnline, meetings, setMeetings, updateMeeting, toggleTask };
}
