// Global verfügbar machen
window.showExistingPlayers = showExistingPlayers;
window.showNewPlayerInput = showNewPlayerInput;
window.resetRoleSelection = resetRoleSelection;
window.enterAsSpectator = enterAsSpectator;
window.switchUser = switchUser;
window.selectMyPlayer = selectMyPlayer;
window.registerNewPlayer = registerNewPlayer;
window.confirmAdminPassword = confirmAdminPassword;
window.showTab = showTab;
window.addPlayer = addPlayer;
window.removePlayer = removePlayer;
window.toggleRef = toggleRef;
window.setPlayerPassword = setPlayerPassword;
window.removePlayerPassword = removePlayerPassword;
window.toggleRegistrationLock = toggleRegistrationLock;
window.drawGroups = drawGroups;
window.drawKOPhase = drawKOPhase;
window.drawSemifinals = drawSemifinals;
window.drawFinals = drawFinals;
window.resetTournament = resetTournament;
window.updateTeamName = updateTeamName;
window.submitMatchResult = submitMatchResult;
window.confirmMatchResult = confirmMatchResult;
window.addClub = addClub;
window.removeClub = removeClub;
window.resetClubsToDefault = resetClubsToDefault;
window.setClubLogo = setClubLogo;
window.startInteractiveDraft = startInteractiveDraft;
window.spinWheel = spinWheel;
window.nextDraftStep = nextDraftStep;
window.finishDraft = finishDraft;
window.cancelDraft = cancelDraft;
window.saveRules = saveRules;
window.submitTip = submitTip;
window.placeBet = placeBet;

// 1. Firebase Konfiguration
const firebaseConfig = {
  apiKey: "AIzaSyBh0yOA1ckPp3TFBJ-Yz932k9A2R1pkTSc",
  authDomain: "fal-fifa-turnier.firebaseapp.com",
  databaseURL: "https://fal-fifa-turnier-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "fal-fifa-turnier",
  storageBucket: "fal-fifa-turnier.firebasestorage.app",
  messagingSenderId: "1095058810971",
  appId: "1:1095058810971:web:2023d72275ed8c22e2b77e"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

const ADMIN_PASSWORD = "1234";

const DEFAULT_CLUBS = [
  "Real Madrid", "FC Bayern", "ManCity", "Arsenal",
  "FC Barcelona", "PSG", "Inter Mailand", "Leverkusen",
  "Liverpool", "ManU", "Atletico", "BVB"
];

const DEFAULT_RULES = "Noch keine Regeln festgelegt. Der Admin kann sie hier eintragen.";

// Feste 18er-Farbpalette fürs Glücksrad (Spieler & unbekannte Clubs)
const COLOR_PALETTE_18 = [
  '#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c',
  '#e67e22', '#ff6b81', '#00cec9', '#fd79a8', '#6c5ce7', '#00b894',
  '#0984e3', '#d63031', '#55efc4', '#a29bfe', '#fab1a0', '#74b9ff'
];

// Bekannte Vereinsfarben für die Standard-Topteams
const KNOWN_CLUB_COLORS = {
  "Real Madrid": "#FEBE10",
  "FC Bayern": "#DC052D",
  "ManCity": "#6CABDD",
  "Arsenal": "#EF0107",
  "FC Barcelona": "#A50044",
  "PSG": "#004170",
  "Inter Mailand": "#0068A8",
  "Leverkusen": "#E32221",
  "Liverpool": "#C8102E",
  "ManU": "#DA291C",
  "Atletico": "#CE3524",
  "BVB": "#FDE100"
};

// 2. Zustand
let players = [];
let availableClubs = [...DEFAULT_CLUBS];
let clubLogos = {};     // { clubName: "https://...wappen.png" }
let teams = [];
let groups = [];
let groupMatches = [];
let koMatches = [];
let rules = DEFAULT_RULES;
let tips = {};          // { playerName: { teamId, amount } }
let tipsEvaluated = false;
let registrationLocked = false;
let myPlayerName = localStorage.getItem('fifa_my_player') || null;
let pendingAdminLogin = false;
let userBalances = {};  // { "Name": 100 }
let bets = [];          // { matchId, isKO, playerName, chosenTeamId, amount }

// Status-Variablen für das Auslosungs-System (Duo-Draft) - UNVERÄNDERT
let draftState = { active: false, currentStep: 0, tempP1: null, tempP2: null, remainingPlayers: [], remainingClubs: [], spinning: false, startTime: null, targetAngle: 0, duration: 4000, lastDrawnItem: null, pairs: [] };
let animFrameId = null;

function getPlayerObj(name) {
  if (!name) return null;
  return players.find(p => p.name.toLowerCase() === name.trim().toLowerCase());
}

function isAdmin() {
  return myPlayerName && myPlayerName.trim().toLowerCase() === 'tim';
}

function isRef() {
  const p = getPlayerObj(myPlayerName);
  return !!(p && p.isRef);
}

// Ref hat exakt die gleichen Rechte wie Admin, AUSSER: Spieler löschen & Ref-Rolle selbst vergeben/entziehen.
function hasElevated() {
  return isAdmin() || isRef();
}
// Alias, damit alte Bezeichnung weiterhin funktioniert
function canManageMatches() {
  return hasElevated();
}

function getMyTeam() {
  if (!myPlayerName) return null;
  return teams.find(t => t.p1 === myPlayerName || t.p2 === myPlayerName);
}

function isTournamentFinished() {
  const finale = koMatches.find(m => m.round === '🏆 FINALE');
  return !!(finale && finale.confirmed);
}

// Gibt ein kleines <img>-Wappen zurück, falls für den Club eine Logo-URL hinterlegt ist
function clubLogoImg(clubName, size) {
  size = size || 18;
  if (!clubName || !clubLogos[clubName]) return '';
  return `<img src="${clubLogos[clubName]}" alt="${clubName}" style="height:${size}px; width:${size}px; object-fit:contain; vertical-align:middle; border-radius:3px; margin-right:5px; background:#fff;">`;
}

function setClubLogo(clubName) {
  if (!hasElevated()) return;
  const current = clubLogos[clubName] || '';
  const url = prompt(`Wappen-Bild-URL für ${clubName} eingeben (leer lassen zum Entfernen):`, current);
  if (url === null) return;
  if (url.trim() === '') {
    delete clubLogos[clubName];
  } else {
    clubLogos[clubName] = url.trim();
  }
  saveData();
}

document.addEventListener('DOMContentLoaded', () => {
  const btnShowNew = document.getElementById('btn-show-new');
  if (btnShowNew) btnShowNew.addEventListener('click', showNewPlayerInput);

  const btnShowExisting = document.getElementById('btn-show-existing');
  if (btnShowExisting) btnShowExisting.addEventListener('click', showExistingPlayers);

  const btnSpectator = document.getElementById('btn-enter-spectator');
  if (btnSpectator) btnSpectator.addEventListener('click', enterAsSpectator);

  const btnRegister = document.getElementById('btn-register-new');
  if (btnRegister) btnRegister.addEventListener('click', registerNewPlayer);

  const btnConfirmAdmin = document.getElementById('btn-confirm-admin');
  if (btnConfirmAdmin) btnConfirmAdmin.addEventListener('click', confirmAdminPassword);

  const btnSwitchUser = document.getElementById('btn-switch-user');
  if (btnSwitchUser) btnSwitchUser.addEventListener('click', switchUser);

  document.querySelectorAll('.btn-reset-role').forEach(btn => {
    btn.addEventListener('click', resetRoleSelection);
  });

  if (myPlayerName) {
    enterAsSpectator();
  }
});

// 3. Rollen & Auth
function enterAsSpectator() {
  document.getElementById('role-selection-modal').style.display = 'none';
  document.getElementById('app-header').style.display = 'flex';
  document.getElementById('app-nav').style.display = 'flex';
  document.getElementById('app-main').style.display = 'block';

  const userBadge = document.getElementById('user-badge');
  if (userBadge) {
    let roleTag = '';
    if (isAdmin()) roleTag = '⭐ (Admin)';
    else if (isRef()) roleTag = '🟨 (Ref)';

    userBadge.innerHTML = myPlayerName
      ? `Angemeldet als: <strong>${myPlayerName}</strong> ${roleTag}`
      : 'Modus: <strong>Zuschauer</strong>';
  }

  const adminBtn = document.getElementById('btn-admin');
  if (adminBtn) adminBtn.style.display = hasElevated() ? 'inline-block' : 'none';

  showTab('home');
}

function switchUser() {
  localStorage.removeItem('fifa_my_player');
  myPlayerName = null;

  document.getElementById('app-header').style.display = 'none';
  document.getElementById('app-nav').style.display = 'none';
  document.getElementById('app-main').style.display = 'none';

  resetRoleSelection();
  document.getElementById('role-selection-modal').style.display = 'flex';
}

function showNewPlayerInput() {
  if (registrationLocked) {
    alert('Die Registrierung neuer Spieler wurde vom Admin gesperrt.');
    return;
  }
  document.getElementById('role-options').style.display = 'none';
  document.getElementById('new-player-select').style.display = 'block';
  document.getElementById('existing-players-select').style.display = 'none';
  document.getElementById('admin-password-select').style.display = 'none';
}

function showExistingPlayers() {
  const container = document.getElementById('existing-players-list');
  if (!container) return;

  if (players.length === 0) {
    container.innerHTML = '<p class="empty-state">Noch keine Spieler registriert.</p>';
  } else {
    container.innerHTML = players.map(p => `
      <button class="btn-secondary" style="margin: 4px; width: auto;" onclick="selectMyPlayer('${p.name}')">
        ${p.name} ${p.isRef ? '🟨' : ''} ${p.password ? '🔒' : ''}
      </button>
    `).join('');
  }

  document.getElementById('role-options').style.display = 'none';
  document.getElementById('new-player-select').style.display = 'none';
  document.getElementById('existing-players-select').style.display = 'block';
  document.getElementById('admin-password-select').style.display = 'none';
}

function resetRoleSelection() {
  pendingAdminLogin = false;
  document.getElementById('role-options').style.display = 'block';
  document.getElementById('new-player-select').style.display = 'none';
  document.getElementById('existing-players-select').style.display = 'none';
  document.getElementById('admin-password-select').style.display = 'none';
}

function selectMyPlayer(name) {
  const pObj = getPlayerObj(name);

  if (name.trim().toLowerCase() === 'tim') {
    promptPassword('admin', name, '🔒 Zugang gesperrt!');
    return;
  }

  if (pObj && pObj.password) {
    promptPassword('player', name, `🔒 Passwort für ${name} eingeben:`);
    return;
  }

  myPlayerName = name;
  localStorage.setItem('fifa_my_player', name);
  enterAsSpectator();
}

function registerNewPlayer() {
  if (registrationLocked) {
    alert('Die Registrierung neuer Spieler wurde vom Admin gesperrt.');
    return;
  }
  const input = document.getElementById('self-player-name');
  const name = input ? input.value.trim() : '';
  if (!name) return alert('Bitte Namen eingeben!');

  if (name.toLowerCase() === 'tim') {
    promptPassword('admin', name, '🔒 Zugang gesperrt!');
    return;
  }

  if (getPlayerObj(name)) return alert('Dieser Name existiert bereits!');

  players.push({ name: name, isRef: false, password: null });
  myPlayerName = name;
  localStorage.setItem('fifa_my_player', name);
  saveData();
  enterAsSpectator();
}

function promptPassword(type, name, textPrompt) {
  pendingAdminLogin = { type, name };
  document.getElementById('role-options').style.display = 'none';
  document.getElementById('new-player-select').style.display = 'none';
  document.getElementById('existing-players-select').style.display = 'none';
  document.getElementById('admin-password-select').style.display = 'block';

  const textEl = document.getElementById('password-prompt-text');
  if (textEl) textEl.innerText = textPrompt;

  const pwdInput = document.getElementById('admin-password-input');
  if (pwdInput) pwdInput.value = '';
}

function confirmAdminPassword() {
  const pwdInput = document.getElementById('admin-password-input');
  const pwd = pwdInput ? pwdInput.value.trim() : '';

  if (!pendingAdminLogin) return;

  if (pendingAdminLogin.type === 'admin') {
    if (pwd === ADMIN_PASSWORD) {
      if (!getPlayerObj(pendingAdminLogin.name)) {
        players.push({ name: pendingAdminLogin.name, isRef: false, password: null });
        saveData();
      }
      myPlayerName = pendingAdminLogin.name;
      localStorage.setItem('fifa_my_player', myPlayerName);
      pendingAdminLogin = false;
      enterAsSpectator();
    } else {
      alert('Versuchs erst gar nicht');
    }
  } else if (pendingAdminLogin.type === 'player') {
    const pObj = getPlayerObj(pendingAdminLogin.name);
    if (pObj && pObj.password === pwd) {
      myPlayerName = pendingAdminLogin.name;
      localStorage.setItem('fifa_my_player', myPlayerName);
      pendingAdminLogin = false;
      enterAsSpectator();
    } else {
      alert('Falsches Passwort!');
    }
  }
}

function showTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

  const btn = document.getElementById(`btn-${tabName}`);
  const tab = document.getElementById(`tab-${tabName}`);
  if (btn) btn.classList.add('active');
  if (tab) tab.classList.add('active');

  if (tabName === 'matches') renderMatches();
  if (tabName === 'groups') renderGroups();
}

