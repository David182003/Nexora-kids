import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
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
const db  = getFirestore(app);

// ══════════════════════════════════════════
//  CONSTANTES
// ══════════════════════════════════════════
const LS_SES   = 'nkm_session_v4';
const EMOJIS   = ['🚗','🚙','🏎️','🚕','🚓','🚒','🚑','🏍️','⚡','🌈','🚀','🛻'];
const TR_EMOJIS = ['🦘','🤸','🧒','👦','👧','🐸','⭐','🎯','🎪','🎠','🌟','🏅'];
// Slots fijos del trampolín — se crean en Firestore si no existen
const TR_SLOTS_DEFAULT = [
  { num:1, label:'Trampolín 1', emoji:'🦘' },
  { num:2, label:'Trampolín 2', emoji:'🦘' },
  { num:3, label:'Trampolín 3', emoji:'🦘' },
  { num:4, label:'Trampolín 4', emoji:'🦘' },
  { num:5, label:'Trampolín 5', emoji:'🦘' },
  { num:6, label:'Trampolín 6', emoji:'🦘' },
];

const PERMISOS_DEF = [
  { key:'editarPago',           icon:'💳', label:'Editar método de pago',    desc:'Puede cambiar el método de pago (Yape/Efectivo) en ventas registradas' },
  { key:'cancelarViaje',        icon:'🚫', label:'Cancelar viaje',           desc:'Puede cancelar el viaje en curso y liberar el vehículo sin contar la venta' },
  { key:'verStats',             icon:'📈', label:'Ver estadísticas',         desc:'Acceso a la pestaña de estadísticas del día' },
  { key:'exportarCSV',          icon:'📁', label:'Exportar CSV',             desc:'Puede descargar el historial de ventas en CSV' },
  { key:'verHistorialCompleto', icon:'📋', label:'Ver historial completo',   desc:'Puede ver todo el historial (semana/todo), no solo el de hoy' },
  { key:'gestionarTrampolin',   icon:'🦘', label:'Gestionar trampolín',      desc:'Puede agregar, extender y finalizar sesiones de trampolín' },
  { key:'cierreCaja',           icon:'🏦', label:'Notificación de ganancias', desc:'Recibe una notificación automática con sus ganancias cuando el admin cierra la caja' }
];

// ══════════════════════════════════════════
//  ESTADO — VEHÍCULOS
// ══════════════════════════════════════════
let currentUser   = null;
let vehicles      = [];
let allSales      = [];
let users         = [];
let sessions      = {};        // timers de vehículos
let histFilter    = 'today';
let rentVehId     = null, rentMin = 10, rentPay = 'yape';
let editVehId     = null, vType = 'small', vEmoji = '🚗';
let editUserId    = null, newURole = 'employee';
let tuVehId       = null;
let cancelVehId   = null;
let editSaleId    = null;
let prevPermisos  = {};
let editUserPerms = {};
let unsubVehicles = null, unsubSales = null, unsubUsers = null, unsubCurrentUser = null;
let unsubCierres  = null; // listener de cierres de caja en tiempo real

// ══════════════════════════════════════════
//  ESTADO — TRAMPOLÍN
// ══════════════════════════════════════════
let trSlots            = [];   // slots fijos (como vehicles)
let trTimers           = {};   // timers por slotId
let trampolineConfig   = { paquetes:[{min:10,precio:5},{min:20,precio:10},{min:30,precio:15}] };
let rentSlotId         = null; // slot que se está alquilando
let rentKidMinutes     = 20;
let rentKidPrecio      = 10;
let rentKidPay         = 'yape';
let unsubTrSlots       = null;
let unsubTrampolineCfg = null;
let unsubComisionCfg   = null;

// Config de comisiones — editable desde el panel admin
// tramos: [{ desde, pago }]  (el primer tramo < 100 usa fórmula automática)
let comisionConfig = {
  tramos: [
    { desde: 100, pago: 45 },
    { desde: 200, pago: 60 },
    { desde: 300, pago: 80 },
    { desde: 400, pago: 100 },
    { desde: 500, pago: 120 },
    { desde: 600, pago: 140 },
    { desde: 700, pago: 160 },
    { desde: 800, pago: 180 },
  ]
};

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
          const snap = await getDoc(doc(db,'users',saved.id));
          if (snap.exists()) {
            const u = { id:snap.id, ...snap.data() };
            if (u.username === saved.username) { currentUser = u; showApp(); return; }
          }
        } catch(e) { console.error(e); }
      }
      showLogin();
    }, 500);
  }, 1900);
});

// ══════════════════════════════════════════
//  PERMISOS
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
    const sz = 40 + Math.random()*120;
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
document.getElementById('lPass').addEventListener('keydown', e => { if (e.key==='Enter') tryLogin(); });
document.getElementById('lUser').addEventListener('keydown', e => { if (e.key==='Enter') document.getElementById('lPass').focus(); });

async function tryLogin() {
  const username = document.getElementById('lUser').value.trim();
  const password = document.getElementById('lPass').value;
  const err = document.getElementById('lErr');
  const btn = document.getElementById('lBtn');
  btn.disabled = true; btn.textContent = 'Verificando...';
  try {
    const q    = query(collection(db,'users'), where('username','==',username));
    const snap = await getDocs(q);
    if (snap.empty) throw new Error('not found');
    const ud = { id:snap.docs[0].id, ...snap.docs[0].data() };
    if (ud.password !== password) throw new Error('wrong pass');
    err.style.display = 'none';
    currentUser = ud;
    localStorage.setItem(LS_SES, JSON.stringify({ id:ud.id, username:ud.username }));
    document.getElementById('loginScreen').classList.add('hidden');
    showApp();
  } catch(e) {
    err.style.display = '';
    ['lUser','lPass'].forEach(id => {
      const el = document.getElementById(id);
      el.classList.add('err');
      setTimeout(() => el.classList.remove('err'), 1400);
    });
  } finally { btn.disabled=false; btn.innerHTML='<span>🚀</span> Ingresar'; }
}

window.doLogout = function() {
  closeM('mLogout');
  localStorage.removeItem(LS_SES);
  currentUser = null;
  [unsubVehicles,unsubSales,unsubUsers,unsubCurrentUser,unsubTrSlots,unsubTrampolineCfg,unsubComisionCfg,unsubCierres]
    .forEach(u => { if (u) u(); });
  unsubVehicles=unsubSales=unsubUsers=unsubCurrentUser=unsubTrSlots=unsubTrampolineCfg=unsubComisionCfg=unsubCierres=null;
  prevPermisos = {};
  Object.values(sessions).forEach(s => { if (s.timerId) clearInterval(s.timerId); });
  Object.values(trTimers).forEach(t => clearInterval(t));
  sessions={}; trTimers={};
  vehicles=[]; allSales=[]; users=[]; trSlots=[];
  document.getElementById('app').style.display = 'none';
  showLogin();
};

// ══════════════════════════════════════════
//  SETUP APP
// ══════════════════════════════════════════
async function showApp() {
  document.getElementById('app').style.display = 'flex';
  prevPermisos = { ...(currentUser?.permisos || {}) };
  setupTopbar(); buildTabs();
  subscribeCurrentUser();
  subscribeVehicles();
  subscribeSales();
  subscribeTrampolineConfig();
  subscribeComisionConfig();
  subscribeTrSlots();
  subscribeCierres();
  if (isAdmin()) subscribeUsers();
}

// ══════════════════════════════════════════
//  LISTENERS FIRESTORE — VEHÍCULOS
// ══════════════════════════════════════════
function subscribeVehicles() {
  if (unsubVehicles) unsubVehicles();
  unsubVehicles = onSnapshot(collection(db,'vehicles'), snap => {
    vehicles = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    renderHome();
    if (isAdmin()) { renderAdmin(); renderPanel(); }
    vehicles.forEach(v => {
      if (v.status==='in-use' && v.timerEndAt && !sessions[v.id]) {
        const et = v.timerEndAt.toMillis ? v.timerEndAt.toMillis() : v.timerEndAt;
        if (et > Date.now()) startTimer(v.id, et);
        else handleTimeOver(v.id);
      }
    });
  });
}

function subscribeSales() {
  if (unsubSales) unsubSales();
  const q = query(collection(db,'sales'), orderBy('date','desc'));
  unsubSales = onSnapshot(q, snap => {
    allSales = snap.docs.map(d => {
      const data = d.data();
      return { id:d.id, ...data, date:data.date?.toMillis ? data.date.toMillis() : data.date };
    });
    renderHome(); renderHistory();
    if (hasPermiso('verStats')) renderStats();
    if (isAdmin()) renderPanel();
  });
}

function subscribeUsers() {
  if (unsubUsers) unsubUsers();
  unsubUsers = onSnapshot(collection(db,'users'), snap => {
    users = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    if (isAdmin()) renderPanel();
  });
}

// ══════════════════════════════════════════
//  LISTENERS FIRESTORE — TRAMPOLÍN
// ══════════════════════════════════════════

// ── CONFIG (paquetes de precio) ──
function subscribeTrampolineConfig() {
  if (unsubTrampolineCfg) unsubTrampolineCfg();
  unsubTrampolineCfg = onSnapshot(doc(db,'config','trampoline'), snap => {
    if (snap.exists()) {
      trampolineConfig = snap.data();
      if (!trampolineConfig.paquetes?.length)
        trampolineConfig.paquetes = [{min:10,precio:5},{min:20,precio:10},{min:30,precio:15}];
    } else {
      trampolineConfig = { paquetes:[{min:10,precio:5},{min:20,precio:10},{min:30,precio:15}] };
    }
    if (isAdmin()) renderTrampolineAdminConfig();
  });
}

// ── CONFIG COMISIONES EMPLEADO ──
function subscribeComisionConfig() {
  if (unsubComisionCfg) unsubComisionCfg();
  unsubComisionCfg = onSnapshot(doc(db,'config','comisiones'), snap => {
    if (snap.exists() && snap.data().tramos?.length) {
      comisionConfig = snap.data();
    }
    // Re-renderizar sección si el panel está activo
    if (isAdmin()) renderComisionAdminConfig();
  });
}


// ── LISTENER CIERRE DE CAJA — notifica a todos en tiempo real ──
let _ultimoCierreId = null;

function subscribeCierres() {
  if (unsubCierres) unsubCierres();
  const q = query(collection(db,'cierres_caja'), orderBy('fecha','desc'));
  let primeraVez = true;
  unsubCierres = onSnapshot(q, snap => {
    if (snap.empty) { primeraVez = false; return; }
    const ultimo = snap.docs[0];
    // Al cargar la app, solo registrar el ID más reciente sin mostrar nada
    if (primeraVez) { _ultimoCierreId = ultimo.id; primeraVez = false; return; }
    // Solo reaccionar si es un cierre NUEVO
    if (ultimo.id === _ultimoCierreId) return;
    _ultimoCierreId = ultimo.id;
    // Admin: siempre recibe la notificación
    // Empleado: solo si tiene el permiso cierreCaja
    if (isAdmin() || hasPermiso('cierreCaja')) {
      mostrarCelebracionCierre(ultimo.data());
    }
  });
}


