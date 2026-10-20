import type { Meeting } from '../types';

export const DEMO_MEETINGS: Meeting[] = [
  {
    id: '1',
    title: 'Weekly marketing sync',
    date: '2026-08-22T10:00:00',
    duration: '32 min',
    status: 'ready',
    participants: ['Alina', 'Igor', 'Maria'],
    decisions: '',
    summary: 'Discussed landing launch and ad budget. Close designs by Wednesday, launch ads Friday.',
    tasks: [
      { id: 't1', title: 'Close landing', assignee: 'Alina', deadline: 'Fri', done: false },
      { id: 't2', title: 'Prepare creatives', assignee: 'Igor', deadline: 'Wed', done: false },
    ],
  },
];