// 4. Live-Sync via Firebase
db.ref('tournament').on('value', (snapshot) => {
  const data = snapshot.val() || {};
  let rawPlayers = data.players || [];

  players = rawPlayers.map(p => typeof p === 'string' ? { name: p, isRef: false, password: null } : p);
  availableClubs = data.availableClubs || [...DEFAULT_CLUBS];
  clubLogos = data.clubLogos || {};
  teams = data.teams || [];
  groups = data.groups || [];
  groupMatches = data.groupMatches || [];
  koMatches = data.koMatches || [];
  rules = data.rules || DEFAULT_RULES;
  tips = data.tips || {};
  tipsEvaluated = data.tipsEvaluated || false;
  registrationLocked = data.registrationLocked || false;
  draftState = data.draftState || { active: false, currentStep: 0, tempP1: null, tempP2: null, remainingPlayers: [], remainingClubs: [], spinning: false, startTime: null, targetAngle: 0, duration: 4000, lastDrawnItem: null, pairs: [] };

  userBalances = data.userBalances || {};
  bets = data.bets || [];

  // Falls das Turnier zurückgesetzt wurde (oder der eigene Spieler entfernt wurde),
  // wird man automatisch zurück zum Auswahlbildschirm geschickt.
  if (myPlayerName && !getPlayerObj(myPlayerName)) {
    myPlayerName = null;
    localStorage.removeItem('fifa_my_player');
    document.getElementById('app-header').style.display = 'none';
    document.getElementById('app-nav').style.display = 'none';
    document.getElementById('app-main').style.display = 'none';
    resetRoleSelection();
    document.getElementById('role-selection-modal').style.display = 'flex';
    return;
  }

  renderAll();
  handleLiveDraftUI();
});

function saveData() {
  db.ref('tournament').set({
    players,
    availableClubs,
    clubLogos,
    teams,
    groups,
    groupMatches,
    koMatches,
    rules,
    tips,
    tipsEvaluated,
    registrationLocked,
    draftState,
    userBalances,
    bets
  });
}

// 5. Profi-Clubs Verwaltung
function addClub() {
  if (!hasElevated()) return;
  const input = document.getElementById('new-club-name');
  const name = input ? input.value.trim() : '';
  if (!name) return;
  if (availableClubs.includes(name)) return alert('Club bereits in der Liste!');

  availableClubs.push(name);
  input.value = '';
  saveData();
}

function removeClub(index) {
  if (!hasElevated()) return;
  availableClubs.splice(index, 1);
  saveData();
}

function resetClubsToDefault() {
  if (!hasElevated()) return;
  if (confirm('Verfügbare Clubs auf Standard-Topteams zurücksetzen?')) {
    availableClubs = [...DEFAULT_CLUBS];
    saveData();
  }
}

// 6. LIVE INTERAKTIVE AUSLOSUNG SHOW (3-Schritt System: P1 -> P2 -> Club) - UNVERÄNDERT
function startInteractiveDraft() {
  if (!hasElevated()) return;
  if (players.length < 4 || players.length % 2 !== 0) {
    return alert(`Du benötigst eine gerade und ausreichend hohe Anzahl an Spielern (aktuell: ${players.length}).`);
  }
  if (availableClubs.length < (players.length / 2)) {
    return alert(`Du hast zu wenige Profi-Clubs in der Liste! Mindestens ${players.length / 2} benötigt.`);
  }

  if (confirm('Soll die Auslosungs-Show jetzt LIVE gestartet werden?')) {
    teams = [];
    groups = [];
    groupMatches = [];
    koMatches = [];
    tips = {};
    tipsEvaluated = false;

    draftState = {
      active: true,
      currentStep: 0, // 0: P1, 1: P2, 2: Club
      tempP1: null,
      tempP2: null,
      remainingPlayers: [...players.map(p => p.name)],
      remainingClubs: [...availableClubs],
      spinning: false,
      startTime: null,
      targetAngle: 0,
      duration: 4000,
      lastDrawnItem: null,
      pairs: []
    };

    saveData();
    handleLiveDraftUI();
  }
}

function handleLiveDraftUI() {
  const modal = document.getElementById('draft-modal');
  if (!modal) return;

  if (!draftState || !draftState.active) {
    modal.style.display = 'none';
    if (animFrameId) cancelAnimationFrame(animFrameId);
    return;
  }

  modal.style.display = 'flex';
  renderDraftStep();
}