function subscribeTrSlots() {
  if (unsubTrSlots) unsubTrSlots();
  unsubTrSlots = onSnapshot(collection(db,'trampoline_slots'), snap => {
    trSlots = snap.docs.map(d => ({ id:d.id, ...d.data() }));

    // Si no hay slots todavía, crearlos automáticamente
    if (trSlots.length === 0) {
      initTrSlots();
      return;
    }

    // Renderizar la vista (igual que renderHome para vehículos)
    renderTrampolineView();

    // Iniciar timers para slots en uso que aún no tienen timer
    trSlots.forEach(sl => {
      if (sl.status === 'in-use' && sl.timerEndAt && !trTimers[sl.id]) {
        const et = sl.timerEndAt.toMillis ? sl.timerEndAt.toMillis() : sl.timerEndAt;
        if (et > Date.now()) startTrTimer(sl.id, et);
        else handleTrTimeOver(sl.id);
      }
    });

    if (isAdmin()) renderPanel();
  });
}

// Crear los 6 slots en Firestore si es la primera vez
async function initTrSlots() {
  const batch = writeBatch(db);
  TR_SLOTS_DEFAULT.forEach(sl => {
    const ref = doc(collection(db,'trampoline_slots'));
    batch.set(ref, {
      num:    sl.num,
      label:  sl.label,
      emoji:  sl.emoji,
      status: 'available',
      timerEndAt: null,
      kidName: null,
      saleId:  null,
      minutes: null,
      price:   null,
      payment: null,
    });
  });
  await batch.commit();
}

// ══════════════════════════════════════════
//  LISTENER USUARIO ACTUAL — PERMISOS TIEMPO REAL
// ══════════════════════════════════════════
function subscribeCurrentUser() {
  if (unsubCurrentUser) unsubCurrentUser();
  if (!currentUser?.id) return;
  unsubCurrentUser = onSnapshot(doc(db,'users',currentUser.id), snap => {
    if (!snap.exists()) return;
    const upd       = { id:snap.id, ...snap.data() };
    const oldPerms  = currentUser?.permisos || {};
    const newPerms  = upd?.permisos || {};
    const ganados   = PERMISOS_DEF.filter(p => !oldPerms[p.key] && !!newPerms[p.key]);
    const revocados = PERMISOS_DEF.filter(p => !!oldPerms[p.key] && !newPerms[p.key]);
    currentUser = upd;
    localStorage.setItem(LS_SES, JSON.stringify({ id:currentUser.id, username:currentUser.username }));
    if (!isAdmin()) {
      const prevTab = document.querySelector('.tab-btn.active')?.dataset.tab || 'home';
      buildTabs(prevTab);
      renderHistory();
      if (hasPermiso('verStats')) renderStats();
      if (!document.querySelector(`.tab-btn[data-tab="${prevTab}"]`)) switchTab('home');
      if (ganados.length   > 0) setTimeout(() => showPermisoCelebration(ganados),   300);
      if (revocados.length > 0) setTimeout(() => showPermisoRevocado(revocados), 300);
    }
  });
}

function showPermisoCelebration(permisos) {
  document.getElementById('permCelContent').innerHTML = permisos.map(p => `
    <div class="perm-cel-item">
      <div class="perm-cel-icon-wrap">${p.icon}</div>
      <div class="perm-cel-info">
        <div class="perm-cel-label">${p.label}</div>
        <div class="perm-cel-desc">${p.desc}</div>
      </div>
    </div>`).join('');
  document.getElementById('permCelTitle').textContent =
    permisos.length===1 ? '¡Tienes un nuevo permiso!' : `¡Tienes ${permisos.length} nuevos permisos!`;
  openM('mPermCel');
  playPermSound();
  launchConfetti();
}

function showPermisoRevocado(permisos) {
  toast(`⚠️ Permiso revocado: ${permisos.map(p=>`${p.icon} ${p.label}`).join(', ')}`);
}

function launchConfetti() {
  const canvas = document.getElementById('confettiCanvas'); if (!canvas) return;
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight;
  const pieces = Array.from({length:60}, () => ({
    x:Math.random()*canvas.width, y:-10-Math.random()*80,
    r:5+Math.random()*7, d:2+Math.random()*3,
    color:['#7C3AED','#A78BFA','#F59E0B','#10B981','#EC4899','#3B82F6'][Math.floor(Math.random()*6)],
    rot:Math.random()*360, spin:(Math.random()-.5)*8, shape:Math.random()>.5?'rect':'circle'
  }));
  let frame;
  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    pieces.forEach(p => {
      ctx.save(); ctx.fillStyle=p.color;
      ctx.translate(p.x,p.y); ctx.rotate(p.rot*Math.PI/180);
      if (p.shape==='rect') ctx.fillRect(-p.r/2,-p.r/3,p.r,p.r/1.8);
      else { ctx.beginPath(); ctx.arc(0,0,p.r/2,0,Math.PI*2); ctx.fill(); }
      ctx.restore();
      p.y+=p.d; p.x+=Math.sin(p.y*.03)*1.2; p.rot+=p.spin;
    });
    if (pieces.some(p=>p.y<canvas.height+20)) frame=requestAnimationFrame(draw);
    else { ctx.clearRect(0,0,canvas.width,canvas.height); canvas.style.display='none'; }
  }
  draw();
  setTimeout(()=>{ cancelAnimationFrame(frame); ctx.clearRect(0,0,canvas.width,canvas.height); canvas.style.display='none'; },4000);
}

function playPermSound() {
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    [[523,.0,.12],[659,.13,.12],[784,.26,.12],[1047,.39,.25],[784,.55,.1],[1047,.67,.3]].forEach(([f,s,d])=>{
      const o=ctx.createOscillator(),g=ctx.createGain(); o.connect(g); g.connect(ctx.destination);
      o.type='sine'; o.frequency.value=f;
      g.gain.setValueAtTime(.3,ctx.currentTime+s); g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+s+d);
      o.start(ctx.currentTime+s); o.stop(ctx.currentTime+s+d+.05);
    });
  } catch(_){}
}

// ══════════════════════════════════════════
//  TOPBAR / TABS
// ══════════════════════════════════════════
function setupTopbar() {
  const u = currentUser;
  const av = document.getElementById('tbAv');
  av.textContent = u.name.charAt(0).toUpperCase(); av.className='tb-av '+u.role;
  document.getElementById('tbUname').textContent = u.name;
  const rb = document.getElementById('tbRbadge');
  rb.textContent = u.role==='admin'?'Admin':'Empleado'; rb.className='tb-rbadge '+u.role;
  document.getElementById('btnAdd').style.display = isAdmin() ? 'flex' : 'none';
  document.getElementById('loIco').textContent  = u.role==='admin' ? '👑' : '👷';
  document.getElementById('loName').textContent = u.name;
  document.getElementById('loRole').textContent = u.role==='admin' ? 'Administrador — acceso total' : 'Empleado · @'+u.username;
}

function buildTabs(keepActive) {
  let tabs = [
    { k:'home',    l:'🏠 Inicio' },
    { k:'history', l:'📋 Ventas'  },
  ];
  if (hasPermiso('gestionarTrampolin')) tabs.push({ k:'trampoline', l:'🦘 Trampolín' });
  if (hasPermiso('verStats'))           tabs.push({ k:'stats',      l:'📈 Stats'     });
  if (isAdmin()) tabs.push({ k:'admin',l:'🚗 Carros' },{ k:'panel',l:'👑 Panel Admin' });

  const activeKey = (keepActive && tabs.find(t=>t.k===keepActive)) ? keepActive : 'home';

  document.getElementById('tabsBar').innerHTML = tabs.map(t =>
    `<button class="tab-btn${t.k===activeKey?' active':''}" data-tab="${t.k}" onclick="switchTab('${t.k}')">${t.l}</button>`
  ).join('');

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const vEl = document.getElementById('view-'+activeKey); if (vEl) vEl.classList.add('active');

  const b = document.getElementById('roleBanner');
  b.style.display='flex'; b.className='role-banner '+(isAdmin()?'admin':'employee');
  b.innerHTML = isAdmin()
    ? `<span style="font-size:18px">👑</span>Hola, <strong>${currentUser.name}</strong> &nbsp;·&nbsp; Administrador`
    : `<span style="font-size:18px">👷</span>Hola, <strong>${currentUser.name}</strong> &nbsp;·&nbsp; Empleado`;
}

window.switchTab = function(k) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab===k));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById('view-'+k); if (el) el.classList.add('active');
  if (k==='history')    renderHistory();
  if (k==='stats')      renderStats();
  if (k==='admin')      renderAdmin();
  if (k==='panel')      renderPanel();
  if (k==='trampoline') renderTrampolineView();
};

// ══════════════════════════════════════════
//  RENDER HOME
// ══════════════════════════════════════════
function renderHome() {
  const today = todaySales();
  const inUse = vehicles.filter(v=>v.status==='in-use'||v.status==='time-over');
  const avail = vehicles.filter(v=>v.status==='available');
  const total = today.reduce((s,x)=>s+x.price,0);
  setText('dTotal','S/'+total); setText('dCount',today.length);
  setText('dInUse',inUse.length); setText('dAvail',avail.length); setText('badgeAvail',avail.length);
  document.getElementById('secActive').style.display = inUse.length ? '' : 'none';
  document.getElementById('gridActive').innerHTML = inUse.map(v=>cardHTML(v)).join('');
  document.getElementById('emptyVeh').style.display = vehicles.length===0 ? '' : 'none';
  document.getElementById('gridAvail').innerHTML = avail.map(v=>cardHTML(v)).join('');
  // Botón cierre de caja: solo visible para el admin
  const ccBtn = document.getElementById('homeCierreCajaBtn');
  if (ccBtn) ccBtn.style.display = isAdmin() ? '' : 'none';
}

