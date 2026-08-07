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
window.drawGroups = drawGroups;
window.drawKOPhase = drawKOPhase;
window.drawSemifinals = drawSemifinals;
window.drawFinals = drawFinals;
window.resetTournament = resetTournament;
window.updateTeamName = updateTeamName;
window.updateMatchScore = updateMatchScore;
window.addClub = addClub;
window.removeClub = removeClub;
window.resetClubsToDefault = resetClubsToDefault;
window.startInteractiveDraft = startInteractiveDraft;
window.spinWheel = spinWheel;
window.nextDraftStep = nextDraftStep;
window.finishDraft = finishDraft;
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

// 2. Zustand
let players = [];
let availableClubs = [...DEFAULT_CLUBS];
let teams = [];
let groups = [];
let groupMatches = [];
let koMatches = [];
let rules = DEFAULT_RULES;
let tips = {};
let myPlayerName = localStorage.getItem('fifa_my_player') || null;
let pendingAdminLogin = false;
let userBalances = {}; // Speichert die Coins pro Spieler { "Name": 100 }
let bets = [];         // Speichert alle abgegebenen Wetten

// Interaktive Auslosung (Live-Synced)
let draftState = {
  active: false,
  pairs: [],
  currentIndex: 0,
  remainingClubs: [],
  spinning: false,
  startTime: null,
  targetAngle: 0,
  duration: 4000,
  lastDrawnClub: null
};

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
  return p && p.isRef;
}

function canManageMatches() {
  return isAdmin() || isRef();
}

function getMyTeam() {
  if (!myPlayerName) return null;
  return teams.find(t => t.p1 === myPlayerName || t.p2 === myPlayerName);
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
  if (adminBtn) adminBtn.style.display = isAdmin() ? 'inline-block' : 'none';

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
}

// 4. Live-Sync via Firebase
db.ref('tournament').on('value', (snapshot) => {
  const data = snapshot.val() || {};
  let rawPlayers = data.players || [];
  
  players = rawPlayers.map(p => typeof p === 'string' ? { name: p, isRef: false, password: null } : p);
  availableClubs = data.availableClubs || [...DEFAULT_CLUBS];
  teams = data.teams || [];
  groups = data.groups || [];
  groupMatches = data.groupMatches || [];
  koMatches = data.koMatches || [];
  rules = data.rules || DEFAULT_RULES;
  tips = data.tips || {};
  draftState = data.draftState || { active: false, pairs: [], currentIndex: 0, remainingClubs: [], spinning: false, startTime: null, targetAngle: 0, duration: 4000, lastDrawnClub: null };
  
  // Neu für das Wett-System:
  userBalances = data.userBalances || {};
  bets = data.bets || [];

  renderAll();
  handleLiveDraftUI();
});

function saveData() {
  db.ref('tournament').set({ 
    players, 
    availableClubs, 
    teams, 
    groups, 
    groupMatches, 
    koMatches, 
    rules, 
    tips, 
    draftState,
    userBalances,
    bets
  });
}

// 5. Profi-Clubs Verwaltung
function addClub() {
  const input = document.getElementById('new-club-name');
  const name = input ? input.value.trim() : '';
  if (!name) return;
  if (availableClubs.includes(name)) return alert('Club bereits in der Liste!');

  availableClubs.push(name);
  input.value = '';
  saveData();
}

function removeClub(index) {
  if (!isAdmin()) return;
  availableClubs.splice(index, 1);
  saveData();
}

function resetClubsToDefault() {
  if (!isAdmin()) return;
  if (confirm('Verfügbare Clubs auf Standard-Topteams zurücksetzen?')) {
    availableClubs = [...DEFAULT_CLUBS];
    saveData();
  }
}

