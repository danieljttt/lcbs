// Firebase modulis
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getDatabase, ref, get, set, update } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCx8pzVrtO0agiJQ9diuJSImWfqjoeth-o",
  authDomain: "fantasy-league-fe43f.firebaseapp.com",
  databaseURL: "https://fantasy-league-fe43f-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "fantasy-league-fe43f",
  storageBucket: "fantasy-league-fe43f.firebasestorage.app",
  messagingSenderId: "210230889461",
  appId: "1:210230889461:web:49d513dd7f76fda325aebc",
  measurementId: "G-C48C2YD5PN"
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app);

// Sesija
const LS_KEY = 'lcbs_user';
export function getCurrentUser(){ try{ return JSON.parse(localStorage.getItem(LS_KEY)); }catch{ return null; } }
function setCurrentUser(u){ localStorage.setItem(LS_KEY, JSON.stringify(u)); }
export async function logoutUser(){ localStorage.removeItem(LS_KEY); }

// Reģistrācija / pieteikšanās
export async function registerUser(username, password){
  const id = 'u_'+btoa(username).replace(/[^a-z0-9]/gi,'').slice(0,12);
  const exists = await get(ref(database, 'users/'+id));
  if(exists.exists()) { alert('Lietotājs jau eksistē'); return false; }
  await set(ref(database, 'users/'+id), { username, password, balances:{ balanceBets:1000, balanceFantasy:10 } });
  setCurrentUser({ id, username });
  return true;
}
export async function loginUser(username, password){
  const snap = await get(ref(database, 'users'));
  const users = snap.exists()? snap.val(): {};
  const pair = Object.entries(users).find(([id,u]) => u.username===username && u.password===password);
  if(!pair){ alert('Nepareizs lietotājvārds vai parole'); return null; }
  const [id, u] = pair;
  setCurrentUser({ id, username: u.username });
  return { id, username: u.username };
}
export async function getUserBalances(userId){
  const snap = await get(ref(database, `users/${userId}/balances`));
  return snap.exists()? snap.val(): { balanceBets:0, balanceFantasy:0 };
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

// Fantasy
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
  const bagRef = ref(database, `userFantasy/${userId}`);
  const bagSnap = await get(bagRef);
  const current = bagSnap.exists() ? Object.keys(bagSnap.val()) : [];
  if (current.includes(playerId)) return true;
  if (current.length >= 3) { alert('Limits: 3 spēlētāji'); return false; }

  const all = await getFantasyPlayers();
  const player = all.find(p => p.id === playerId);
  const cost = player?.price ?? (player?.tier === 1 ? 6 : player?.tier === 2 ? 4 : 2);

  const balSnap = await get(ref(database, `users/${userId}/balances/balanceFantasy`));
  const cur = balSnap.exists()? balSnap.val(): 0;
  if(cur < cost){ alert('Nepietiek kredītu'); return false; }

  await set(ref(database, `userFantasy/${userId}/${playerId}`), true);
  await update(ref(database, `users/${userId}/balances`), { balanceFantasy: cur - cost });
  return true;
}
export async function removeFantasyPlayer(userId, playerId){
  await set(ref(database, `userFantasy/${userId}/${playerId}`), null);
  return true;
}

// Likmes ar pool dalīšanu un 7.5% adminam
export async function getMatches(){
  const snap = await get(ref(database, 'matches'));
  const all = snap.exists()? snap.val(): {};
  const arr = Object.entries(all).map(([id, m])=>({ id, ...m }));
  const open = arr.filter(m=>m.status!=='closed');
  const closed = arr.filter(m=>m.status==='closed').sort((a,b)=> (b.time||'').localeCompare(a.time||''));
  return { open, closed };
}
export async function addMatch({ team1, team2, tournament='', time='' }){
  const id = 'm_'+Math.random().toString(36).slice(2,10);
  await set(ref(database, 'matches/'+id), { id, team1, team2, tournament, time, status:'open', winner:null });
  return id;
}
export async function placeBet(userId, matchId, team, amount){
  amount = Math.floor(amount||0);
  if(amount < 1) return false;
  const mSnap = await get(ref(database, 'matches/'+matchId));
  if(!mSnap.exists()) return false;
  const m = mSnap.val();
  if(m.status==='closed') return false;

  const balSnap = await get(ref(database, `users/${userId}/balances/balanceBets`));
  const cur = balSnap.exists()? balSnap.val(): 0;
  if(cur < amount) return false;

  const betRef = ref(database, `userBets/${userId}/${matchId}`);
  const prevSnap = await get(betRef);
  const prev = prevSnap.exists()? prevSnap.val(): null;
  const newAmt = (prev && prev.team===team) ? (prev.amount + amount) : amount;
  await set(betRef, { team, amount: newAmt });
  await update(ref(database, `users/${userId}/balances`), { balanceBets: cur - amount });
  return true;
}
export async function closeMatchAndPayout(matchId, winner){
  const ubSnap = await get(ref(database, 'userBets'));
  const allUserBets = ubSnap.exists()? ubSnap.val(): {};
  let total = 0, winnersTotal = 0;
  const bets = [];
  for(const [uid, userBetObj] of Object.entries(allUserBets)){
    if(userBetObj && userBetObj[matchId]){
      const b = userBetObj[matchId];
      total += b.amount;
      if(b.team === winner){ winnersTotal += b.amount; }
      bets.push({ uid, ...b });
    }
  }
  const adminCut = Math.floor(total * 0.075);
  const poolForWinners = Math.max(0, total - adminCut);
  for(const b of bets){
    if(b.team !== winner) continue;
    const share = winnersTotal>0 ? Math.floor(b.amount / winnersTotal * poolForWinners) : 0;
    if(share>0){
      const balSnap = await get(ref(database, `users/${b.uid}/balances/balanceBets`));
      const cur = balSnap.exists()? balSnap.val(): 0;
      await update(ref(database, `users/${b.uid}/balances`), { balanceBets: cur + share });
    }
  }
  const admSnap = await get(ref(database, 'admin/balance'));
  const admCur = admSnap.exists()? admSnap.val(): 0;
  await set(ref(database, 'admin/balance'), admCur + adminCut);
  await update(ref(database, 'matches/'+matchId), { status:'closed', winner, pool: total, adminCut });
  return true;
}

// Admin helpers
export async function updateTeamLogo(teamId, logoUrl){
  await update(ref(database, `teams_seed/${teamId}`), { logo: logoUrl });
}
export async function updatePlayerStats(playerId, stats){
  await update(ref(database, `fantasy_players/${playerId}/stats`), stats);
}

// Seed from local JSON if empty (fantasy/teams only)
async function maybeSeed(path, url){
  const snap = await get(ref(database, path));
  if(!snap.exists()){
    try{
      const data = await fetch(url).then(r=>r.json());
      await set(ref(database, path), data);
    }catch(e){}
  }
}
(async () => {
  try{
    await maybeSeed('fantasy_players', './fantasy_players.json');
    await maybeSeed('teams_seed', './teams_seed.json');
  }catch(e){}
})();
