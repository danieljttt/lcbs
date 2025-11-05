
export {};
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import { getDatabase, ref, get, set, update, onValue, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCx8pzVrtO0agiJQ9diuJSImWfqjoeth-o",
  authDomain: "fantasy-league-fe43f.firebaseapp.com",
  databaseURL: "https://fantasy-league-fe43f-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "fantasy-league-fe43f",
  storageBucket: "fantasy-league-fe43f.appspot.com",
  messagingSenderId: "210230889461",
  appId: "1:210230889461:web:49d513dd7f76fda325aebc",
  measurementId: "G-C48C2YD5PN"
};
export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

const ADMIN_USERNAME = "dturannn";
const ADMIN_BALANCE_PATH = "admin/balance";
const INIT_FLAG = "meta/initialized";

const now = ()=>Date.now();
const uid = ()=> (crypto.randomUUID? crypto.randomUUID() : ('id_'+Math.random().toString(36).slice(2,10)));
const toArr = obj => obj ? Object.keys(obj).map(id => ({ id, ...obj[id] })) : [];

async function inc(path, delta){
  const s = await get(ref(db, path));
  const cur = s.exists()? Number(s.val()) : 0;
  await set(ref(db, path), cur + Number(delta));
}

/* AUTH */
export function getCurrentUser(){
  try { return JSON.parse(localStorage.getItem('user')||'null'); } catch(e){ return null; }
}
export function logoutUser(){ localStorage.removeItem('user'); }
export async function registerUser(username, password){
  if(!username || !password) return false;
  const q = query(ref(db, 'users_custom'), orderByChild('username'), equalTo(username));
  const snap = await get(q);
  if(snap.exists()){ alert('Šāds lietotājvārds jau pastāv'); return false; }
  const id = uid();
  await set(ref(db, `users_custom/${id}`), { username, password, balanceBets: 100, balanceFantasy: 10, created_at: now() });
  localStorage.setItem('user', JSON.stringify({ id, username }));
  const ab = await get(ref(db, ADMIN_BALANCE_PATH)); if(!ab.exists()) await set(ref(db, ADMIN_BALANCE_PATH), 0);
  return true;
}
export async function loginUser(username, password){
  if(!username || !password){ alert('Введите логин и пароль'); return null; }
  const q = query(ref(db, 'users_custom'), orderByChild('username'), equalTo(username));
  const snap = await get(q);
  if(!snap.exists()){ alert('Nepareizs lietotājvārds vai parole'); return null; }
  const list = toArr(snap.val());
  const found = list.find(u => u.password === password);
  if(!found){ alert('Nepareizs lietotājvārds vai parole'); return null; }
  localStorage.setItem('user', JSON.stringify({ id: found.id, username: found.username }));
  return found;
}
export async function getUserBalances(user_id){
  const s = await get(ref(db, `users_custom/${user_id}`));
  const v = s.exists()? s.val() : {};
  return { balanceBets: Number(v.balanceBets||0), balanceFantasy: Number(v.balanceFantasy||0) };
}
export async function setInitialFantasyIfNeeded(){
  const u = getCurrentUser(); if(!u) return;
  const s = await get(ref(db, `users_custom/${u.id}/balanceFantasy`));
  if(!s.exists()) await set(ref(db, `users_custom/${u.id}/balanceFantasy`), 10);
}

/* ADMIN ONE-TIME INIT */
export async function initializeIfFirstAdmin(){
  const u = getCurrentUser(); if(!u || u.username !== ADMIN_USERNAME) return;
  const flag = await get(ref(db, INIT_FLAG));
  if(flag.exists() && flag.val() === true) return;

  // wipe (keep users_custom)
  await set(ref(db, 'matches'), null);
  await set(ref(db, 'bets'), null);
  await set(ref(db, 'teams'), null);
  await set(ref(db, 'fantasy_teams'), null);
  await set(ref(db, ADMIN_BALANCE_PATH), 0);
  await set(ref(db, 'fantasy_players'), null);

  // seed
  try{
    const r = await fetch('./fantasy_players.json'); const d = await r.json();
    if(d && d.fantasy_players) await set(ref(db, 'fantasy_players'), d.fantasy_players);
  }catch(e){ console.error(e); }
  try{
    const r2 = await fetch('./teams_seed.json'); const d2 = await r2.json();
    if(d2 && d2.teams) await set(ref(db, 'teams'), d2.teams);
  }catch(e){ console.error(e); }

  await set(ref(db, INIT_FLAG), true);
}

/* TEAMS */
export async function addTeam(name,logo_url,tag,country){
  const id = uid();
  await set(ref(db, `teams/${id}`), { name, logo_url: logo_url||null, tag: tag||null, country: country||null, created_at: now() });
}
export async function loadTeams(){
  const s = await get(ref(db, 'teams'));
  const arr = toArr(s.val()); arr.sort((a,b)=> (a.name||'').localeCompare(b.name||''));
  return arr;
}