// 6. LIVE INTERAKTIVE AUSLOSUNG SHOW
function startInteractiveDraft() {
  if (!isAdmin()) return;
  if (players.length < 2 || players.length % 2 !== 0) {
    return alert(`Du benötigst eine gerade Anzahl an Spielern (aktuell: ${players.length}).`);
  }
  if (availableClubs.length < (players.length / 2)) {
    return alert(`Du hast zu wenige Profi-Clubs in der Liste! Mindestens ${players.length / 2} benötigt.`);
  }

  if (confirm('Soll die Auslosungs-Show jetzt LIVE gestartet werden?')) {
    const shuffledPlayers = [...players.map(p => p.name)].sort(() => Math.random() - 0.5);
    const shuffledClubs = [...availableClubs].sort(() => Math.random() - 0.5);

    let pairs = [];
    let idCounter = 1;
    for (let i = 0; i < shuffledPlayers.length; i += 2) {
      pairs.push({
        id: idCounter,
        name: `Team ${idCounter}`,
        p1: shuffledPlayers[i],
        p2: shuffledPlayers[i + 1],
        club: null
      });
      idCounter++;
    }

    teams = [];
    groups = [];
    groupMatches = [];
    koMatches = [];
    tips = {};

    draftState = {
      active: true,
      pairs: pairs,
      currentIndex: 0,
      remainingClubs: shuffledClubs,
      spinning: false,
      startTime: null,
      targetAngle: 0,
      duration: 4000,
      lastDrawnClub: null
    };

    saveData();
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

  if (draftState.currentIndex >= draftState.pairs.length) {
    stage.innerHTML = `
      <h3 style="color:#4CAF50;">🎉 Alle Teams wurden gelost! 🎉</h3>
      <p>Die Teams und zugelosten Fußballmannschaften stehen fest!</p>
      ${isAdmin() ? `<button class="btn-primary role-btn" onclick="finishDraft()">Fertigstellen & Teams speichern</button>` : '<p style="color:var(--fal-yellow);">Warte auf Admin-Bestätigung...</p>'}
    `;
    return;
  }

  const currentPair = draftState.pairs[draftState.currentIndex];

  stage.innerHTML = `
    <p style="font-size:0.9em; opacity:0.8;">Team ${draftState.currentIndex + 1} von ${draftState.pairs.length}</p>
    
    <div style="background:rgba(0,0,0,0.3); padding:15px; border-radius:10px; margin: 15px 0;">
      <h3 style="margin:0 0 10px 0; color:var(--fal-yellow);">👥 Spieler-Duo:</h3>
      <h2 style="margin:0; font-size:1.4em;">${currentPair.p1} & ${currentPair.p2}</h2>
    </div>

    <div class="wheel-container">
      <div class="wheel-pointer"></div>
      <canvas id="wheel-canvas" width="260" height="260"></canvas>
    </div>

    <div id="spin-result" style="height: 35px; font-weight: bold; font-size: 1.2em; color: var(--fal-yellow); margin-top:5px;">
      ${draftState.lastDrawnClub ? `⚽ Gewählter Club: <u>${draftState.lastDrawnClub}</u>` : ''}
    </div>

    ${isAdmin() ? `
      ${!draftState.spinning && !draftState.lastDrawnClub ? `
        <button class="btn-primary role-btn" id="btn-spin-wheel" style="margin-top:10px;" onclick="spinWheel()">
          🎰 Rad drehen
        </button>
      ` : ''}

      ${!draftState.spinning && draftState.lastDrawnClub ? `
        <button class="btn-primary role-btn" style="margin-top:15px;" onclick="nextDraftStep()">
          ${draftState.currentIndex + 1 < draftState.pairs.length ? 'Weiter zum nächsten Team ➡️' : 'Auslosung abschließen 🎉'}
        </button>
      ` : ''}
    ` : `
      <p style="font-size:0.9em; opacity:0.8; margin-top:10px;">
        ${draftState.spinning ? '🎰 Das Rad dreht sich live...' : (draftState.lastDrawnClub ? 'Warte auf nächstes Team...' : 'Der Admin dreht gleich am Rad!')}
      </p>
    `}
  `;

  startWheelAnimationLoop();
}

function startWheelAnimationLoop() {
  if (animFrameId) cancelAnimationFrame(animFrameId);

  function update() {
    if (!draftState || !draftState.active) return;

    let currentAngle = 0;

    if (draftState.spinning && draftState.startTime) {
      const now = Date.now();
      const elapsed = now - draftState.startTime;
      const progress = Math.min(elapsed / draftState.duration, 1);
      
      const easeOut = 1 - Math.pow(1 - progress, 3);
      currentAngle = easeOut * draftState.targetAngle;

      if (progress < 1) {
        animFrameId = requestAnimationFrame(update);
      } else {
        currentAngle = draftState.targetAngle;
      }
    } else if (draftState.lastDrawnClub) {
      currentAngle = draftState.targetAngle;
    }

    drawWheelCanvas(currentAngle);
  }

  update();
}

function drawWheelCanvas(angleOffset) {
  const canvas = document.getElementById('wheel-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const numClubs = draftState.remainingClubs.length;
  if (numClubs === 0) return;

  const sliceAngle = (2 * Math.PI) / numClubs;
  ctx.clearRect(0, 0, 260, 260);

  const colors = ['#1e3e62', '#0b192c', '#132a4a', '#2a2a2a', '#10233d'];

  for (let i = 0; i < numClubs; i++) {
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
    ctx.fillText(draftState.remainingClubs[i].substring(0, 12), 120, 4);
    ctx.restore();
  }
}

function spinWheel() {
  if (!isAdmin() || draftState.spinning) return;

  const targetIndex = Math.floor(Math.random() * draftState.remainingClubs.length);
  const targetClub = draftState.remainingClubs[targetIndex];

  const numClubs = draftState.remainingClubs.length;
  const sliceAngle = (2 * Math.PI) / numClubs;

  const targetSegmentCenter = (targetIndex + 0.5) * sliceAngle;
  const targetAngleAtTop = (1.5 * Math.PI) - targetSegmentCenter;
  const totalRotation = (2 * Math.PI * 5) + targetAngleAtTop;

  draftState.spinning = true;
  draftState.startTime = Date.now();
  draftState.targetAngle = totalRotation;
  draftState.duration = 4000;
  draftState.lastDrawnClub = null;
  saveData();

  // Nach Ablauf der 4 Sekunden speichern wir das Endergebnis (Club wird HIER noch NICHT gelöscht)
  setTimeout(() => {
    if (isAdmin() && draftState.spinning) {
      draftState.spinning = false;
      draftState.lastDrawnClub = targetClub;
      draftState.pairs[draftState.currentIndex].club = targetClub;
      saveData();
    }
  }, 4100);
}

function nextDraftStep() {
  if (!isAdmin()) return;

  // HIER löschen wir den Club erst sauber heraus, wenn es weitergeht!
  if (draftState.lastDrawnClub) {
    const idx = draftState.remainingClubs.indexOf(draftState.lastDrawnClub);
    if (idx !== -1) {
      draftState.remainingClubs.splice(idx, 1);
    }
  }

  draftState.currentIndex++;
  draftState.lastDrawnClub = null;
  draftState.targetAngle = 0;
  draftState.startTime = null;
  draftState.spinning = false;
  saveData();
}

function finishDraft() {
  if (!isAdmin()) return;
  teams = [...draftState.pairs];
  draftState.active = false;
  saveData();
  showTab('teams');
}

// 7. Standard Admin Handlungen
function addPlayer() {
  const input = document.getElementById('new-player-name');
  const name = input ? input.value.trim() : '';
  if (!name) return;
  if (getPlayerObj(name)) return alert('Spieler existiert bereits!');

  players.push({ name: name, isRef: false, password: null });
  input.value = '';
  saveData();
}

function removePlayer(index) {
  if (!isAdmin()) return;
  players.splice(index, 1);
  saveData();
}

function toggleRef(index) {
  if (!isAdmin()) return;
  players[index].isRef = !players[index].isRef;
  saveData();
}

function setPlayerPassword(index) {
  if (!isAdmin()) return;
  const pwd = prompt(`Neues Passwort für ${players[index].name} eingeben:`);
  if (pwd !== null) {
    if (pwd.trim() === '') return alert('Passwort darf nicht leer sein.');
    players[index].password = pwd.trim();
    saveData();
  }
}

function removePlayerPassword(index) {
  if (!isAdmin()) return;
  if (confirm(`Passwort von ${players[index].name} wirklich löschen?`)) {
    players[index].password = null;
    saveData();
  }
}

// 8. Gruppen & KO-Phase Logik
function drawGroups() {
  if (!isAdmin()) return;
  if (teams.length < 4) return alert('Du benötigst mindestens 4 Teams für Gruppen!');

  let choice = prompt(
    `Du hast aktuell ${teams.length} Teams.\n\n` +
    `Wähle den Turniermodus:\n` +
    `1 = 2 Gruppen (Top 2 je Gruppe direkt ins HALBFINALE)\n` +
    `2 = 4 Gruppen (Top 2 je Gruppe ins VIERTELFINALE)\n\n` +
    `Eingabe (1 oder 2):`, 
    teams.length <= 8 ? "1" : "2"
  );

  if (!choice) return;

  let groupLetters = [];
  if (choice.trim() === "1") {
    groupLetters = ['Gruppe A', 'Gruppe B'];
  } else if (choice.trim() === "2") {
    groupLetters = ['Gruppe A', 'Gruppe B', 'Gruppe C', 'Gruppe D'];
  } else {
    return alert('Ungültige Auswahl! Bitte 1 oder 2 eingeben.');
  }

  if (confirm(`Gruppen neu auslosen (${groupLetters.length} Gruppen) & Spielplan erstellen?`)) {
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
          rawGroupMatches.push({
            group: group.letter,
            t1Id: gTeams[i],
            t2Id: gTeams[j],
            score1: null,
            score2: null,
            played: false
          });
        }
      }
    });

    let matchesByGroup = {};
    groupLetters.forEach(l => { matchesByGroup[l] = rawGroupMatches.filter(m => m.group === l); });

    let interleavedMatches = [];
    let maxLen = Math.max(...Object.values(matchesByGroup).map(arr => arr.length));
    
    for (let i = 0; i < maxLen; i++) {
      groupLetters.forEach(l => {
        if (matchesByGroup[l][i]) {
          interleavedMatches.push(matchesByGroup[l][i]);
        }
      });
    }

    groupMatches = [];
    let matchId = 1;
    let slotCounter = 1;

    for (let i = 0; i < interleavedMatches.length; i += 2) {
      let m1 = interleavedMatches[i];
      let m2 = interleavedMatches[i + 1];

      m1.id = matchId++;
      m1.court = 'Hauptplatz';
      m1.slot = slotCounter;
      groupMatches.push(m1);

      if (m2) {
        if (m2.t1Id === m1.t1Id || m2.t1Id === m1.t2Id || m2.t2Id === m1.t1Id || m2.t2Id === m1.t2Id) {
          let swapIdx = interleavedMatches.findIndex((candidate, cIdx) => 
            cIdx > i + 1 && 
            candidate.t1Id !== m1.t1Id && candidate.t1Id !== m1.t2Id &&
            candidate.t2Id !== m1.t1Id && candidate.t2Id !== m1.t2Id
          );

          if (swapIdx !== -1) {
            let temp = interleavedMatches[i + 1];
            interleavedMatches[i + 1] = interleavedMatches[swapIdx];
            interleavedMatches[swapIdx] = temp;
            m2 = interleavedMatches[i + 1];
          }
        }

        m2.id = matchId++;
        m2.court = 'Nebenplatz';
        m2.slot = slotCounter;
        groupMatches.push(m2);
      }

      slotCounter++;
    }

    koMatches = [];
    saveData();
    showTab('groups');
  }
}