function renderDraftStep() {
  const stage = document.getElementById('draft-stage');
  if (!stage) return;

  const noPlayersLeft = !draftState.remainingPlayers || draftState.remainingPlayers.length === 0;
  const noDuoPending = !draftState.tempP1 && !draftState.tempP2 && !draftState.lastDrawnItem;

  if (noPlayersLeft && noDuoPending) {
    stage.innerHTML = `
      <h3 style="color:#4CAF50; margin-bottom: 10px;">🎉 Alle Teams & Clubs wurden gelost! 🎉</h3>
      <p>Die Duos und ihre Profi-Vereine stehen fest.</p>
      ${hasElevated() ? `
        <button class="btn-primary role-btn" style="margin-top:15px;" onclick="finishDraft()">
          💾 Teams speichern & Auslosung beenden
        </button>
      ` : '<p style="color:var(--fal-yellow);">Warte auf Admin-Bestätigung...</p>'}
    `;
    return;
  }

  const currentTeamNum = (draftState.pairs ? draftState.pairs.length : teams.length) + 1;
  let stepText = '';
  if (draftState.currentStep === 0) stepText = '🎰 Step 1: Lose <strong>Spieler 1</strong>';
  else if (draftState.currentStep === 1) stepText = `🎰 Step 2: Lose <strong>Spieler 2</strong> (Partner für ${draftState.tempP1})`;
  else if (draftState.currentStep === 2) stepText = `🎰 Step 3: Lose <strong>Club</strong> für Duo ${draftState.tempP1} & ${draftState.tempP2}`;

  stage.innerHTML = `
    <p style="font-size:0.9em; opacity:0.8;">Erstelle Team ${currentTeamNum}</p>
    <h3 style="margin:5px 0; color:var(--fal-yellow);">${stepText}</h3>

    <div style="background:rgba(0,0,0,0.3); padding:10px; border-radius:8px; margin: 10px 0;">
      <small style="opacity:0.7;">Aktuelles Status-Duo:</small><br>
      <strong>${draftState.tempP1 ? draftState.tempP1 : '???'}</strong> & <strong>${draftState.tempP2 ? draftState.tempP2 : '???'}</strong>
    </div>

    <div class="wheel-container" style="position:relative; width:260px; margin:0 auto;">
      <div class="wheel-pointer" style="position:absolute; top:-10px; left:50%; transform:translateX(-50%); width:0; height:0; border-left:10px solid transparent; border-right:10px solid transparent; border-top:15px solid red; z-index:10;"></div>
      <canvas id="wheel-canvas" width="260" height="260"></canvas>
    </div>

    <div id="spin-result" style="height: 35px; font-weight: bold; font-size: 1.1em; color: var(--fal-yellow); margin-top:5px;">
      ${draftState.lastDrawnItem ? `🎯 Gezogen: <u>${draftState.lastDrawnItem}</u>` : ''}
    </div>

    ${hasElevated() ? `
      <div style="margin-top:15px; display:flex; gap:10px; justify-content:center;">
        ${!draftState.spinning && !draftState.lastDrawnItem ? `
          <button class="btn-primary role-btn" id="btn-spin-wheel" onclick="spinWheel()">
            🎰 Rad drehen
          </button>
        ` : ''}

        ${!draftState.spinning && draftState.lastDrawnItem ? `
          <button class="btn-primary role-btn" onclick="nextDraftStep()">
            Weiter ➡️
          </button>
        ` : ''}

        <button class="btn-secondary role-btn" style="background:#e74c3c; color:white; border:none;" onclick="cancelDraft()">
          🛑 Abbrechen
        </button>
      </div>
    ` : `
      <p style="font-size:0.9em; opacity:0.8; margin-top:10px;">
        ${draftState.spinning ? '🎰 Das Rad dreht sich live...' : 'Der Admin dreht gleich am Rad!'}
      </p>
    `}
  `;

  startWheelAnimationLoop();
}

function startWheelAnimationLoop() {
  if (animFrameId) cancelAnimationFrame(animFrameId);

  function animate() {
    if (!draftState || !draftState.active) return;

    let currentAngle = 0;

    if (draftState.spinning && draftState.startTime) {
      const elapsed = Date.now() - draftState.startTime;
      const progress = Math.min(elapsed / (draftState.duration || 4000), 1);
      const easeOut = 1 - Math.pow(1 - progress, 3);
      currentAngle = (draftState.targetAngle || 0) * easeOut;

      if (progress >= 1) {
        drawWheelCanvas(draftState.targetAngle);
        return;
      }
    } else {
      currentAngle = draftState.targetAngle || 0;
    }

    drawWheelCanvas(currentAngle);

    if (draftState.spinning) {
      animFrameId = requestAnimationFrame(animate);
    }
  }

  animFrameId = requestAnimationFrame(animate);
}

function drawWheelCanvas(angleOffset) {
  const canvas = document.getElementById('wheel-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let items = [];
  if (draftState.currentStep === 0 || draftState.currentStep === 1) {
    items = draftState.remainingPlayers;
  } else {
    items = draftState.remainingClubs;
  }

  const numItems = items ? items.length : 0;
  if (numItems === 0) {
    ctx.clearRect(0, 0, 260, 260);
    return;
  }

  const sliceAngle = (2 * Math.PI) / numItems;
  ctx.clearRect(0, 0, 260, 260);

  const colors = ['#1e3e62', '#0b192c', '#132a4a', '#2a2a2a', '#10233d'];

  for (let i = 0; i < numItems; i++) {
    const startAngle = angleOffset + i * sliceAngle;
    const endAngle = startAngle + sliceAngle;

    ctx.beginPath();
    ctx.moveTo(130, 130);
    ctx.arc(130, 130, 130, startAngle, endAngle);
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,200,0,0.3)';
    ctx.stroke();

    ctx.save();
    ctx.translate(130, 130);
    ctx.rotate(startAngle + sliceAngle / 2);
    ctx.textAlign = "right";
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 11px sans-serif";

    const text = String(items[i]).substring(0, 12);
    ctx.fillText(text, 120, 4);
    ctx.restore();
  }
}

function spinWheel() {
  if (!hasElevated() || draftState.spinning) return;

  let currentPool = [];
  if (draftState.currentStep === 0 || draftState.currentStep === 1) {
    currentPool = draftState.remainingPlayers;
  } else if (draftState.currentStep === 2) {
    currentPool = draftState.remainingClubs;
  }

  if (!currentPool || currentPool.length === 0) {
    return alert("Keine Elemente mehr zum Auslosen im aktuellen Pool!");
  }

  const targetIndex = Math.floor(Math.random() * currentPool.length);
  const targetItem = currentPool[targetIndex];

  const numItems = currentPool.length;
  const sliceAngle = (2 * Math.PI) / numItems;

  const targetSegmentCenter = (targetIndex + 0.5) * sliceAngle;
  const targetAngleAtTop = (1.5 * Math.PI) - targetSegmentCenter;
  const totalRotation = (2 * Math.PI * 5) + targetAngleAtTop;

  draftState.spinning = true;
  draftState.startTime = Date.now();
  draftState.targetAngle = totalRotation;
  draftState.duration = 4000;
  draftState.lastDrawnItem = null;
  saveData();

  setTimeout(() => {
    if (hasElevated() && draftState.spinning) {
      draftState.spinning = false;
      draftState.lastDrawnItem = targetItem;

      if (draftState.currentStep === 0) {
        draftState.tempP1 = targetItem;
      } else if (draftState.currentStep === 1) {
        draftState.tempP2 = targetItem;
      } else if (draftState.currentStep === 2) {
        if (!draftState.pairs) draftState.pairs = [];

        const newTeam = {
          id: draftState.pairs.length + 1,
          name: `Team ${draftState.pairs.length + 1}`,
          p1: draftState.tempP1,
          p2: draftState.tempP2,
          club: targetItem
        };
        draftState.pairs.push(newTeam);
      }

      saveData();
      renderDraftStep();
    }
  }, 4100);
}

function nextDraftStep() {
  if (!hasElevated()) return;

  if (draftState.lastDrawnItem) {
    if (draftState.currentStep === 0) {
      const idx = draftState.remainingPlayers.indexOf(draftState.lastDrawnItem);
      if (idx !== -1) draftState.remainingPlayers.splice(idx, 1);
      draftState.currentStep = 1;

    } else if (draftState.currentStep === 1) {
      const idx = draftState.remainingPlayers.indexOf(draftState.lastDrawnItem);
      if (idx !== -1) draftState.remainingPlayers.splice(idx, 1);
      draftState.currentStep = 2;

    } else if (draftState.currentStep === 2) {
      const idx = draftState.remainingClubs.indexOf(draftState.lastDrawnItem);
      if (idx !== -1) draftState.remainingClubs.splice(idx, 1);

      draftState.tempP1 = null;
      draftState.tempP2 = null;
      draftState.currentStep = 0;
    }
  }

  draftState.lastDrawnItem = null;
  draftState.targetAngle = 0;
  draftState.startTime = null;
  draftState.spinning = false;

  saveData();
  renderDraftStep();
}

