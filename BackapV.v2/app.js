import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
 import { initTrampoline, destroyTrampoline, renderTrampolineView, openAddKidModal } from './trampoline.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc,
  updateDoc, deleteDoc, query, where, orderBy, onSnapshot, Timestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDZIZfWn79gzlznytG34RaSVtVGp57k9jw",
  authDomain: "nexora-kids.firebaseapp.com",
  projectId: "nexora-kids",
  storageBucket: "nexora-kids.firebasestorage.app",
  messagingSenderId: "1024849178642",
  appId: "1:1024849178642:web:9c6bda5a5a193f3189e8cb"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ══════════════════════════════════════════
//  CONSTANTES
// ══════════════════════════════════════════
const LS_SES = 'nkm_session_v4';
const EMOJIS = ['🚗','🚙','🏎️','🚕','🚓','🚒','🚑','🏍️','⚡','🌈','🚀','🛻'];

// Definición de todos los permisos disponibles para empleados
const PERMISOS_DEF = [
  {
    key: 'editarPago',
    icon: '💳',
    label: 'Editar método de pago',
    desc: 'Puede cambiar el método de pago (Yape/Efectivo) en ventas registradas'
  },
  {
    key: 'verStats',
    icon: '📈',
    label: 'Ver estadísticas',
    desc: 'Acceso a la pestaña de estadísticas del día'
  },
  {
    key: 'exportarCSV',
    icon: '📁',
    label: 'Exportar CSV',
    desc: 'Puede descargar el historial de ventas en CSV'
  },
  {
    key: 'verHistorialCompleto',
    icon: '📋',
    label: 'Ver historial completo',
    desc: 'Puede ver todo el historial (semana/todo), no solo el de hoy'
  }
];

// ══════════════════════════════════════════
//  ESTADO LOCAL
// ══════════════════════════════════════════
let currentUser = null;
let vehicles = [];
let allSales = [];
let users = [];
let sessions = {};
let histFilter = 'today';
let rentVehId = null, rentMin = 10, rentPay = 'yape';
let editVehId = null, vType = 'small', vEmoji = '🚗';
let editUserId = null, newURole = 'employee';
let tuVehId = null;
let unsubVehicles = null, unsubSales = null, unsubUsers = null, unsubCurrentUser = null;
// Permisos del usuario en edición
let editUserPerms = {};
// ID de la venta que se está editando el pago
let editSaleId = null;
// Snapshot previo de permisos para detectar cambios
let prevPermisos = {};

// ══════════════════════════════════════════
//  BOOT
// ══════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async () => {
  buildEmojiGrid();
  setTimeout(async () => {
    document.getElementById('splash').classList.add('out');
    setTimeout(async () => {
      document.getElementById('splash').style.display = 'none';
      const saved = JSON.parse(localStorage.getItem(LS_SES) || 'null');
      if (saved) {
        try {
          const snap = await getDoc(doc(db, 'users', saved.id));
          if (snap.exists()) {
            const u = { id: snap.id, ...snap.data() };
            if (u.username === saved.username) {
              currentUser = u;
              showApp();
              return;
            }
          }
        } catch (e) { console.error('Session restore error:', e); }
      }
      showLogin();
    }, 500);
  }, 1900);
});

// ══════════════════════════════════════════
//  HELPERS DE PERMISOS
// ══════════════════════════════════════════
function hasPermiso(key) {
  if (isAdmin()) return true;
  return !!(currentUser?.permisos?.[key]);
}

// ══════════════════════════════════════════
//  LOGIN / LOGOUT
// ══════════════════════════════════════════
function showLogin() {
  const c = document.getElementById('lbBubbles'); c.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const b = document.createElement('div'); b.className = 'lbub';
    const sz = 40 + Math.random() * 120;
    b.style.cssText = `width:${sz}px;height:${sz}px;left:${Math.random()*100}%;animation-duration:${7+Math.random()*9}s;animation-delay:${Math.random()*5}s`;
    c.appendChild(b);
  }
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('lUser').value = '';
  document.getElementById('lPass').value = '';
  document.getElementById('lErr').style.display = 'none';
  setTimeout(() => document.getElementById('lUser').focus(), 350);
}

document.getElementById('lBtn').addEventListener('click', tryLogin);
document.getElementById('lPass').addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
document.getElementById('lUser').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('lPass').focus(); });

async function tryLogin() {
  const username = document.getElementById('lUser').value.trim();
  const password = document.getElementById('lPass').value;
  const err = document.getElementById('lErr');
  const btn = document.getElementById('lBtn');
  btn.disabled = true; btn.textContent = 'Verificando...';
  try {
    const q = query(collection(db, 'users'), where('username', '==', username));
    const snap = await getDocs(q);
    if (snap.empty) throw new Error('not found');
    const userDoc = snap.docs[0];
    const userData = { id: userDoc.id, ...userDoc.data() };
    if (userData.password !== password) throw new Error('wrong pass');
    err.style.display = 'none';
    currentUser = userData;
    localStorage.setItem(LS_SES, JSON.stringify({ id: userData.id, username: userData.username }));
    document.getElementById('loginScreen').classList.add('hidden');
    showApp();
  } catch (e) {
    err.style.display = '';
    ['lUser','lPass'].forEach(id => {
      const el = document.getElementById(id);
      el.classList.add('err');
      setTimeout(() => el.classList.remove('err'), 1400);
    });
  } finally {
    btn.disabled = false; btn.innerHTML = '<span>🚀</span> Ingresar';
  }
}

