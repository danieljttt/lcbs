import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Подключение к вашему проекту Supabase
const SUPABASE_URL = "https://vikcpipfrniiqiblvdkw.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpa2NwaXBmcm5paXFpYmx2ZGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyNjA4OTIsImV4cCI6MjA3NzgzNjg5Mn0.KpwDxvJBvehz-61ziDDuEo-c8OWmZLQyD5bL5iORfFQ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Читать матчи
export async function loadMatchesDB(){
  const { data, error } = await supabase.from('matches').select('*').order('id');
  if(error){ console.error('loadMatchesDB:', error); return []; }
  return data || [];
}

// Создать матч
export async function createMatchDB({A,B,deadline=0}){
  const row = { A, B, open: true, winner: null, deadline, betsA: 0, betsB: 0 };
  const { error } = await supabase.from('matches').insert([row]);
  if(error){ alert('DB error: '+error.message); }
}

// Выставить победителя
export async function setWinnerDB(id, side){
  const { error } = await supabase.from('matches').update({ winner: side, open: false }).eq('id', id);
  if(error){ alert('DB error: '+error.message); }
}

// Записать ставку + инкремент суммы в агрегатах
export async function placeBetDB({username, match_id, side, amount}){
  // 1) запись ставки
  const { error: e1 } = await supabase.from('bets').insert([{ username, match_id, side, amount }]);
  if(e1){ alert('DB bet error: '+e1.message); return; }
  // 2) увеличение суммы в таблице matches
  const field = side==='A' ? 'betsA' : 'betsB';
  const { data, error: e2 } = await supabase.from('matches').select('*').eq('id', match_id).single();
  if(e2 || !data){ console.error(e2); return; }
  const next = (data[field] || 0) + amount;
  const upd = {}; upd[field] = next;
  await supabase.from('matches').update(upd).eq('id', match_id);
}