function cardHTML(v) {
  const inUse=v.status==='in-use', over=v.status==='time-over';
  const pL=v.type==='large'?'S/10×10min':'S/5×10min';
  const tL=v.type==='large'?'🚙 Grande':'🚗 Pequeño';
  let timer='', acts='';
  const canCancel=hasPermiso('cancelarViaje');
  if (inUse) {
    const se=sessions[v.id]; const rem=se?Math.max(0,se.endTime-Date.now()):0;
    timer=`<div class="vc-timer" id="tmr-${v.id}">${fmtTime(rem)}</div>`;
    const cb=canCancel?`<button class="vbtn vbtn-cancel" onclick="openCancelModal('${v.id}')" title="Cancelar">🚫</button>`:'';
    acts=`<div class="vc-acts"><button class="vbtn vbtn-a" onclick="extendVeh('${v.id}',10)">+10</button><button class="vbtn vbtn-r" onclick="freeVeh('${v.id}')">✔ Fin</button>${cb}</div>`;
  } else if (over) {
    timer=`<div class="vc-timer urgent" id="tmr-${v.id}">⏰ FIN</div>`;
    const cb=canCancel?`<button class="vbtn vbtn-cancel" onclick="openCancelModal('${v.id}')" title="Cancelar">🚫</button>`:'';
    acts=`<div class="vc-acts"><button class="vbtn vbtn-a" onclick="extendVeh('${v.id}',10)">+10</button><button class="vbtn vbtn-t" onclick="freeVeh('${v.id}')">✔ Fin</button>${cb}</div>`;
  } else {
    const eb=isAdmin()?`<button class="vbtn vbtn-e" onclick="openEditModal('${v.id}')">✏️</button>`:'';
    acts=`<div class="vc-acts"><button class="vbtn vbtn-p" onclick="openRentModal('${v.id}')">🚀 Alquilar</button>${eb}</div>`;
  }
  return `<div class="vc ${v.status}" id="vc-${v.id}">
    <div class="vc-top"><span class="vc-dot"></span><span class="vc-emoji">${v.emoji}</span></div>
    <div class="vc-body"><div class="vc-name">${v.name}</div><div class="vc-type">${tL}</div><div class="vc-price">${pL}</div></div>
    ${timer}${acts}</div>`;
}

// ══════════════════════════════════════════
//  RENDER TRAMPOLÍN — idéntico a renderHome
// ══════════════════════════════════════════
function renderTrampolineView() {
  const container = document.getElementById('view-trampoline');
  if (!container) return;

  if (!hasPermiso('gestionarTrampolin')) {
    container.innerHTML=`<div class="empty" style="padding:50px 20px"><span class="empty-ico">🦘</span><p>No tienes permiso para gestionar el trampolín.</p></div>`;
    return;
  }

  if (!trSlots.length) {
    container.innerHTML=`<div class="empty" style="padding:50px 20px"><span class="empty-ico">🦘</span><p>Cargando trampolines...</p></div>`;
    return;
  }

  const inUse  = trSlots.filter(s=>s.status==='in-use'||s.status==='time-over');
  const avail  = trSlots.filter(s=>s.status==='available');
  const todayTr = todayTrampolineSales().reduce((s,x)=>s+x.price,0);
  const sortedSlots = [...trSlots].sort((a,b)=>(a.num||0)-(b.num||0));

  container.innerHTML = `
    <div class="tr-header">
      <div class="tr-stats">
        <div class="tr-stat tr-stat--jump">
          <div class="tr-stat-ico">🦘</div>
          <div class="tr-stat-val">${inUse.length}</div>
          <div class="tr-stat-lbl">Saltando ahora</div>
        </div>
        <div class="tr-stat tr-stat--avail">
          <div class="tr-stat-ico">🟢</div>
          <div class="tr-stat-val">${avail.length}</div>
          <div class="tr-stat-lbl">Disponibles</div>
        </div>
        <div class="tr-stat tr-stat--money">
          <div class="tr-stat-ico">💰</div>
          <div class="tr-stat-val">S/${todayTr}</div>
          <div class="tr-stat-lbl">Ingresos hoy</div>
        </div>
      </div>
    </div>
    ${inUse.length ? `
      <div class="sec">
        <div class="sec-head"><h2 class="sec-title">⏱ En uso ahora</h2></div>
        <div class="vg">${inUse.map(sl=>trSlotCardHTML(sl)).join('')}</div>
      </div>` : ''}
    <div class="sec">
      <div class="sec-head">
        <h2 class="sec-title">🦘 Trampolines</h2>
        <span class="sec-badge">${avail.length} libre${avail.length!==1?'s':''}</span>
      </div>
      <div class="vg">${avail.map(sl=>trSlotCardHTML(sl)).join('')}</div>
      ${avail.length===0 ? '<div style="text-align:center;padding:14px;font-size:13px;color:var(--tx2)">Todos ocupados</div>' : ''}
    </div>`;

  // Arrancar timers para slots en uso (el innerHTML reconstruyó el DOM)
  trSlots.forEach(sl => {
    if ((sl.status==='in-use') && sl.timerEndAt) {
      const et = sl.timerEndAt.toMillis ? sl.timerEndAt.toMillis() : sl.timerEndAt;
      if (et > Date.now()) startTrTimer(sl.id, et);
      else handleTrTimeOver(sl.id);
    }
  });
}

function trSlotCardHTML(sl) {
  const inUse = sl.status==='in-use', over=sl.status==='time-over';
  const endTime = sl.timerEndAt?.toMillis ? sl.timerEndAt.toMillis() : (sl.timerEndAt||0);
  const rem     = Math.max(0, endTime - Date.now());
  const isUrgent = inUse && rem < 60000;
  let timerEl='', acts='';

  if (inUse) {
    timerEl = `<div class="vc-timer${isUrgent?' urgent':''}" id="tr-tmr-${sl.id}">${fmtTime(rem)}</div>`;
    const cb = hasPermiso('cancelarViaje')
      ? `<button class="vbtn vbtn-cancel" onclick="cancelTrSlot('${sl.id}')" title="Cancelar">🚫</button>` : '';
    acts = `<div class="vc-acts">
      <button class="vbtn vbtn-a" onclick="extendTrSlot('${sl.id}',10)">+10</button>
      <button class="vbtn vbtn-r" onclick="freeTrSlot('${sl.id}')">✔ Fin</button>
      ${cb}
    </div>`;
  } else if (over) {
    timerEl = `<div class="vc-timer urgent" id="tr-tmr-${sl.id}">⏰ FIN</div>`;
    const cb = hasPermiso('cancelarViaje')
      ? `<button class="vbtn vbtn-cancel" onclick="cancelTrSlot('${sl.id}')" title="Cancelar">🚫</button>` : '';
    acts = `<div class="vc-acts">
      <button class="vbtn vbtn-a" onclick="extendTrSlot('${sl.id}',10)">+10</button>
      <button class="vbtn vbtn-t" onclick="freeTrSlot('${sl.id}')">✔ Fin</button>
      ${cb}
    </div>`;
  } else {
    // Disponible — mostrar botón para asignar niño
    acts = `<div class="vc-acts">
      <button class="vbtn vbtn-p tr-rent-btn" onclick="openTrRentModal('${sl.id}')">🦘 Asignar</button>
      ${isAdmin() ? `<button class="vbtn vbtn-e" onclick="openEditTrSlotModal('${sl.id}')">✏️</button>` : ''}
    </div>`;
  }

  // Info del niño si está en uso
  const kidInfo = (inUse||over) && sl.kidName
    ? `<div class="vc-body">
        <div class="vc-name">👦 ${sl.kidName}</div>
        <div class="vc-type">${sl.minutes} min · ${sl.payment==='yape'?'💜 Yape':'💵 Efectivo'}</div>
        <div class="vc-price">S/${sl.price||0}</div>
      </div>`
    : `<div class="vc-body">
        <div class="vc-name">${sl.label||'Trampolín'}</div>
        <div class="vc-type">Disponible</div>
        <div class="vc-price" style="color:var(--gr)">🟢 Libre</div>
      </div>`;

  const statusClass = over ? 'time-over' : inUse ? 'in-use' : 'available';
  return `<div class="vc ${statusClass}" id="tr-slot-${sl.id}">
    <div class="vc-top">
      <span class="vc-dot"></span>
      <span class="vc-emoji">${sl.emoji||'🦘'}</span>
    </div>
    ${kidInfo}
    ${timerEl}
    ${acts}
  </div>`;
}

// ══════════════════════════════════════════
//  MODAL ASIGNAR NIÑO A SLOT
// ══════════════════════════════════════════
window.openTrRentModal = function(slotId) {
  if (!hasPermiso('gestionarTrampolin')) { toast('⛔ Sin permiso'); return; }
  const sl = trSlots.find(x=>x.id===slotId); if (!sl) return;
  const paquetes = trampolineConfig.paquetes || [{min:20,precio:10}];
  rentSlotId     = slotId;
  rentKidMinutes = paquetes[0].min;
  rentKidPrecio  = paquetes[0].precio;
  rentKidPay     = 'yape';

  setText('mTrRentTitle', sl.label || 'Trampolín');
  document.getElementById('mTrRentEmoji').textContent = sl.emoji || '🦘';
  document.getElementById('trKidName').value = '';

  // Construir botones de paquetes dinámicamente
  document.getElementById('trPaquetesGrid').innerHTML = paquetes.map((p,i) =>
    `<button class="kpaq-btn${i===0?' active':''}" onclick="selTrPaquete(this,${p.min},${p.precio})">
      <span class="kpaq-min">${p.min} min</span>
      <span class="kpaq-precio">S/${p.precio}</span>
    </button>`
  ).join('');

  document.getElementById('trPriceDisplay').textContent = 'S/'+rentKidPrecio;
  document.getElementById('trMinDisplay').textContent   = rentKidMinutes+' min';
  document.getElementById('trPayYape').classList.add('active');
  document.getElementById('trPayCash').classList.remove('active');
  openM('mTrRent');
  setTimeout(()=>document.getElementById('trKidName').focus(), 200);
};