function finishDraft() {
  if (!hasElevated()) return;
  teams = [...draftState.pairs];
  draftState.active = false;
  saveData();
  showTab('teams');
  renderAll();
  alert("🎉 Auslosung beendet! Die Teams wurden geladen.");
}

function cancelDraft() {
  if (!hasElevated()) return;

  if (confirm("Möchtest du die Auslosung wirklich abbrechen und zurücksetzen?")) {
    if (animFrameId) cancelAnimationFrame(animFrameId);

    draftState = {
      active: false, spinning: false, currentStep: 0,
      tempP1: null, tempP2: null, lastDrawnItem: null,
      remainingPlayers: [], remainingClubs: [], pairs: []
    };

    saveData();

    const modal = document.getElementById('draft-modal');
    if (modal) modal.style.display = 'none';

    renderAll();
    alert("Auslosung wurde zurückgesetzt!");
  }
}

// 7. Standard Admin Handlungen
function addPlayer() {
  if (!hasElevated()) return;
  const input = document.getElementById('new-player-name');
  const name = input ? input.value.trim() : '';
  if (!name) return;
  if (getPlayerObj(name)) return alert('Spieler existiert bereits!');

  players.push({ name: name, isRef: false, password: null });
  input.value = '';
  saveData();
}

function removePlayer(index) {
  if (!isAdmin()) return; // NUR Admin darf Spieler löschen
  players.splice(index, 1);
  saveData();
}

function toggleRef(index) {
  if (!isAdmin()) return; // NUR Admin darf Ref-Rechte vergeben/entziehen
  players[index].isRef = !players[index].isRef;
  saveData();
}

function setPlayerPassword(index) {
  if (!hasElevated()) return;
  const pwd = prompt(`Neues Passwort für ${players[index].name} eingeben:`);
  if (pwd !== null) {
    if (pwd.trim() === '') return alert('Passwort darf nicht leer sein.');
    players[index].password = pwd.trim();
    saveData();
  }
}

function removePlayerPassword(index) {
  if (!hasElevated()) return;
  if (confirm(`Passwort von ${players[index].name} wirklich löschen?`)) {
    players[index].password = null;
    saveData();
  }
}

function toggleRegistrationLock() {
  if (!hasElevated()) return;
  registrationLocked = !registrationLocked;
  saveData();
}

// 8. Gruppen- & KO-Auslosung
function makeMatch(id, group, slot, t1Id, t2Id) {
  return {
    id, group, slot,
    court: null,
    t1Id, t2Id,
    crossed: Math.random() < 0.5, // zufällig: 1v1 oder über Kreuz (1v2 / 2v1)
    score1_h: null, score2_h: null,
    score1_r: null, score2_r: null,
    score1: null, score2: null,
    played: false,
    confirmed: false,
    betsEvaluated: false
  };
}

function makeKOMatch(id, round, court, t1Id, t2Id) {
  return {
    id, round, court,
    t1Id, t2Id,
    crossed: Math.random() < 0.5,
    score1_h: null, score2_h: null,
    score1_r: null, score2_r: null,
    score1: null, score2: null,
    played: false,
    confirmed: false,
    betsEvaluated: false
  };
}

function drawGroups() {
  if (!hasElevated()) return;
  if (!teams || teams.length < 3) {
    return alert(`Du benötigst mindestens 3 Teams (aktuell: ${teams ? teams.length : 0}).`);
  }

  if (confirm('Möchtest du die Teams jetzt zufällig auf 3 Gruppen verteilen und den Spielplan erstellen?')) {
    const groupLetters = ['Gruppe A', 'Gruppe B', 'Gruppe C'];
    const shuffledTeams = [...teams].sort(() => Math.random() - 0.5);

    groups = groupLetters.map(letter => ({ letter, teams: [] }));

    shuffledTeams.forEach((team, index) => {
      groups[index % groups.length].teams.push(team.id);
    });

    let rawGroupMatches = [];
    groups.forEach(group => {
      const gTeams = group.teams;
      for (let i = 0; i < gTeams.length; i++) {
        for (let j = i + 1; j < gTeams.length; j++) {
          rawGroupMatches.push(makeMatch(null, group.letter, null, gTeams[i], gTeams[j]));
        }
      }
    });

    let matchesByGroup = {};
    groupLetters.forEach(l => {
      matchesByGroup[l] = rawGroupMatches.filter(m => m.group === l);
    });

    let interleavedMatches = [];
    let maxLen = Math.max(...Object.values(matchesByGroup).map(arr => arr.length));

    for (let i = 0; i < maxLen; i++) {
      groupLetters.forEach(l => {
        if (matchesByGroup[l][i]) interleavedMatches.push(matchesByGroup[l][i]);
      });
    }

    groupMatches = [];
    let matchId = 1;
    interleavedMatches.forEach((match, idx) => {
      match.id = matchId++;
      match.slot = idx + 1;
      match.court = (idx % 2 === 1) ? 'Nebenplatz' : 'Hauptplatz';
      groupMatches.push(match);
    });

    koMatches = [];
    saveData();
    renderAll();
    showTab('matches');

    alert('🎉 3 Gruppen & der komplette Spielplan wurden erfolgreich erstellt!');
  }
}

// Quervergleich-fähige Tabellenberechnung (siehe Abschnitt 10)
function drawKOPhase() {
  if (!hasElevated()) return;
  if (groups.length !== 3) {
    return alert('Diese Funktion ist für den 3-Gruppen-Modus vorgesehen. Bitte zuerst Gruppen auslosen.');
  }
  if (!groupMatches.every(m => m.played)) {
    return alert('Es müssen zuerst alle Gruppenspiele eingetragen sein!');
  }

  const standings = calculateGroupStandings();
  const winners = standings.map(g => ({ ...g.rankings[0], group: g.letter }));
  const runnerUps = standings.map(g => ({ ...g.rankings[1], group: g.letter }));
  const thirds = standings
    .map(g => ({ ...g.rankings[2], group: g.letter }))
    .filter(r => r && r.teamId !== undefined)
    .sort((a, b) => b.points - a.points || b.diff - a.diff || b.gf - a.gf)
    .slice(0, 2);

  if (winners.length < 3 || runnerUps.length < 3 || thirds.length < 2) {
    return alert('Es sind nicht genügend qualifizierte Teams vorhanden!');
  }

  if (!confirm('Viertelfinale auslosen? (Gruppendritte spielen gegen Gruppensieger, keine Wiederholung aus der Gruppenphase)')) return;

  let availableWinners = [...winners];
  let availableRunnerUps = [...runnerUps];
  const pairsArr = [];

  // Schritt 1: beide Gruppendritte bekommen einen Gruppensieger (nicht aus eigener Gruppe)
  thirds.forEach(third => {
    let idx = availableWinners.findIndex(w => w.group !== third.group);
    if (idx === -1) idx = 0;
    const opponent = availableWinners.splice(idx, 1)[0];
    pairsArr.push({ a: opponent, b: third });
  });

  // Schritt 2: übriger Gruppensieger vs. Gruppenzweiter (nicht aus eigener Gruppe)
  const remWinner = availableWinners[0];
  let idx2 = availableRunnerUps.findIndex(r => r.group !== remWinner.group);
  if (idx2 === -1) idx2 = 0;
  const oppRU = availableRunnerUps.splice(idx2, 1)[0];
  pairsArr.push({ a: remWinner, b: oppRU });

  // Schritt 3: die beiden übrigen Gruppenzweiten spielen gegeneinander (unterschiedliche Gruppen, also kein Rematch)
  pairsArr.push({ a: availableRunnerUps[0], b: availableRunnerUps[1] });

  koMatches = [];
  let matchId = 101;
  pairsArr.forEach((p, i) => {
    koMatches.push(makeKOMatch(matchId++, 'Viertelfinale', (i % 2 === 0) ? 'Hauptplatz' : 'Nebenplatz', p.a.teamId, p.b.teamId));
  });

  saveData();
  showTab('matches');
}

function drawSemifinals() {
  if (!hasElevated()) return;

  const qfMatches = koMatches.filter(m => m.round === 'Viertelfinale');
  if (qfMatches.length < 4) return alert('Es muss zuerst das Viertelfinale ausgelost werden!');

  const winners = [];
  qfMatches.forEach(m => {
    if (m.played) {
      if (m.score1 > m.score2) winners.push(m.t1Id);
      else if (m.score2 > m.score1) winners.push(m.t2Id);
    }
  });

  if (winners.length < 4) return alert('Es müssen erst alle 4 Viertelfinal-Spiele eingetragen sein!');

  if (confirm('Halbfinale jetzt zufällig aus den 4 Siegern auslosen?')) {
    const shuffled = [...winners].sort(() => Math.random() - 0.5);

    koMatches.push(makeKOMatch(201, 'Halbfinale 1', 'Hauptplatz', shuffled[0], shuffled[1]));
    koMatches.push(makeKOMatch(202, 'Halbfinale 2', 'Nebenplatz', shuffled[2], shuffled[3]));

    saveData();
    showTab('matches');
  }
}

