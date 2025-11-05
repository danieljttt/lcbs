// Firebase module (replace config with your project)
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getDatabase, ref, get, set, update } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "REPLACE_ME",
  authDomain: "REPLACE_ME.firebaseapp.com",
  databaseURL: "https://REPLACE_ME-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "REPLACE_ME",
  storageBucket: "REPLACE_ME.appspot.com",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME"
};
const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);

const LS_KEY = 'lcbs_user';
export function getCurrentUser(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)); }catch{ return null; } }
function setCurrentUser(u){ localStorage.setItem(LS_KEY, JSON.stringify(u)); }
export async function logoutUser(){ localStorage.removeItem(LS_KEY); }

export async function registerUser(username, password){
  const id = 'u_'+btoa(username).replace(/[^a-z0-9]/gi,'').slice(0,12);
  const exists = await get(ref(database, 'users/'+id));
  if(exists.exists()) { alert('Пользователь уже есть'); return false; }
  await set(ref(database, 'users/'+id), { username, password, balances:{ balanceBets:1000, balanceFantasy:500 } });
  setCurrentUser({ id, username });
  return true;
}
export async function loginUser(username, password){
  const snap = await get(ref(database, 'users'));
  const users = snap.exists()? snap.val(): {};
  const pair = Object.entries(users).find(([id,u]) => u.username===username && u.password===password);
  if(!pair){ alert('Неверные данные'); return null; }
  const [id, u] = pair;
  setCurrentUser({ id, username: u.username });
  return { id, username: u.username };
}
export async function getUserBalances(userId){
  const snap = await get(ref(database, `users/${userId}/balances`));
  return snap.exists()? snap.val(): { balanceBets:0, balanceFantasy:0 };
}
export async function getAdminBalance(){
  const snap = await get(ref(database, `admin/balance`));
  return snap.exists()? snap.val(): 0;
}
export async function updateUserBalances(userId, balances){
  await update(ref(database, `users/${userId}/balances`), balances);
}
export async function getAllUsers(){
  const snap = await get(ref(database, 'users'));
  if(!snap.exists()) return [];
  const data = snap.val();
  return Object.entries(data).map(([id,u])=>({ id, ...u }));
}

export async function getFantasyPlayers(){
  const snap = await get(ref(database, 'fantasy_players'));
  if(!snap.exists()) return [];
  const obj = snap.val();
  return Object.entries(obj).map(([id,p])=>({ id, ...p }));
}
export async function getTeams(){
  const snap = await get(ref(database, 'teams_seed'));
  if(!snap.exists()) return {};
  const obj = snap.val();
  Object.keys(obj).forEach(id => obj[id]={ id, ...obj[id] });
  return obj;
}
export async function getUserFantasyPlayers(userId){
  const bagSnap = await get(ref(database, `userFantasy/${userId}`));
  const ids = bagSnap.exists()? Object.keys(bagSnap.val()): [];
  if(ids.length===0) return [];
  const all = await getFantasyPlayers();
  const byId = Object.fromEntries(all.map(p=>[p.id,p]));
  return ids.map(i=>byId[i]).filter(Boolean);
}
export async function buyFantasyPlayer(userId, playerId){
  await set(ref(database, `userFantasy/${userId}/${playerId}`), true);
  const balSnap = await get(ref(database, `users/${userId}/balances/balanceFantasy`));
  const cur = balSnap.exists()? balSnap.val(): 0;
  await update(ref(database, `users/${userId}/balances`), { balanceFantasy: cur - 100 });
}

export async function updateTeamLogo(teamId, logoUrl){
  await update(ref(database, `teams_seed/${teamId}`), { logo: logoUrl });
}
export async function updatePlayerStats(playerId, stats){
  await update(ref(database, `fantasy_players/${playerId}/stats`), stats);
}

// Auto-seed from local JSON if empty
async function maybeSeed(path, url){
  const snap = await get(ref(database, path));
  if(!snap.exists()){
    const data = await fetch(url).then(r=>r.json());
    await set(ref(database, path), data);
  }
}
(async () => {
  try{
    await maybeSeed('fantasy_players', './fantasy_players.json');
    await maybeSeed('teams_seed', './teams_seed.json');
  }catch(e){}
})();
