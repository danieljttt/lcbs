export {};
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import {
  getDatabase, ref, get, set, update, onValue, query, orderByChild, equalTo
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-database.js";

/* === Your Firebase project === */
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
export const db  = getDatabase(app);

/* ===== helpers ===== */
const ADMIN_USERNAME = "dturannn";
const ADMIN_BALANCE_PATH = "admin/balance";
const now = ()=> Date.now();
const uid = ()=> (crypto.randomUUID ? crypto.randomUUID() : ('id_'+Math.random().toString(36).slice(2,10)));
const toArr = obj => obj ? Object.keys(obj).map(id => ({ id, ...obj[id] })) : [];
async function inc(path, delta){
  const s = await get(ref(db, path));
  const cur = s.exists()? Number(s.val()) : 0;
  await set(ref(db, path), cur + Number(delta));
}

/* ===== users ===== */
export function getCurrentUser(){
  try { return JSON.parse(localStorage.getItem("user")||"null"); } catch(e){ return null; }
}
export function logoutUser(){ localStorage.removeItem("user"); }

export async function registerUser(username, password){
  if(!username || !password) return false;
  // unique username
  const q = query(ref(db, "users_custom"), orderByChild("username"), equalTo(username));
  const snap = await get(q);
  if(snap.exists()){ alert("Šāds lietotājvārds jau pastāv"); return false; }

  const id = uid();
  await set(ref(db, `users_custom/${id}`), { username, password, balance: 100, created_at: now() });
  localStorage.setItem("user", JSON.stringify({ id, username }));
  // ensure admin balance
  const ab = await get(ref(db, ADMIN_BALANCE_PATH));
  if(!ab.exists()) await set(ref(db, ADMIN_BALANCE_PATH), 0);
  return true;
}

export async function loginUser(username, password){
  if(!username || !password){ alert("Введите логин и пароль"); return null; }
  const q = query(ref(db, "users_custom"), orderByChild("username"), equalTo(username));
  const snap = await get(q);
  if(!snap.exists()) { alert("Nepareizs lietotājvārds vai parole"); return null; }
  const list = toArr(snap.val());
  const found = list.find(u => u.password === password);
  if(!found){ alert("Nepareizs lietotājvārds vai parole"); return null; }
  localStorage.setItem("user", JSON.stringify({ id: found.id, username: found.username }));
  return found;
}

export async function getUserBalance(user_id){
  const s = await get(ref(db, `users_custom/${user_id}/balance`));
  return s.exists()? Number(s.val()) : 0;
}
export async function getAdminBalance(){
  const s = await get(ref(db, ADMIN_BALANCE_PATH));
  return s.exists()? Number(s.val()) : 0;
}

/* ===== teams (logo URL only) ===== */
export async function loadTeams(){
  const s = await get(ref(db, "teams"));
  const arr = toArr(s.val());
  arr.sort((a,b)=> (a.name||"").localeCompare(b.name||""));
  return arr;
}
export async function addTeam(name, logoUrl){
  if(!name) return;
  const id = uid();
  await set(ref(db, `teams/${id}`), { name, logo_url: logoUrl||null, created_at: now() });
  return { id, name, logo_url: logoUrl||null };
}

/* ===== matches ===== */
export async function loadMatchesDB(){
  const s = await get(ref(db, "matches"));
  const arr = toArr(s.val());
  arr.sort((a,b)=> (a.created_at||0)-(b.created_at||0));
  return arr;
}
export async function createMatchDB({A,B,deadline=0}){
  const id = uid();
  await set(ref(db, `matches/${id}`), {
    A, B, open:true, winner:null, deadline, betsA:0, betsB:0, created_at: now()
  });
}
export async function setWinnerDB(match_id, side){
  // close
  await update(ref(db, `matches/${match_id}`), { winner: side, open:false });

  // totals
  const mSnap = await get(ref(db, `matches/${match_id}`));
  if(!mSnap.exists()) return;
  const m = mSnap.val();
  const totalA = Number(m.betsA||0);
  const totalB = Number(m.betsB||0);
  const totalPool = totalA + totalB;

  const adminCut = totalPool * 0.075;
  const winPool  = totalPool - adminCut;
  await inc(ADMIN_BALANCE_PATH, adminCut);

  // collect winner bets
  const allBetsSnap = await get(ref(db, "bets"));
  const allBets = toArr(allBetsSnap.val()).filter(b => b.match_id === match_id && b.side === side);
  const totalWinner = allBets.reduce((s,b)=> s + Number(b.amount||0), 0);

  if(totalWinner > 0 && winPool > 0){
    for(const b of allBets){
      const part = Number(b.amount)/totalWinner;
      const gain = winPool * part;
      await inc(`users_custom/${b.user_id}/balance`, gain);
      await update(ref(db, `bets/${b.id}`), { settled:true, gain });
    }
  }else{
    // если никто не поставил на победителя — весь winPool админу
    await inc(ADMIN_BALANCE_PATH, winPool);
  }
}

/* ===== bets ===== */
export async function placeBetDB(user_id, match_id, side, amount){
  const betId = uid();
  await set(ref(db, `bets/${betId}`), {
    user_id, match_id, side, amount:Number(amount), settled:false, created_at: now()
  });
  // balance --
  await inc(`users_custom/${user_id}/balance`, -Number(amount));
  // aggregates
  const field = side==='A' ? 'betsA' : 'betsB';
  await inc(`matches/${match_id}/${field}`, Number(amount));
}

/* ===== realtime ===== */
export function subscribeRealtime(cb){
  ['users_custom','matches','bets','teams','admin/balance'].forEach(path=>{
    onValue(ref(db, path), ()=>{ try{ cb&&cb(); }catch(e){} });
  });
}