window.doLogout = function() {
  closeM('mLogout');
  localStorage.removeItem(LS_SES);
  currentUser = null;
  if (unsubVehicles) unsubVehicles();
  if (unsubSales) unsubSales();
  if (unsubUsers) unsubUsers();
  if (unsubCurrentUser) unsubCurrentUser();
  unsubVehicles = unsubSales = unsubUsers = unsubCurrentUser = null;
  prevPermisos = {};
  Object.values(sessions).forEach(s => { if (s.timerId) clearInterval(s.timerId); });
  sessions = {};
  vehicles = []; allSales = []; users = [];
  document.getElementById('app').style.display = 'none';
  showLogin();
};

// ══════════════════════════════════════════
//  SETUP APP + LISTENERS EN TIEMPO REAL
// ══════════════════════════════════════════
async function showApp() {
  document.getElementById('app').style.display = 'flex';
  // Inicializar snapshot previo de permisos al entrar
  prevPermisos = { ...(currentUser?.permisos || {}) };
  setupTopbar(); buildTabs();
  subscribeCurrentUser();
  subscribeVehicles();
  subscribeSales();
  if (isAdmin()) subscribeUsers();
}

function subscribeVehicles() {
  if (unsubVehicles) unsubVehicles();
  unsubVehicles = onSnapshot(collection(db, 'vehicles'), snap => {
    vehicles = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderHome();
    if (isAdmin()) { renderAdmin(); renderPanel(); }
    vehicles.forEach(v => {
      if ((v.status === 'in-use') && v.timerEndAt && !sessions[v.id]) {
        const endTime = v.timerEndAt.toMillis ? v.timerEndAt.toMillis() : v.timerEndAt;
        if (endTime > Date.now()) startTimer(v.id, endTime);
        else handleTimeOver(v.id);
      }
    });
  });
}

function subscribeSales() {
  if (unsubSales) unsubSales();
  const q = query(collection(db, 'sales'), orderBy('date', 'desc'));
  unsubSales = onSnapshot(q, snap => {
    allSales = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id, ...data,
        date: data.date?.toMillis ? data.date.toMillis() : data.date
      };
    });
    renderHome();
    renderHistory();
    if (hasPermiso('verStats')) renderStats();
    if (isAdmin()) renderPanel();
  });
}

function subscribeUsers() {
  if (unsubUsers) unsubUsers();
  unsubUsers = onSnapshot(collection(db, 'users'), snap => {
    users = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (isAdmin()) renderPanel();
  });
}

// ── LISTENER EN TIEMPO REAL DEL USUARIO ACTUAL ──
function subscribeCurrentUser() {
  if (unsubCurrentUser) unsubCurrentUser();
  if (!currentUser?.id) return;
  unsubCurrentUser = onSnapshot(doc(db, 'users', currentUser.id), snap => {
    if (!snap.exists()) return;
    const updatedData = { id: snap.id, ...snap.data() };
    const oldPerms = currentUser?.permisos || {};
    const newPerms = updatedData?.permisos || {};

    // Detectar permisos NUEVOS (pasaron de false/undefined → true)
    const permisosGanados = PERMISOS_DEF.filter(p =>
      !oldPerms[p.key] && !!newPerms[p.key]
    );
    // Detectar permisos REVOCADOS (pasaron de true → false/undefined)
    const permisosRevocados = PERMISOS_DEF.filter(p =>
      !!oldPerms[p.key] && !newPerms[p.key]
    );

    // Actualizar currentUser en memoria y localStorage
    currentUser = updatedData;
    localStorage.setItem(LS_SES, JSON.stringify({ id: currentUser.id, username: currentUser.username }));

    // Si no es admin, reconstruir UI con nuevos permisos
    if (!isAdmin()) {
      buildTabs();
      renderHistory();
      if (hasPermiso('verStats')) renderStats();

      // Mostrar notificación de permisos ganados
      if (permisosGanados.length > 0) {
        setTimeout(() => showPermisoCelebration(permisosGanados), 300);
      }
      // Mostrar notificación de permisos revocados
      if (permisosRevocados.length > 0) {
        setTimeout(() => showPermisoRevocado(permisosRevocados), 300);
      }
    }
  });
}

// ── CELEBRACIÓN DE NUEVO PERMISO ──
function showPermisoCelebration(permisos) {
  // Construir contenido del modal
  const permList = permisos.map(p => `
    <div class="perm-cel-item">
      <div class="perm-cel-icon-wrap">${p.icon}</div>
      <div class="perm-cel-info">
        <div class="perm-cel-label">${p.label}</div>
        <div class="perm-cel-desc">${p.desc}</div>
      </div>
    </div>`).join('');

  document.getElementById('permCelContent').innerHTML = permList;
  document.getElementById('permCelTitle').textContent =
    permisos.length === 1 ? '¡Tienes un nuevo permiso!' : `¡Tienes ${permisos.length} nuevos permisos!`;
  openM('mPermCel');
  playPermSound();
  launchConfetti();
}