function drawFinals() {
  if (!hasElevated()) return;
  const hf1 = koMatches.find(m => m.round === 'Halbfinale 1');
  const hf2 = koMatches.find(m => m.round === 'Halbfinale 2');

  if (!hf1 || !hf2 || !hf1.played || !hf2.played) return alert('Beide Halbfinal-Spiele müssen erst eingetragen sein!');

  const hf1Winner = hf1.score1 > hf1.score2 ? hf1.t1Id : hf1.t2Id;
  const hf1Loser  = hf1.score1 > hf1.score2 ? hf1.t2Id : hf1.t1Id;
  const hf2Winner = hf2.score1 > hf2.score2 ? hf2.t1Id : hf2.t2Id;
  const hf2Loser  = hf2.score1 > hf2.score2 ? hf2.t2Id : hf2.t1Id;

  if (confirm('Finale & Spiel um Platz 3 jetzt erstellen?')) {
    koMatches.push(makeKOMatch(301, '🥉 Spiel um Platz 3', 'Nebenplatz', hf1Loser, hf2Loser));
    koMatches.push(makeKOMatch(302, '🏆 FINALE', 'Hauptplatz', hf1Winner, hf2Winner));

    saveData();
    showTab('matches');
  }
}

function resetTournament() {
  if (!hasElevated()) return;
  if (confirm('Turnier wirklich zurücksetzen? Alle Teams, Spieler, Ergebnisse und Coins werden gelöscht!')) {
    players = [];
    teams = [];
    groups = [];
    groupMatches = [];
    koMatches = [];
    tips = {};
    tipsEvaluated = false;
    registrationLocked = false;
    draftState = { active: false, currentStep: 0, tempP1: null, tempP2: null, remainingPlayers: [], remainingClubs: [], spinning: false, startTime: null, targetAngle: 0, duration: 4000, lastDrawnItem: null, pairs: [] };
    userBalances = {};
    bets = [];
    saveData();
  }
}

// 9. Team- & Match-Updates
function updateTeamName(teamId, newName) {
  const team = teams.find(t => t.id === teamId);
  if (!team) return;

  const isMyTeam = (myPlayerName && (team.p1 === myPlayerName || team.p2 === myPlayerName));

  if (hasElevated() || isMyTeam) {
    team.name = newName.trim() || `Team ${team.id}`;
    saveData();
  } else {
    alert('Du kannst nur deinen eigenen Team-Namen bearbeiten!');
    renderAll();
  }
}

function getMatchArray(isKO) { return isKO ? koMatches : groupMatches; }

// Spieler tragen ihr eigenes Ergebnis ein -> "vorläufig". Admin/Ref bestätigt separat.
function submitMatchResult(matchId, isKO) {
  const matchArray = getMatchArray(isKO);
  const match = matchArray.find(m => m.id === matchId);
  if (!match) return;

  const myTeam = getMyTeam();
  const canEdit = hasElevated() || (myTeam && (match.t1Id === myTeam.id || match.t2Id === myTeam.id));
  if (!canEdit) {
    alert('Du darfst nur Ergebnisse eintragen, bei denen dein Team mitspielt!');
    return;
  }
  if (match.confirmed && !hasElevated()) {
    alert('Dieses Ergebnis wurde bereits vom Admin bestätigt und ist gesperrt!');
    return;
  }

  const h1El = document.getElementById(`m_${matchId}_${isKO ? 'ko_' : ''}h1`);
  const h2El = document.getElementById(`m_${matchId}_${isKO ? 'ko_' : ''}h2`);
  const r1El = document.getElementById(`m_${matchId}_${isKO ? 'ko_' : ''}r1`);
  const r2El = document.getElementById(`m_${matchId}_${isKO ? 'ko_' : ''}r2`);

  const h1 = h1El ? h1El.value : '';
  const h2 = h2El ? h2El.value : '';
  const r1 = r1El ? r1El.value : '';
  const r2 = r2El ? r2El.value : '';

  if (h1 === '' || h2 === '' || r1 === '' || r2 === '') {
    if (hasElevated()) {
      match.score1_h = null; match.score2_h = null;
      match.score1_r = null; match.score2_r = null;
      match.score1 = null; match.score2 = null;
      match.played = false;
      saveData();
      renderAll();
    } else {
      alert('Bitte alle 4 Ergebnis-Felder (Hin- & Rückspiel) ausfüllen!');
    }
    return;
  }

  const s1h = parseInt(h1, 10), s2h = parseInt(h2, 10);
  const s1r = parseInt(r1, 10), s2r = parseInt(r2, 10);

  const total1 = s1h + s1r;
  const total2 = s2h + s2r;

  if (isKO && total1 === total2) {
    return alert('In der KO-Phase muss es nach Hin- und Rückspiel einen Gesamtsieger geben!');
  }

  match.score1_h = s1h; match.score2_h = s2h;
  match.score1_r = s1r; match.score2_r = s2r;
  match.score1 = total1; match.score2 = total2;
  match.played = true;

  saveData();
  renderAll();
  alert(match.confirmed ? '✅ Ergebnis korrigiert (Tabelle aktualisiert).' : '✅ Ergebnis vorläufig gespeichert. Ein Admin/Ref muss es noch bestätigen.');
}

// Admin/Ref bestätigt ein Ergebnis endgültig -> Wetten werden ausgezahlt
function confirmMatchResult(matchId, isKO) {
  if (!hasElevated()) return;
  const matchArray = getMatchArray(isKO);
  const match = matchArray.find(m => m.id === matchId);
  if (!match) return;
  if (!match.played) return alert('Es wurde noch kein Ergebnis eingetragen!');
  if (match.confirmed) return;

  match.confirmed = true;

  const winningTeamId = match.score1 > match.score2 ? match.t1Id : (match.score2 > match.score1 ? match.t2Id : null);
  if (winningTeamId) {
    evaluateBetsForMatch(matchId, isKO, winningTeamId);

    if (isKO && match.round === '🏆 FINALE') {
      evaluateTips(winningTeamId);
      const winnerTeam = teams.find(t => t.id === winningTeamId);
      if (winnerTeam) {
        setTimeout(() => {
          alert(`🎉 🏆 DIE SIEGER DES FAL FIFA TURNIERS SIND: 🏆 🎉\n\n🥇 ${winnerTeam.p1} & ${winnerTeam.p2} (${winnerTeam.name} - ${winnerTeam.club || ''}) 🥇\n\nHerzlichen Glückwunsch! 👏🥳`);
        }, 300);
      }
    }
  } else {
    saveData();
  }

  renderAll();
}

// 10. Render Panel & UI
function renderAll() {
  renderHome();
  renderTeams();
  renderGroups();
  renderMatches();
  renderAdminPanel();
  renderBettingSystem();
}

// 10a. HOME: Regeln, Tippspiel, Dashboard
function renderHome() {
  renderRules();
  renderTipRound();
  renderDashboard();
}

function renderRules() {
  const container = document.getElementById('rules-content');
  if (!container) return;

  if (hasElevated()) {
    const currentText = (rules === DEFAULT_RULES) ? '' : rules;
    container.innerHTML = `
      <textarea id="rules-textarea" rows="6" style="width:100%;" placeholder="Regeln hier eintragen...">${currentText}</textarea>
      <button class="btn-primary btn-sm" style="margin-top:8px;" onclick="saveRules()">Regeln speichern</button>
    `;
  } else {
    container.innerHTML = `<p class="rules-text">${rules}</p>`;
  }
}

function saveRules() {
  if (!hasElevated()) return;
  const textarea = document.getElementById('rules-textarea');
  if (!textarea) return;
  rules = textarea.value.trim() || DEFAULT_RULES;
  saveData();
}

// 10b. TIPPSPIEL (mit FAL-Coins, Quote = Anzahl Teams : 1, einmalig & fix)
function renderTipRound() {
  const container = document.getElementById('tip-content');
  if (!container) return;

  if (teams.length === 0) {
    container.innerHTML = '<p class="empty-state">Sobald die Teams gelost sind, kann getippt werden.</p>';
    return;
  }

  if (!myPlayerName) {
    container.innerHTML = '<p class="empty-state">Melde dich als Spieler an, um mitzutippen.</p>';
    return;
  }

  const myTip = tips[myPlayerName];
  const odds = teams.length;
  const finished = isTournamentFinished();

  if (myTip) {
    const tipTeam = teams.find(t => t.id === myTip.teamId);
    container.innerHTML = `
      <div class="bet-card">
        ✅ Du hast <strong>${myTip.amount} 🪙</strong> auf <strong>${tipTeam ? tipTeam.name : '???'}</strong>${tipTeam && tipTeam.club ? ' (' + tipTeam.club + ')' : ''} gesetzt.
        <div style="font-size:0.85em; opacity:0.75; margin-top:6px;">Quote ${odds}:1 – dein Tipp ist fix und kann nicht mehr geändert werden.</div>
      </div>
      ${finished ? renderTipResultsBreakdown() : '<p style="font-size:0.85em; opacity:0.7;">Die Tipps der anderen werden erst nach dem Finale sichtbar.</p>'}
    `;
    return;
  }

  const currentBalance = getUserBalance(myPlayerName);
  const options = teams.map(t => `<option value="${t.id}">${t.name}${t.club ? ' (' + t.club + ')' : ''}</option>`).join('');

  container.innerHTML = `
    <div class="bet-card">
      <div style="font-size:0.9em; margin-bottom:6px;">Aktuelle Quote: <strong style="color:var(--fal-yellow);">${odds}:1</strong> (bei ${teams.length} Teams)</div>
      <div class="bet-input-row">
        <select id="tip-team-select">${options}</select>
        <input type="number" id="tip-amount-input" placeholder="Coins" min="1" max="${currentBalance}">
        <button class="btn-primary" onclick="submitTip()">Tipp abgeben</button>
      </div>
      <div style="font-size:0.8em; opacity:0.7; margin-top:6px;">Dein Kontostand: ${currentBalance} 🪙 — Achtung: Der Tipp kann danach nicht mehr geändert werden!</div>
    </div>
  `;
}