function drawKOPhase() {
  if (!isAdmin()) return;
  if (groups.length === 2) {
    return alert('Du spielst im 2-Gruppen-Modus! Klicke direkt auf "Halbfinale auslosen".');
  }

  const standings = calculateGroupStandings();
  const qualified1st = [];
  const qualified2nd = [];

  standings.forEach(g => {
    if (g.rankings.length >= 1) qualified1st.push({ ...g.rankings[0], group: g.letter });
    if (g.rankings.length >= 2) qualified2nd.push({ ...g.rankings[1], group: g.letter });
  });

  if (qualified1st.length < 4 || qualified2nd.length < 4) {
    return alert('Es müssen in allen 4 Gruppen die Gruppenspiele beendet sein!');
  }

  if (confirm('Viertelfinale Über-Kreuz auslosen (keine Duelle aus gleicher Gruppe)?')) {
    let available2nd = [...qualified2nd];
    let paired2nd = [];

    for (let i = 0; i < qualified1st.length; i++) {
      let first = qualified1st[i];
      let possibleOpponents = available2nd.filter(sec => sec.group !== first.group);
      
      if (possibleOpponents.length === 0) {
        possibleOpponents = available2nd;
      }

      let chosen = possibleOpponents[Math.floor(Math.random() * possibleOpponents.length)];
      paired2nd.push(chosen);
      available2nd = available2nd.filter(sec => sec.teamId !== chosen.teamId);
    }

    koMatches = [];
    let matchId = 101;

    for (let i = 0; i < 4; i++) {
      let court = (i % 2 === 0) ? 'Hauptplatz' : 'Nebenplatz';
      koMatches.push({
        id: matchId++,
        round: 'Viertelfinale',
        court: court,
        t1Id: qualified1st[i].teamId,
        t2Id: paired2nd[i].teamId,
        score1: null,
        score2: null,
        played: false
      });
    }

    saveData();
    showTab('matches');
  }
}