window.selTrPaquete = function(btn, min, precio) {
  rentKidMinutes = min; rentKidPrecio = precio;
  document.querySelectorAll('.kpaq-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('trPriceDisplay').textContent = 'S/'+precio;
  document.getElementById('trMinDisplay').textContent   = min+' min';
};

window.selTrPay = function(p) {
  rentKidPay = p;
  document.getElementById('trPayYape').classList.toggle('active',p==='yape');
  document.getElementById('trPayCash').classList.toggle('active',p==='cash');
};

window.confirmTrRent = async function() {
  const kidName = document.getElementById('trKidName').value.trim();
  if (!kidName) { toast('⚠️ Escribe el nombre del niño'); return; }
  const sl = trSlots.find(x=>x.id===rentSlotId); if (!sl) return;
  const endAt = Timestamp.fromMillis(Date.now() + rentKidMinutes * 60 * 1000);
  closeM('mTrRent');
  try {
    // 1) Crear venta
    const saleRef = await addDoc(collection(db,'sales'), {
      vId:    rentSlotId,
      vName:  `🦘 ${sl.label} — ${kidName}`,
      vEmoji: sl.emoji || '🦘',
      vType:  'trampoline',
      min:    rentKidMinutes,
      price:  rentKidPrecio,
      payment:rentKidPay,
      date:   Timestamp.now(),
      by:     currentUser?.username || '?'
    });
    // 2) Actualizar el slot en Firestore (igual que updateDoc en vehículos)
    await updateDoc(doc(db,'trampoline_slots',rentSlotId), {
      status:     'in-use',
      timerEndAt: endAt,
      kidName,
      minutes:    rentKidMinutes,
      price:      rentKidPrecio,
      payment:    rentKidPay,
      saleId:     saleRef.id,
      by:         currentUser?.username || '?'
    });
    toast(`🦘 ${kidName} · S/${rentKidPrecio}`);
    // El onSnapshot de trampoline_slots dispara automáticamente en todos los dispositivos
  } catch(e) {
    console.error('Error al asignar trampolín:',e);
    toast('❌ Error al guardar. Revisa tu conexión.');
  }
};

// ══════════════════════════════════════════
//  ACCIONES SOBRE SLOTS
// ══════════════════════════════════════════
window.extendTrSlot = async function(slotId, extraMin) {
  const sl = trSlots.find(x=>x.id===slotId); if (!sl) return;
  const ppm      = (sl.price || 0) / (sl.minutes || 1);
  const extraPrecio = Math.round(ppm * extraMin * 10) / 10;
  const baseEnd  = sl.timerEndAt?.toMillis ? sl.timerEndAt.toMillis() : Date.now();
  const newEnd   = Math.max(baseEnd, Date.now()) + extraMin * 60 * 1000;
  try {
    await updateDoc(doc(db,'trampoline_slots',slotId), {
      status:     'in-use',
      timerEndAt: Timestamp.fromMillis(newEnd),
      minutes:    (sl.minutes||0) + extraMin,
      price:      Math.round(((sl.price||0) + extraPrecio)*10)/10
    });
    toast(`⏱ +${extraMin} min · ${sl.kidName}`);
  } catch(e) { toast('❌ Error al extender.'); }
};

window.freeTrSlot = async function(slotId) {
  if (trTimers[slotId]) { clearInterval(trTimers[slotId]); delete trTimers[slotId]; }
  try {
    await updateDoc(doc(db,'trampoline_slots',slotId), {
      status:'available', timerEndAt:null,
      kidName:null, minutes:null, price:null, payment:null, saleId:null
    });
    toast('🟢 Trampolín liberado');
  } catch(e) { toast('❌ Error al liberar.'); }
};

window.cancelTrSlot = function(slotId) {
  if (!hasPermiso('cancelarViaje')) { toast('⛔ Sin permiso'); return; }
  const sl = trSlots.find(x=>x.id===slotId); if (!sl) return;
  // Mostrar modal de confirmación (igual que vehículos)
  document.getElementById('cancelTrEmoji').textContent = sl.emoji || '🦘';
  document.getElementById('cancelTrName').textContent  = sl.label || 'Trampolín';
  const pay = sl.payment === 'yape' ? '💜 Yape' : '💵 Efectivo';
  document.getElementById('cancelTrInfo').innerHTML = `
    <div class="cancel-venta-row"><span>👦 Niño</span><strong>${sl.kidName||'—'}</strong></div>
    <div class="cancel-venta-row"><span>⏱ Tiempo</span><strong>${sl.minutes||0} min</strong></div>
    <div class="cancel-venta-row"><span>💰 Monto</span><strong>S/${sl.price||0}</strong></div>
    <div class="cancel-venta-row"><span>💳 Pago</span><strong>${pay}</strong></div>`;
  document.getElementById('cancelTrSlotId').value = slotId;
  openM('mCancelTr');
};

window.confirmCancelTrSlot = async function() {
  const slotId = document.getElementById('cancelTrSlotId').value;
  const sl = trSlots.find(x=>x.id===slotId); if (!sl) return;
  closeM('mCancelTr');
  if (trTimers[slotId]) { clearInterval(trTimers[slotId]); delete trTimers[slotId]; }
  try {
    if (sl.saleId) await deleteDoc(doc(db,'sales',sl.saleId));
    await updateDoc(doc(db,'trampoline_slots',slotId), {
      status:'available', timerEndAt:null,
      kidName:null, minutes:null, price:null, payment:null, saleId:null
    });
    toast(`🚫 ${sl.kidName||'Niño'} cancelado — venta eliminada`);
  } catch(e) { console.error(e); toast('❌ Error al cancelar.'); }
};

// ══════════════════════════════════════════
//  GESTIÓN DE SLOTS (solo admin) — agregar / editar / eliminar
// ══════════════════════════════════════════
let editTrSlotId = null, trSlotEmoji = '🦘';

// Abrir modal para AGREGAR nuevo trampolín
window.openAddTrSlotModal = function() {
  if (!isAdmin()) return;
  editTrSlotId = null;
  trSlotEmoji  = '🦘';
  document.getElementById('trSlotName').value = '';
  document.getElementById('mTrSlotTitle').textContent = '➕ Nuevo Trampolín';
  document.getElementById('btnDelTrSlot').style.display = 'none';
  buildTrEmojiGrid();
  selTrEmoji('🦘');
  openM('mTrSlotEdit');
};

// Abrir modal para EDITAR trampolín existente
window.openEditTrSlotModal = function(slotId) {
  if (!isAdmin()) return;
  const sl = trSlots.find(x=>x.id===slotId); if (!sl) return;
  editTrSlotId = slotId;
  trSlotEmoji  = sl.emoji || '🦘';
  document.getElementById('trSlotName').value = sl.label || '';
  document.getElementById('mTrSlotTitle').textContent = '✏️ Editar Trampolín';
  // Solo mostrar eliminar si el slot está disponible (no en uso)
  const btnDel = document.getElementById('btnDelTrSlot');
  btnDel.style.display = sl.status === 'available' ? '' : 'none';
  buildTrEmojiGrid();
  selTrEmoji(trSlotEmoji);
  openM('mTrSlotEdit');
};

function buildTrEmojiGrid() {
  document.getElementById('trEmojiGrid').innerHTML = TR_EMOJIS.map(e =>
    `<button class="ebtn" data-te="${e}" onclick="selTrEmoji('${e}')">${e}</button>`
  ).join('');
}

window.selTrEmoji = function(e) {
  trSlotEmoji = e;
  document.querySelectorAll('#trEmojiGrid .ebtn').forEach(b => b.classList.toggle('active', b.dataset.te===e));
};

// GUARDAR (crear nuevo o actualizar)
window.saveTrSlot = async function() {
  if (!isAdmin()) return;
  const label = document.getElementById('trSlotName').value.trim();
  if (!label) { toast('⚠️ Escribe el nombre'); return; }
  try {
    if (editTrSlotId) {
      // Actualizar existente
      await updateDoc(doc(db,'trampoline_slots',editTrSlotId), { label, emoji:trSlotEmoji });
      toast('✅ Trampolín actualizado');
    } else {
      // Crear nuevo slot
      const nextNum = trSlots.length > 0 ? Math.max(...trSlots.map(s=>s.num||0)) + 1 : 1;
      await addDoc(collection(db,'trampoline_slots'), {
        num:        nextNum,
        label,
        emoji:      trSlotEmoji,
        status:     'available',
        timerEndAt: null,
        kidName:    null,
        saleId:     null,
        minutes:    null,
        price:      null,
        payment:    null,
      });
      toast('✅ Trampolín agregado');
    }
    closeM('mTrSlotEdit');
  } catch(e) { console.error(e); toast('❌ Error al guardar.'); }
};

// ELIMINAR slot (solo si está disponible)
window.deleteTrSlot = async function() {
  if (!isAdmin() || !editTrSlotId) return;
  const sl = trSlots.find(x=>x.id===editTrSlotId);
  if (sl?.status !== 'available') { toast('⛔ Solo puedes eliminar trampolines disponibles'); return; }
  if (trSlots.length <= 1) { toast('⚠️ Debe quedar al menos 1 trampolín'); return; }
  if (!confirm(`¿Eliminar "${sl.label}"? Esta acción no se puede deshacer.`)) return;
  try {
    await deleteDoc(doc(db,'trampoline_slots',editTrSlotId));
    closeM('mTrSlotEdit');
    toast('🗑️ Trampolín eliminado');
  } catch(e) { toast('❌ Error al eliminar.'); }
};

// ══════════════════════════════════════════
//  CRONÓMETROS TRAMPOLÍN
// ══════════════════════════════════════════
function startTrTimer(slotId, endTime) {
  if (trTimers[slotId]) clearInterval(trTimers[slotId]);
  // Tick inmediato
  tickTr(slotId, endTime);
  trTimers[slotId] = setInterval(() => tickTr(slotId, endTime), 1000);
}

function tickTr(slotId, endTime) {
  const rem = endTime - Date.now();
  const el  = document.getElementById('tr-tmr-'+slotId);
  if (!el) return; // El DOM no está montado aún — el timer sigue corriendo, esperará
  if (rem <= 0) {
    clearInterval(trTimers[slotId]); delete trTimers[slotId];
    el.textContent = '⏰ FIN'; el.classList.add('urgent');
    handleTrTimeOver(slotId);
    return;
  }
  el.textContent = fmtTime(rem);
  el.classList.toggle('urgent', rem < 60000);
}

async function handleTrTimeOver(slotId) {
  const sl = trSlots.find(x=>x.id===slotId);
  try { await updateDoc(doc(db,'trampoline_slots',slotId), { status:'time-over', timerEndAt:null }); } catch(e){}
  playKidAlert();
  toast(`⏰ ¡Tiempo! → ${sl?.kidName||'Trampolín'}`);
}

// ══════════════════════════════════════════
//  PANEL ADMIN — CONFIG TRAMPOLÍN (flota + precios)
// ══════════════════════════════════════════
function renderTrampolineAdminConfig() {
  const container = document.getElementById('apTrampolinConfig');
  if (!container || !isAdmin()) return;

  // ── Lista de trampolines actuales ──
  const sortedSlots = [...trSlots].sort((a,b)=>(a.num||0)-(b.num||0));
  const slotsList = sortedSlots.length === 0
    ? `<div style="padding:12px 15px;font-size:13px;color:var(--tx2)">Sin trampolines.</div>`
    : sortedSlots.map(sl => {
        const stLbl = { available:'🟢 Disponible','in-use':'🟡 En uso','time-over':'🔴 Fin' };
        return `<div class="ap-row" onclick="openEditTrSlotModal('${sl.id}')">
          <span class="ap-row-ico">${sl.emoji||'🦘'}</span>
          <div class="ap-row-info">
            <div class="ap-row-name">${sl.label||'Trampolín'}</div>
            <div class="ap-row-sub">${stLbl[sl.status]||sl.status}</div>
          </div>
          <span style="color:var(--tx2)">›</span>
        </div>`;
      }).join('');

  // ── Paquetes de precio ──
  const paquetes = trampolineConfig.paquetes || [];
  const paquetesList = paquetes.length === 0
    ? `<div style="padding:12px 15px;font-size:13px;color:var(--tx2)">Sin paquetes configurados.</div>`
    : paquetes.map((p,i) => `
      <div class="tr-cfg-row">
        <div class="tr-cfg-label-pill">Paquete ${i+1}</div>
        <div class="tr-cfg-fields">
          <div class="tr-cfg-field">
            <label class="tr-cfg-field-lbl">⏱ Min</label>
            <input class="tr-cfg-input" type="number" min="1" max="999" value="${p.min}" id="cfgMin-${i}">
          </div>
          <div class="tr-cfg-field">
            <label class="tr-cfg-field-lbl">💰 S/</label>
            <input class="tr-cfg-input" type="number" min="0.5" max="999" step="0.5" value="${p.precio}" id="cfgPrecio-${i}">
          </div>
        </div>
        <button class="tr-cfg-del-btn" onclick="deletePaquete(${i})" title="Eliminar">🗑</button>
      </div>`
    ).join('');

  container.innerHTML = `
    <div class="ap-tr-section">
      <div class="ap-tr-section-head">
        <span>🦘 Trampolines</span>
        <span class="ap-sec-badge">${trSlots.length}</span>
      </div>
      ${slotsList}
      <div style="padding:11px 15px">
        <button class="cta" style="margin-bottom:0" onclick="openAddTrSlotModal()">➕ Agregar Trampolín</button>
      </div>
    </div>
    <div class="ap-tr-section" style="margin-top:12px">
      <div class="ap-tr-section-head"><span>💰 Paquetes de precio</span></div>
      ${paquetesList}
    </div>`;
}

// ══════════════════════════════════════════
//  PANEL ADMIN — CONFIG COMISIONES EMPLEADO
// ══════════════════════════════════════════
function renderComisionAdminConfig() {
  const container = document.getElementById('apComisionConfig');
  if (!container || !isAdmin()) return;

  const tramos = [...(comisionConfig.tramos || [])].sort((a,b) => a.desde - b.desde);

  container.innerHTML = `
    <div style="padding:10px 15px 4px;font-size:11px;color:var(--tx2);font-weight:700;text-transform:uppercase;letter-spacing:.4px">
      Tramo automático (sin configurar)
    </div>
    <div class="tr-cfg-row" style="opacity:.6">
      <div class="tr-cfg-label-pill" style="background:var(--ambs);color:#92400E">Menos de S/100</div>
      <div style="flex:1;font-size:12px;color:var(--tx2);padding:0 8px">(Total ÷ 2) − S/5 <em>automático</em></div>
    </div>
    <div style="padding:6px 15px 4px;font-size:11px;color:var(--tx2);font-weight:700;text-transform:uppercase;letter-spacing:.4px">
      Tramos configurables
    </div>
    ${tramos.map((t,i) => `
      <div class="tr-cfg-row">
        <div class="tr-cfg-label-pill">Desde S/${t.desde}</div>
        <div class="tr-cfg-fields">
          <div class="tr-cfg-field">
            <label class="tr-cfg-field-lbl">Desde S/</label>
            <input class="tr-cfg-input" type="number" min="100" step="10" value="${t.desde}" id="cDesde-${i}">
          </div>
          <div class="tr-cfg-field">
            <label class="tr-cfg-field-lbl">Pago S/</label>
            <input class="tr-cfg-input" type="number" min="1" step="5" value="${t.pago}" id="cPago-${i}">
          </div>
        </div>
        <button class="tr-cfg-del-btn" onclick="deleteTramo(${i})" title="Eliminar">🗑</button>
      </div>`
    ).join('')}`;
}

window.addTramo = function() {
  if (!isAdmin()) return;
  const tramos = comisionConfig.tramos || [];
  const lastDesde = tramos.length > 0 ? Math.max(...tramos.map(t=>t.desde)) : 100;
  const lastPago  = tramos.length > 0 ? tramos.find(t=>t.desde===lastDesde)?.pago || 45 : 45;
  comisionConfig.tramos = [...tramos, { desde: lastDesde + 100, pago: lastPago + 20 }];
  renderComisionAdminConfig();
};

window.deleteTramo = function(i) {
  if (!isAdmin()) return;
  const tramos = [...(comisionConfig.tramos || [])].sort((a,b)=>a.desde-b.desde);
  if (tramos.length <= 1) { toast('⚠️ Debe haber al menos 1 tramo'); return; }
  tramos.splice(i, 1);
  comisionConfig.tramos = tramos;
  renderComisionAdminConfig();
};

window.saveComisionConfig = async function() {
  if (!isAdmin()) return;
  const tramos = (comisionConfig.tramos || []).map((_,i) => ({
    desde: parseInt(document.getElementById('cDesde-'+i)?.value) || 100,
    pago:  parseInt(document.getElementById('cPago-'+i)?.value)  || 45
  })).filter(t => t.desde >= 100 && t.pago > 0);

  // Validar que no haya duplicados
  const desdes = tramos.map(t=>t.desde);
  if (new Set(desdes).size !== desdes.length) { toast('⚠️ Hay tramos con el mismo monto'); return; }

  try {
    await setDoc(doc(db,'config','comisiones'), { tramos });
    toast('✅ Escala de comisiones guardada');
  } catch(e) { toast('❌ Error al guardar.'); }
};


window.addPaquete = function() {
  if (!isAdmin()) return;
  if (!trampolineConfig.paquetes) trampolineConfig.paquetes = [];
  trampolineConfig.paquetes.push({ min:10, precio:5 });
  renderTrampolineAdminConfig();
};

window.deletePaquete = function(i) {
  if (!isAdmin()) return;
  if (trampolineConfig.paquetes.length <= 1) { toast('⚠️ Mínimo 1 paquete'); return; }
  trampolineConfig.paquetes.splice(i,1);
  renderTrampolineAdminConfig();
};

window.saveTrampolineConfig = async function() {
  if (!isAdmin()) return;
  const paquetes = (trampolineConfig.paquetes||[]).map((_,i) => ({
    min:    parseInt(document.getElementById('cfgMin-'+i)?.value)    || 10,
    precio: parseFloat(document.getElementById('cfgPrecio-'+i)?.value) || 5
  }));
  if (paquetes.some(p=>p.min<1||p.precio<0.5)) { toast('⚠️ Valores inválidos'); return; }
  try {
    await setDoc(doc(db,'config','trampoline'), { paquetes });
    toast('✅ Precios guardados');
  } catch(e) { toast('❌ Error al guardar.'); }
};

// ══════════════════════════════════════════
//  RENDER HISTORY — con botón eliminar solo admin
// ══════════════════════════════════════════
function renderHistory() {
  const sales      = filteredSales();
  const list       = document.getElementById('saleList');
  const empty      = document.getElementById('emptySales');
  const exportBtn  = document.getElementById('btnExportCSV');
  const filterWeek = document.getElementById('fbWeek');
  const filterAll  = document.getElementById('fbAll');
  if (exportBtn)  exportBtn.style.display  = hasPermiso('exportarCSV')         ? '' : 'none';
  if (filterWeek) filterWeek.style.display = hasPermiso('verHistorialCompleto') ? '' : 'none';
  if (filterAll)  filterAll.style.display  = hasPermiso('verHistorialCompleto') ? '' : 'none';
  if (!sales.length) { list.innerHTML=''; empty.style.display=''; return; }
  empty.style.display='none';
  const canEditPago = hasPermiso('editarPago');
  list.innerHTML = [...sales].map(s => {
    const d   = new Date(s.date);
    const dt  = d.toLocaleDateString('es-PE',{day:'numeric',month:'short'});
    const tm  = d.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'});
    const pay = s.payment==='yape' ? '💜 Yape' : '💵 Efectivo';
    const by  = s.by ? ` · ${s.by}` : '';
    const editBtn = canEditPago
      ? `<button class="edit-pay-btn" onclick="openEditPagoModal('${s.id}','${s.payment}')" title="Editar pago">✏️</button>`
      : '';
    const delBtn = isAdmin()
      ? `<button class="sale-del-btn" onclick="deleteSale('${s.id}')" title="Eliminar">🗑️</button>`
      : '';
    return `<div class="si" id="si-${s.id}">
      <div class="si-emoji">${s.vEmoji||'🚗'}</div>
      <div class="si-info">
        <div class="si-name">${s.vName}</div>
        <div class="si-det">${s.min} min · ${dt} ${tm}${by}</div>
      </div>
      <div class="si-right">
        <div class="si-price">S/${s.price}</div>
        <div class="si-pay-row">${editBtn}${delBtn}<span class="si-pay">${pay}</span></div>
      </div></div>`;
  }).join('');
}

window.deleteSale = async function(saleId) {
  if (!isAdmin()) { toast('⛔ Solo el administrador puede eliminar registros'); return; }
  if (!confirm('¿Eliminar este registro? No se puede deshacer.')) return;
  try {
    const el = document.getElementById('si-'+saleId);
    if (el) { el.style.transition='opacity .25s,transform .25s'; el.style.opacity='0'; el.style.transform='translateX(40px)'; }
    await new Promise(r => setTimeout(r, 220));
    await deleteDoc(doc(db,'sales',saleId));
    toast('🗑️ Registro eliminado');
  } catch(e) { toast('❌ Error al eliminar.'); }
};

// ══════════════════════════════════════════
//  RENDER STATS
// ══════════════════════════════════════════
function renderStats() {
  if (!hasPermiso('verStats')) return;
  const today = todaySales();
  const total = today.reduce((s,x)=>s+x.price,0);
  const min   = today.reduce((s,x)=>s+x.min,0);
  const yape  = today.filter(x=>x.payment==='yape').reduce((s,x)=>s+x.price,0);
  const cash  = today.filter(x=>x.payment==='cash').reduce((s,x)=>s+x.price,0);
  const usage = {}; today.forEach(s=>{ usage[s.vName]=(usage[s.vName]||0)+1; });
  const top   = Object.entries(usage).sort((a,b)=>b[1]-a[1])[0];
  setText('stTotal','S/'+total); setText('stCount',today.length); setText('stMin',min+' min'); setText('stTop',top?top[0]:'—');
  setText('stYape','S/'+yape); setText('stCash','S/'+cash);
  const maxC = Math.max(...Object.values(usage),1);
  document.getElementById('usageWrap').innerHTML = Object.keys(usage).length
    ? Object.entries(usage).sort((a,b)=>b[1]-a[1]).map(([nm,cnt])=>
        `<div class="u-item"><div class="u-label"><span>${nm}</span><span>${cnt}</span></div><div class="u-track"><div class="u-fill" style="width:${Math.round(cnt/maxC*100)}%"></div></div></div>`
      ).join('')
    : '<div class="empty"><span class="empty-ico">📊</span>Sin datos hoy.</div>';
}

// ══════════════════════════════════════════
//  RENDER ADMIN + PANEL
// ══════════════════════════════════════════
function renderAdmin() {
  if (!isAdmin()) return;
  const list  = document.getElementById('adminList');
  const empty = document.getElementById('emptyAdmin');
  if (!vehicles.length) { list.innerHTML=''; empty.style.display=''; return; }
  empty.style.display='none';
  const sl={ available:'🟢 Disponible','in-use':'🟡 En uso','time-over':'🔴 Tiempo terminado' };
  list.innerHTML = vehicles.map(v =>
    `<div class="av-item" onclick="openEditModal('${v.id}')">
      <span class="av-emoji">${v.emoji}</span>
      <div class="av-info"><div class="av-name">${v.name}</div><div class="av-type">${v.type==='large'?'🚙 Grande · S/10×10min':'🚗 Pequeño · S/5×10min'}</div><span class="av-stat ${v.status}">${sl[v.status]||v.status}</span></div>
      <span class="av-arrow">›</span></div>`
  ).join('');
}

function renderPanel() {
  if (!isAdmin()) return;
  const today = todaySales();
  const total = today.reduce((s,x)=>s+x.price,0);
  const yape  = today.filter(x=>x.payment==='yape').reduce((s,x)=>s+x.price,0);
  const cash  = today.filter(x=>x.payment==='cash').reduce((s,x)=>s+x.price,0);
  setText('apTotal','S/'+total); setText('apCount',today.length); setText('apYape','S/'+yape); setText('apCash','S/'+cash);
  setText('apFleetN',vehicles.length);
  const stLbl={ available:'🟢 Disponible','in-use':'🟡 En uso','time-over':'🔴 Fin' };
  document.getElementById('apFleetList').innerHTML = vehicles.map(v =>
    `<div class="ap-row" onclick="openEditModal('${v.id}');switchTab('admin')">
      <span class="ap-row-ico">${v.emoji}</span>
      <div class="ap-row-info"><div class="ap-row-name">${v.name}</div><div class="ap-row-sub">${v.type==='large'?'Grande':'Pequeño'} · ${stLbl[v.status]||v.status}</div></div>
      <span style="color:var(--tx2)">›</span></div>`
  ).join('') || '<div style="padding:12px 15px;font-size:13px;color:var(--tx2)">Sin vehículos</div>';
  const emps = users.filter(u=>u.role==='employee');
  setText('apEmpN',emps.length);
  document.getElementById('apEmpList').innerHTML = emps.map(u => {
    const permsCount = Object.values(u.permisos||{}).filter(Boolean).length;
    return `<div class="ap-row" onclick="openEditUserModal('${u.id}')">
      <span class="ap-row-ico">👷</span>
      <div class="ap-row-info">
        <div class="ap-row-name">${u.name}</div>
        <div class="ap-row-sub">@${u.username} · <span class="perm-count-badge">${permsCount} permiso${permsCount!==1?'s':''}</span></div>
      </div>
      <span style="color:var(--tx2)">›</span></div>`;
  }).join('') || '<div style="padding:12px 15px;font-size:13px;color:var(--tx2)">Sin empleados</div>';
  renderTrampolineAdminConfig();
  renderComisionAdminConfig();
}

// ══════════════════════════════════════════
//  MODAL EDITAR PAGO
// ══════════════════════════════════════════
window.openEditPagoModal = function(saleId, currentPayment) {
  if (!hasPermiso('editarPago')) { toast('⛔ Sin permiso'); return; }
  editSaleId = saleId;
  selEditPay(currentPayment||'yape');
  openM('mEditPago');
};
window.selEditPay = function(p) {
  document.getElementById('editPayYape').classList.toggle('active',p==='yape');
  document.getElementById('editPayCash').classList.toggle('active',p==='cash');
  document.getElementById('mEditPago').dataset.selectedPay = p;
};
window.confirmEditPago = async function() {
  if (!editSaleId) return;
  const newPay = document.getElementById('mEditPago').dataset.selectedPay||'yape';
  try {
    await updateDoc(doc(db,'sales',editSaleId),{ payment:newPay });
    closeM('mEditPago'); toast('✅ Pago actualizado'); editSaleId=null;
  } catch(e) { toast('❌ Error.'); }
};

// ══════════════════════════════════════════
//  ALQUILER VEHÍCULOS
// ══════════════════════════════════════════
window.openRentModal = function(id) {
  const v=vehicles.find(x=>x.id===id); if (!v) return;
  rentVehId=id; rentMin=10; rentPay='yape';
  setText('mRentTitle',v.name);
  document.getElementById('mRentEmoji').textContent=v.emoji;
  updRentUI(v.type); selPay('yape');
  document.querySelectorAll('.qt').forEach(b=>b.classList.remove('active'));
  openM('mRent');
};
window.adjTime=function(d){ const v=vehicles.find(x=>x.id===rentVehId); const n=rentMin+d; if (n<10) return; rentMin=n; updRentUI(v?.type||'small'); document.querySelectorAll('.qt').forEach(b=>b.classList.remove('active')); animPop('tVal'); };
window.setT=function(m){ const v=vehicles.find(x=>x.id===rentVehId); rentMin=m; updRentUI(v?.type||'small'); document.querySelectorAll('.qt').forEach(b=>b.classList.toggle('active',parseInt(b.textContent)===m)); animPop('tVal'); };
function updRentUI(t){ setText('tVal',rentMin); setText('pbAmt','S/'+calcPrice(t,rentMin)); animPop('pbAmt'); }
window.selPay=function(p){ rentPay=p; document.getElementById('payYape').classList.toggle('active',p==='yape'); document.getElementById('payCash').classList.toggle('active',p==='cash'); };
window.confirmRent=async function(){
  const v=vehicles.find(x=>x.id===rentVehId); if (!v) return;
  const price=calcPrice(v.type,rentMin); const endTime=Date.now()+rentMin*60*1000;
  closeM('mRent');
  try {
    await updateDoc(doc(db,'vehicles',v.id),{status:'in-use',timerEndAt:Timestamp.fromMillis(endTime)});
    await addDoc(collection(db,'sales'),{vId:v.id,vName:v.name,vEmoji:v.emoji,vType:v.type,min:rentMin,price,payment:rentPay,date:Timestamp.now(),by:currentUser?.username||'?'});
    startTimer(v.id,endTime); toast(`🚀 ${v.name} · S/${price}`);
  } catch(e){ toast('❌ Error al guardar.'); }
};

// ══════════════════════════════════════════
//  CRONÓMETRO VEHÍCULOS
// ══════════════════════════════════════════
function startTimer(vehicleId, endTime) {
  if (sessions[vehicleId]?.timerId) clearInterval(sessions[vehicleId].timerId);
  const timerId=setInterval(()=>{
    const rem=endTime-Date.now(); const el=document.getElementById('tmr-'+vehicleId);
    if (rem<=0){ clearInterval(timerId); delete sessions[vehicleId]; handleTimeOver(vehicleId); return; }
    if (el){ el.textContent=fmtTime(rem); el.classList.toggle('urgent',rem<60000); }
  },1000);
  sessions[vehicleId]={endTime,timerId};
  const el=document.getElementById('tmr-'+vehicleId);
  if (el) el.textContent=fmtTime(Math.max(0,endTime-Date.now()));
}
async function handleTimeOver(vehicleId) {
  const v=vehicles.find(x=>x.id===vehicleId);
  try{ await updateDoc(doc(db,'vehicles',vehicleId),{status:'time-over',timerEndAt:null}); }catch(e){}
  playAlert(); tuVehId=vehicleId;
  setText('tuMsg',`"${v?.name||'Vehículo'}" ha terminado. ¿Agregar 10 minutos?`);
  openM('mTimeUp');
}
window.extendVeh=async function(id,extra){
  const se=sessions[id]; const base=se?.endTime||Date.now(); const newEnd=Math.max(base,Date.now())+extra*60*1000;
  const v=vehicles.find(x=>x.id===id);
  try{ await updateDoc(doc(db,'vehicles',id),{status:'in-use',timerEndAt:Timestamp.fromMillis(newEnd)}); startTimer(id,newEnd); toast(`⏱ +${extra} min · S/${calcPrice(v?.type||'small',extra)}`); }
  catch(e){ toast('❌ Error.'); }
};
window.freeVeh=async function(id){
  if (sessions[id]?.timerId){ clearInterval(sessions[id].timerId); delete sessions[id]; }
  try{ await updateDoc(doc(db,'vehicles',id),{status:'available',timerEndAt:null}); toast('🟢 Vehículo liberado'); }
  catch(e){ toast('❌ Error.'); }
};
window.addTenFromAlert=function(){ closeM('mTimeUp'); if (tuVehId) extendVeh(tuVehId,10); };

// ══════════════════════════════════════════
//  CANCELAR VIAJE VEHÍCULO
// ══════════════════════════════════════════
window.openCancelModal=function(id){
  if (!hasPermiso('cancelarViaje')){ toast('⛔ Sin permiso'); return; }
  const v=vehicles.find(x=>x.id===id); if (!v) return;
  cancelVehId=id;
  document.getElementById('cancelVehEmoji').textContent=v.emoji;
  document.getElementById('cancelVehName').textContent=v.name;
  const vr=allSales.filter(s=>s.vId===id).sort((a,b)=>b.date-a.date)[0];
  if (vr){
    const pay=vr.payment==='yape'?'💜 Yape':'💵 Efectivo';
    document.getElementById('cancelVentaInfo').innerHTML=
      `<div class="cancel-venta-row"><span>⏱ Tiempo</span><strong>${vr.min} min</strong></div>
       <div class="cancel-venta-row"><span>💰 Monto</span><strong>S/${vr.price}</strong></div>
       <div class="cancel-venta-row"><span>💳 Pago</span><strong>${pay}</strong></div>`;
    document.getElementById('cancelVentaId').value=vr.id;
  } else {
    document.getElementById('cancelVentaInfo').innerHTML=`<div class="cancel-venta-row" style="color:var(--tx2)">Sin venta asociada</div>`;
    document.getElementById('cancelVentaId').value='';
  }
  openM('mCancelViaje');
};
window.confirmCancelViaje=async function(){
  if (!hasPermiso('cancelarViaje')||!cancelVehId) return;
  const v=vehicles.find(x=>x.id===cancelVehId);
  const ventaId=document.getElementById('cancelVentaId').value;
  closeM('mCancelViaje');
  if (sessions[cancelVehId]?.timerId){ clearInterval(sessions[cancelVehId].timerId); delete sessions[cancelVehId]; }
  try{
    await updateDoc(doc(db,'vehicles',cancelVehId),{status:'available',timerEndAt:null});
    if (ventaId) await deleteDoc(doc(db,'sales',ventaId));
    toast(`🚫 Viaje cancelado · ${v?.name||''} disponible`);
  } catch(e){ toast('❌ Error al cancelar.'); }
  cancelVehId=null;
};

// ══════════════════════════════════════════
//  VEHICLE CRUD
// ══════════════════════════════════════════
window.openAddModal=function(){
  if (!isAdmin()){ toast('⛔ Solo admin'); return; }
  editVehId=null; vType='small'; vEmoji='🚗';
  setText('mVehTitle','Agregar Vehículo');
  document.getElementById('vName').value='';
  document.getElementById('btnDel').style.display='none';
  selType('small'); selEmoji('🚗'); openM('mVeh');
};
window.openEditModal=function(id){
  if (!isAdmin()){ toast('⛔ Solo admin'); return; }
  const v=vehicles.find(x=>x.id===id); if (!v) return;
  editVehId=id; vType=v.type; vEmoji=v.emoji;
  setText('mVehTitle','Editar Vehículo');
  document.getElementById('vName').value=v.name;
  document.getElementById('btnDel').style.display='';
  selType(v.type); selEmoji(v.emoji); openM('mVeh');
};
window.selType=function(t){ vType=t; document.getElementById('tSmall').classList.toggle('active',t==='small'); document.getElementById('tLarge').classList.toggle('active',t==='large'); };
function buildEmojiGrid(){ document.getElementById('emojiGrid').innerHTML=EMOJIS.map(e=>`<button class="ebtn" data-e="${e}" onclick="selEmoji('${e}')">${e}</button>`).join(''); }
window.selEmoji=function(e){ vEmoji=e; document.querySelectorAll('.ebtn').forEach(b=>b.classList.toggle('active',b.dataset.e===e)); };
window.saveVehicle=async function(){
  if (!isAdmin()) return;
  const name=document.getElementById('vName').value.trim(); if (!name){ toast('⚠️ Escribe el nombre'); return; }
  try{
    if (editVehId){ await updateDoc(doc(db,'vehicles',editVehId),{name,type:vType,emoji:vEmoji}); toast('✅ Vehículo actualizado'); }
    else { await addDoc(collection(db,'vehicles'),{name,type:vType,emoji:vEmoji,status:'available',timerEndAt:null}); toast('✅ Vehículo agregado'); }
    closeM('mVeh');
  } catch(e){ toast('❌ Error.'); }
};
window.deleteVehicle=async function(){
  if (!isAdmin()||!editVehId||!confirm('¿Eliminar este vehículo?')) return;
  if (sessions[editVehId]?.timerId){ clearInterval(sessions[editVehId].timerId); delete sessions[editVehId]; }
  try{ await deleteDoc(doc(db,'vehicles',editVehId)); closeM('mVeh'); toast('🗑️ Vehículo eliminado'); }catch(e){ toast('❌ Error.'); }
};

// ══════════════════════════════════════════
//  USER CRUD + PERMISOS
// ══════════════════════════════════════════
window.openAddUserModal=function(){
  if (!isAdmin()) return;
  editUserId=null; newURole='employee'; editUserPerms={};
  setText('mUserTitle','Agregar Empleado');
  ['uName','uUser','uPass'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('btnDelUser').style.display='none';
  selURole('employee'); renderPermsUI({}); openM('mUser');
};
window.openEditUserModal=function(id){
  if (!isAdmin()) return;
  const u=users.find(x=>x.id===id); if (!u) return;
  editUserId=id; newURole=u.role; editUserPerms={...(u.permisos||{})};
  setText('mUserTitle','Editar Usuario');
  document.getElementById('uName').value=u.name;
  document.getElementById('uUser').value=u.username;
  document.getElementById('uPass').value='';
  document.getElementById('btnDelUser').style.display=u.isMainAdmin?'none':'';
  selURole(u.role); renderPermsUI(editUserPerms); openM('mUser');
};
window.selURole=function(r){
  newURole=r;
  document.getElementById('rEmp').classList.toggle('active',r==='employee');
  document.getElementById('rAdm').classList.toggle('active',r==='admin');
  const ps=document.getElementById('permsSection'); if (ps) ps.style.display=r==='employee'?'':'none';
};
function renderPermsUI(perms){
  const container=document.getElementById('permsContainer'); if (!container) return;
  container.innerHTML=PERMISOS_DEF.map(p=>{
    const active=!!(perms[p.key]);
    return `<div class="perm-item ${active?'active':''}" id="permItem-${p.key}" onclick="togglePerm('${p.key}')">
      <div class="perm-left"><span class="perm-icon">${p.icon}</span><div class="perm-info"><div class="perm-label">${p.label}</div><div class="perm-desc">${p.desc}</div></div></div>
      <div class="perm-toggle ${active?'on':''}" id="permToggle-${p.key}"><div class="perm-knob"></div></div>
    </div>`;
  }).join('');
}
window.togglePerm=function(key){ editUserPerms[key]=!editUserPerms[key]; document.getElementById('permItem-'+key)?.classList.toggle('active',editUserPerms[key]); document.getElementById('permToggle-'+key)?.classList.toggle('on',editUserPerms[key]); };
window.saveUser=async function(){
  if (!isAdmin()) return;
  const name=document.getElementById('uName').value.trim();
  const username=document.getElementById('uUser').value.trim().toLowerCase();
  const password=document.getElementById('uPass').value;
  if (!name||!username){ toast('⚠️ Completa nombre y usuario'); return; }
  try{
    const permsToSave=newURole==='employee'?editUserPerms:{};
    if (editUserId){
      const ud={name,username,role:newURole,permisos:permsToSave};
      if (password.length>=4) ud.password=password;
      await updateDoc(doc(db,'users',editUserId),ud);
      if (currentUser.id===editUserId){ currentUser={...currentUser,...ud}; localStorage.setItem(LS_SES,JSON.stringify({id:currentUser.id,username:currentUser.username})); setupTopbar(); buildTabs(); }
      toast('✅ Usuario actualizado');
    } else {
      const q=query(collection(db,'users'),where('username','==',username)); const s=await getDocs(q);
      if (!s.empty){ toast('⚠️ Usuario ya existe'); return; }
      if (password.length<4){ toast('⚠️ Mínimo 4 caracteres'); return; }
      await addDoc(collection(db,'users'),{name,username,password,role:newURole,isMainAdmin:false,permisos:permsToSave});
      toast('✅ Empleado agregado');
    }
    closeM('mUser');
  } catch(e){ toast('❌ Error.'); }
};
window.deleteUser=async function(){
  if (!isAdmin()||!editUserId) return;
  const u=users.find(x=>x.id===editUserId);
  if (u?.isMainAdmin){ toast('⛔ No puedes eliminar al admin principal'); return; }
  if (editUserId===currentUser.id){ toast('⛔ No puedes eliminarte'); return; }
  if (!confirm('¿Eliminar este usuario?')) return;
  try{ await deleteDoc(doc(db,'users',editUserId)); closeM('mUser'); toast('🗑️ Eliminado'); }catch(e){ toast('❌ Error.'); }
};

// ══════════════════════════════════════════
//  HISTORIAL / STATS / CSV
// ══════════════════════════════════════════
function todaySales(){ const s=new Date(); s.setHours(0,0,0,0); return allSales.filter(x=>x.date>=s.getTime()); }
function todayTrampolineSales(){ const s=new Date(); s.setHours(0,0,0,0); return allSales.filter(x=>x.date>=s.getTime()&&x.vType==='trampoline'); }
function filteredSales(){
  const now=Date.now(),day=86400000,week=7*day;
  if (!hasPermiso('verHistorialCompleto')) return allSales.filter(x=>x.date>=now-day);
  if (histFilter==='today') return allSales.filter(x=>x.date>=now-day);
  if (histFilter==='week')  return allSales.filter(x=>x.date>=now-week);
  return allSales;
}
window.setFilter=function(btn,f){
  if (!hasPermiso('verHistorialCompleto')&&f!=='today'){ toast('⛔ Sin permiso'); return; }
  histFilter=f; document.querySelectorAll('.fb').forEach(b=>b.classList.toggle('active',b.dataset.f===f)); renderHistory();
};
window.exportCSV=function(){
  if (!hasPermiso('exportarCSV')){ toast('⛔ Sin permiso'); return; }
  const sales=filteredSales(); if (!sales.length){ toast('Sin ventas para exportar'); return; }
  const h='Nombre,Tipo,Minutos,Precio,Pago,Empleado,Fecha,Hora';
  const rows=sales.map(s=>{
    const d=new Date(s.date);
    const tipo=s.vType==='trampoline'?'Trampolín':(s.vType==='large'?'Grande':'Pequeño');
    return `"${s.vName}","${tipo}",${s.min},"S/${s.price}","${s.payment==='yape'?'Yape':'Efectivo'}","${s.by||'?'}","${d.toLocaleDateString('es-PE')}","${d.toLocaleTimeString('es-PE',{hour:'2-digit',minute:'2-digit'})}"`;
  });
  const blob=new Blob(['\uFEFF'+[h,...rows].join('\n')],{type:'text/csv;charset=utf-8;'});
  Object.assign(document.createElement('a'),{href:URL.createObjectURL(blob),download:`nexora_${Date.now()}.csv`}).click();
  toast('📁 CSV exportado');
};
window.resetDay=async function(){
  if (!isAdmin()||!confirm('¿Borrar ventas de hoy?')) return;
  const s=new Date(); s.setHours(0,0,0,0);
  const q=query(collection(db,'sales'),where('date','>=',Timestamp.fromMillis(s.getTime())));
  const snap=await getDocs(q); const batch=writeBatch(db);
  snap.docs.forEach(d=>batch.delete(d.ref)); await batch.commit(); toast('🔄 Datos del día borrados');
};

// ══════════════════════════════════════════
//  CIERRE DE CAJA
// ══════════════════════════════════════════

// Ganancia del empleado usando comisionConfig (configurable desde el panel admin):
// - Menos de S/100 → (total / 2) - 5  (fórmula automática)
// - A partir de S/100 → busca el tramo más alto que el empleado alcanzó
function calcComisionEmpleado(totalVendido) {
  if (totalVendido <= 0) return 0;
  if (totalVendido < 100) return Math.max(0, Math.round((totalVendido / 2) - 5));
  // Ordenar tramos de mayor a menor y buscar el primero que aplica
  const tramos = [...(comisionConfig.tramos || [])].sort((a,b) => b.desde - a.desde);
  for (const t of tramos) {
    if (totalVendido >= t.desde) return t.pago;
  }
  return 45; // fallback
}

// Abre el modal de cierre de caja
window.openCierreCaja = function() {
  if (!isAdmin()) { toast('⛔ Solo el admin puede abrir el cierre de caja'); return; }

  const today     = todaySales();
  const totalDia  = today.reduce((s,x)=>s+x.price, 0);
  const yape      = today.filter(x=>x.payment==='yape').reduce((s,x)=>s+x.price, 0);
  const efectivo  = today.filter(x=>x.payment==='cash').reduce((s,x)=>s+x.price, 0);
  const totalVtas = today.length;

  // Agrupar ventas por empleado
  const byEmp = {};
  today.forEach(s => {
    const emp = s.by || '?';
    if (!byEmp[emp]) byEmp[emp] = 0;
    byEmp[emp] += s.price;
  });

  // Calcular comisiones
  let totalComisiones = 0;
  const empRows = Object.entries(byEmp).map(([emp, monto]) => {
    const comision  = calcComisionEmpleado(monto);
    totalComisiones += comision;
    return { emp, monto, comision };
  });

  const gananciaNeta = totalDia - totalComisiones;

  // Construir HTML de empleados
  const empHTML = empRows.length === 0
    ? `<div class="cc-empty">Sin ventas registradas hoy</div>`
    : empRows.map(r => `
        <div class="cc-emp-row">
          <div class="cc-emp-info">
            <span class="cc-emp-ico">👷</span>
            <div>
              <div class="cc-emp-name">@${r.emp}</div>
              <div class="cc-emp-sub">Vendió S/${r.monto} · ${today.filter(s=>s.by===r.emp).length} ventas</div>
            </div>
          </div>
          <div class="cc-emp-ganancia">
            <div class="cc-emp-label">Su ganancia</div>
            <div class="cc-emp-val">S/${r.comision}</div>
          </div>
        </div>`
      ).join('');

  // Inyectar datos en el modal
  document.getElementById('ccTotalDia').textContent   = 'S/'+totalDia;
  document.getElementById('ccTotalDia2').textContent  = 'S/'+totalDia;
  document.getElementById('ccYape').textContent       = 'S/'+yape;
  document.getElementById('ccEfectivo').textContent   = 'S/'+efectivo;
  document.getElementById('ccVentas').textContent     = totalVtas;
  document.getElementById('ccComisiones').textContent = 'S/'+totalComisiones;
  document.getElementById('ccNeta').textContent       = 'S/'+gananciaNeta;
  document.getElementById('ccEmpList').innerHTML      = empHTML;
  document.getElementById('ccFecha').textContent      =
    new Date().toLocaleDateString('es-PE',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  // Mostrar sección de ganancia admin solo si es admin
  const adminSec = document.getElementById('ccAdminSec');
  if (adminSec) adminSec.style.display = isAdmin() ? '' : 'none';

  // El botón confirmar solo lo ve el admin
  const btnConfirmar = document.getElementById('ccBtnConfirmar');
  if (btnConfirmar) btnConfirmar.style.display = isAdmin() ? '' : 'none';

  openM('mCierreCaja');
};

// Confirmar cierre — guarda en Firestore; el listener notifica a todos en tiempo real
window.confirmarCierreCaja = async function() {
  if (!isAdmin()) { toast('⛔ Solo el admin puede confirmar el cierre'); return; }

  const today    = todaySales();
  const totalDia = today.reduce((s,x)=>s+x.price, 0);
  const yape     = today.filter(x=>x.payment==='yape').reduce((s,x)=>s+x.price, 0);
  const efectivo = today.filter(x=>x.payment==='cash').reduce((s,x)=>s+x.price, 0);

  const byEmp = {};
  today.forEach(s => {
    const emp = s.by || '?';
    if (!byEmp[emp]) byEmp[emp] = 0;
    byEmp[emp] += s.price;
  });

  const comisiones = Object.entries(byEmp).map(([emp, monto]) => ({
    emp, monto, comision: calcComisionEmpleado(monto)
  }));
  const totalComisiones = comisiones.reduce((s,c)=>s+c.comision, 0);
  const gananciaNeta    = totalDia - totalComisiones;

  try {
    const btn = document.getElementById('ccBtnConfirmar');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

    await addDoc(collection(db,'cierres_caja'), {
      fecha:         Timestamp.now(),
      totalDia,      yape,       efectivo,
      totalVentas:   today.length,
      comisiones,    totalComisiones,
      gananciaNeta,  cerradoPor: currentUser.username
    });

    closeM('mCierreCaja');
    // El onSnapshot de subscribeCierres se dispara en TODOS los dispositivos
    // y llama mostrarCelebracionCierre() automáticamente para cada uno
  } catch(e) {
    console.error(e);
    toast('❌ Error al guardar el cierre');
    const btn = document.getElementById('ccBtnConfirmar');
    if (btn) { btn.disabled = false; btn.textContent = '✅ Confirmar cierre de caja'; }
  }
};

// Modal de celebración — se llama desde el listener en TODOS los dispositivos
function mostrarCelebracionCierre(cierre) {
  const { totalDia, yape, efectivo, comisiones=[], totalComisiones, gananciaNeta } = cierre;
  const fecha = new Date().toLocaleDateString('es-PE',{day:'numeric',month:'long',year:'numeric'});

  if (isAdmin()) {
    // ── Vista del ADMIN ──
    const empDetalles = comisiones.length > 0
      ? comisiones.map(c =>
          `<div class="ccb-emp-row">
            <span>👷 @${c.emp}</span>
            <strong>S/${c.comision}</strong>
          </div>
          <div class="ccb-emp-row" style="font-size:11px;padding-top:0;padding-bottom:4px">
            <span style="padding-left:20px;color:rgba(255,255,255,.5)">Vendió S/${c.monto}</span>
          </div>`
        ).join('')
      : `<div class="ccb-emp-row" style="color:rgba(255,255,255,.5)"><span>Sin empleados hoy</span></div>`;

    document.getElementById('ccbTitulo').textContent      = '¡Caja cerrada! 🎉';
    document.getElementById('ccbSubtitulo').textContent   = fecha;
    document.getElementById('ccbGanancia').textContent    = 'S/'+gananciaNeta;
    document.getElementById('ccbGananciaLbl').textContent = '👑 Tu ganancia neta';
    document.getElementById('ccbDetalles').innerHTML = `
      <div class="ccb-row"><span>💰 Total generado</span><strong>S/${totalDia}</strong></div>
      <div class="ccb-row"><span>💜 Yape</span><strong>S/${yape}</strong></div>
      <div class="ccb-row"><span>💵 Efectivo</span><strong>S/${efectivo}</strong></div>
      <div class="ccb-divider"></div>
      <div class="ccb-sub">Pagos a empleados</div>
      ${empDetalles}
      <div class="ccb-divider"></div>
      <div class="ccb-row ccb-row--total"><span>✅ Tu ganancia</span><strong>S/${gananciaNeta}</strong></div>`;
  } else {
    // ── Vista del EMPLEADO ──
    const miUsername = currentUser?.username || '?';
    const miDato     = comisiones.find(c => c.emp === miUsername);
    const miGanancia = miDato?.comision || 0;
    const miVenta    = miDato?.monto    || 0;
    // Contar mis alquileres del día
    const misAlquileres = todaySales().filter(s => s.by === miUsername).length;

    document.getElementById('ccbTitulo').textContent      = '¡Felicitaciones! 🎊';
    document.getElementById('ccbSubtitulo').textContent   = fecha;
    document.getElementById('ccbGanancia').textContent    = 'S/'+miGanancia;
    document.getElementById('ccbGananciaLbl').textContent = '💵 Tu ganancia del día';
    document.getElementById('ccbDetalles').innerHTML = `
      <div class="ccb-row"><span>📦 Alquileres que hiciste</span><strong>${misAlquileres}</strong></div>
      <div class="ccb-row"><span>💰 Lo que generaste</span><strong>S/${miVenta}</strong></div>
      <div class="ccb-divider"></div>
      <div class="ccb-row ccb-row--total"><span>🎉 Tu pago de hoy</span><strong>S/${miGanancia}</strong></div>`;
  }

  openM('mCierreBravo');
  launchConfetti2();
  playGananciaSound();
}

// Confetti para el modal de cierre (usa el canvas del modal)
function launchConfetti2() {
  const canvas = document.getElementById('ccbConfetti');
  if (!canvas) return;
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');
  canvas.width  = canvas.offsetWidth;
  canvas.height = canvas.offsetHeight;
  const pieces = Array.from({length:80}, () => ({
    x: Math.random()*canvas.width, y: -10 - Math.random()*60,
    r: 4+Math.random()*7, d: 2.5+Math.random()*3,
    color:['#FCD34D','#A78BFA','#34D399','#F87171','#60A5FA','#F472B6','#fff'][Math.floor(Math.random()*7)],
    rot: Math.random()*360, spin:(Math.random()-.5)*9,
    shape: Math.random()>.4 ? 'rect' : 'circle'
  }));
  let frame;
  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    pieces.forEach(p => {
      ctx.save(); ctx.fillStyle=p.color;
      ctx.translate(p.x,p.y); ctx.rotate(p.rot*Math.PI/180);
      if (p.shape==='rect') ctx.fillRect(-p.r/2,-p.r/3,p.r,p.r/1.6);
      else { ctx.beginPath(); ctx.arc(0,0,p.r/2,0,Math.PI*2); ctx.fill(); }
      ctx.restore();
      p.y+=p.d; p.x+=Math.sin(p.y*.025)*1.5; p.rot+=p.spin;
    });
    if (pieces.some(p=>p.y<canvas.height+20)) frame=requestAnimationFrame(draw);
    else { ctx.clearRect(0,0,canvas.width,canvas.height); canvas.style.display='none'; }
  }
  draw();
  setTimeout(()=>{ cancelAnimationFrame(frame); ctx.clearRect(0,0,canvas.width,canvas.height); canvas.style.display='none'; }, 5000);
}

// Sonido de fanfarria para el cierre
function playGananciaSound() {
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    [[523,.0,.12],[659,.1,.12],[784,.2,.12],[1047,.32,.35],[880,.52,.12],[1047,.65,.4]]
    .forEach(([f,s,d])=>{
      const o=ctx.createOscillator(),g=ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type='sine'; o.frequency.value=f;
      g.gain.setValueAtTime(.35,ctx.currentTime+s);
      g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+s+d);
      o.start(ctx.currentTime+s); o.stop(ctx.currentTime+s+d+.05);
    });
  } catch(_){}
}