function renderTipResultsBreakdown() {
  const totalTips = Object.keys(tips).length;
  const rows = teams.map(t => {
    const count = Object.values(tips).filter(tip => tip.teamId === t.id).length;
    const pct = totalTips > 0 ? Math.round((count / totalTips) * 100) : 0;
    return `
      <div class="tip-row">
        <div class="tip-btn"><span>${t.name}</span><span style="color:var(--fal-yellow); font-weight:bold;">${pct}% (${count})</span></div>
        <div class="tip-bar-track"><div class="tip-bar-fill" style="width:${pct}%;"></div></div>
      </div>
    `;
  }).join('');
  return `<div style="margin-top:12px;">${rows}<p style="font-size:0.8em; opacity:0.7;">${totalTips} von ${players.length} Spielern haben getippt.</p></div>`;
}

function submitTip() {
  if (!myPlayerName) return;
  if (tips[myPlayerName]) return alert('Du hast bereits getippt – das kann nicht mehr geändert werden.');

  const teamSelect = document.getElementById('tip-team-select');
  const amountInput = document.getElementById('tip-amount-input');
  if (!teamSelect || !amountInput) return;

  const teamId = parseInt(teamSelect.value);
  const amount = parseInt(amountInput.value);
  const currentBalance = getUserBalance(myPlayerName);

  if (isNaN(amount) || amount <= 0) return alert('Bitte einen gültigen Betrag eingeben!');
  if (amount > currentBalance) return alert('Du hast nicht genügend FAL-Coins!');

  if (!confirm(`Sicher? Du setzt ${amount} Coins fest auf dieses Team – das lässt sich NICHT mehr ändern.`)) return;

  userBalances[myPlayerName] -= amount;
  tips[myPlayerName] = { teamId, amount };

  saveData();
}

function evaluateTips(winningTeamId) {
  if (tipsEvaluated) return;
  const odds = teams.length || 1;

  Object.keys(tips).forEach(playerName => {
    const tip = tips[playerName];
    if (tip.teamId === winningTeamId) {
      const winAmount = tip.amount * odds;
      userBalances[playerName] = (userBalances[playerName] || 0) + winAmount;
    }
  });

  tipsEvaluated = true;
  saveData();
}

// 10c. DASHBOARD (Einzelspieler-Statistiken)
function calculatePlayerStats() {
  const stats = {};
  function ensure(name) {
    if (!stats[name]) stats[name] = { name, goals: 0, conceded: 0, wins: 0, played: 0 };
    return stats[name];
  }

  function processLeg(m, isHin) {
    const s1 = isHin ? m.score1_h : m.score1_r;
    const s2 = isHin ? m.score2_h : m.score2_r;
    if (s1 === null || s1 === undefined || s2 === null || s2 === undefined) return;

    const t1 = teams.find(t => t.id === m.t1Id);
    const t2 = teams.find(t => t.id === m.t2Id);
    if (!t1 || !t2) return;

    const playerA = isHin ? t1.p1 : t1.p2;
    const playerB = isHin ? (m.crossed ? t2.p2 : t2.p1) : (m.crossed ? t2.p1 : t2.p2);

    const a = ensure(playerA);
    const b = ensure(playerB);
    a.goals += s1; a.conceded += s2; a.played++;
    b.goals += s2; b.conceded += s1; b.played++;
    if (s1 > s2) a.wins++;
    else if (s2 > s1) b.wins++;
  }

  [...groupMatches, ...koMatches].forEach(m => {
    processLeg(m, true);
    processLeg(m, false);
  });

  return Object.values(stats);
}

function renderDashboard() {
  const container = document.getElementById('dashboard-content');
  if (!container) return;

  if (teams.length === 0) {
    container.innerHTML = '<p class="empty-state">Sobald Teams und Spiele existieren, siehst du hier Live-Statistiken.</p>';
    return;
  }

  const stats = calculatePlayerStats();
  const played = stats.filter(s => s.played > 0);

  const topScorer = played.length ? [...played].sort((a, b) => b.goals - a.goals)[0] : null;
  const bestDefender = played.length ? [...played].sort((a, b) => (a.conceded / a.played) - (b.conceded / b.played))[0] : null;
  const topWinner = played.length ? [...played].sort((a, b) => (b.wins / b.played) - (a.wins / a.played) || b.wins - a.wins)[0] : null;

  let favoriteTile = '';
  if (isTournamentFinished()) {
    const tipCounts = teams.map(t => ({ team: t, count: Object.values(tips).filter(tip => tip.teamId === t.id).length }));
    const favorite = [...tipCounts].sort((a, b) => b.count - a.count)[0];
    favoriteTile = `
      <div class="admin-card stat-tile">
        <p class="stat-label">🐐 Fan-Liebling (Tippspiel)</p>
        <p class="stat-value">${favorite && favorite.count > 0 ? `${favorite.team.name} (${favorite.count} Tipps)` : 'Keine Tipps'}</p>
      </div>
    `;
  }

  container.innerHTML = `
    <div class="grid-container">
      <div class="admin-card stat-tile">
        <p class="stat-label">⚽ Torschützenkönig</p>
        <p class="stat-value">${topScorer && topScorer.goals > 0 ? `${topScorer.name} (${topScorer.goals} Tore)` : 'Noch keine Tore'}</p>
      </div>
      <div class="admin-card stat-tile">
        <p class="stat-label">🛡️ Beste Abwehr</p>
        <p class="stat-value">${bestDefender ? `${bestDefender.name} (Ø ${(bestDefender.conceded / bestDefender.played).toFixed(1)} Gegentore)` : 'Noch keine Spiele'}</p>
      </div>
      <div class="admin-card stat-tile">
        <p class="stat-label">🔥 Höchste Siegquote</p>
        <p class="stat-value">${topWinner ? `${topWinner.name} (${topWinner.wins}/${topWinner.played} Siege)` : 'Noch keine Spiele'}</p>
      </div>
      ${favoriteTile}
    </div>
  `;
}

function renderTeams() {
  const container = document.getElementById('teams-container');
  if (!container) return;

  if (teams.length === 0) {
    container.innerHTML = '<p class="empty-state">Noch keine Teams gelost. Gehe in den Admin-Bereich und starte die Auslosungs-Show.</p>';
    return;
  }

  container.innerHTML = teams.map(t => {
    const isMyTeam = (myPlayerName && (t.p1 === myPlayerName || t.p2 === myPlayerName));
    const canEditName = hasElevated() || isMyTeam;
    const clubBadgeHtml = t.club ? `<div class="club-badge">${clubLogoImg(t.club, 18)}${t.club}</div>` : '';

    return `
      <div class="admin-card ${isMyTeam ? 'highlight-me' : ''}">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap;">
          <input type="text" value="${t.name}"
                 ${canEditName ? '' : 'disabled'}
                 onchange="updateTeamName(${t.id}, this.value)"
                 style="font-weight: bold; font-size: 1.1em; max-width: 180px;">
          ${clubBadgeHtml}
        </div>
        ${isMyTeam ? '<div style="color:var(--fal-yellow); font-size:0.85em; font-weight:bold; margin-top:4px;">⭐ (Dein Team)</div>' : ''}
        <p style="margin-top: 8px; margin-bottom:0;">Mitglieder: <strong>${t.p1}</strong> & <strong>${t.p2}</strong></p>
      </div>
    `;
  }).join('');
}