// ── REVOCACIÓN DE PERMISO ──
function showPermisoRevocado(permisos) {
  const names = permisos.map(p => `${p.icon} ${p.label}`).join(', ');
  toast(`⚠️ Permiso revocado: ${names}`);
}

// ── CONFETTI LIGERO ──
function launchConfetti() {
  const canvas = document.getElementById('confettiCanvas');
  if (!canvas) return;
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  const pieces = Array.from({length: 60}, () => ({
    x: Math.random() * canvas.width,
    y: -10 - Math.random() * 80,
    r: 5 + Math.random() * 7,
    d: 2 + Math.random() * 3,
    color: ['#7C3AED','#A78BFA','#F59E0B','#10B981','#EC4899','#3B82F6'][Math.floor(Math.random()*6)],
    rot: Math.random() * 360,
    spin: (Math.random() - 0.5) * 8,
    shape: Math.random() > 0.5 ? 'rect' : 'circle'
  }));
  let frame;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      ctx.save(); ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI / 180);
      if (p.shape === 'rect') ctx.fillRect(-p.r/2, -p.r/3, p.r, p.r/1.8);
      else { ctx.beginPath(); ctx.arc(0,0,p.r/2,0,Math.PI*2); ctx.fill(); }
      ctx.restore();
      p.y += p.d; p.x += Math.sin(p.y * 0.03) * 1.2; p.rot += p.spin;
    });
    if (pieces.some(p => p.y < canvas.height + 20)) frame = requestAnimationFrame(draw);
    else { ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.style.display = 'none'; }
  }
  draw();
  setTimeout(() => { cancelAnimationFrame(frame); ctx.clearRect(0,0,canvas.width,canvas.height); canvas.style.display='none'; }, 4000);
}

// ── SONIDO DE CELEBRACIÓN ──
function playPermSound() {
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    [[523,.0,.12],[659,.13,.12],[784,.26,.12],[1047,.39,.25],[784,.55,.1],[1047,.67,.3]].forEach(([f,s,d]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.3, ctx.currentTime + s);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + s + d);
      o.start(ctx.currentTime + s); o.stop(ctx.currentTime + s + d + 0.05);
    });
  } catch(_) {}
}

// ══════════════════════════════════════════
//  SETUP TOPBAR / TABS
// ══════════════════════════════════════════
function setupTopbar() {
  const u = currentUser;
  const av = document.getElementById('tbAv');
  av.textContent = u.name.charAt(0).toUpperCase(); av.className = 'tb-av ' + u.role;
  document.getElementById('tbUname').textContent = u.name;
  const rb = document.getElementById('tbRbadge');
  rb.textContent = u.role === 'admin' ? 'Admin' : 'Empleado'; rb.className = 'tb-rbadge ' + u.role;
  document.getElementById('btnAdd').style.display = isAdmin() ? 'flex' : 'none';
  document.getElementById('loIco').textContent = u.role === 'admin' ? '👑' : '👷';
  document.getElementById('loName').textContent = u.name;
  document.getElementById('loRole').textContent = u.role === 'admin' ? 'Administrador — acceso total' : 'Empleado · @' + u.username;
}

function buildTabs() {
  let tabs = [{k:'home',l:'🏠 Inicio'},{k:'history',l:'📋 Ventas'}];
  if (hasPermiso('verStats')) tabs.push({k:'stats',l:'📈 Stats'});
  if (isAdmin()) {
    tabs.push({k:'admin',l:'🚗 Carros'},{k:'panel',l:'👑 Panel Admin'});
  }
  document.getElementById('tabsBar').innerHTML = tabs.map(t =>
    `<button class="tab-btn${t.k==='home'?' active':''}" data-tab="${t.k}" onclick="switchTab('${t.k}')">${t.l}</button>`
  ).join('');
  const b = document.getElementById('roleBanner');
  b.style.display = 'flex'; b.className = 'role-banner ' + (isAdmin() ? 'admin' : 'employee');
  b.innerHTML = isAdmin()
    ? `<span style="font-size:18px">👑</span>Hola, <strong>${currentUser.name}</strong> &nbsp;·&nbsp; Administrador`
    : `<span style="font-size:18px">👷</span>Hola, <strong>${currentUser.name}</strong> &nbsp;·&nbsp; Empleado`;
}

window.switchTab = function(k) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === k));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-' + k); if (el) el.classList.add('active');
  if (k === 'history') renderHistory();
  if (k === 'stats') renderStats();
  if (k === 'admin') renderAdmin();
  if (k === 'panel') renderPanel();
};

// ══════════════════════════════════════════
//  RENDER HOME
// ══════════════════════════════════════════
function renderHome() {
  const today = todaySales();
  const inUse = vehicles.filter(v => v.status === 'in-use' || v.status === 'time-over');
  const avail = vehicles.filter(v => v.status === 'available');
  const total = today.reduce((s, x) => s + x.price, 0);
  setText('dTotal','S/'+total); setText('dCount',today.length);
  setText('dInUse',inUse.length); setText('dAvail',avail.length); setText('badgeAvail',avail.length);
  document.getElementById('secActive').style.display = inUse.length ? '' : 'none';
  document.getElementById('gridActive').innerHTML = inUse.map(v => cardHTML(v)).join('');
  document.getElementById('emptyVeh').style.display = vehicles.length === 0 ? '' : 'none';
  document.getElementById('gridAvail').innerHTML = avail.map(v => cardHTML(v)).join('');
}