/* MATCHES & BETS */
export async function createMatchFromTeams(teamIdA,teamIdB){
  const tA = await get(ref(db, `teams/${teamIdA}`));
  const tB = await get(ref(db, `teams/${teamIdB}`));
  if(!tA.exists() || !tB.exists()) return;
  const A = tA.val(), B = tB.val();
  const id = uid();
  await set(ref(db, `matches/${id}`), {
    A: A.name, B: B.name, logoA: A.logo_url||null, logoB: B.logo_url||null,
    open:true, winner:null, deadline:0, betsA:0, betsB:0, created_at: now()
  });
}
export async function loadMatchesDB(){
  const s = await get(ref(db, 'matches'));
  const arr = toArr(s.val()); arr.sort((a,b)=> (a.created_at||0)-(b.created_at||0));
  return arr;
}
export async function placeBetDB(user_id,match_id,side,amount){
  const betId = uid();
  await set(ref(db, `bets/${betId}`), { user_id, match_id, side, amount:Number(amount), settled:false, created_at: now() });
  const ub = await get(ref(db, `users_custom/${user_id}/balanceBets`));
  const cur = ub.exists()? Number(ub.val()) : 0;
  await set(ref(db, `users_custom/${user_id}/balanceBets`), cur - Number(amount));
  const field = side==='A' ? 'betsA':'betsB';
  const agg = await get(ref(db, `matches/${match_id}/${field}`));
  const curAgg = agg.exists()? Number(agg.val()) : 0;
  await set(ref(db, `matches/${match_id}/${field}`), curAgg + Number(amount));
}
export async function setWinnerDB(match_id,side){
  await update(ref(db, `matches/${match_id}`), { winner:side, open:false });
  const mSnap = await get(ref(db, `matches/${match_id}`)); if(!mSnap.exists()) return;
  const m = mSnap.val();
  const totalA = Number(m.betsA||0), totalB = Number(m.betsB||0);
  const totalPool = totalA + totalB; const adminCut = totalPool * 0.075; const winPool = totalPool - adminCut;
  const ab = await get(ref(db, ADMIN_BALANCE_PATH)); const curAb = ab.exists()? Number(ab.val()) : 0;
  await set(ref(db, ADMIN_BALANCE_PATH), curAb + adminCut);
  const betsSnap = await get(ref(db, 'bets'));
  const winnerBets = toArr(betsSnap.val()).filter(b=> b.match_id===match_id && b.side===side);
  const totalWinner = winnerBets.reduce((s,b)=> s + Number(b.amount||0), 0);
  if(totalWinner>0 && winPool>0){
    for(const b of winnerBets){
      const part = Number(b.amount)/totalWinner;
      const gain = winPool * part;
      const uBal = await get(ref(db, `users_custom/${b.user_id}/balanceBets`));
      const curU = uBal.exists()? Number(uBal.val()) : 0;
      await set(ref(db, `users_custom/${b.user_id}/balanceBets`), curU + gain);
      await update(ref(db, `bets/${b.id}`), { settled:true, gain });
    }
  }else{
    const ab2 = await get(ref(db, ADMIN_BALANCE_PATH)); const cur2 = ab2.exists()? Number(ab2.val()) : 0;
    await set(ref(db, ADMIN_BALANCE_PATH), cur2 + winPool);
  }
}
export async function getAdminBalance(){
  const s = await get(ref(db, ADMIN_BALANCE_PATH));
  return s.exists()? Number(s.val()) : 0;
}

/* FANTASY */
export async function loadFantasyPlayers(){
  const s = await get(ref(db, 'fantasy_players'));
  const arr = toArr(s.val()); arr.forEach(p=>{
    if(p.tier==1 && !p.price_points) p.price_points=6;
    if(p.tier==2 && !p.price_points) p.price_points=4;
    if(p.tier==3 && !p.price_points) p.price_points=2;
  });
  arr.sort((a,b)=> (a.tier||0)-(b.tier||0) || (a.name||'').localeCompare(b.name||''));
  return arr;
}
export async function buyFantasyPlayer(user_id,playerId){
  const uSnap = await get(ref(db, `users_custom/${user_id}`)); if(!uSnap.exists()) return {ok:false,msg:'user not found'};
  const user = uSnap.val();
  const pSnap = await get(ref(db, `fantasy_players/${playerId}`)); if(!pSnap.exists()) return {ok:false,msg:'player not found'};
  const p = pSnap.val(); const price = Number(p.price_points||0);
  const balS = await get(ref(db, `users_custom/${user_id}/balanceFantasy`)); const bal = balS.exists()? Number(balS.val()) : 0;
  if(bal < price) return {ok:false,msg:'Недостаточно очков Fantasy'};
  const slotPath = `fantasy_teams/${user.username}`;
  const teamSnap = await get(ref(db, slotPath));
  const t = teamSnap.exists()? teamSnap.val() : { manager:user.username, total_points:0, tier1:[], tier2:[], tier3:[] };
  const key = p.tier==1?'tier1':(p.tier==2?'tier2':'tier3');
  const list = Array.isArray(t[key])? t[key] : [];
  if(!list.includes(playerId)) list.push(playerId);
  t[key] = list;
  await set(ref(db, slotPath), t);
  await set(ref(db, `users_custom/${user_id}/balanceFantasy`), bal - price);
  return {ok:true};
}
export async function loadFantasyTeams(){
  const s = await get(ref(db, 'fantasy_teams'));
  const arr = toArr(s.val()); arr.forEach(t=> t.total_points = Number(t.total_points||0));
  arr.sort((a,b)=> (b.total_points||0)-(a.total_points||0));
  return arr;
}
export async function addPlayerPoints(playerId,delta){
  const s = await get(ref(db, `fantasy_players/${playerId}/points`));
  const cur = s.exists()? Number(s.val()) : 0;
  await set(ref(db, `fantasy_players/${playerId}/points`), cur + Number(delta));
}
export async function savePlayerStats(playerId,stats){
  await update(ref(db, `fantasy_players/${playerId}`), stats);
}

/* REALTIME */
export function subscribeRealtime(cb){
  ['users_custom','matches','bets','teams','admin/balance','fantasy_players','fantasy_teams','meta/initialized'].forEach(p=>{
    onValue(ref(db,p),()=>{ try{cb&&cb();}catch(e){} });
  });
}
