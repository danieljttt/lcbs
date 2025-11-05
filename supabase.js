export {};
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = 'https://vikcpipfrniiqiblvdkw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpa2NwaXBmcm5paXFpYmx2ZGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyNjA4OTIsImV4cCI6MjA3NzgzNjg5Mn0.KpwDxvJBvehz-61ziDDuEo-c8OWmZLQyD5bL5iORfFQ';

export const supabase = createClient(supabaseUrl, supabaseKey);
/* ========= USERS (custom table, plaintext as requested) ========= */
const USERS_TABLE = 'users_custom';

export function getCurrentUser(){
  try { return JSON.parse(localStorage.getItem('user')||'null'); } catch(e){ return null; }
}
export function logoutUser(){ localStorage.removeItem('user'); }

export async function registerUser(username, password){
  const { error } = await supabase.from(USERS_TABLE).insert([{ username, password, balance: 100 }]);
  if(error){ alert('Reg error: '+error.message); return false; }
  const u = await loginUser(username, password);
  return !!u;
}

export async function loginUser(username, password){
  const { data, error } = await supabase
    .from(USERS_TABLE)
    .select('*')
    .eq('username', username)
    .eq('password', password)
    .maybeSingle();
  if(error || !data){ alert('Nepareizs lietotājvārds vai parole'); return null; }
  localStorage.setItem('user', JSON.stringify(data));
  return data;
}

export async function getUserBalance(user_id){
  const { data } = await supabase.from(USERS_TABLE).select('balance').eq('id', user_id).maybeSingle();
  return data?.balance ?? 0;
}
export async function getUserBets(user_id){
  const { data } = await supabase.from('bets').select('*').eq('user_id', user_id).order('id');
  return data || [];
}

/* ========= MATCHES ========= */
export async function loadMatchesDB(){
  const { data, error } = await supabase.from('matches').select('*').order('id');
  if(error){ console.error('loadMatchesDB:', error); return []; }
  return data || [];
}
export async function createMatchDB({A,B,deadline=0}){
  const row = { A, B, open:true, winner:null, deadline, betsA:0, betsB:0 };
  const { error } = await supabase.from('matches').insert([row]);
  if(error){ alert('Create match error: '+error.message); }
}
export async function setWinnerDB(id, side){
  const { error } = await supabase.from('matches').update({ winner: side, open:false }).eq('id', id);
  if(error){ alert('Set winner error: '+error.message); }
}

/* ========= BETS ========= */
export async function placeBetDB(user_id, match_id, side, amount){
  const { error: e1 } = await supabase.from('bets').insert([{ user_id, match_id, side, amount }]);
  if(e1){ alert('Bet error: '+e1.message); return; }
  const { data: balRow } = await supabase.from(USERS_TABLE).select('balance').eq('id', user_id).maybeSingle();
  const nextBal = (balRow?.balance ?? 0) - amount;
  await supabase.from(USERS_TABLE).update({ balance: nextBal }).eq('id', user_id);
  const field = side==='A' ? 'betsA' : 'betsB';
  const { data: m } = await supabase.from('matches').select(field).eq('id', match_id).maybeSingle();
  const next = (m?.[field]||0) + amount;
  await supabase.from('matches').update({ [field]: next }).eq('id', match_id);
}

/* ========= TEAMS + STORAGE ========= */
export async function loadTeams(){
  const { data, error } = await supabase.from('teams').select('*').order('name');
  if(error){ console.error('loadTeams:', error); return []; }
  return data || [];
}
export async function addTeam(name, file){
  let logo_url = null;
  if(file){
    const fileName = `${Date.now()}_${file.name}`;
    const { error: upErr } = await supabase.storage.from('team-logos').upload(fileName, file);
    if(upErr){ alert('Upload error: '+upErr.message); return; }
    const { data: pub } = supabase.storage.from('team-logos').getPublicUrl(fileName);
    logo_url = pub.publicUrl;
  }
  const { error } = await supabase.from('teams').insert([{ name, logo_url }]);
  if(error){ alert('Add team error: '+error.message); }
}

/* ========= REALTIME ========= */
export function subscribeRealtime(onChange){
  const ch = supabase.channel('realtime-all');
  ['users_custom','matches','bets','teams'].forEach(tbl => {
    ch.on('postgres_changes', { event: '*', schema: 'public', table: tbl }, ()=>{
      try{ onChange&&onChange(); }catch(e){ console.warn(e); }
    });
  });
  ch.subscribe();
  return ch;
}