window.openM =function(id){ document.getElementById(id).style.display='flex'; };
window.closeM=function(id){ document.getElementById(id).style.display='none'; };
document.addEventListener('click',e=>{
  ['mRent','mVeh','mTimeUp','mLogout','mUser','mEditPago','mCancelViaje','mTrRent','mTrSlotEdit','mCancelTr','mCierreCaja','mCierreBravo'].forEach(id=>{
    const el=document.getElementById(id); if (el&&e.target===el) closeM(id);
  });
});
function calcPrice(type,min){ return (min/10)*(type==='large'?10:5); }
function fmtTime(ms){ const s=Math.max(0,Math.floor(ms/1000)); return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
function setText(id,v){ const e=document.getElementById(id); if (e) e.textContent=v; }
function animPop(id){ const e=document.getElementById(id); if (!e) return; e.style.animation='none'; e.offsetHeight; e.style.animation='numPop .2s ease'; }
const isAdmin=()=>currentUser?.role==='admin';
let tTimer=null;
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(tTimer); tTimer=setTimeout(()=>t.classList.remove('show'),2600); }
function playAlert(){
  try{ const ctx=new (window.AudioContext||window.webkitAudioContext)(); [[880,0,.18],[660,.22,.18],[880,.44,.18],[440,.66,.35]].forEach(([f,s,d])=>{ const o=ctx.createOscillator(),g=ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.type='sine'; o.frequency.value=f; g.gain.setValueAtTime(.4,ctx.currentTime+s); g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+s+d); o.start(ctx.currentTime+s); o.stop(ctx.currentTime+s+d+.05); }); }catch(_){}
}
function playKidAlert(){
  try{ const ctx=new (window.AudioContext||window.webkitAudioContext)(); [[880,0,.18],[1047,.22,.18],[880,.44,.18],[660,.66,.35]].forEach(([f,s,d])=>{ const o=ctx.createOscillator(),g=ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.type='sine'; o.frequency.value=f; g.gain.setValueAtTime(.35,ctx.currentTime+s); g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+s+d); o.start(ctx.currentTime+s); o.stop(ctx.currentTime+s+d+.05); }); }catch(_){}
}