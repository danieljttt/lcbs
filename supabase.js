export {};
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// === Your Supabase project (URL fixed, insert your anon key) ===
const SUPABASE_URL = "https://vikcpipfrniiqiblvdkw.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpa2NwaXBmcm5paXFpYmx2ZGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyNjA4OTIsImV4cCI6MjA3NzgzNjg5Mn0.KpwDxvJBvehz-61ziDDuEo-c8OWmZLQyD5bL5iORfFQ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ===== USERS =====
export async function registerUser(username, password){
  const { error } = await supabase.from('users').insert([{ username, password, balance: 100 }]);
  if(error){ alert(error.message); return false; }
  const u = await loginUser(username, password);
  return !!u;
}
export async function loginUser(username, password){
  const { data, error } = await supabase.from('users').select('*').eq('username', username).eq('password', password).single();
  if(error || !data){ alert('Nepareizs lietotājvārds vai parole'); return null; }
  localStorage.setItem('user', JSON.stringify(data));
  return data;
}
export function logoutUser(){ localStorage.removeItem('user'); }
export async function getUserBalance(user_id){
  const { data, error } = await supabase.from('users').select('balance').eq('id', user_id).single();
  if(error) return 0;
  return data?.balance ?? 0;
}
export async function getUserBets(user_id){
  const { data } = await supabase.from('bets').select('*').eq('user_id', user_id).order('id');
  return data || [];
}

// ===== MATCHES =====
export async function loadMatchesDB(){
  const { data, error } = await supabase.from('matches').select('*').order('id');
  if(error){ console.error(error); return []; }
  return data || [];
}
export async function createMatchDB({A,B,deadline=0}){
  const row = { A, B, open:true, winner:null, deadline, betsA:0, betsB:0 };
  const { error } = await supabase.from('matches').insert([row]);
  if(error){ alert(error.message); }
}
export async function setWinnerDB(id, side){
  const { error } = await supabase.from('matches').update({ winner: side, open:false }).eq('id', id);
  if(error){ alert(error.message); }
}

// ===== BETS =====
export async function placeBetDB(user_id, match_id, side, amount){
  // create bet
  const { error: e1 } = await supabase.from('bets').insert([{ user_id, match_id, side, amount }]);
  if(e1){ alert(e1.message); return; }
  // decrement user balance (simple update; optionally add an RPC later)
  const { data: balRow } = await supabase.from('users').select('balance').eq('id', user_id).single();
  const nextBal = (balRow?.balance ?? 0) - amount;
  await supabase.from('users').update({ balance: nextBal }).eq('id', user_id);
  // increment aggregate on match
  const field = side==='A' ? 'betsA' : 'betsB';
  const { data: m } = await supabase.from('matches').select(field).eq('id', match_id).single();
  const next = (m?.[field]||0) + amount;
  await supabase.from('matches').update({ [field]: next }).eq('id', match_id);
}
// ===== Вспомогательная функция =====
export function getCurrentUser(){
  try {
    return JSON.parse(localStorage.getItem('user') || 'null');
  } catch(e){
    return null;
  }
}
