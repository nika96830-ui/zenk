import { supabase } from '../lib/supabase';
import type { Task } from '../types';
export type ExportResult={success:boolean;message:string;content?:string};
export async function exportToNotion(meetingTitle:string,tasks:Task[]){return exportTasks('csv',meetingTitle,tasks);}
export async function exportToTrello(meetingTitle:string,tasks:Task[]){return exportTasks('markdown',meetingTitle,tasks);}
async function exportTasks(format:'csv'|'markdown',meetingTitle:string,tasks:Task[]):Promise<ExportResult>{const {data,error}=await supabase.functions.invoke('export-tasks',{body:{format,meetingTitle,tasks}});if(error||!data?.success)return{success:false,message:'EXPORT_FAILED'};if(data.content){const blob=new Blob([data.content],{type:format==='csv'?'text/csv;charset=utf-8':'text/plain;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=format==='csv'?'zenk-tasks.csv':'zenk-tasks.md';a.click();URL.revokeObjectURL(url);}return data as ExportResult;}