// GRUPPENTABELLEN BERECHNUNG (Aggregat aus Hin- & Rückspiel)
function calculateGroupStandings() {
  return groups.map(g => {
    const stats = {};
    g.teams.forEach(tId => {
      const teamObj = teams.find(t => t.id === tId);
      let displayName = teamObj ? teamObj.name : `Team ${tId}`;
      if (teamObj && teamObj.club) displayName += ` (${teamObj.club})`;
      stats[tId] = { teamId: tId, name: displayName, played: 0, gf: 0, ga: 0, diff: 0, points: 0 };
    });

    groupMatches.filter(m => m.group === g.letter && m.played).forEach(m => {
      const t1 = stats[m.t1Id];
      const t2 = stats[m.t2Id];
      if (!t1 || !t2) return;

      t1.played++; t2.played++;
      t1.gf += m.score1; t1.ga += m.score2;
      t2.gf += m.score2; t2.ga += m.score1;

      if (m.score1 > m.score2) t1.points += 3;
      else if (m.score2 > m.score1) t2.points += 3;
      else { t1.points += 1; t2.points += 1; }

      t1.diff = t1.gf - t1.ga;
      t2.diff = t2.gf - t2.ga;
    });

    const rankings = Object.values(stats).sort((a, b) => b.points - a.points || b.diff - a.diff || b.gf - a.gf);
    return { letter: g.letter, rankings };
  });
}

