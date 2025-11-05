// Firebase v11 CDN imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, getDocs, query, orderBy, deleteDoc } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

// ------------------------------------
// 🔥 Firebase config (your live keys)
// ------------------------------------
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
const auth = getAuth(app);
const db = getFirestore(app);

// ------------------------------------
// UI helpers
// ------------------------------------
const $ = (sel)=>document.querySelector(sel);
const playersGrid = $("#players-grid");
const myTeamGrid = $("#my-team");
const noPlayers = $("#no-players");
const kpiUser = $("#kpi-user");
const kpiBudget = $("#kpi-budget");
const kpiTeam = $("#kpi-team");

const authSection = $("#auth-section");
const draftSection = $("#draft-section");
const adminSection = $("#admin-section");
const btnShowAuth = $("#btn-show-auth");
const btnShowDraft = $("#btn-show-draft");
const btnLogout = $("#btn-logout");

let currentUser = null;
let currentUserProfile = null;
const BUDGET = 10;
const TEAM_SIZE = 3;

// ------------------------------------
// Auth flows
// ------------------------------------
$("#register-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const username = $("#reg-username").value.trim();
  const email = $("#reg-email").value.trim();
  const password = $("#reg-password").value;

  if(!username) return alert("Введите никнейм");
  if(!email || !password) return alert("Введите email и пароль");

  try{
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    // set displayName for convenience
    try { await updateProfile(cred.user, { displayName: username }); } catch(e){}
    const userRef = doc(db, "users", cred.user.uid);
    await setDoc(userRef, {
      uid: cred.user.uid,
      username,
      email,
      budget: BUDGET,
      isAdmin: username.toLowerCase() === "dturannn",
      createdAt: Date.now()
    });
    alert("Регистрация успешна!");
  }catch(err){
    console.error(err);
    alert("Ошибка регистрации: " + err.message);
  }
});

$("#login-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  try{
    await signInWithEmailAndPassword(auth, email, password);
  }catch(err){
    console.error(err);
    alert("Ошибка входа: " + err.message);
  }
});

btnLogout.addEventListener("click", async ()=>{
  await signOut(auth);
});

btnShowAuth.addEventListener("click", ()=>showAuth());
btnShowDraft.addEventListener("click", ()=>showDraft());

onAuthStateChanged(auth, async (user)=>{
  currentUser = user;
  if(!user){
    currentUserProfile = null;
    btnLogout.style.display = "none";
    showAuth();
  }else{
    btnLogout.style.display = "inline-flex";
    // load profile
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);
    if(snap.exists()){
      currentUserProfile = snap.data();
    }else{
      // fallback create
      currentUserProfile = { uid:user.uid, username:user.displayName||"user", email:user.email||"", budget:BUDGET, isAdmin:false };
      await setDoc(userRef, currentUserProfile, { merge:true });
    }
    showDraft();
    await refreshData();
  }
});

function showAuth(){
  authSection.style.display = "block";
  draftSection.style.display = "none";
  adminSection.style.display = "none";
}

function showDraft(){
  authSection.style.display = "none";
  draftSection.style.display = "block";
  adminSection.style.display = currentUserProfile?.isAdmin ? "block":"none";
}

// ------------------------------------
async function refreshData(){
  // KPIs
  kpiUser.textContent = currentUserProfile ? (currentUserProfile.username||"Игрок") : "Гость";

  // Load team
  const teamRef = doc(db, "teams", currentUser.uid);
  const teamSnap = await getDoc(teamRef);
  let team = [];
  if(teamSnap.exists()){
    team = teamSnap.data().players || [];
  }
  const spent = team.reduce((s,p)=>s+(p.cost||0),0);
  const budget = BUDGET - spent;
  kpiBudget.textContent = `Бюджет: ${budget}`;
  kpiTeam.textContent = `Команда: ${team.length}/${TEAM_SIZE}`;
  renderMyTeam(team);

  // Load players
  const q = query(collection(db,"players"), orderBy("tier","asc"));
  const snap = await getDocs(q);
  const list = snap.docs.map(d=>({id:d.id, ...d.data()}));
  renderPlayers(list, team, budget);
}

// ------------------------------------
// Team operations
// ------------------------------------
async function addToTeam(player){
  if(!currentUser) return alert("Войдите, чтобы выбирать игроков");
  const teamRef = doc(db, "teams", currentUser.uid);
  const teamSnap = await getDoc(teamRef);
  let team = teamSnap.exists() ? (teamSnap.data().players || []) : [];
  const spent = team.reduce((s,p)=>s+(p.cost||0),0);
  const budget = BUDGET - spent;

  if(team.find(p=>p.username===player.username)) return alert("Этот игрок уже в вашей команде");
  if(team.length >= TEAM_SIZE) return alert("Команда уже из 3 игроков");
  if(budget - (player.cost||0) < 0) return alert("Недостаточно бюджета");

  team.push(player);
  await setDoc(teamRef, { uid: currentUser.uid, players: team }, { merge:true });
  await refreshData();
}