function cardHTML(v) {
  const inUse = v.status === 'in-use', over = v.status === 'time-over';
  const pL = v.type === 'large' ? 'S/10×10min' : 'S/5×10min';
  const tL = v.type === 'large' ? '🚙 Grande' : '🚗 Pequeño';
  let timer = '', acts = '';
  if (inUse) {
    const se = sessions[v.id];
    const rem = se ? Math.max(0, se.endTime - Date.now()) : 0;
    timer = `<div class="vc-timer" id="tmr-${v.id}">${fmtTime(rem)}</div>`;
    acts = `<div class="vc-acts"><button class="vbtn vbtn-a" onclick="extendVeh('${v.id}',10)">+10 min</button><button class="vbtn vbtn-r" onclick="freeVeh('${v.id}')">Liberar</button></div>`;
  } else if (over) {
    timer = `<div class="vc-timer urgent" id="tmr-${v.id}">⏰ FIN</div>`;
    acts = `<div class="vc-acts"><button class="vbtn vbtn-a" onclick="extendVeh('${v.id}',10)">+10 min</button><button class="vbtn vbtn-t" onclick="freeVeh('${v.id}')">Liberar</button></div>`;
  } else {
    const editBtn = isAdmin() ? `<button class="vbtn vbtn-e" onclick="openEditModal('${v.id}')">✏️</button>` : '';
    acts = `<div class="vc-acts"><button class="vbtn vbtn-p" onclick="openRentModal('${v.id}')">🚀 Alquilar</button>${editBtn}</div>`;
  }
  return `<div class="vc ${v.status}" id="vc-${v.id}">
    <div class="vc-top"><span class="vc-dot"></span><span class="vc-emoji">${v.emoji}</span></div>
    <div class="vc-body"><div class="vc-name">${v.name}</div><div class="vc-type">${tL}</div><div class="vc-price">${pL}</div></div>
    ${timer}${acts}</div>`;
}

