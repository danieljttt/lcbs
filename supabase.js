import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// === Подключение к Supabase ===
const SUPABASE_URL = "https://vikcpipfrniiqiblvdkw.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpa2NwaXBmcm5paXFpYmx2ZGt3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyNjA4OTIsImV4cCI6MjA3NzgzNjg5Mn0.KpwDxvJBvehz-61ziDDuEo-c8OWmZLQyD5bL5iORfFQ";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// === Пользователи ===
export async function register(username, password) {
  const { data, error } = await supabase.from("users").insert([{ username, password }]);
  if (error) alert(error.message);
  return data;
}

export async function login(username, password) {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("username", username)
    .eq("password", password)
    .single();
  if (error || !data) { alert("Неверное имя пользователя или пароль"); return null; }
  localStorage.setItem("user", JSON.stringify(data));
  return data;
}

// === Матчи ===
export async function loadMatches() {
  const { data, error } = await supabase.from("matches").select("*").order("id");
  if (error) console.error(error);
  return data || [];
}

export async function createMatch(teamA, teamB) {
  const { error } = await supabase.from("matches").insert([{ team_a: teamA, team_b: teamB }]);
  if (error) alert(error.message);
}

export async function setWinner(id, side) {
  const { error } = await supabase.from("matches").update({ winner: side, open: false }).eq("id", id);
  if (error) alert(error.message);
}

// === Ставки ===
export async function placeBet(userId, matchId, side, amount) {
  const { error } = await supabase.from("bets").insert([{ user_id: userId, match_id: matchId, side, amount }]);
  if (error) alert(error.message);
}
