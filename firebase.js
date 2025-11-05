export {};
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import {
  getDatabase, ref, get, set, update, onValue, query, orderByChild, equalTo, child
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-database.js";
import {
  getStorage, ref as sRef, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.14.0/firebase-storage.js";

/* === Your Firebase config === */
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
export const storage = getStorage(app);

const ADMIN_USERNAME = "dturannn";
const ADMIN_BALANCE_PATH = "admin/balance";

/* ===== Helpers ===== */
function uid(){ return crypto.randomUUID ? crypto.randomUUID() : ('id_'+Math.random().toString(36).slice(2,10)); }
function objToArray(obj){ return obj ? Object.keys(obj).map(k => ({ id:k, ...(obj[k]||{}) })) : []; }
async function getUserByUsername(username){
  const q = query(ref(db, "users_custom"), orderByChild("username"), equalTo(username));
  const snap = await get(q);
  if(!snap.exists()) return null;
  const arr = objToArray(snap.val());
  return arr[0] || null;
}
async function inc(path, delta){
  const s = await get(ref(db, path));
  const cur = s.exists()? Number(s.val()) : 0;
  await set(ref(db, path), cur + Number(delta));
}

/* ===== Users (plaintext) ===== */
export function getCurrentUser(){
  try { return JSON.parse(localStorage.getItem("user")||"null"); } catch(e){ return null; }
}
export function logoutUser(){ localStorage.removeItem("user"); }

export async function registerUser(username, password){
  // unique username check
  const q = query(ref(db, "users_custom"), orderByChild("username"), equalTo(username));
  const snap = await get(q);
  if(snap.exists()){ alert("Šāds lietotājvārds jau pastāv"); return false; }

  const id = uid();
  await set(ref(db, `users_custom/${id}`), { username, password, balance: 100, created_at: Date.now() });
  const me = { id, username, password, balance: 100 };
  localStorage.setItem("user", JSON.stringify(me));
  // ensure admin balance node exists
  const ab = await get(ref(db, ADMIN_BALANCE_PATH));
  if(!ab.exists()) await set(ref(db, ADMIN_BALANCE_PATH), 0);
  return true;
}

export async function loginUser(username, password){
  const user = await getUserByUsername(username);
  if(!user || user.password !== password){ alert("Nepareizs lietotājvārds vai parole"); return null; }
  localStorage.setItem("user", JSON.stringify(user));
  return user;
}

export async function getUserBalance(user_id){
  const s = await get(ref(db, `users_custom/${user_id}/balance`));
  return s.exists() ? Number(s.val()) : 0;
}

/* ===== Teams + Storage ===== */
export async function loadTeams(){
  const s = await get(ref(db, "teams"));
  const arr = objToArray(s.val());
  arr.sort((a,b)=> (a.name||"").localeCompare(b.name||""));
  return arr;
}
export async function addTeam(name, file){
  let logo_url = null;
  if(file){
    const path = `team-logos/${Date.now()}_${file.name}`;
    const bucketRef = sRef(storage, path);
    await uploadBytes(bucketRef, file);
    logo_url = await getDownloadURL(bucketRef);
  }
  const id = uid();
  await set(ref(db, `teams/${id}`), { name, logo_url, created_at: Date.now() });
  return { id, name, logo_url };
}

/* ===== Matches ===== */
export async function loadMatchesDB(){
  const s = await get(ref(db, "matches"));
  const arr = objToArray(s.val());
  arr.sort((a,b)=> (a.created_at||0) - (b.created_at||0));
  return arr;
}
export async function createMatchDB({A,B,deadline=0}){
  const id = uid();
  await set(ref(db, `matches/${id}`), {
    A, B, open: true, winner: null, deadline, betsA: 0, betsB: 0, created_at: Date.now()
  });
}
export async function setWinnerDB(match_id, side){
  // close match first
  await update(ref(db, `matches/${match_id}`), { winner: side, open: false });

  // totals
  const mSnap = await get(ref(db, `matches/${match_id}`));
  if(!mSnap.exists()) return;
  const m = mSnap.val();
  const totalA = Number(m.betsA||0);
  const totalB = Number(m.betsB||0);
  const totalPool = totalA + totalB;

  // admin cut 7.5%
  const adminCut = totalPool * 0.075;
  const winPool = totalPool - adminCut;

  // credit admin balance
  await inc(ADMIN_BALANCE_PATH, adminCut);

  // collect winner bets
  const betsSnap = await get(ref(db, "bets"));
  const allBets = objToArray(betsSnap.val()).filter(b => b.match_id === match_id && b.side === side);
  const totalWinnerBets = allBets.reduce((s,b)=> s + Number(b.amount||0), 0);

  if(totalWinnerBets > 0 && winPool > 0){
    for(const b of allBets){
      const userPart = Number(b.amount)/totalWinnerBets;
      const gain = winPool * userPart;
      await inc(`users_custom/${b.user_id}/balance`, gain);
      await update(ref(db, `bets/${b.id}`), { settled: true, gain });
    }
  }else{
    await inc(ADMIN_BALANCE_PATH, winPool);
  }
}

/* ===== Bets ===== */
export async function placeBetDB(user_id, match_id, side, amount){
  const betId = uid();
  await set(ref(db, `bets/${betId}`), {
    user_id, match_id, side, amount: Number(amount), created_at: Date.now(), settled: false
  });
  await inc(`users_custom/${user_id}/balance`, -Number(amount));
  const field = side === "A" ? "betsA" : "betsB";
  await inc(`matches/${match_id}/${field}`, Number(amount));
}

/* ===== Realtime ===== */
export function subscribeRealtime(onChange){
  const paths = ["users_custom","matches","bets","teams", "admin/balance"];
  paths.forEach(p => onValue(ref(db, p), ()=>{ try{ onChange&&onChange(); }catch(e){ console.warn(e); } }));
  return ()=>{};
}
