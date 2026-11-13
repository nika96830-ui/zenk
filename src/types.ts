export type MeetingStatus = 'ready' | 'processing' | 'recording' | 'failed';

export interface Task { id: string; title: string; assignee: string; deadline?: string; done: boolean; }
export interface Meeting { id: string; title: string; date: string; duration: string; status: MeetingStatus; participants: string[]; summary: string; tasks: Task[]; transcript?: { speaker: string; text: string; time: string }[]; topics?: string[]; decisions?: string[]; }
export type Theme = 'light' | 'dark' | 'system';
