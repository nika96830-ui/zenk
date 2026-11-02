import type { Locale } from './types';
const en = { audio: 'Recording', loadAudio: 'Load recording', audioError: 'Could not load recording. Try again.', edit: 'Edit task', title: 'Task title', assignee: 'Assignee', deadline: 'Due date', done: 'Completed', save: 'Save', cancel: 'Cancel', saveError: 'Could not save task. Your changes are still here.', saving: 'Saving…' };
export const meetingTools: Record<Locale, typeof en> = {
  en,
  ru: { audio: 'Аудиозапись', loadAudio: 'Загрузить запись', audioError: 'Не удалось загрузить запись. Повторите попытку.', edit: 'Редактировать задачу', title: 'Название задачи', assignee: 'Ответственный', deadline: 'Срок', done: 'Выполнено', save: 'Сохранить', cancel: 'Отмена', saveError: 'Не удалось сохранить задачу. Ваши изменения сохранены в форме.', saving: 'Сохранение…' },
  az: { audio: 'Səs yazısı', loadAudio: 'Yazını yüklə', audioError: 'Yazı yüklənmədi. Yenidən cəhd edin.', edit: 'Tapşırığı redaktə et', title: 'Tapşırığın adı', assignee: 'Məsul şəxs', deadline: 'Son tarix', done: 'Tamamlanıb', save: 'Saxla', cancel: 'Ləğv et', saveError: 'Tapşırıq saxlanmadı. Dəyişiklikləriniz formadadır.', saving: 'Saxlanılır…' },
  tr: { audio: 'Ses kaydı', loadAudio: 'Kaydı yükle', audioError: 'Kayıt yüklenemedi. Tekrar deneyin.', edit: 'Görevi düzenle', title: 'Görev başlığı', assignee: 'Sorumlu', deadline: 'Son tarih', done: 'Tamamlandı', save: 'Kaydet', cancel: 'İptal', saveError: 'Görev kaydedilemedi. Değişiklikleriniz formda duruyor.', saving: 'Kaydediliyor…' },
};
