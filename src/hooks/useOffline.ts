import { useState, useEffect } from 'react';
import type { Meeting } from '../types';
import { useAuth } from './useAuth';
import { fetchMeetings, toggleTaskRemote } from '../services/meetings';

const CACHE_PREFIX = 'zang-meetings-cache:';

function readCache(userId: string): Meeting[] {
  try {
    const cached = localStorage.getItem(`${CACHE_PREFIX}${userId}`);
    if (cached) return JSON.parse(cached) as Meeting[];
  } catch {
    // A corrupt local cache must not prevent the server request.
  }
  return [];
}

function clearMeetingCache() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(CACHE_PREFIX)) localStorage.removeItem(key);
    }
  } catch {
    // Storage may be unavailable in private browsing contexts.
  }
}

export function useOffline() {
  const { isAuthenticated, loading, user } = useAuth();
  const [isOnline, setIsOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

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
    if (loading) return;
    if (!isAuthenticated || !user) {
      setMeetings([]);
      setLoadedUserId(null);
      setSyncError(null);
      clearMeetingCache();
      return;
    }

    let active = true;
    setMeetings(readCache(user.id));
    setLoadedUserId(user.id);
    setSyncError(null);

    fetchMeetings()
      .then((rows) => {
        if (!active) return;
        setMeetings(rows);
        setSyncError(null);
      })
      .catch(() => {
        if (active) setSyncError('MEETINGS_LOAD_FAILED');
      });

    return () => { active = false; };
  }, [isAuthenticated, loading, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !user || loadedUserId !== user.id) return;
    try {
      localStorage.setItem(`${CACHE_PREFIX}${user.id}`, JSON.stringify(meetings));
    } catch {
      setSyncError('LOCAL_CACHE_UNAVAILABLE');
    }
  }, [isAuthenticated, user?.id, loadedUserId, meetings]);

  const updateMeeting = (id: string, patch: Partial<Meeting>) => {
    setMeetings((previous) => previous.map((meeting) =>
      meeting.id === id ? { ...meeting, ...patch } : meeting,
    ));
  };

  const toggleTask = (meetingId: string, taskId: string) => {
    const task = meetings.find((meeting) => meeting.id === meetingId)?.tasks.find((item) => item.id === taskId);
    if (!task) return;

    const previousDone = task.done;
    const nextDone = !previousDone;
    setSyncError(null);
    setMeetings((previous) => previous.map((meeting) => meeting.id !== meetingId ? meeting : {
      ...meeting,
      tasks: meeting.tasks.map((item) => item.id === taskId ? { ...item, done: nextDone } : item),
    }));

    void toggleTaskRemote(taskId, nextDone)
      .then(() => setSyncError(null))
      .catch(() => {
        setMeetings((previous) => previous.map((meeting) => meeting.id !== meetingId ? meeting : {
          ...meeting,
          tasks: meeting.tasks.map((item) => item.id === taskId ? { ...item, done: previousDone } : item),
        }));
        setSyncError('TASK_SAVE_FAILED');
      });
  };

  return { isOnline, meetings, setMeetings, updateMeeting, toggleTask, syncError };
}