async function removeFromTeam(username){
  const teamRef = doc(db, "teams", currentUser.uid);
  const teamSnap = await getDoc(teamRef);
  if(!teamSnap.exists()) return;
  const team = (teamSnap.data().players||[]).filter(p=>p.username!==username);
  await setDoc(teamRef, { players: team }, { merge:true });
  await refreshData();
}

// ------------------------------------
// Rendering
// ------------------------------------
function renderMyTeam(team){
  myTeamGrid.innerHTML = "";
  if(team.length===0){
    myTeamGrid.innerHTML = `<p class="tag">Пока пусто. Выберите игроков ниже.</p>`;
    return;
  }
  for(const p of team){
    const div = document.createElement("div");
    div.className = "player";
    div.innerHTML = `
      <h4>${p.username}</h4>
      <div class="meta"><span class="tag">Tier ${p.tier}</span><span>Стоимость ${p.cost}</span></div>
      <div class="hrow" style="margin-top:8px">
        <a class="btn" target="_blank" href="${p.steam||'#'}">Steam</a>
        <button class="btn" data-remove="${p.username}">Удалить</button>
      </div>
    `;
    div.querySelector('[data-remove]').addEventListener('click', ()=>removeFromTeam(p.username));
    myTeamGrid.appendChild(div);
  }
}

function renderPlayers(players, team, budget){
  playersGrid.innerHTML = "";
  if(players.length===0){
    noPlayers.style.display = "inline-block";
    return;
  }
  noPlayers.style.display = "none";
  const picked = new Set(team.map(p=>p.username));
  for(const p of players){
    const div = document.createElement("div");
    div.className = `player tier${p.tier}`;
    const disabled = picked.has(p.username) || team.length>=TEAM_SIZE || (budget - (p.cost||0) < 0);
    div.innerHTML = `
      <h4>${p.username}</h4>
      <div class="meta"><span>${p.team||''}</span><span>TR ${(p.teamRating||0).toFixed(2)}</span></div>
      <p class="hint">Tier ${p.tier} · Стоимость ${p.cost}</p>
      <div class="hrow" style="margin-top:8px">
        <a class="btn" target="_blank" href="${p.steam||'#'}">Steam</a>
        <button class="btn ${disabled?'':'primary'}" ${disabled?'disabled':''} data-pick="${p.username}">Взять</button>
      </div>
    `;
    div.querySelector('[data-pick]').addEventListener('click', ()=>addToTeam(p));
    playersGrid.appendChild(div);
  }
}

// ------------------------------------
// Admin
// ------------------------------------
const seedBtn = document.getElementById("seed-btn");
const addPlayerForm = document.getElementById("add-player-form");
const statsBox = document.getElementById("stats");
const adminList = document.getElementById("players-admin-list");

seedBtn.addEventListener("click", async ()=>{
  if(!currentUserProfile?.isAdmin) return alert("Только админ");
  const res = await fetch("players.json");
  const data = await res.json();
  for(const p of data){
    // ensure cost matches tier if not provided
    const cost = p.cost ?? (p.tier===1?6: p.tier===2?4:2);
    await addDoc(collection(db,"players"), {...p, cost});
  }
  alert("Игроки загружены");
  await refreshData();
  await refreshAdmin();
});

addPlayerForm.addEventListener("submit", async (e)=>{
  e.preventDefault();
  if(!currentUserProfile?.isAdmin) return alert("Только админ");
  const p = {
    username: document.getElementById("p-username").value.trim(),
    team: document.getElementById("p-team").value.trim(),
    steam: document.getElementById("p-steam").value.trim(),
    teamRating: parseFloat(document.getElementById("p-rating").value||"0")||0,
    tier: parseInt(document.getElementById("p-tier").value,10)
  };
  p.cost = p.tier===1?6: p.tier===2?4:2;
  await addDoc(collection(db,"players"), p);
  alert("Игрок добавлен");
  addPlayerForm.reset();
  await refreshData();
  await refreshAdmin();
});

async function refreshAdmin(){
  if(!currentUserProfile?.isAdmin){ adminSection.style.display = "none"; return; }
  adminSection.style.display = "block";
  // load stats
  const snap = await getDocs(collection(db,"players"));
  const list = snap.docs.map(d=>({id:d.id, ...d.data()}));
  statsBox.textContent = `Игроков: ${list.length}`;
  adminList.innerHTML = "";
  for(const p of list){
    const item = document.createElement("div");
    item.className = "player";
    item.innerHTML = `<h4>${p.username}</h4>
      <div class="meta"><span>${p.team||''}</span><span>Tier ${p.tier} · ${p.cost} очк.</span></div>
      <button class="btn" data-del="${p.id}">Удалить</button>`;
    item.querySelector("[data-del]").addEventListener("click", async ()=>{
      if(confirm("Удалить игрока?")){
        await deleteDoc(doc(db,"players", p.id));
        await refreshData(); await refreshAdmin();
      }
    });
    adminList.appendChild(item);
  }
}

// initial state for nav buttons
function updateNav(){
  const logged = !!currentUser;
  btnShowDraft.style.display = logged ? "inline-flex" : "none";
  btnLogout.style.display = logged ? "inline-flex" : "none";
}
setInterval(updateNav, 500); // simple sync