// ══════════════════════════════════════════
//  RENDER HISTORY
// ══════════════════════════════════════════
function renderHistory() {
  const sales = filteredSales();
  const list = document.getElementById('saleList'), empty = document.getElementById('emptySales');

  // Controlar botón exportar CSV según permiso
  const exportBtn = document.getElementById('btnExportCSV');
  if (exportBtn) exportBtn.style.display = hasPermiso('exportarCSV') ? '' : 'none';

  // Controlar filtros de historial completo
  const filterWeek = document.getElementById('fbWeek');
  const filterAll = document.getElementById('fbAll');
  if (filterWeek) filterWeek.style.display = hasPermiso('verHistorialCompleto') ? '' : 'none';
  if (filterAll) filterAll.style.display = hasPermiso('verHistorialCompleto') ? '' : 'none';

  if (!sales.length) { list.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';

  const canEditPago = hasPermiso('editarPago');

  list.innerHTML = [...sales].map(s => {
    const d = new Date(s.date);
    const dt = d.toLocaleDateString('es-PE',{day:'numeric',month:'short'});
    const tm = d.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'});
    const pay = s.payment === 'yape' ? '💜 Yape' : '💵 Efectivo';
    const by = s.by ? ` · ${s.by}` : '';
    const editBtn = canEditPago
      ? `<button class="edit-pay-btn" onclick="openEditPagoModal('${s.id}','${s.payment}')" title="Editar método de pago">✏️</button>`
      : '';
    return `<div class="si">
      <div class="si-emoji">${s.vEmoji||'🚗'}</div>
      <div class="si-info">
        <div class="si-name">${s.vName}</div>
        <div class="si-det">${s.min} min · ${dt} ${tm}${by}</div>
      </div>
      <div class="si-right">
        <div class="si-price">S/${s.price}</div>
        <div class="si-pay-row">${editBtn}<span class="si-pay">${pay}</span></div>
      </div></div>`;
  }).join('');
}

// ══════════════════════════════════════════
//  RENDER STATS
// ══════════════════════════════════════════
function renderStats() {
  if (!hasPermiso('verStats')) return;
  const today = todaySales();
  const total = today.reduce((s,x)=>s+x.price,0);
  const min = today.reduce((s,x)=>s+x.min,0);
  const yape = today.filter(x=>x.payment==='yape').reduce((s,x)=>s+x.price,0);
  const cash = today.filter(x=>x.payment==='cash').reduce((s,x)=>s+x.price,0);
  const usage = {}; today.forEach(s => { usage[s.vName] = (usage[s.vName]||0)+1; });
  const top = Object.entries(usage).sort((a,b)=>b[1]-a[1])[0];
  setText('stTotal','S/'+total); setText('stCount',today.length); setText('stMin',min+' min'); setText('stTop',top?top[0]:'—');
  setText('stYape','S/'+yape); setText('stCash','S/'+cash);
  const maxC = Math.max(...Object.values(usage),1);
  document.getElementById('usageWrap').innerHTML = Object.keys(usage).length
    ? Object.entries(usage).sort((a,b)=>b[1]-a[1]).map(([nm,cnt])=>`<div class="u-item"><div class="u-label"><span>${nm}</span><span>${cnt}</span></div><div class="u-track"><div class="u-fill" style="width:${Math.round(cnt/maxC*100)}%"></div></div></div>`).join('')
    : '<div class="empty"><span class="empty-ico">📊</span>Sin datos hoy.</div>';
}

// ══════════════════════════════════════════
//  RENDER ADMIN + PANEL
// ══════════════════════════════════════════
function renderAdmin() {
  if (!isAdmin()) return;
  const list = document.getElementById('adminList'), empty = document.getElementById('emptyAdmin');
  if (!vehicles.length) { list.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';
  const sl = { available:'🟢 Disponible','in-use':'🟡 En uso','time-over':'🔴 Tiempo terminado' };
  list.innerHTML = vehicles.map(v => `<div class="av-item" onclick="openEditModal('${v.id}')">
    <span class="av-emoji">${v.emoji}</span>
    <div class="av-info"><div class="av-name">${v.name}</div><div class="av-type">${v.type==='large'?'🚙 Grande · S/10×10min':'🚗 Pequeño · S/5×10min'}</div><span class="av-stat ${v.status}">${sl[v.status]||v.status}</span></div>
    <span class="av-arrow">›</span></div>`).join('');
}

function renderPanel() {
  if (!isAdmin()) return;
  const today = todaySales();
  const total = today.reduce((s,x)=>s+x.price,0);
  const yape = today.filter(x=>x.payment==='yape').reduce((s,x)=>s+x.price,0);
  const cash = today.filter(x=>x.payment==='cash').reduce((s,x)=>s+x.price,0);
  setText('apTotal','S/'+total); setText('apCount',today.length); setText('apYape','S/'+yape); setText('apCash','S/'+cash);
  setText('apFleetN', vehicles.length);
  const stLbl = { available:'🟢 Disponible','in-use':'🟡 En uso','time-over':'🔴 Fin' };
  document.getElementById('apFleetList').innerHTML = vehicles.map(v=>`<div class="ap-row" onclick="openEditModal('${v.id}');switchTab('admin')">
    <span class="ap-row-ico">${v.emoji}</span><div class="ap-row-info"><div class="ap-row-name">${v.name}</div><div class="ap-row-sub">${v.type==='large'?'Grande':'Pequeño'} · ${stLbl[v.status]||v.status}</div></div><span style="color:var(--tx2)">›</span></div>`).join('')
    || '<div style="padding:12px 15px;font-size:13px;color:var(--tx2)">Sin vehículos</div>';

  const emps = users.filter(u => u.role === 'employee');
  setText('apEmpN', emps.length);
  document.getElementById('apEmpList').innerHTML = emps.map(u => {
    const permsCount = Object.values(u.permisos || {}).filter(Boolean).length;
    return `<div class="ap-row" onclick="openEditUserModal('${u.id}')">
      <span class="ap-row-ico">👷</span>
      <div class="ap-row-info">
        <div class="ap-row-name">${u.name}</div>
        <div class="ap-row-sub">@${u.username} · <span class="perm-count-badge">${permsCount} permiso${permsCount !== 1 ? 's' : ''}</span></div>
      </div>
      <span style="color:var(--tx2)">›</span></div>`;
  }).join('') || '<div style="padding:12px 15px;font-size:13px;color:var(--tx2)">Sin empleados</div>';
}

// ══════════════════════════════════════════
//  MODAL EDITAR PAGO
// ══════════════════════════════════════════
window.openEditPagoModal = function(saleId, currentPayment) {
  if (!hasPermiso('editarPago')) {
    toast('⛔ No tienes permiso para editar pagos');
    return;
  }
  editSaleId = saleId;
  // Seleccionar el método actual
  selEditPay(currentPayment || 'yape');
  openM('mEditPago');
};

window.selEditPay = function(p) {
  document.getElementById('editPayYape').classList.toggle('active', p === 'yape');
  document.getElementById('editPayCash').classList.toggle('active', p === 'cash');
  document.getElementById('mEditPago').dataset.selectedPay = p;
};

window.confirmEditPago = async function() {
  if (!editSaleId) return;
  const newPay = document.getElementById('mEditPago').dataset.selectedPay || 'yape';
  try {
    await updateDoc(doc(db, 'sales', editSaleId), { payment: newPay });
    closeM('mEditPago');
    toast('✅ Método de pago actualizado');
    editSaleId = null;
  } catch(e) {
    console.error('Error editando pago:', e);
    toast('❌ Error al actualizar pago');
  }
};

// ══════════════════════════════════════════
//  ALQUILER
// ══════════════════════════════════════════
window.openRentModal = function(id) {
  const v = vehicles.find(x => x.id === id); if (!v) return;
  rentVehId = id; rentMin = 10; rentPay = 'yape';
  setText('mRentTitle', v.name);
  document.getElementById('mRentEmoji').textContent = v.emoji;
  updRentUI(v.type); selPay('yape');
  document.querySelectorAll('.qt').forEach(b => b.classList.remove('active'));
  openM('mRent');
};

window.adjTime = function(d) {
  const v = vehicles.find(x=>x.id===rentVehId);
  const n = rentMin + d; if (n < 10) return;
  rentMin = n; updRentUI(v?.type||'small');
  document.querySelectorAll('.qt').forEach(b => b.classList.remove('active')); animPop('tVal');
};

window.setT = function(m) {
  const v = vehicles.find(x=>x.id===rentVehId);
  rentMin = m; updRentUI(v?.type||'small');
  document.querySelectorAll('.qt').forEach(b => b.classList.toggle('active', parseInt(b.textContent)===m)); animPop('tVal');
};

function updRentUI(t) { setText('tVal',rentMin); setText('pbAmt','S/'+calcPrice(t,rentMin)); animPop('pbAmt'); }

window.selPay = function(p) {
  rentPay = p;
  document.getElementById('payYape').classList.toggle('active',p==='yape');
  document.getElementById('payCash').classList.toggle('active',p==='cash');
};

window.confirmRent = async function() {
  const v = vehicles.find(x=>x.id===rentVehId); if (!v) return;
  const price = calcPrice(v.type, rentMin);
  const endTime = Date.now() + rentMin * 60 * 1000;
  closeM('mRent');
  try {
    await updateDoc(doc(db,'vehicles',v.id), {
      status: 'in-use',
      timerEndAt: Timestamp.fromMillis(endTime)
    });
    await addDoc(collection(db,'sales'), {
      vId: v.id, vName: v.name, vEmoji: v.emoji, vType: v.type,
      min: rentMin, price, payment: rentPay,
      date: Timestamp.now(), by: currentUser?.username || '?'
    });
    startTimer(v.id, endTime);
    toast(`🚀 ${v.name} · S/${price}`);
  } catch(e) {
    console.error('Error al confirmar alquiler:', e);
    toast('❌ Error al guardar. Revisa tu conexión.');
  }
};

// ══════════════════════════════════════════
//  CRONÓMETRO
// ══════════════════════════════════════════
function startTimer(vehicleId, endTime) {
  if (sessions[vehicleId]?.timerId) clearInterval(sessions[vehicleId].timerId);
  const timerId = setInterval(() => {
    const rem = endTime - Date.now();
    const el = document.getElementById('tmr-' + vehicleId);
    if (rem <= 0) {
      clearInterval(timerId);
      delete sessions[vehicleId];
      handleTimeOver(vehicleId);
      return;
    }
    if (el) { el.textContent = fmtTime(rem); el.classList.toggle('urgent', rem < 60000); }
  }, 1000);
  sessions[vehicleId] = { endTime, timerId };
  const el = document.getElementById('tmr-' + vehicleId);
  if (el) el.textContent = fmtTime(Math.max(0, endTime - Date.now()));
}

async function handleTimeOver(vehicleId) {
  const v = vehicles.find(x => x.id === vehicleId);
  try {
    await updateDoc(doc(db,'vehicles',vehicleId), { status: 'time-over', timerEndAt: null });
  } catch(e) { console.error('Error actualizando time-over:', e); }
  playAlert();
  tuVehId = vehicleId;
  setText('tuMsg', `"${v?.name||'Vehículo'}" ha terminado. ¿Agregar 10 minutos?`);
  openM('mTimeUp');
}

window.extendVeh = async function(id, extra) {
  const se = sessions[id];
  const base = se?.endTime || Date.now();
  const newEnd = Math.max(base, Date.now()) + extra * 60 * 1000;
  const v = vehicles.find(x=>x.id===id);
  try {
    await updateDoc(doc(db,'vehicles',id), { status: 'in-use', timerEndAt: Timestamp.fromMillis(newEnd) });
    startTimer(id, newEnd);
    toast(`⏱ +${extra} min · S/${calcPrice(v?.type||'small',extra)}`);
  } catch(e) { toast('❌ Error al extender tiempo.'); }
};

window.freeVeh = async function(id) {
  if (sessions[id]?.timerId) { clearInterval(sessions[id].timerId); delete sessions[id]; }
  try {
    await updateDoc(doc(db,'vehicles',id), { status: 'available', timerEndAt: null });
    toast('🟢 Vehículo liberado');
  } catch(e) { toast('❌ Error al liberar vehículo.'); }
};

window.addTenFromAlert = function() { closeM('mTimeUp'); if (tuVehId) extendVeh(tuVehId, 10); };

// ══════════════════════════════════════════
//  VEHICLE CRUD (solo admin)
// ══════════════════════════════════════════
window.openAddModal = function() {
  if (!isAdmin()) { toast('⛔ Solo el administrador puede agregar vehículos'); return; }
  editVehId = null; vType = 'small'; vEmoji = '🚗';
  setText('mVehTitle','Agregar Vehículo');
  document.getElementById('vName').value = '';
  document.getElementById('btnDel').style.display = 'none';
  selType('small'); selEmoji('🚗'); openM('mVeh');
};

window.openEditModal = function(id) {
  if (!isAdmin()) { toast('⛔ Solo el administrador puede editar'); return; }
  const v = vehicles.find(x=>x.id===id); if (!v) return;
  editVehId = id; vType = v.type; vEmoji = v.emoji;
  setText('mVehTitle','Editar Vehículo');
  document.getElementById('vName').value = v.name;
  document.getElementById('btnDel').style.display = '';
  selType(v.type); selEmoji(v.emoji); openM('mVeh');
};

window.selType = function(t) {
  vType = t;
  document.getElementById('tSmall').classList.toggle('active',t==='small');
  document.getElementById('tLarge').classList.toggle('active',t==='large');
};

function buildEmojiGrid() {
  document.getElementById('emojiGrid').innerHTML = EMOJIS.map(e =>
    `<button class="ebtn" data-e="${e}" onclick="selEmoji('${e}')">${e}</button>`
  ).join('');
}

window.selEmoji = function(e) {
  vEmoji = e;
  document.querySelectorAll('.ebtn').forEach(b => b.classList.toggle('active', b.dataset.e === e));
};

window.saveVehicle = async function() {
  if (!isAdmin()) return;
  const name = document.getElementById('vName').value.trim();
  if (!name) { toast('⚠️ Escribe el nombre'); return; }
  try {
    if (editVehId) {
      await updateDoc(doc(db,'vehicles',editVehId), { name, type: vType, emoji: vEmoji });
      toast('✅ Vehículo actualizado');
    } else {
      await addDoc(collection(db,'vehicles'), { name, type: vType, emoji: vEmoji, status: 'available', timerEndAt: null });
      toast('✅ Vehículo agregado');
    }
    closeM('mVeh');
  } catch(e) { toast('❌ Error al guardar vehículo.'); }
};

window.deleteVehicle = async function() {
  if (!isAdmin() || !editVehId || !confirm('¿Eliminar este vehículo?')) return;
  if (sessions[editVehId]?.timerId) { clearInterval(sessions[editVehId].timerId); delete sessions[editVehId]; }
  try {
    await deleteDoc(doc(db,'vehicles',editVehId));
    closeM('mVeh'); toast('🗑️ Vehículo eliminado');
  } catch(e) { toast('❌ Error al eliminar.'); }
};

// ══════════════════════════════════════════
//  USER CRUD + PERMISOS (solo admin)
// ══════════════════════════════════════════
window.openAddUserModal = function() {
  if (!isAdmin()) return;
  editUserId = null; newURole = 'employee'; editUserPerms = {};
  setText('mUserTitle','Agregar Empleado');
  document.getElementById('uName').value = '';
  document.getElementById('uUser').value = '';
  document.getElementById('uPass').value = '';
  document.getElementById('btnDelUser').style.display = 'none';
  selURole('employee');
  renderPermsUI({});
  openM('mUser');
};

window.openEditUserModal = function(id) {
  if (!isAdmin()) return;
  const u = users.find(x=>x.id===id); if (!u) return;
  editUserId = id; newURole = u.role; editUserPerms = { ...(u.permisos || {}) };
  setText('mUserTitle','Editar Usuario');
  document.getElementById('uName').value = u.name;
  document.getElementById('uUser').value = u.username;
  document.getElementById('uPass').value = '';
  document.getElementById('btnDelUser').style.display = (u.isMainAdmin) ? 'none' : '';
  selURole(u.role);
  renderPermsUI(editUserPerms);
  openM('mUser');
};

window.selURole = function(r) {
  newURole = r;
  document.getElementById('rEmp').classList.toggle('active',r==='employee');
  document.getElementById('rAdm').classList.toggle('active',r==='admin');
  // Mostrar/ocultar sección de permisos según rol
  const permsSection = document.getElementById('permsSection');
  if (permsSection) permsSection.style.display = r === 'employee' ? '' : 'none';
};

function renderPermsUI(perms) {
  const container = document.getElementById('permsContainer');
  if (!container) return;
  container.innerHTML = PERMISOS_DEF.map(p => {
    const active = !!(perms[p.key]);
    return `<div class="perm-item ${active ? 'active' : ''}" id="permItem-${p.key}" onclick="togglePerm('${p.key}')">
      <div class="perm-left">
        <span class="perm-icon">${p.icon}</span>
        <div class="perm-info">
          <div class="perm-label">${p.label}</div>
          <div class="perm-desc">${p.desc}</div>
        </div>
      </div>
      <div class="perm-toggle ${active ? 'on' : ''}" id="permToggle-${p.key}">
        <div class="perm-knob"></div>
      </div>
    </div>`;
  }).join('');
}

window.togglePerm = function(key) {
  editUserPerms[key] = !editUserPerms[key];
  const item = document.getElementById('permItem-' + key);
  const toggle = document.getElementById('permToggle-' + key);
  if (item) item.classList.toggle('active', editUserPerms[key]);
  if (toggle) toggle.classList.toggle('on', editUserPerms[key]);
};

window.saveUser = async function() {
  if (!isAdmin()) return;
  const name = document.getElementById('uName').value.trim();
  const username = document.getElementById('uUser').value.trim().toLowerCase();
  const password = document.getElementById('uPass').value;
  if (!name || !username) { toast('⚠️ Completa nombre y usuario'); return; }
  try {
    const permsToSave = newURole === 'employee' ? editUserPerms : {};
    if (editUserId) {
      const updateData = { name, username, role: newURole, permisos: permsToSave };
      if (password.length >= 4) updateData.password = password;
      await updateDoc(doc(db,'users',editUserId), updateData);
      if (currentUser.id === editUserId) {
        currentUser = { ...currentUser, ...updateData };
        localStorage.setItem(LS_SES, JSON.stringify({ id: currentUser.id, username: currentUser.username }));
        setupTopbar(); buildTabs();
      }
      toast('✅ Usuario actualizado');
    } else {
      const q = query(collection(db,'users'), where('username','==',username));
      const snap = await getDocs(q);
      if (!snap.empty) { toast('⚠️ Ese usuario ya existe'); return; }
      if (password.length < 4) { toast('⚠️ Contraseña mínimo 4 caracteres'); return; }
      await addDoc(collection(db,'users'), {
        name, username, password, role: newURole,
        isMainAdmin: false, permisos: permsToSave
      });
      toast('✅ Empleado agregado');
    }
    closeM('mUser');
  } catch(e) {
    console.error('Error guardando usuario:', e);
    toast('❌ Error al guardar usuario.');
  }
};

window.deleteUser = async function() {
  if (!isAdmin() || !editUserId) return;
  const u = users.find(x=>x.id===editUserId);
  if (u?.isMainAdmin) { toast('⛔ No puedes eliminar al admin principal'); return; }
  if (editUserId === currentUser.id) { toast('⛔ No puedes eliminarte a ti mismo'); return; }
  if (!confirm('¿Eliminar este usuario?')) return;
  try {
    await deleteDoc(doc(db,'users',editUserId));
    closeM('mUser'); toast('🗑️ Usuario eliminado');
  } catch(e) { toast('❌ Error al eliminar usuario.'); }
};

// ══════════════════════════════════════════
//  HISTORIAL / STATS / CSV
// ══════════════════════════════════════════
function todaySales() {
  const s = new Date(); s.setHours(0,0,0,0);
  return allSales.filter(x => x.date >= s.getTime());
}

function filteredSales() {
  const now = Date.now(), day = 86400000, week = 7*day;
  // Si no tiene permiso de historial completo, solo hoy
  if (!hasPermiso('verHistorialCompleto')) return allSales.filter(x => x.date >= now - day);
  if (histFilter === 'today') return allSales.filter(x => x.date >= now - day);
  if (histFilter === 'week') return allSales.filter(x => x.date >= now - week);
  return allSales;
}

window.setFilter = function(btn, f) {
  if (!hasPermiso('verHistorialCompleto') && f !== 'today') {
    toast('⛔ No tienes permiso para ver historial completo');
    return;
  }
  histFilter = f;
  document.querySelectorAll('.fb').forEach(b => b.classList.toggle('active',b.dataset.f===f));
  renderHistory();
};

window.exportCSV = function() {
  if (!hasPermiso('exportarCSV')) { toast('⛔ No tienes permiso para exportar'); return; }
  const sales = filteredSales(); if (!sales.length) { toast('Sin ventas para exportar'); return; }
  const h = 'Vehículo,Tipo,Minutos,Precio,Pago,Empleado,Fecha,Hora';
  const rows = sales.map(s => {
    const d = new Date(s.date);
    return `"${s.vName}","${s.vType==='large'?'Grande':'Pequeño'}",${s.min},"S/${s.price}","${s.payment==='yape'?'Yape':'Efectivo'}","${s.by||'?'}","${d.toLocaleDateString('es-PE')}","${d.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})}"`;
  });
  const blob = new Blob(['\uFEFF'+[h,...rows].join('\n')],{type:'text/csv;charset=utf-8;'});
  const a = Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:`nexora_${Date.now()}.csv`});
  a.click(); toast('📁 CSV exportado');
};