function renderGroups() {
  const container = document.getElementById('groups-container');
  if (!container) return;

  if (groups.length === 0) {
    container.innerHTML = '<p class="empty-state">Noch keine Gruppen gelost.</p>';
    return;
  }

  const standings = calculateGroupStandings();

  let html = standings.map(g => `
    <div class="admin-card">
      <h3 style="color:var(--fal-yellow); margin-top:0;">Gruppe ${g.letter}</h3>
      <div class="table-container">
        <table>
          <thead>
            <tr><th>#</th><th>Team</th><th>Sp</th><th>Tore</th><th>Diff</th><th>Pkt</th></tr>
          </thead>
          <tbody>
            ${g.rankings.map((r, idx) => `
              <tr style="${idx === 2 ? 'opacity: 0.9;' : ''}">
                <td>${idx + 1}</td>
                <td><strong>${r.name}</strong></td>
                <td>${r.played}</td>
                <td>${r.gf}:${r.ga}</td>
                <td>${r.diff > 0 ? '+' + r.diff : r.diff}</td>
                <td><strong>${r.points}</strong></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `).join('');

  if (groups.length === 3) {
    const thirdPlaces = standings
      .map(g => ({ ...g.rankings[2], group: g.letter }))
      .filter(r => r !== undefined && r.teamId !== undefined)
      .sort((a, b) => b.points - a.points || b.diff - a.diff || b.gf - a.gf);

    html += `
      <div class="admin-card highlight-me" style="grid-column: 1 / -1; margin-top: 10px;">
        <h3 style="color:var(--fal-yellow); margin-top:0;">📊 Quervergleich der Gruppendritten (Top 2 kommen ins Viertelfinale)</h3>
        <div class="table-container">
          <table>
            <thead><tr><th>Platz</th><th>Team (Gruppe)</th><th>Sp</th><th>Tore</th><th>Diff</th><th>Pkt</th><th>Status</th></tr></thead>
            <tbody>
              ${thirdPlaces.map((r, idx) => `
                <tr style="${idx < 2 ? 'background: rgba(0, 255, 100, 0.1);' : 'background: rgba(255, 0, 0, 0.1);'}">
                  <td>${idx + 1}</td>
                  <td><strong>${r.name}</strong> (${r.group})</td>
                  <td>${r.played}</td>
                  <td>${r.gf}:${r.ga}</td>
                  <td>${r.diff > 0 ? '+' + r.diff : r.diff}</td>
                  <td><strong>${r.points}</strong></td>
                  <td>${idx < 2 ? '✅ Qualifiziert' : '❌ Ausgeschieden'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

// SPIELE: gemeinsame Karten-Darstellung für Gruppen- & KO-Spiele
function renderMatchBlock(m, isKO) {
  const t1 = teams.find(t => t.id === m.t1Id) || { name: 'Team ?', p1: 'P1', p2: 'P2', club: '' };
  const t2 = teams.find(t => t.id === m.t2Id) || { name: 'Team ?', p1: 'P1', p2: 'P2', club: '' };

  const hinP2 = m.crossed ? t2.p2 : t2.p1;
  const rueckP2 = m.crossed ? t2.p1 : t2.p2;

  const myTeam = getMyTeam();
  const canEdit = hasElevated() || (myTeam && (m.t1Id === myTeam.id || m.t2Id === myTeam.id));
  const locked = m.confirmed && !hasElevated();

  let statusBadge = '<span class="status-badge status-open">❌ Offen</span>';
  if (m.betsEvaluated) statusBadge = '<span class="status-badge status-confirmed">🔒 Bestätigt & Ausgezahlt</span>';
  else if (m.confirmed) statusBadge = '<span class="status-badge status-confirmed">✅ Bestätigt</span>';
  else if (m.played) statusBadge = '<span class="status-badge status-provisional">⏳ Vorläufig</span>';

  const prefix = `m_${m.id}_${isKO ? 'ko_' : ''}`;
  const courtColor = m.court === 'Hauptplatz' ? '#e74c3c' : '#2ecc71';
  const roundLabel = isKO ? m.round : `Runde ${m.slot || ''} • ${m.group}`;

  const hinLegColor = 'border-left: 5px solid #f1c40f; background: rgba(241, 196, 15, 0.1);';
  const rueckLegColor = 'border-left: 5px solid #3498db; background: rgba(52, 152, 219, 0.1);';

  return `
    <div class="match-card" style="position:relative;">
      <div style="display:flex; justify-content: space-between; align-items:center; flex-wrap:wrap; gap:6px;">
        <span style="color:var(--fal-yellow); font-weight:bold;">${roundLabel}</span>
        <div style="display:flex; gap:6px; align-items:center;">
          ${statusBadge}
          <span class="court-badge" style="background:${courtColor}; color:white;">${m.court || ''}</span>
        </div>
      </div>

      <div style="margin: 6px 0;">
        <div style="font-size:1.05em; font-weight:bold;">
          ${t1.name} <small style="opacity:0.8;">(${t1.p1} & ${t1.p2})</small> ${t1.club ? `<span style="color:#f1c40f;">[${t1.club}]</span>` : ''}
        </div>
        <div style="font-size:0.8em; opacity:0.6; margin:2px 0;">vs</div>
        <div style="font-size:1.05em; font-weight:bold;">
          ${t2.name} <small style="opacity:0.8;">(${t2.p1} & ${t2.p2})</small> ${t2.club ? `<span style="color:#f1c40f;">[${t2.club}]</span>` : ''}
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:8px;">
        <div style="padding:8px; border-radius:5px; ${hinLegColor}; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px;">
          <span style="font-size:0.85em;">🟡 <strong>Hinspiel:</strong> ${t1.p1} vs. ${hinP2}</span>
          <div style="display:flex; gap:5px; align-items:center;">
            <input type="number" id="${prefix}h1" min="0" max="20" style="width:40px; text-align:center;" ${(!canEdit || locked) ? 'disabled' : ''} value="${m.score1_h !== null && m.score1_h !== undefined ? m.score1_h : ''}">
            :
            <input type="number" id="${prefix}h2" min="0" max="20" style="width:40px; text-align:center;" ${(!canEdit || locked) ? 'disabled' : ''} value="${m.score2_h !== null && m.score2_h !== undefined ? m.score2_h : ''}">
          </div>
        </div>

        <div style="padding:8px; border-radius:5px; ${rueckLegColor}; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px;">
          <span style="font-size:0.85em;">🔵 <strong>Rückspiel:</strong> ${t1.p2} vs. ${rueckP2}</span>
          <div style="display:flex; gap:5px; align-items:center;">
            <input type="number" id="${prefix}r1" min="0" max="20" style="width:40px; text-align:center;" ${(!canEdit || locked) ? 'disabled' : ''} value="${m.score1_r !== null && m.score1_r !== undefined ? m.score1_r : ''}">
            :
            <input type="number" id="${prefix}r2" min="0" max="20" style="width:40px; text-align:center;" ${(!canEdit || locked) ? 'disabled' : ''} value="${m.score2_r !== null && m.score2_r !== undefined ? m.score2_r : ''}">
          </div>
        </div>
      </div>

      ${m.played ? `<div style="text-align:center; font-size:0.85em; color:var(--fal-yellow);">Gesamt: <strong>${m.score1} : ${m.score2}</strong></div>` : ''}

      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        ${(canEdit && !locked) ? `<button class="btn-primary btn-sm" style="flex:1;" onclick="submitMatchResult(${m.id}, ${isKO})">💾 ${m.played ? 'Aktualisieren' : 'Ergebnis eintragen'}</button>` : ''}
        ${(hasElevated() && m.played && !m.confirmed) ? `<button class="btn-primary btn-sm" style="flex:1; background:#2ecc71; color:#fff;" onclick="confirmMatchResult(${m.id}, ${isKO})">✅ Bestätigen</button>` : ''}
      </div>
    </div>
  `;
}

function renderMatches() {
  const groupContainer = document.getElementById('matches-list');
  const koContainer = document.getElementById('ko-matches-list');

  if (groupContainer) {
    if (!groupMatches || groupMatches.length === 0) {
      groupContainer.innerHTML = '<p class="empty-state">Noch keine Spiele generiert. Bitte zuerst Gruppen auslosen.</p>';
    } else {
      groupContainer.innerHTML = groupMatches.map(m => renderMatchBlock(m, false)).join('');
    }
  }

  if (koContainer) {
    if (!koMatches || koMatches.length === 0) {
      koContainer.innerHTML = '<p class="empty-state">KO-Phase noch nicht ausgelost.</p>';
    } else {
      const roundOrder = ['Viertelfinale', 'Halbfinale 1', 'Halbfinale 2', '🥉 Spiel um Platz 3', '🏆 FINALE'];
      const rounds = roundOrder.filter(r => koMatches.some(m => m.round === r));
      koContainer.innerHTML = rounds.map(r => `
        <h4 style="color:var(--fal-yellow); margin-top:15px;">${r}</h4>
        ${koMatches.filter(m => m.round === r).map(m => renderMatchBlock(m, true)).join('')}
      `).join('');
    }
  }
}

function renderAdminPanel() {
  const playerListEl = document.getElementById('admin-player-list');
  const clubListEl = document.getElementById('admin-club-list');
  const lockContainer = document.getElementById('registration-lock-container');

  if (lockContainer) {
    lockContainer.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(0,0,0,0.2); padding:8px 12px; border-radius:8px; margin-bottom:12px;">
        <span style="font-size:0.9em;">${registrationLocked ? '🔒 Registrierung gesperrt' : '🔓 Registrierung offen'}</span>
        <button class="btn-secondary btn-sm" onclick="toggleRegistrationLock()">${registrationLocked ? 'Entsperren' : 'Sperren'}</button>
      </div>
    `;
  }

  if (playerListEl) {
    playerListEl.innerHTML = players.map((p, index) => {
      const hasPW = !!p.password;
      const isRefBtnClass = p.isRef ? 'btn-primary' : 'btn-secondary';

      return `
        <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; background: var(--fal-blue-primary); padding: 10px 12px; border-radius: 8px; margin-bottom: 8px; gap: 8px;">
          <div>
            <strong>${index + 1}. ${p.name}</strong>
            ${p.isRef ? '<span style="color:var(--fal-yellow); font-size:0.85em;">[🟨 Ref]</span>' : ''}
            ${hasPW ? '<span style="font-size:0.85em; opacity:0.8;">[🔒 PW]</span>' : ''}
          </div>

          <div style="display:flex; gap: 5px; flex-wrap:wrap;">
            ${isAdmin() ? `<button class="${isRefBtnClass} btn-sm" onclick="toggleRef(${index})">${p.isRef ? '🟨 Ref (Aktiv)' : 'Ref vergeben'}</button>` : ''}
            ${hasPW
              ? `<button class="btn-danger btn-sm" onclick="removePlayerPassword(${index})">PW löschen</button>`
              : `<button class="btn-secondary btn-sm" onclick="setPlayerPassword(${index})">+ PW</button>`
            }
            ${isAdmin() ? `<button class="btn-danger btn-sm" onclick="removePlayer(${index})">🗑️</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  if (clubListEl) {
    clubListEl.innerHTML = availableClubs.map((club, index) => `
      <span class="club-badge">
        ${clubLogoImg(club, 16)}${club}
        <span style="cursor:pointer;" title="Wappen-URL setzen" onclick="setClubLogo('${club.replace(/'/g, "\\'")}')">🖼️</span>
        <span style="cursor:pointer; color:#ff4d4d; font-weight:bold; margin-left:4px;" onclick="removeClub(${index})">×</span>
      </span>
    `).join('');
  }
}

// ==========================================
// 🎯 WETT-SYSTEM LOGIK & RENDERING (Ergebniswetten)
// ==========================================

function getUserBalance(playerName) {
  if (!playerName) return 0;
  if (userBalances[playerName] === undefined) {
    userBalances[playerName] = 100;
  }
  return userBalances[playerName];
}

function renderBettingSystem() {
  const balanceEl = document.getElementById('user-coin-balance');
  const matchesListEl = document.getElementById('betting-matches-list');
  const leaderboardEl = document.getElementById('betting-leaderboard');

  if (!balanceEl || !matchesListEl || !leaderboardEl) return;

  const currentBalance = myPlayerName ? getUserBalance(myPlayerName) : 0;
  balanceEl.innerText = currentBalance;

  const upcoming = [
    ...groupMatches.map(m => ({ ...m, isKO: false })),
    ...koMatches.map(m => ({ ...m, isKO: true }))
  ].filter(m => !m.played && m.t1Id && m.t2Id).slice(0, 3);

  if (upcoming.length === 0) {
    matchesListEl.innerHTML = '<p style="opacity:0.7;">Aktuell keine anstehenden Spiele zum Wetten verfügbar.</p>';
  } else {
    matchesListEl.innerHTML = upcoming.map(m => {
      const t1 = teams.find(t => t.id === m.t1Id);
      const t2 = teams.find(t => t.id === m.t2Id);
      if (!t1 || !t2) return '';

      const myExistingBet = bets.find(b => b.matchId === m.id && b.isKO === m.isKO && b.playerName === myPlayerName);
      const uid = `${m.isKO ? 'ko' : 'gr'}-${m.id}`;

      return `
        <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; margin-bottom: 10px; border: 1px solid rgba(255,255,255,0.1);">
          <div style="font-size: 0.85em; opacity: 0.8; margin-bottom: 5px;">${m.isKO ? m.round : m.group}</div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold; margin-bottom: 10px; flex-wrap:wrap; gap:6px;">
            <span>${t1.name}${t1.club ? ' (' + t1.club + ')' : ''}</span>
            <span style="color: var(--fal-yellow);">VS</span>
            <span>${t2.name}${t2.club ? ' (' + t2.club + ')' : ''}</span>
          </div>

          ${myExistingBet ? `
            <div style="text-align:center; font-size: 0.9em; color: var(--fal-yellow); background: rgba(0,0,0,0.2); padding: 5px; border-radius: 5px;">
              ✅ Gewettet: <strong>${myExistingBet.amount} Coins</strong> auf <strong>${myExistingBet.chosenTeamId === t1.id ? t1.name : t2.name}</strong>
            </div>
          ` : `
            <div class="bet-input-row">
              <select id="bet-team-${uid}">
                <option value="${t1.id}">${t1.name}</option>
                <option value="${t2.id}">${t2.name}</option>
              </select>
              <input type="number" id="bet-amount-${uid}" placeholder="Coins" min="1" max="${currentBalance}">
              <button class="btn-primary" style="padding: 6px 12px; font-size: 0.9em;" onclick="placeBet(${m.id}, ${m.isKO})">Wetten</button>
            </div>
          `}
        </div>
      `;
    }).join('');
  }

  const sortedUsers = Object.keys(userBalances)
    .map(name => ({ name, balance: userBalances[name] }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);

  if (sortedUsers.length === 0) {
    leaderboardEl.innerHTML = '<p style="font-size:0.85em; opacity:0.7;">Noch keine Konten aktiv.</p>';
  } else {
    leaderboardEl.innerHTML = sortedUsers.map((u, i) => `
      <div class="leaderboard-item">
        <span>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} ${u.name}</span>
        <span style="font-weight: bold; color: var(--fal-yellow);">${u.balance} 🪙</span>
      </div>
    `).join('');
  }
}

function placeBet(matchId, isKO) {
  if (!myPlayerName) return alert('Bitte melde dich erst an, um zu wetten!');

  const uid = `${isKO ? 'ko' : 'gr'}-${matchId}`;
  const teamSelect = document.getElementById(`bet-team-${uid}`);
  const amountInput = document.getElementById(`bet-amount-${uid}`);
  if (!teamSelect || !amountInput) return;

  const chosenTeamId = parseInt(teamSelect.value);
  const amount = parseInt(amountInput.value);
  const currentBalance = getUserBalance(myPlayerName);

  if (isNaN(amount) || amount <= 0) return alert('Bitte einen gültigen Wettbetrag eingeben!');
  if (amount > currentBalance) return alert('Du hast nicht genügend FAL-Coins!');

  userBalances[myPlayerName] -= amount;

  bets.push({ matchId, isKO, playerName: myPlayerName, chosenTeamId, amount });

  saveData();
}

function evaluateBetsForMatch(matchId, isKO, winningTeamId) {
  const relatedBets = bets.filter(b => b.matchId === matchId && b.isKO === isKO);

  relatedBets.forEach(b => {
    if (b.chosenTeamId === winningTeamId) {
      const winAmount = b.amount * 2;
      userBalances[b.playerName] = (userBalances[b.playerName] || 0) + winAmount;
    }
  });

  bets = bets.filter(b => !(b.matchId === matchId && b.isKO === isKO));

  const matchArray = getMatchArray(isKO);
  const match = matchArray.find(m => m.id === matchId);
  if (match) match.betsEvaluated = true;

  saveData();
}