function drawSemifinals() {
  if (!isAdmin()) return;
  const standings = calculateGroupStandings();

  if (groups.length === 2) {
    const groupA = standings.find(g => g.letter === 'Gruppe A');
    const groupB = standings.find(g => g.letter === 'Gruppe B');

    if (!groupA || !groupB || groupA.rankings.length < 2 || groupB.rankings.length < 2) {
      return alert('Es müssen erst alle Gruppenspiele in Gruppe A und B beendet sein!');
    }

    if (confirm('Halbfinale Über-Kreuz anlegen? (A1 vs B2 & B1 vs A2)')) {
      koMatches = [
        {
          id: 201, round: 'Halbfinale 1', court: 'Hauptplatz',
          t1Id: groupA.rankings[0].teamId,
          t2Id: groupB.rankings[1].teamId,
          score1: null, score2: null, played: false
        },
        {
          id: 202, round: 'Halbfinale 2', court: 'Nebenplatz',
          t1Id: groupB.rankings[0].teamId,
          t2Id: groupA.rankings[1].teamId,
          score1: null, score2: null, played: false
        }
      ];

      saveData();
      showTab('matches');
    }
    return;
  }

  const qfMatches = koMatches.filter(m => m.round === 'Viertelfinale');
  const winners = [];

  qfMatches.forEach(m => {
    if (m.played) {
      if (m.score1 > m.score2) winners.push(m.t1Id);
      else if (m.score2 > m.score1) winners.push(m.t2Id);
    }
  });

  if (winners.length < 4) return alert('Es müssen erst alle 4 Viertelfinal-Spiele beendet sein!');

  if (confirm('Halbfinale jetzt zufällig aus den 4 Siegern auslosen?')) {
    const shuffledWinners = [...winners].sort(() => Math.random() - 0.5);
    
    koMatches.push({
      id: 201, round: 'Halbfinale 1', court: 'Hauptplatz',
      t1Id: shuffledWinners[0], t2Id: shuffledWinners[1],
      score1: null, score2: null, played: false
    });

    koMatches.push({
      id: 202, round: 'Halbfinale 2', court: 'Nebenplatz',
      t1Id: shuffledWinners[2], t2Id: shuffledWinners[3],
      score1: null, score2: null, played: false
    });

    saveData();
    showTab('matches');
  }
}

function drawFinals() {
  if (!isAdmin()) return;
  const hf1 = koMatches.find(m => m.round === 'Halbfinale 1');
  const hf2 = koMatches.find(m => m.round === 'Halbfinale 2');

  if (!hf1 || !hf2 || !hf1.played || !hf2.played) return alert('Beide Halbfinal-Spiele müssen erst beendet sein!');

  const hf1Winner = hf1.score1 > hf1.score2 ? hf1.t1Id : hf1.t2Id;
  const hf1Loser  = hf1.score1 > hf1.score2 ? hf1.t2Id : hf1.t1Id;
  const hf2Winner = hf2.score1 > hf2.score2 ? hf2.t1Id : hf2.t2Id;
  const hf2Loser  = hf2.score1 > hf2.score2 ? hf2.t2Id : hf2.t1Id;

  if (confirm('Finale & Spiel um Platz 3 jetzt erstellen?')) {
    koMatches.push({
      id: 301, round: '🥉 Spiel um Platz 3', court: 'Nebenplatz',
      t1Id: hf1Loser, t2Id: hf2Loser, score1: null, score2: null, played: false
    });

    koMatches.push({
      id: 302, round: '🏆 FINALE', court: 'Hauptplatz',
      t1Id: hf1Winner, t2Id: hf2Winner, score1: null, score2: null, played: false
    });

    saveData();
    showTab('matches');
  }
}