window.resetDay = async function() {
  if (!isAdmin() || !confirm('¿Borrar ventas de hoy?')) return;
  const s = new Date(); s.setHours(0,0,0,0);
  const todayStart = Timestamp.fromMillis(s.getTime());
  try {
    const q = query(collection(db,'sales'), where('date','>=',todayStart));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    toast('🔄 Datos del día borrados');
  } catch(e) { toast('❌ Error al resetear.'); }
};

// ══════════════════════════════════════════
//  UTILS
// ══════════════════════════════════════════
window.openM = function(id) { document.getElementById(id).style.display = 'flex'; };
window.closeM = function(id) { document.getElementById(id).style.display = 'none'; };

document.addEventListener('click', e => {
  ['mRent','mVeh','mTimeUp','mLogout','mUser','mEditPago'].forEach(id => {
    const el = document.getElementById(id); if (el && e.target === el) closeM(id);
  });
});

function calcPrice(type, min) { return (min/10) * (type==='large'?10:5); }
function fmtTime(ms) { const s = Math.max(0,Math.floor(ms/1000)); return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
function setText(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }
function animPop(id) { const e = document.getElementById(id); if (!e) return; e.style.animation='none'; e.offsetHeight; e.style.animation='numPop .2s ease'; }
const isAdmin = () => currentUser?.role === 'admin';

let tTimer = null;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(tTimer); tTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function playAlert() {
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    [[880,0,.18],[660,.22,.18],[880,.44,.18],[440,.66,.35]].forEach(([f,s,d]) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.connect(g); g.connect(ctx.destination);
      o.type='sine'; o.frequency.value=f; g.gain.setValueAtTime(.4,ctx.currentTime+s);
      g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+s+d); o.start(ctx.currentTime+s); o.stop(ctx.currentTime+s+d+.05);
    });
  } catch(_) {}
}