function resetTournament() {
  if (!isAdmin()) return;
  if (confirm('Turnier wirklich zurücksetzen? Alle Teams und Ergebnisse werden gelöscht!')) {
    players = [];
    teams = [];
    groups = [];
    groupMatches = [];
    koMatches = [];
    tips = {};
    draftState = { active: false, pairs: [], currentIndex: 0, remainingClubs: [], spinning: false, startTime: null, targetAngle: 0, duration: 4000, lastDrawnClub: null };
    userBalances = {}; // Setzt alle Kontostände zurück (jeder startet wieder bei 100)
    bets = [];         // Löscht alle aktiven Wetten
    saveData();
  }
}

// 9. Match & Team Updates
function updateTeamName(teamId, newName) {
  const team = teams.find(t => t.id === teamId);
  if (!team) return;

  const isMyTeam = (myPlayerName && (team.p1 === myPlayerName || team.p2 === myPlayerName));
  
  if (canManageMatches() || isMyTeam) {
    team.name = newName.trim() || `Team ${team.id}`;
    saveData();
  } else {
    alert('Du kannst nur deinen eigenen Team-Namen bearbeiten!');
    renderAll();
  }
}

function updateMatchScore(matchId, isKO, score1Val, score2Val) {
  const matchArray = isKO ? koMatches : groupMatches;
  const match = matchArray.find(m => m.id === matchId);
  if (!match) return;
  if (match.betsEvaluated) {
    alert('Dieses Spiel wurde bereits bestätigt und ausgezahlt. Der Spielstand ist gesperrt!');
    return;
  }

  const myTeam = getMyTeam();
  const canEdit = canManageMatches() || (myTeam && (match.t1Id === myTeam.id || match.t2Id === myTeam.id));

  if (!canEdit) {
    alert('Du darfst nur Ergebnisse eintragen, bei denen dein Team mitspielt!');
    renderAll();
    return;
  }

  if (score1Val === '' || score2Val === '') {
    match.score1 = null; match.score2 = null; match.played = false;
  } else {
    const s1 = parseInt(score1Val, 10);
    const s2 = parseInt(score2Val, 10);

    if (isKO && s1 === s2) return alert('In der KO-Phase muss es einen Sieger geben!');

    match.score1 = s1; match.score2 = s2; match.played = true;

    if (s1 !== s2 && canManageMatches()) {
      const winningTeamId = s1 > s2 ? match.t1Id : match.t2Id;
      evaluateBetsForMatch(matchId, winningTeamId);
    }

    if (match.round === '🏆 FINALE') {
      const winnerTeamId = s1 > s2 ? match.t1Id : match.t2Id;
      const winnerTeam = teams.find(t => t.id === winnerTeamId);

      if (winnerTeam) {
        setTimeout(() => {
          alert(`🎉 🏆 DIE SIEGER DES FAL FIFA TURNIERS SIND: 🏆 🎉\n\n🥇 ${winnerTeam.p1} & ${winnerTeam.p2} (${winnerTeam.name} - ${winnerTeam.club || ''}) 🥇\n\nHerzlichen Glückwunsch! 👏🥳`);
        }, 300);
      }
    }
  }

  saveData();
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

  if (isAdmin()) {
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
  if (!isAdmin()) return;
  const textarea = document.getElementById('rules-textarea');
  if (!textarea) return;
  rules = textarea.value.trim() || DEFAULT_RULES;
  saveData();
}

function renderTipRound() {
  const container = document.getElementById('tip-content');
  if (!container) return;

  if (teams.length === 0) {
    container.innerHTML = '<p class="empty-state">Sobald die Teams gelost sind, kann getippt werden.</p>';
    return;
  }

  const totalTips = Object.keys(tips).length;
  const myTip = myPlayerName ? tips[myPlayerName] : null;

  const rows = teams.map(t => {
    const count = Object.values(tips).filter(id => id === t.id).length;
    const pct = totalTips > 0 ? Math.round((count / totalTips) * 100) : 0;
    const isMine = myTip === t.id;
    const label = `${t.name}${t.club ? ' (' + t.club + ')' : ''}`;

    return `
      <div class="tip-row">
        <button class="btn-secondary tip-btn ${isMine ? 'highlight-me' : ''}"
                ${myPlayerName ? `onclick="submitTip(${t.id})"` : 'disabled'}>
          <span>${isMine ? '✅ ' : ''}${label}</span>
          <span style="color:var(--fal-yellow); font-weight:bold;">${pct}% (${count})</span>
        </button>
        <div class="tip-bar-track">
          <div class="tip-bar-fill" style="width:${pct}%;"></div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    ${!myPlayerName ? '<p class="empty-state">Melde dich als Spieler an, um mitzutippen.</p>' : ''}
    ${rows}
    <p style="font-size:0.8em; opacity:0.7; margin-top:4px;">${totalTips} von ${players.length} Spielern haben getippt.</p>
  `;
}

function submitTip(teamId) {
  if (!myPlayerName) return;
  tips[myPlayerName] = teamId;
  saveData();
}

function calculateTeamStats() {
  const stats = {};
  teams.forEach(t => {
    stats[t.id] = { team: t, goals: 0, wins: 0, played: 0 };
  });

  [...groupMatches, ...koMatches].filter(m => m.played).forEach(m => {
    if (stats[m.t1Id]) {
      stats[m.t1Id].goals += m.score1;
      stats[m.t1Id].played++;
      if (m.score1 > m.score2) stats[m.t1Id].wins++;
    }
    if (stats[m.t2Id]) {
      stats[m.t2Id].goals += m.score2;
      stats[m.t2Id].played++;
      if (m.score2 > m.score1) stats[m.t2Id].wins++;
    }
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

  const stats = calculateTeamStats();
  const played = stats.filter(s => s.played > 0);

  const topScorer = [...stats].sort((a, b) => b.goals - a.goals)[0];
  const topWinner = played.length > 0
    ? [...played].sort((a, b) => (b.wins / b.played) - (a.wins / a.played) || b.wins - a.wins)[0]
    : null;

  const tipCounts = teams.map(t => ({ team: t, count: Object.values(tips).filter(id => id === t.id).length }));
  const favorite = [...tipCounts].sort((a, b) => b.count - a.count)[0];

  container.innerHTML = `
    <div class="grid-container">
      <div class="admin-card stat-tile">
        <p class="stat-label">⚽ Torjäger-Team</p>
        <p class="stat-value">${topScorer && topScorer.goals > 0 ? `${topScorer.team.name} (${topScorer.goals} Tore)` : 'Noch keine Tore'}</p>
      </div>
      <div class="admin-card stat-tile">
        <p class="stat-label">🔥 Beste Siegquote</p>
        <p class="stat-value">${topWinner ? `${topWinner.team.name} (${topWinner.wins}/${topWinner.played} Siege)` : 'Noch keine Spiele'}</p>
      </div>
      <div class="admin-card stat-tile">
        <p class="stat-label">🐐 Fan-Liebling</p>
        <p class="stat-value">${favorite && favorite.count > 0 ? `${favorite.team.name} (${favorite.count} Tipps)` : 'Noch keine Tipps'}</p>
      </div>
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
    const canEditName = canManageMatches() || isMyTeam;
    const clubBadgeHtml = t.club ? `<div class="club-badge">⚽ ${t.club}</div>` : '';

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
      if (t1 && t2) {
        t1.played++; t2.played++;
        t1.gf += m.score1; t1.ga += m.score2;
        t2.gf += m.score2; t2.ga += m.score1;

        if (m.score1 > m.score2) t1.points += 3;
        else if (m.score2 > m.score1) t2.points += 3;
        else { t1.points += 1; t2.points += 1; }

        t1.diff = t1.gf - t1.ga;
        t2.diff = t2.gf - t2.ga;
      }
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

  container.innerHTML = standings.map(g => `
    <div class="admin-card">
      <h3 style="color:var(--fal-yellow); margin-top:0;">${g.letter}</h3>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th>Sp</th>
              <th>Tore</th>
              <th>Diff</th>
              <th>Pkt</th>
            </tr>
          </thead>
          <tbody>
            ${g.rankings.map((r, idx) => `
              <tr>
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
}

function renderMatches() {
  const gList = document.getElementById('group-matches-list');
  const kList = document.getElementById('ko-matches-list');
  const myTeam = getMyTeam();

  if (gList) {
    if (groupMatches.length === 0) {
      gList.innerHTML = '<p class="empty-state">Noch keine Gruppenspiele generiert.</p>';
    } else {
      gList.innerHTML = groupMatches.map(m => renderMatchCard(m, false, myTeam)).join('');
    }
  }

  if (kList) {
    if (koMatches.length === 0) {
      kList.innerHTML = '<p class="empty-state">KO-Phase wurde noch nicht gelost.</p>';
    } else {
      let html = '';

      const finalMatch = koMatches.find(m => m.round === '🏆 FINALE');
      if (finalMatch && finalMatch.played) {
        const winnerId = finalMatch.score1 > finalMatch.score2 ? finalMatch.t1Id : finalMatch.t2Id;
        const winnerTeam = teams.find(t => t.id === winnerId);
        if (winnerTeam) {
          html += `
            <div class="admin-card highlight-me" style="text-align: center; margin-bottom: 25px; background: linear-gradient(135deg, #132A4A, #1A3E66);">
              <h2 style="color: var(--fal-yellow); margin: 0 0 10px 0;">🏆 TURNIERSIEGER 🏆</h2>
              <h3 style="font-size: 1.5em; margin: 0; color: white;">${winnerTeam.p1} & ${winnerTeam.p2}</h3>
              <p style="margin: 5px 0 0 0; color: var(--fal-yellow); font-weight: bold;">(${winnerTeam.name} - ${winnerTeam.club || ''})</p>
            </div>
          `;
        }
      }

      const isTwoGroupMode = groups.length === 2;
      const qfMatches = koMatches.filter(m => m.round === 'Viertelfinale');
      const qfFinished = qfMatches.length === 4 && qfMatches.every(m => m.played);
      const hasHF = koMatches.some(m => m.round.includes('Halbfinale'));

      const hfMatches = koMatches.filter(m => m.round.includes('Halbfinale'));
      const hfFinished = hfMatches.length === 2 && hfMatches.every(m => m.played);
      const hasFinal = koMatches.some(m => m.round.includes('FINALE'));

      if (isAdmin()) {
        if (isTwoGroupMode && !hasHF) {
          html += `<button class="btn-primary" style="margin-bottom: 20px;" onclick="drawSemifinals()">🎲 Halbfinale Über-Kreuz auslosen!</button>`;
        } else if (!isTwoGroupMode && qfFinished && !hasHF) {
          html += `<button class="btn-primary" style="margin-bottom: 20px;" onclick="drawSemifinals()">🎲 Halbfinale jetzt auslosen!</button>`;
        }
        
        if (hfFinished && !hasFinal) {
          html += `<button class="btn-primary" style="margin-bottom: 20px;" onclick="drawFinals()">🏆 Finale & Spiel um Platz 3 anlegen!</button>`;
        }
      }

      html += koMatches.map(m => renderMatchCard(m, true, myTeam)).join('');
      kList.innerHTML = html;
    }
  }
}

function renderMatchCard(m, isKO, myTeam) {
  const t1 = teams.find(t => t.id === m.t1Id);
  const t2 = teams.find(t => t.id === m.t2Id);
  const canEdit = canManageMatches() || (myTeam && (m.t1Id === myTeam.id || m.t2Id === myTeam.id));
  const courtClass = m.court === 'Hauptplatz' ? 'court-main' : 'court-side';
  const roundTitle = m.round ? `${m.round}` : `Runde ${m.slot} • ${m.group}`;
  const isFinal = m.round === '🏆 FINALE';

  const t1Label = t1 ? `${t1.name} ${t1.club ? '(' + t1.club + ')' : ''}` : 'Team 1';
  const t2Label = t2 ? `${t2.name} ${t2.club ? '(' + t2.club + ')' : ''}` : 'Team 2';

  return `
    <div class="match-card ${isFinal ? 'highlight-me' : ''}">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="font-size: 0.85em; font-weight: bold; color: var(--fal-yellow);">${roundTitle}</span>
        <span class="court-badge ${courtClass}">${m.court}</span>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin: 10px 0;">
        <span style="font-size: 0.95em;"><strong>${t1Label}</strong> <br><small style="opacity:0.7;">vs</small><br> <strong>${t2Label}</strong></span>
      </div>
      <div style="display:flex; gap: 8px; align-items:center;">
        <input type="number" min="0" value="${m.score1 !== null ? m.score1 : ''}" 
               ${canEdit && !m.betsEvaluated ? '' : 'disabled'} id="score1-${m.id}" placeholder="-" style="width: 60px;">
        <span>:</span>
        <input type="number" min="0" value="${m.score2 !== null ? m.score2 : ''}" 
               ${canEdit && !m.betsEvaluated ? '' : 'disabled'} id="score2-${m.id}" placeholder="-" style="width: 60px;">
        ${canEdit ? `
          <button class="${m.betsEvaluated ? 'btn-secondary' : 'btn-primary'} btn-sm" 
                  ${m.betsEvaluated ? 'disabled' : ''} 
                  onclick="updateMatchScore(${m.id}, ${isKO}, document.getElementById('score1-${m.id}').value, document.getElementById('score2-${m.id}').value)">
            ${canManageMatches() ? (m.betsEvaluated ? '🔒 Ausgezahlt & Fix' : (m.played ? '✓ Bestätigen & Auszahlen' : 'Speichern')) : 'Speichern'}
          </button>
        ` : ''}

      </div>
    </div>
  `;
}

function renderAdminPanel() {
  const playerListEl = document.getElementById('admin-player-list');
  const clubListEl = document.getElementById('admin-club-list');

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
            <button class="${isRefBtnClass} btn-sm" onclick="toggleRef(${index})">
              ${p.isRef ? '🟨 Ref (Aktiv)' : 'Ref vergeben'}
            </button>
            ${hasPW 
              ? `<button class="btn-danger btn-sm" onclick="removePlayerPassword(${index})">PW löschen</button>`
              : `<button class="btn-secondary btn-sm" onclick="setPlayerPassword(${index})">+ PW</button>`
            }
            <button class="btn-danger btn-sm" onclick="removePlayer(${index})">🗑️</button>
          </div>
        </div>
      `;
    }).join('');
  }

  if (clubListEl) {
    clubListEl.innerHTML = availableClubs.map((club, index) => `
      <span class="club-badge">
        ${club} <span style="cursor:pointer; color:#ff4d4d; font-weight:bold; margin-left:4px;" onclick="removeClub(${index})">×</span>
      </span>
    `).join('');
  }
}
// ==========================================
// 🎯 WETT-SYSTEM LOGIK & RENDERING
// ==========================================

function getUserBalance(playerName) {
  if (!playerName) return 0;
  if (userBalances[playerName] === undefined) {
    userBalances[playerName] = 100; // Startguthaben für jeden neuen Spieler
  }
  return userBalances[playerName];
}

function renderBettingSystem() {
  const balanceEl = document.getElementById('user-coin-balance');
  const matchesListEl = document.getElementById('betting-matches-list');
  const leaderboardEl = document.getElementById('betting-leaderboard');

  if (!balanceEl || !matchesListEl || !leaderboardEl) return;

  // 1. Kontostand anzeigen
  const currentBalance = myPlayerName ? getUserBalance(myPlayerName) : 0;
  balanceEl.innerText = currentBalance;

  // 2. Nächste ungespielte Spiele laden
  const upcomingMatches = [...groupMatches, ...koMatches]
    .filter(m => !m.played && m.t1Id && m.t2Id)
    .slice(0, 3); // Max 3 nächste Spiele zum Wetten anzeigen

  if (upcomingMatches.length === 0) {
    matchesListEl.innerHTML = '<p style="opacity:0.7;">Aktuell keine anstehenden Spiele zum Wetten verfügbar.</p>';
  } else {
    matchesListEl.innerHTML = upcomingMatches.map(m => {
      const t1 = teams.find(t => t.id === m.t1Id);
      const t2 = teams.find(t => t.id === m.t2Id);
      if (!t1 || !t2) return '';

      // Prüfen, ob der User bereits auf dieses Spiel gewettet hat
      const myExistingBet = bets.find(b => b.matchId === m.id && b.playerName === myPlayerName);

      return `
        <div style="background: rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; margin-bottom: 10px; border: 1px solid rgba(255,255,255,0.1);">
          <div style="font-size: 0.85em; opacity: 0.8; margin-bottom: 5px;">${m.round || m.group || 'Spiel'}</div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold; margin-bottom: 10px;">
            <span>${t1.p1}/${t1.p2} (${t1.club || 'Team 1'})</span>
            <span style="color: var(--fal-yellow);">VS</span>
            <span>${t2.p1}/${t2.p2} (${t2.club || 'Team 2'})</span>
          </div>
          
          ${myExistingBet ? `
            <div style="text-align:center; font-size: 0.9em; color: var(--fal-yellow); background: rgba(0,0,0,0.2); padding: 5px; border-radius: 5px;">
              ✅ Gewettet: <strong>${myExistingBet.amount} Coins</strong> auf <strong>${myExistingBet.chosenTeamId === t1.id ? t1.club : t2.club}</strong>
            </div>
          ` : `
            <div style="display: flex; gap: 8px; align-items: center;">
              <select id="bet-team-${m.id}" style="flex: 2; padding: 6px; border-radius: 4px;">
                <option value="${t1.id}">${t1.club || t1.name}</option>
                <option value="${t2.id}">${t2.club || t2.name}</option>
              </select>
              <input type="number" id="bet-amount-${m.id}" placeholder="Coins" min="1" max="${currentBalance}" style="flex: 1; padding: 6px; border-radius: 4px;">
              <button class="btn-primary" style="padding: 6px 12px; font-size: 0.9em;" onclick="placeBet(${m.id})">Wetten</button>
            </div>
          `}
        </div>
      `;
    }).join('');
  }

  // 3. Highroller Ranking
  const sortedUsers = Object.keys(userBalances)
    .map(name => ({ name, balance: userBalances[name] }))
    .sort((a, b) => b.balance - a.balance);

  if (sortedUsers.length === 0) {
    leaderboardEl.innerHTML = '<p style="font-size:0.85em; opacity:0.7;">Noch keine Konten aktiv.</p>';
  } else {
    leaderboardEl.innerHTML = sortedUsers.map((u, i) => `
      <div style="display: flex; justify-content: space-between; font-size: 0.9em; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
        <span>${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`} ${u.name}</span>
        <span style="font-weight: bold; color: var(--fal-yellow);">${u.balance} 🪙</span>
      </div>
    `).join('');
  }
}

function placeBet(matchId) {
  if (!myPlayerName) return alert('Bitte melde dich erst an, um zu wetten!');

  const teamSelect = document.getElementById(`bet-team-${matchId}`);
  const amountInput = document.getElementById(`bet-amount-${matchId}`);

  const chosenTeamId = parseInt(teamSelect.value);
  const amount = parseInt(amountInput.value);
  const currentBalance = getUserBalance(myPlayerName);

  if (isNaN(amount) || amount <= 0) return alert('Bitte einen gültigen Wettbetrag eingeben!');
  if (amount > currentBalance) return alert('Du hast nicht genügend FAL-Coins!');

  // Coins abziehen
  userBalances[myPlayerName] -= amount;

  // Wette einspeichern
  bets.push({
    matchId: matchId,
    playerName: myPlayerName,
    chosenTeamId: chosenTeamId,
    amount: amount
  });

  saveData();
}

// Auswertung der Wetten bei Spielende (Wird aufgerufen wenn ein Match-Ergebnis eingetragen wird)
function evaluateBetsForMatch(matchId, winningTeamId) {
  const matchBets = bets.filter(b => b.matchId === matchId);

  matchBets.forEach(b => {
    if (b.chosenTeamId === winningTeamId) {
      // Gewinn: Verdopplung des Einsatzes (Quote 2.0)
      const winAmount = b.amount * 2;
      userBalances[b.playerName] = (userBalances[b.playerName] || 0) + winAmount;
    }
  });

  // Abgearbeitete Wetten entfernen
  bets = bets.filter(b => b.matchId !== matchId);
  const match = [...groupMatches, ...koMatches].find(m => m.id === matchId);
  if (match) {
    match.betsEvaluated = true;
  }
  saveData();
}
