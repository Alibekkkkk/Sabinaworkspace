(() => {

(function(){
  try {
    var t = localStorage.getItem('teacher_theme') || 'light';
    document.documentElement.setAttribute('data-theme', t);
  } catch(e) {}
})();

})();

import { isLessonVisibleTo } from "../audience.js";
import { isTeacher } from "../auth.js";
import { appendBoundedRealtimeRecord } from "../bounded-realtime-list.js";
import { installDelegatedActions, readActionEnum, readActionInteger, readActionParam } from "../delegated-actions.js";
import { appendHtml, safeUrl, setHtml } from "../dom.js";
import { DEFAULT_CLASS_ID, validateNickname } from "../leaderboard.js";
import { showToast } from "../ui.js";

let firebaseConfig = null;

let fbApp = null, fbAuth = null, fbDb = null, teacherUid = null;
let studentsMap = {}, studentMeta = {}, curriculum = {}, pendingMap = {}, activeNotesRef = null;
let activeCode = null, activeFeedRef = null, activeProgressRef = null;
let activeGameProgress = {};
let activeHistoryItems = [], weeklyHistoryLoaded = false, weeklyProgressLoaded = false;
let editingLessonId = null, lessonVisibility = 'some', lessonType = 'classwork';
let pendingLinkUid = null;
let currentClassworkId = null, currentClassworkCode = '';
let currentHomeworkId = null, currentHomeworkCode = '';
let expandedYears = {}, expandedMonths = {}, expandedLessons = {};
const UNDO_STORAGE_KEY = 'teacherDashboardUndoV2';
let undoStack = [];

const STAGE_NAMES = ['Vocabulary','Word Match','Reading & Questions','Completing Sent 1','Completing Sent 2','Sentence Builder 1','Sentence Builder 2','Choose the Tense','Test Your Knowledge'];
const STAGE_LIST = [
  {id:1,label:'Vocabulary'},
  {id:2,label:'Word Match'},
  {id:3,label:'Reading & Questions'},
  {id:4,label:'Completing Sent 1'},
  {id:5,label:'Completing Sent 2'},
  {id:6,label:'Sentence Builder 1'},
  {id:7,label:'Sentence Builder 2'},
  {id:8,label:'Choose the Tense'},
  {id:9,label:'Test Your Knowledge'}
];

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  const next = cur === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('teacher_theme', next); } catch (e) {}
  updateThemeButton();
}
function updateThemeButton() {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  const cur = document.documentElement.getAttribute('data-theme') || 'light';
  btn.textContent = cur === 'light' ? '🌙' : '☀️';
  btn.title = cur === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
}

async function initFirebase() {
  try {
    const config=await import('../config.js');
    firebaseConfig=config.firebaseConfig;
    fbApp = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig);
    fbAuth = firebase.auth();
    fbDb = firebase.database();

    fbAuth.getRedirectResult().catch(function(err) {
      console.error('Redirect error:', err);
      document.getElementById('authError').textContent = authErrorMessage(err);
    });

    fbAuth.onAuthStateChanged(async function(user) {
      let allowed = false;
      try {
        allowed = await isTeacher(user, fbDb);
      } catch (error) {
        console.error("Teacher authorization check failed:", error);
        document.getElementById('authError').textContent = 'Could not verify teacher access. Check your connection and try again.';
      }
      if (!allowed) {
        teacherUid = null;
        document.querySelector('.wrap').style.display = 'none';
        document.getElementById('teacherLogin').style.display = 'block';
        if (user) {
          document.getElementById('authError').textContent =
            'Signed in as ' + user.email + ', which is not the teacher account. Signing you out…';
          fbAuth.signOut();
        }
        return;
      }
      teacherUid = user.uid;
      document.getElementById('authError').textContent = '';
      document.getElementById('teacherLogin').style.display = 'none';
      document.querySelector('.wrap').style.display = 'block';
      document.getElementById('teacherEmail').textContent = user.email;
      updateThemeButton();
      initTeacherData();
    });
  } catch (err) {
    console.error('Firebase init failed:', err);
    document.getElementById('authError').textContent = authErrorMessage(err);
  }
}

function authErrorMessage(err) {
  const code = (err && err.code) || '';
  if (code.indexOf('unauthorized-domain') !== -1) return 'This domain is not authorized. Add alibekkkkk.github.io in Firebase Auth settings.';
  if (code.indexOf('operation-not-allowed') !== -1) return 'Google sign-in is not enabled in Firebase.';
  if (code.indexOf('popup') !== -1) return 'Popup blocked. Allow popups for this site.';
  return (err && err.message) || 'Sign-in failed. Check the console.';
}

function teacherGoogleSignIn() {
  document.getElementById('authError').textContent = 'Opening Google sign-in…';
  if (!fbAuth) { document.getElementById('authError').textContent = 'Firebase not initialized.'; return; }
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  fbAuth.signInWithPopup(provider).then(function() {
    document.getElementById('authError').textContent = '';
  }).catch(function(err) {
    if (err && (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment')) {
      document.getElementById('authError').textContent = 'Popup blocked — trying redirect…';
      fbAuth.signInWithRedirect(provider);
      return;
    }
    document.getElementById('authError').textContent = authErrorMessage(err);
  });
}

function teacherSignOut() { if (fbAuth) fbAuth.signOut(); }

function initTeacherData() {
  if (!teacherUid) return;
  loadUndoStack();
  updateThemeButton();

  fbDb.ref('students').on('value', function(snap) {
    studentsMap = snap.val() || {};
    updateConnUI('live');
    renderStudentsList();
    if (!activeCode) renderOverview();
    renderClassworkTree();
    renderHomeworkTree();
  }, function(err) { console.error(err); updateConnUI('error'); });

  fbDb.ref('pendingStudents').on('value', function(snap) {
    pendingMap = snap.val() || {};
    renderPendingApprovals();
  });

  // Compact per-student summaries only. Notes, drafts and history are fetched for the
  // selected student on demand (attachNotesListener / attachHistoryListener).
  fbDb.ref('sessionSummary').on('value', function(snap) {
    const data = snap.val() || {};
    const previous = studentMeta;
    studentMeta = {};
    Object.keys(data).forEach(function(code) {
      const summary = data[code] || {};
      studentMeta[code] = {
        score: summary.score || 0, stage: summary.stage || 0, doneCount: summary.doneCount || 0,
        elapsed: summary.elapsed || 0, streak: summary.streak || 0,
        lastSeen: summary.lastUpdate || 0, homework: summary.homework || {},
        notes: (previous[code] && previous[code].notes) || ''
      };
    });
    if (activeCode) renderSelectedView();
    else renderOverview();
    renderStudentsList();
  }, function(err) { console.error(err); updateConnUI('error'); });

  fbDb.ref('curriculum').on('value', function(snap) {
    curriculum = snap.val() || {};
    renderClassworkTree();
    renderHomeworkTree();
    if (activeCode) renderStudentHomework();
  });
}

function updateConnUI(status) {
  const el = document.getElementById('conn');
  const txt = document.getElementById('connText');
  el.classList.remove('live','off');
  if (status === 'live') { el.classList.add('live'); txt.textContent = 'Live · Synced'; }
  else if (status === 'error') { el.classList.add('off'); txt.textContent = 'Connection error'; }
  else txt.textContent = 'Connecting…';
}

function renderPendingApprovals() {
  const card = document.getElementById('pendingCard');
  const list = document.getElementById('pendingList');
  const count = document.getElementById('pendingCount');
  const uids = Object.keys(pendingMap);
  if (!uids.length) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  count.textContent = uids.length;
  setHtml(list, uids.map(function(uid) {
    const p = pendingMap[uid] || {};
    return '<div class="pending-item">' +
      '<div><div class="who">' + escapeHtml(p.name || 'Student') + '</div>' +
      '<div class="email">' + escapeHtml(p.email || uid) + '</div></div>' +
      '<div class="actions">' +
      '<button class="btn small primary" data-action="approve-pending-student" data-uid="' + escapeHtml(uid) + '">✓ Create new</button>' +
      '<button class="btn small" data-action="open-link-modal" data-uid="' + escapeHtml(uid) + '">🔗 Link existing</button>' +
      '<button class="btn small danger" data-action="reject-pending-student" data-uid="' + escapeHtml(uid) + '">✕ Reject</button>' +
      '</div></div>';
  }).join(''));
}

function approvePendingStudent(uid) {
  const p = pendingMap[uid];
  if (!p) return;
  const code = generateCode(studentsMap);
  const payload = { name: p.name || 'Student', code: code, email: p.email || '', uid: uid, approved: true, createdAt: Date.now() };
  writeChangesWithUndo([
    { path: 'students/' + code, value: payload },
    { path: 'studentByUid/' + uid, value: code },
    { path: 'pendingStudents/' + uid, value: null }
  ], 'approve ' + payload.name).then(function() {
    showToast('Approved ' + payload.name + ' — code ' + code);
  }).catch(function(err) { alert('Approval failed: ' + err.message); });
}

function rejectPendingStudent(uid) {
  if (!confirm('Reject this registration request?')) return;
  fbDb.ref('pendingStudents/' + uid).remove().catch(function(err) { alert('Reject failed: ' + err.message); });
}

function openLinkModal(uid) {
  pendingLinkUid = uid;
  const unlinked = Object.keys(studentsMap).filter(function(code) { return !studentsMap[code].uid; });
  if (!unlinked.length) { alert('No unlinked students available. Create a new one instead.'); return; }
  setHtml(document.getElementById('linkCodeSelect'), unlinked.map(function(code) {
    const s = studentsMap[code];
    return '<option value="' + escapeHtml(code) + '">' + escapeHtml(s.name || code) + ' — ' + escapeHtml(code) + '</option>';
  }).join(''));
  document.getElementById('linkStudentModal').classList.add('open');
}

function closeLinkModal() {
  pendingLinkUid = null;
  document.getElementById('linkStudentModal').classList.remove('open');
}

function confirmLinkStudent() {
  const uid = pendingLinkUid;
  const code = document.getElementById('linkCodeSelect').value;
  if (!uid || !code) return;
  const p = pendingMap[uid] || {};
  const existing = studentsMap[code] || {};
  const updated = Object.assign({}, existing, { uid: uid, email: p.email || existing.email || '', approved: true, linkedAt: Date.now() });
  writeChangesWithUndo([
    { path: 'students/' + code, value: updated },
    { path: 'studentByUid/' + uid, value: code },
    { path: 'pendingStudents/' + uid, value: null }
  ], 'link ' + code).then(function() {
    closeLinkModal();
    showToast('Linked ' + (updated.name || code) + ' to Google.');
  }).catch(function(err) { alert('Link failed: ' + err.message); });
}

function switchMainTab(tab) {
  ['students','classwork','homework'].forEach(function(t) {
    document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle('active', t === tab);
    document.getElementById('view' + t.charAt(0).toUpperCase() + t.slice(1)).classList.toggle('active', t === tab);
  });
  if (tab === 'classwork') {
    if (activeCode) {
      const s = studentsMap[activeCode] || {};
      document.getElementById('classworkFilterText').textContent = 'Showing lessons visible to ' + (s.name || activeCode);
      document.getElementById('classworkFilter').classList.add('show');
    } else {
      document.getElementById('classworkFilter').classList.remove('show');
    }
    renderClassworkTree();
  }
  if (tab === 'homework') renderHomeworkTree();
}

function clearClassworkFilter() {
  activeCode = null;
  document.getElementById('classworkFilter').classList.remove('show');
  renderClassworkTree();
}

function generateCode(existing) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = 'S'; for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)]; }
  while (existing && existing[code]);
  return code;
}

function renderStudentsList() {
  const list = document.getElementById('studentsList');
  const query = (document.getElementById('studentSearch').value || '').toLowerCase().trim();
  const codes = Object.keys(studentsMap).filter(function(code) {
    const s = studentsMap[code];
    return !query || (s.name || '').toLowerCase().indexOf(query) !== -1 || code.toLowerCase().indexOf(query) !== -1;
  });
  document.getElementById('studentsCount').textContent = Object.keys(studentsMap).length;
  if (!codes.length) { setHtml(list, '<div class="no-data" style="padding:20px;">No students yet.</div>'); return; }
  
  setHtml(list, codes.map(function(code) {
    const s = studentsMap[code];
    const meta = studentMeta[code] || {};
    const lastSeen = meta.lastSeen || 0;
    const age = Date.now() - lastSeen;
    let dotClass = 'off';
    if (lastSeen && age < 60000) dotClass = 'live';
    else if (lastSeen && age < 600000) dotClass = 'stale';
    const linked = s.uid ? '🔗' : '⚠️';
    
    const doneCount = Number(meta.doneCount) || 0;
    const totalStages = 9; 
    const pct = Math.round((doneCount / totalStages) * 100);
    const barColor = pct === 100 ? 'var(--success)' : (pct > 50 ? 'var(--warn)' : 'var(--accent)');
    const progressBar = `<div style="width:100%; height:6px; background:var(--border); border-radius:6px; margin-top:8px;"><div style="width:${pct}%; height:100%; background:${barColor}; border-radius:6px; transition:width 0.3s;"></div></div>`;

    // Add homework progress summary
    const hwCount = Object.keys(meta.homework || {}).length;
    const hwDone = Object.keys(meta.homework || {}).filter(k => meta.homework[k].submitted).length;
    const hwText = hwCount > 0 ? `<span style="color:var(--accent);">HW: ${hwDone}/${hwCount}</span>` : '';

    return '<div class="student-item ' + (code === activeCode ? 'active' : '') + '" data-action="select-student" data-code="' + escapeHtml(code) + '">' +
      '<div class="top-row"><div class="name">' + escapeHtml(s.name || code) + '</div><div class="dot ' + dotClass + '"></div></div>' +
      '<div class="code">' + linked + ' ' + escapeHtml(code) + '</div>' +
      '<div class="stats" style="margin-bottom:4px;"><span>🏆 <b>' + escapeHtml(meta.score || 0) + '</b></span><span>📍 Stage ' + escapeHtml(meta.stage || '—') + '</span><span>✅ ' + doneCount + '/' + totalStages + '</span>' + hwText + '</div>' +
      progressBar +
      '</div>';
  }).join(''));
}

function selectStudent(code) {
  document.getElementById('studentContextBanner').style.display = 'block';
  document.getElementById('studentContextName').textContent = code ? (studentsMap[code].name || code) : '';
  activeCode = code;
  activeGameProgress = {};
  activeHistoryItems = [];
  weeklyHistoryLoaded = false;
  weeklyProgressLoaded = false;
  document.getElementById('weeklySummaryOutput').value = '';
  document.getElementById('downloadWeeklySummary').disabled = true;
  updateWeeklySummaryAvailability();
  renderStudentsList();
  document.getElementById('selectedView').style.display = 'block';
  document.getElementById('overviewView').style.display = 'none';
  renderSelectedView();
  attachHistoryListener();
  attachGameProgressListener();
  attachNotesListener();
  loadLeaderboardCard();
  renderClassworkTree();
}

function deselectStudent() {
  activeCode = null;
  if (activeFeedRef) { activeFeedRef.off(); activeFeedRef = null; }
  if (activeProgressRef) { activeProgressRef.off(); activeProgressRef = null; }
  if (activeNotesRef) { activeNotesRef.off(); activeNotesRef = null; }
  activeGameProgress = {};
  document.getElementById('selectedView').style.display = 'none';
  document.getElementById('overviewView').style.display = 'block';
  document.getElementById('studentContextBanner').style.display = 'none';
  renderStudentsList();
  renderOverview();
  renderClassworkTree();
  switchMainTab('students'); 
}

function renderSelectedView() {
  if (!activeCode || !studentsMap[activeCode]) return;
  const s = studentsMap[activeCode];
  const meta = studentMeta[activeCode] || {};
  document.getElementById('selectedName').textContent = s.name || activeCode;
  document.getElementById('selectedCode').textContent = activeCode;
  document.getElementById('selectedAdded').textContent = s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '—';

  setHtml(document.getElementById('controlGrid'), '<button class="btn" data-action="send-goto" data-stage="' + (Number(meta.stage) || 1) + '" style="grid-column: 1 / -1; background:var(--success); color:#fff; border:none; margin-bottom:8px; font-size:15px;">' +
      '🎯 Tell Student to Resume at Stage ' + escapeHtml(meta.stage || 1) +
    '</button>' +
    STAGE_LIST.map(function(st) {
      const isCurrent = (meta.stage || 1) === st.id;
      return '<button class="ctrl-btn' + (isCurrent ? ' current' : '') + '" data-action="send-goto" data-stage="' + st.id + '"><span class="num">' + st.id + '</span>' + st.label + '</button>';
    }).join(''));

  document.getElementById('notesView').textContent = meta.notes || '— No notes yet —';
  renderStudentHomework();
  renderGameAnalytics();
}

function attachNotesListener() {
  if (activeNotesRef) activeNotesRef.off();
  const code = activeCode;
  activeNotesRef = fbDb.ref('sessions/' + code + '/state/notes');
  activeNotesRef.on('value', function(snapshot) {
    if (code !== activeCode) return;
    const notes = typeof snapshot.val() === 'string' ? snapshot.val() : '';
    studentMeta[code] = Object.assign({}, studentMeta[code], { notes: notes });
    document.getElementById('notesView').textContent = notes || '— No notes yet —';
  }, function(error) { console.error('Unable to load student notes', error); });
}

function leaderboardTarget() {
  const student = studentsMap[activeCode] || {};
  return { uid: student.uid || '', classId: student.classId || DEFAULT_CLASS_ID };
}

function loadLeaderboardCard() {
  const summary = document.getElementById('leaderboardSummary');
  const target = leaderboardTarget();
  document.getElementById('classIdInput').value = studentsMap[activeCode] && studentsMap[activeCode].classId || '';
  document.getElementById('leaderboardNicknameInput').value = '';
  if (!target.uid) { summary.textContent = 'This student has not linked an account yet.'; return; }
  fbDb.ref('leaderboard/' + target.classId + '/members/' + target.uid).once('value').then(function(snapshot) {
    const member = snapshot.val();
    summary.textContent = member
      ? 'Nickname: ' + member.nickname + ' (class ' + target.classId + ', ' + (Number(member.totalXp) || 0) + ' XP all time)'
      : 'Not joined (students are opted out by default).';
    if (member) document.getElementById('leaderboardNicknameInput').value = member.nickname;
  }).catch(function(error) { summary.textContent = 'Could not load: ' + error.message; });
}

function renameLeaderboardNickname() {
  const target = leaderboardTarget();
  const check = validateNickname(document.getElementById('leaderboardNicknameInput').value);
  if (!target.uid) return;
  if (!check.valid) { showToast(check.reason); return; }
  fbDb.ref('leaderboard/' + target.classId + '/members/' + target.uid + '/nickname').set(check.nickname)
    .then(function() { showToast('Nickname updated'); loadLeaderboardCard(); })
    .catch(function(error) { alert('Rename failed: ' + error.message); });
}

function removeFromLeaderboard() {
  const target = leaderboardTarget();
  if (!target.uid || !confirm('Remove this student from the leaderboard? They can join again.')) return;
  fbDb.ref('leaderboard/' + target.classId + '/members/' + target.uid).remove()
    .then(function() { showToast('Removed from the leaderboard'); loadLeaderboardCard(); })
    .catch(function(error) { alert('Remove failed: ' + error.message); });
}

function saveClassId() {
  const value = document.getElementById('classIdInput').value.trim().toLowerCase();
  if (value && !/^[a-z0-9_-]{1,32}$/.test(value)) { showToast('Use letters, numbers, - and _ only.'); return; }
  fbDb.ref('students/' + activeCode + '/classId').set(value || null)
    .then(function() { showToast(value ? 'Class set to ' + value : 'Class cleared (main)'); })
    .catch(function(error) { alert('Could not save the class: ' + error.message); });
}

function renderPlacementCard() {
  const placement = activeGameProgress && activeGameProgress.placement;
  const summary = document.getElementById('placementSummary');
  const select = document.getElementById('placementOverride');
  if (!summary || !select) return;
  if (!placement || !placement.cefr) {
    summary.textContent = 'No result yet.';
    select.value = '';
    return;
  }
  const confidence = Math.round((Number(placement.confidence) || 0) * 100);
  const answers = Object.values(placement.answers || {});
  summary.textContent = 'Estimated ' + placement.cefr + ' (confidence ' + confidence + '%, ' +
    answers.filter(function(a) { return a.correct; }).length + '/' + answers.length + ' correct) on ' +
    new Date(Number(placement.takenAt) || 0).toLocaleDateString() +
    (placement.teacherLevel ? ' — teacher level: ' + placement.teacherLevel : '');
  select.value = placement.teacherLevel || '';
}

function savePlacementOverride() {
  if (!activeCode || !activeGameProgress.placement) { showToast('This student has no placement result yet.'); return; }
  const level = document.getElementById('placementOverride').value;
  fbDb.ref('studentProgress/' + activeCode + '/placement/teacherLevel').set(level || null)
    .then(function() { showToast(level ? 'Level set to ' + level : 'Using the estimate'); })
    .catch(function(error) { alert('Could not save the level: ' + error.message); });
}

function resetPlacement() {
  if (!activeCode || !activeGameProgress.placement) { showToast('Nothing to reset.'); return; }
  if (!confirm('Remove the saved result so this student can retake the check now?')) return;
  fbDb.ref('studentProgress/' + activeCode + '/placement').set(null)
    .then(function() { showToast('The student can retake the check.'); })
    .catch(function(error) { alert('Reset failed: ' + error.message); });
}

function attachGameProgressListener() {
  if (activeProgressRef) activeProgressRef.off();
  const host = document.getElementById('gameAnalytics');
  host.textContent = 'Loading practice data…';
  activeProgressRef = fbDb.ref('studentProgress/' + activeCode);
  activeProgressRef.on('value', function(snapshot) {
    activeGameProgress = snapshot.val() || {};
    weeklyProgressLoaded = true;
    updateWeeklySummaryAvailability();
    renderGameAnalytics();
    renderPlacementCard();
  }, function(error) {
    host.textContent = 'Practice data could not be loaded: ' + error.message;
    weeklyProgressLoaded = false;
    updateWeeklySummaryAvailability();
  });
}

function renderGameAnalytics() {
  const host = document.getElementById('gameAnalytics');
  if (!host) return;
  const progress = activeGameProgress || {};
  const attempts = Array.isArray(progress.attempts) ? progress.attempts : [];
  const topics = Object.entries(progress.topics || {})
    .map(([name, stats]) => ({
      name: stats.label || name,
      accuracy: Number(stats.total) ? Number(stats.score || 0) / Number(stats.total) : 0,
      time: Number(stats.timeSpentSeconds) || 0,
      attempts: Number(stats.attempts) || 0
    }))
    .sort((a, b) => a.accuracy - b.accuracy);
  const totalTime = topics.reduce((sum, topic) => sum + topic.time, 0);
  const summary = document.createElement('p');
  summary.textContent = attempts.length
    ? 'Completed ' + attempts.length + ' recent games · ' + (progress.xp || 0) + ' XP · ' +
      Math.round(totalTime / 60) + ' minutes tracked · ' + (progress.streak || 0) + '-day streak.'
    : 'No practice games completed yet.';
  host.replaceChildren(summary);
  if (!topics.length) return;
  const heading = document.createElement('h3');
  heading.textContent = 'Topics to revisit';
  const list = document.createElement('ul');
  topics.slice(0, 5).forEach(topic => {
    const item = document.createElement('li');
    item.textContent = topic.name + ' · ' + Math.round(topic.accuracy * 100) + '% accuracy · ' +
      topic.attempts + ' games · ' + Math.round(topic.time / 60) + ' min';
    list.append(item);
  });
  host.append(heading, list);
}

function attachHistoryListener() {
  if (activeFeedRef) activeFeedRef.off();
  const sList = document.getElementById('studentHistoryList');
  const tList = document.getElementById('teacherHistoryList');
  setHtml(sList, '<div class="no-data">Loading…</div>');
  setHtml(tList, '<div class="no-data">Loading…</div>');
  
  const tf = document.getElementById('historyTimeframe').value;
  const cutoff = tf === 'all' ? 0 : Date.now() - Number(tf);

  activeFeedRef = fbDb.ref('sessions/' + activeCode + '/history').limitToLast(100);
  activeFeedRef.on('value', function(snap) {
    const data = snap.val() || {};
    let items = Object.keys(data).map(k => Object.assign({id:k}, data[k]));
    activeHistoryItems = items;
    weeklyHistoryLoaded = true;
    updateWeeklySummaryAvailability();
    items = items.filter(i => i.ts >= cutoff).sort((a,b) => b.ts - a.ts);
    
    const sItems = items.filter(i => i.actor === 'student');
    const tItems = items.filter(i => i.actor === 'teacher');
    
    setHtml(sList, sItems.map(item => `
      <div class="feed-item info" style="align-items:center;">
         <span class="time">${new Date(item.ts).toLocaleTimeString()}</span>
         <span class="msg">${escapeHtml(item.detail)}</span>
         <button class="btn small" data-action="reset-stage" data-stage="${escapeHtml(item.stage)}" style="padding:2px 6px; font-size:11px;">Reset Stage ${escapeHtml(item.stage)}</button>
      </div>
    `).join('') || '<div class="no-data">No student actions.</div>');
    
    setHtml(tList, tItems.map(item => `
      <div class="feed-item action" style="align-items:center;">
         <span class="time">${new Date(item.ts).toLocaleTimeString()}</span>
         <span class="msg">${escapeHtml(item.detail)}</span>
         ${item.undo ? `<button class="btn small danger" data-action="undo-teacher-action" data-id="${escapeHtml(item.id)}" data-undo-type="${escapeHtml(item.undo.type)}" style="padding:2px 6px; font-size:11px;">Undo</button>` : ''}
      </div>
    `).join('') || '<div class="no-data">No teacher actions.</div>');
  }, function(error) {
    activeHistoryItems = [];
    weeklyHistoryLoaded = false;
    sList.textContent = 'Student history could not be loaded: ' + error.message;
    tList.textContent = 'Teacher history could not be loaded: ' + error.message;
    updateWeeklySummaryAvailability();
  });
}

function updateWeeklySummaryAvailability() {
  const button = document.getElementById('generateWeeklySummary');
  if (button) button.disabled = !activeCode || !weeklyHistoryLoaded || !weeklyProgressLoaded;
}

function generateWeeklySummary() {
  if (!activeCode || !studentsMap[activeCode]) return;
  try {
    const student = studentsMap[activeCode];
    document.getElementById('weeklySummaryOutput').value = window.createWeeklyProgressSummary({
      studentName: student.name || 'Student',
      studentCode: activeCode,
      attempts: activeGameProgress.attempts,
      topics: activeGameProgress.topics,
      homework: (studentMeta[activeCode] || {}).homework,
      history: activeHistoryItems,
      streak: activeGameProgress.streak
    });
    document.getElementById('downloadWeeklySummary').disabled = false;
  } catch (error) {
    document.getElementById('weeklySummaryOutput').value = `Summary could not be generated: ${error.message}`;
    document.getElementById('downloadWeeklySummary').disabled = true;
  }
}

function downloadWeeklySummary() {
  const text = document.getElementById('weeklySummaryOutput').value;
  if (!text || !activeCode) return;
  const reportUrl = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = reportUrl;
  link.download = `weekly-progress-${activeCode}-${new Date().toISOString().slice(0, 10)}.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(reportUrl), 1000);
}

// Teacher commands are append-only records under sessions/$code/commands/$id:
// { type, payload?, createdAt: SERVER_TIMESTAMP }. The student client acknowledges with `ack: true`.
function sendCommand(type, payload) {
  const command = { type: type, createdAt: firebase.database.ServerValue.TIMESTAMP };
  if (payload) command.payload = payload;
  return fbDb.ref('sessions/' + activeCode + '/commands').push(command);
}

function resetStage(stageId) {
  if(!confirm('Reset student progress for Stage ' + stageId + '?')) return;
  const ts = Date.now();
  sendCommand('resetStage', { stage: Number(stageId) })
    .then(() => {
      showToast('Sent: reset stage ' + stageId);
      return appendBoundedRealtimeRecord(fbDb.ref('sessions/' + activeCode + '/history'), {
        actor: 'teacher', type: 'resetStage', detail: `Reset Stage ${stageId}`, ts: ts
      });
    })
    .catch(function(error) { alert('Stage reset failed: ' + error.message); });
}

function undoTeacherAction(id, type) {
  if(type === 'goto') {
    sendCommand('goto', { stage: 1 }).catch(function(err) { alert('Command failed: ' + err.message); });
  }
  fbDb.ref('sessions/' + activeCode + '/history/' + id).remove();
  showToast('Action reverted');
}

function clearHistoryLogs() {
  const tf = document.getElementById('historyTimeframe').value;
  const cutoff = tf === 'all' ? 0 : Date.now() - Number(tf);
  if(!confirm('Delete history logs from this timeframe?')) return;
  
  fbDb.ref('sessions/' + activeCode + '/history').once('value').then(snap => {
    const data = snap.val() || {};
    const updates = {};
    Object.keys(data).forEach(k => {
      if(data[k].ts >= cutoff) updates[k] = null;
    });
    if(Object.keys(updates).length) return fbDb.ref('sessions/' + activeCode + '/history').update(updates);
  }).then(() => showToast('Logs cleared'));
}

function sendGoto(stage) {
  if (!activeCode) return;
  const ts = Date.now();
  sendCommand('goto', { stage: Number(stage) })
    .then(function() {
      showToast('Sent: go to stage ' + stage);
      return appendBoundedRealtimeRecord(fbDb.ref('sessions/' + activeCode + '/history'), {
        actor: 'teacher', type: 'goto', detail: `Sent goto Stage ${stage}`, ts: ts, undo: { type: 'goto' }
      });
    })
    .catch(function(err) { alert('Command failed: ' + err.message); });
}

function sendReset(type) {
  if (!activeCode) return;
  const label = type === 'vocab' ? 'vocabulary progress' : 'all progress';
  if (!confirm('Reset ' + label + ' for this student? You can undo this.')) return;
  const ts = Date.now();
  sendCommand(type === 'vocab' ? 'resetVocab' : 'resetAll')
    .then(function() {
      showToast('Reset command sent');
      return appendBoundedRealtimeRecord(fbDb.ref('sessions/' + activeCode + '/history'), {
        actor: 'teacher', type: 'reset', detail: `Reset ${label}`, ts: ts
      });
    })
    .catch(function(err) { alert('Reset failed: ' + err.message); });
}

function renderStudentHomework() {
  const list = document.getElementById('studentHomeworkList');
  if (!list || !activeCode) return;
  const assigned = Object.keys(curriculum || {}).map(function(id) { return { id: id, lesson: curriculum[id] || {} }; })
    .filter(function(row) {
      return row.lesson.homework &&
             Array.isArray(row.lesson.assignedTo) &&
             row.lesson.assignedTo.indexOf(activeCode) !== -1;
    });
  if (!assigned.length) { setHtml(list, 'No homework assigned to this student.'); return; }
  const progress = (studentMeta[activeCode] || {}).homework || {};
  setHtml(list, assigned.map(function(row) {
    const lesson = row.lesson;
    const prog = progress[row.id] || {};
    const isSubmitted = !!prog.submitted;
    const status = isSubmitted ? '✓ Submitted' : (prog.updatedAt ? 'In progress' : 'Not started');
    const score = isSubmitted ? (prog.total ? (prog.score || 0) + ' / ' + prog.total + ' correct' : (prog.score || 0) + ' correct') : '';
    const base = lesson.customUrl || 'homework.html';
    const url = safeUrl(base, window.location.href);
    if (!url) {
      console.error('Skipping homework with an unsafe custom URL', { lessonId: row.id });
      return '<div class="info-row"><span class="k">' + escapeHtml(lesson.title || row.id) +
        '</span><span class="v">Homework link unavailable.</span></div>';
    }
    url.searchParams.set('code', activeCode);
    url.searchParams.set('lesson', row.id);
    return '<div class="info-row"><span class="k">' + escapeHtml(lesson.title || row.id) + '</span>' +
      '<span class="v">' + status + (score ? ' · ' + escapeHtml(score) : '') + ' · <a href="' + escapeHtml(url.href) + '" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">open</a></span></div>';
  }).join(''));
}

function openStudentClasswork() {
  if (!activeCode) return;
  switchMainTab('classwork');
}
function openStudentHomework() {
  if (!activeCode) return;
  switchMainTab('homework');
}

function renderOverview() {
  const el = document.getElementById('overviewContent');
  const codes = Object.keys(studentsMap);
  if (!codes.length) {
    setHtml(el, '<div class="empty-state"><div class="icon">👥</div><h3>No students yet</h3>' +
      '<p>Click <b>+ Add Student</b> to create your first student code.</p></div>');
    return;
  }
  const totalScore = codes.reduce(function(s, c) { return s + (Number((studentMeta[c] || {}).score) || 0); }, 0);
  const active = codes.filter(function(c) { return ((studentMeta[c] || {}).lastSeen || 0) > Date.now() - 120000; }).length;
  setHtml(el, '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:20px;">' +
    '<div class="card" style="text-align:center;"><div style="font-size:36px;font-weight:800;color:var(--accent);">' + codes.length + '</div><div style="font-size:12px;color:var(--ink-soft);font-weight:700;text-transform:uppercase;letter-spacing:1px;">Students</div></div>' +
    '<div class="card" style="text-align:center;"><div style="font-size:36px;font-weight:800;color:var(--accent);">' + active + '</div><div style="font-size:12px;color:var(--ink-soft);font-weight:700;text-transform:uppercase;letter-spacing:1px;">Active now</div></div>' +
    '<div class="card" style="text-align:center;"><div style="font-size:36px;font-weight:800;color:var(--accent);">' + totalScore + '</div><div style="font-size:12px;color:var(--ink-soft);font-weight:700;text-transform:uppercase;letter-spacing:1px;">Total points</div></div>' +
    '</div>' +
    '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;">' +
    codes.map(function(code) {
      const s = studentsMap[code];
      const meta = studentMeta[code] || {};
      return '<div class="card" style="cursor:pointer;" data-action="select-student" data-code="' + escapeHtml(code) + '">' +
        '<div style="font-size:18px;font-weight:800;margin-bottom:4px;">' + escapeHtml(s.name || code) + '</div>' +
        '<div style="font-size:13px;color:var(--ink-soft);font-family:\'Fira Code\',monospace;letter-spacing:1.5px;margin-bottom:14px;">' + escapeHtml(code) + ' · ' + (s.uid ? '🔗 linked' : '⚠️ not linked') + '</div>' +
        '<div style="font-size:42px;font-weight:800;color:var(--accent);line-height:1;margin-bottom:4px;">' + escapeHtml(meta.score || 0) + '</div>' +
        '<div style="font-size:12px;color:var(--ink-soft);font-weight:700;text-transform:uppercase;letter-spacing:1px;">points</div>' +
        '</div>';
    }).join('') + '</div>');
}

function openAddStudent() {
  document.getElementById('newStudentName').value = '';
  document.getElementById('newStudentCode').value = '';
  document.getElementById('addStudentModal').classList.add('open');
  setTimeout(function() { document.getElementById('newStudentName').focus(); }, 50);
}
function closeAddStudent() { document.getElementById('addStudentModal').classList.remove('open'); }
function submitAddStudent() {
  const name = (document.getElementById('newStudentName').value || '').trim();
  if (!name) { alert('Please enter a name.'); return; }
  let code = (document.getElementById('newStudentCode').value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) code = generateCode(studentsMap);
  else {
    if (studentsMap[code]) { alert('That code is already taken.'); return; }
    if (code.length < 3) { alert('Code must be at least 3 characters.'); return; }
  }
  writeChangesWithUndo([{ path: 'students/' + code, value: { name: name, code: code, createdAt: Date.now() } }], 'add student ' + name)
    .then(function() { closeAddStudent(); selectStudent(code); })
    .catch(function(err) { alert('Failed: ' + err.message); });
}
function renameStudent() {
  if (!activeCode) return;
  const s = studentsMap[activeCode] || {};
  const newName = (prompt('New name:', s.name || '') || '').trim();
  if (!newName || newName === s.name) return;
  writeChangesWithUndo([{ path: 'students/' + activeCode, value: Object.assign({}, s, { name: newName }) }], 'rename to ' + newName)
    .catch(function(err) { alert('Failed: ' + err.message); });
}
function deleteStudent() {
  if (!activeCode) return;
  const s = studentsMap[activeCode] || {};
  if (!confirm('Delete "' + (s.name || activeCode) + '" and all progress? You can undo.')) return;
  const code = activeCode;
  const changes = [
    { path: 'students/' + code, value: null },
    { path: 'sessions/' + code, value: null }
  ];
  if (s.uid) changes.push({ path: 'studentByUid/' + s.uid, value: null });
  writeChangesWithUndo(changes, 'delete ' + code)
    .then(function() { deselectStudent(); })
    .catch(function(err) { alert('Failed: ' + err.message); });
}

function loadUndoStack() {
  try { undoStack = JSON.parse(sessionStorage.getItem(UNDO_STORAGE_KEY) || '[]'); } catch (e) { undoStack = []; }
  updateUndoButton();
}
function updateUndoButton() {
  const b = document.getElementById('undoButton');
  if (!b) return;
  b.disabled = !undoStack.length;
  b.title = undoStack.length ? 'Undo: ' + undoStack[undoStack.length - 1].label : 'No changes to undo';
}
function rememberUndo(action) {
  undoStack.push(action);
  if (undoStack.length > 30) undoStack.shift();
  try { sessionStorage.setItem(UNDO_STORAGE_KEY, JSON.stringify(undoStack)); } catch (e) {}
  updateUndoButton();
}
function sameValue(a, b) { return JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b); }
function writeChangesWithUndo(changes, label) {
  const refs = changes.map(function(c) { return fbDb.ref(c.path); });
  return Promise.all(refs.map(function(r) { return r.once('value'); })).then(function(snaps) {
    const action = { label: label, changes: changes.map(function(c, i) {
      return { path: c.path, before: snaps[i].val(), after: c.value === undefined ? null : c.value };
    })};
    return Promise.all(action.changes.map(function(c) {
      const r = fbDb.ref(c.path);
      return c.after === null ? r.remove() : r.set(c.after);
    })).then(function() { rememberUndo(action); return action; });
  });
}
function undoLastChange() {
  if (!undoStack.length) return;
  const action = undoStack[undoStack.length - 1];
  const refs = action.changes.map(function(c) { return fbDb.ref(c.path); });
  Promise.all(refs.map(function(r) { return r.once('value'); })).then(function(snaps) {
    const matches = action.changes.every(function(c, i) { return sameValue(snaps[i].val(), c.after); });
    if (!matches) { alert('Data changed since this action; undo skipped.'); return; }
    return Promise.all(action.changes.map(function(c) {
      const r = fbDb.ref(c.path);
      return c.before === null ? r.remove() : r.set(c.before);
    })).then(function() {
      undoStack.pop();
      try { sessionStorage.setItem(UNDO_STORAGE_KEY, JSON.stringify(undoStack)); } catch (e) {}
      updateUndoButton();
      showToast('Undid: ' + action.label);
    });
  }).catch(function(err) { alert('Undo failed: ' + err.message); });
}

// UPDATED: Grouping by year -> month -> [lessons & homeworks]
function renderClassworkTree() {
  const container = document.getElementById('classworkTree');
  if (!container) return;

  const grouped = {};
  Object.keys(curriculum).forEach(id => {
    const l = curriculum[id];
    if (activeCode && !isLessonVisibleTo(l, activeCode)) return;
    
    const year = l.year || '2026';
    const month = l.month || 'October';
    if (!grouped[year]) grouped[year] = {};
    if (!grouped[year][month]) grouped[year][month] = [];
    grouped[year][month].push({ id, l });
  });

  if (Object.keys(grouped).length === 0) {
    setHtml(container, '<div class="tree-empty">No items yet.<br><br><button class="btn small primary" data-action="open-lesson-modal">+ New Item</button></div>');
    return;
  }

  let html = '';
  Object.keys(grouped).sort().reverse().forEach(year => {
    const isY = expandedYears[year] !== false;
    html += `<div class="tree-year ${isY?'open':''}" data-action="toggle-year" data-year="${escapeHtml(year)}"><span>📅 ${escapeHtml(year)}</span><span class="arrow">▶</span></div>`;
    if (isY) {
      Object.keys(grouped[year]).sort().forEach(month => {
        const isM = expandedMonths[year+'_'+month] !== false;
        html += `<div class="tree-month ${isM?'open':''}" data-action="toggle-month" data-year="${escapeHtml(year)}" data-month="${escapeHtml(month)}"><span>📁 ${escapeHtml(month)}</span><span class="arrow">▶</span></div>`;
        if (isM) {
          grouped[year][month].sort((a,b) => (a.l.order||0) - (b.l.order||0)).forEach(item => {
            const l = item.l;
            const isActive = item.id === currentClassworkId || item.id === currentHomeworkId;
            const isOpen = expandedLessons[item.id];
            
            if (l.homework) {
              // Render as homework
              const prog = (studentMeta[activeCode]?.homework?.[item.id]) || {};
              let progText = "";
              if (prog.submitted) progText = `<span style="color:var(--success); font-size:11px; margin-left:auto;">✓ ${escapeHtml(prog.score || 0)}${prog.total ? '/' + escapeHtml(prog.total) : ''}</span>`;
              else if (prog.updatedAt) progText = `<span style="color:var(--warn); font-size:11px; margin-left:auto;">In progress</span>`;
              else progText = `<span style="color:var(--ink-soft); font-size:11px; margin-left:auto;">Not started</span>`;
              
              html += `<div class="tree-lesson ${isActive?'active':''}" data-action="open-homework" data-lesson-id="${escapeHtml(item.id)}">
                  <span>📝 ${escapeHtml(l.title || item.id)}</span>
                  ${progText}
              </div>`;
            } else {
              // Render as classwork
              html += `<div class="tree-lesson ${isActive?'active':''}" data-action="toggle-lesson-tree" data-lesson-id="${escapeHtml(item.id)}">
                  <span>📘 ${escapeHtml(l.title || item.id)}</span>
                  <span style="margin-left:auto; font-size:10px; opacity:0.6;">${isOpen ? '▼' : '▶'}</span>
              </div>`;
              
              if (isOpen) {
                  html += `<div style="padding-left: 20px; border-left: 1px solid var(--border); margin-left: 44px; margin-bottom: 8px;">`;
                  STAGE_LIST.forEach(st => {
                      html += `<div class="tree-lesson" style="padding:4px 10px; font-size:12px;" data-action="open-classwork-lesson" data-lesson-id="${escapeHtml(item.id)}" data-code="${escapeHtml(activeCode || '')}">${escapeHtml(st.label)}</div>`;
                  });
                  html += `</div>`;
              }
            }
          });
        }
      });
    }
  });
  setHtml(container, html);
}

function toggleYear(year) { expandedYears[year] = expandedYears[year] === false; renderClassworkTree(); }
function toggleMonth(year, month) {
  const k = year + '_' + month;
  expandedMonths[k] = expandedMonths[k] === false;
  renderClassworkTree();
}
function toggleLessonTree(id) {
  expandedLessons[id] = !expandedLessons[id];
  renderClassworkTree();
}

// The lesson page resolves the classwork file from the manifest when none is given;
// the dashboard never guesses a student's file from their name.
function resolveContentName(lesson) {
  if (lesson && lesson.contentUrl) {
    return lesson.contentUrl.replace(/^content\//, '').replace(/\.json$/, '');
  }
  return '';
}

function openClassworkLesson(id, specificCode) {
  currentClassworkId = id;
  currentClassworkCode = specificCode || '';
  const l = curriculum[id] || {};
  document.getElementById('classworkTitle').textContent = l.title || id;
  document.getElementById('classworkBar').style.display = 'flex';
  document.getElementById('classworkPlaceholder').style.display = 'none';
  const frame = document.getElementById('classworkFrame');
  frame.style.display = 'block';
  
  const url = new URL('lesson.html', window.location.href);
  url.searchParams.set('lesson', id);
  url.searchParams.set('teacher', '1');
  { const contentName = resolveContentName(l); if (contentName) url.searchParams.set('content', contentName); }
  if (currentClassworkCode) url.searchParams.set('code', currentClassworkCode); 
  frame.src = url.href;
  renderClassworkTree();
}

function openCurrentClassworkInTab() {
  if (!currentClassworkId) return;
  const l = curriculum[currentClassworkId] || {};
  const url = new URL('lesson.html', window.location.href);
  url.searchParams.set('lesson', currentClassworkId);
  url.searchParams.set('teacher', '1');
  { const contentName = resolveContentName(l); if (contentName) url.searchParams.set('content', contentName); }
  if (currentClassworkCode) url.searchParams.set('code', currentClassworkCode);
  window.open(url.href, '_blank');
}

function renderHomeworkTree() {
  const container = document.getElementById('homeworkTree');
  if (!container) return;
  const hwIds = Object.keys(curriculum).filter(function(id) {
    const l = curriculum[id] || {};
    if (!l.homework) return false;
    if (activeCode) {
      return Array.isArray(l.assignedTo) && l.assignedTo.indexOf(activeCode) !== -1;
    }
    return true;
  });
  if (!hwIds.length) {
    setHtml(container, '<div class="tree-empty">No homework assigned yet.<br><br>Open a classwork lesson and assign it as homework, or click + New in the Classwork tab and mark it as homework.</div>');
    return;
  }
  const grouped = {};
  hwIds.forEach(function(id) {
    const l = curriculum[id] || {};
    const assigned = Array.isArray(l.assignedTo) ? l.assignedTo : [];
    if (!assigned.length) { if (!grouped['Unassigned']) grouped['Unassigned'] = []; grouped['Unassigned'].push({ id: id, title: l.title || id }); return; }
    assigned.forEach(function(code) {
      const name = (studentsMap[code] && studentsMap[code].name) || code;
      if (!grouped[name]) grouped[name] = [];
      grouped[name].push({ id: id, title: l.title || id });
    });
  });
  const groups = Object.keys(grouped).sort();
  setHtml(container, groups.map(function(name) {
    const key = 'hw_' + name;
    const open = expandedYears[key] !== false;
    return '<div class="tree-year' + (open ? ' open' : '') + '" data-action="toggle-homework-group" data-group-name="' + escapeHtml(name) + '"><span>👤 ' + escapeHtml(name) + '</span><span class="arrow">▶</span></div>' +
      (open ? grouped[name].map(function(row) {
        return '<div class="tree-lesson' + (row.id === currentHomeworkId ? ' active' : '') + '" data-action="open-homework" data-lesson-id="' + escapeHtml(row.id) + '"><span>' + escapeHtml(row.title) + '</span></div>';
      }).join('') : '');
  }).join(''));
}
function toggleHwGroup(name) { const k = 'hw_' + name; expandedYears[k] = expandedYears[k] === false; renderHomeworkTree(); }

function openHomework(id) {
  currentHomeworkId = id;
  const l = curriculum[id] || {};
  document.getElementById('homeworkTitle').textContent = l.title || id;
  document.getElementById('homeworkBar').style.display = 'flex';
  document.getElementById('homeworkPlaceholder').style.display = 'none';
  const frame = document.getElementById('homeworkFrame');
  
  let contentFile = (l.contentUrl || '').replace(/^content\//, '').replace(/\.json$/, '');
  if(!contentFile) {
      if (l.assignedTo && l.assignedTo.length > 0) {
          const code = l.assignedTo[0];
          const sName = (studentsMap[code] && studentsMap[code].name) ? studentsMap[code].name : code;
          contentFile = 'homework_' + sName.toLowerCase().replace(/\s+/g, '');
      } else if (activeCode) {
          const sName = (studentsMap[activeCode] && studentsMap[activeCode].name) ? studentsMap[activeCode].name : activeCode;
          contentFile = 'homework_' + sName.toLowerCase().replace(/\s+/g, '');
      }
  }
  
  frame.style.display = 'block';
  const url = new URL('homework.html', window.location.href);
  url.searchParams.set('lesson', id);
  url.searchParams.set('teacher', '1');
  if (contentFile) url.searchParams.set('variant', contentFile);
  
  if (activeCode) url.searchParams.set('code', activeCode);
  frame.src = url.href;
  renderClassworkTree();
  renderHomeworkTree();
}

function openCurrentHomeworkInTab() {
  if (!currentHomeworkId) return;
  const l = curriculum[currentHomeworkId] || {};
  
  let contentFile = (l.contentUrl || '').replace(/^content\//, '').replace(/\.json$/, '');
  if(!contentFile) {
      if (l.assignedTo && l.assignedTo.length > 0) {
          const code = l.assignedTo[0];
          const sName = (studentsMap[code] && studentsMap[code].name) ? studentsMap[code].name : code;
          contentFile = 'homework_' + sName.toLowerCase().replace(/\s+/g, '');
      } else if (activeCode) {
          const sName = (studentsMap[activeCode] && studentsMap[activeCode].name) ? studentsMap[activeCode].name : activeCode;
          contentFile = 'homework_' + sName.toLowerCase().replace(/\s+/g, '');
      }
  }
  
  const url = new URL('homework.html', window.location.href);
  url.searchParams.set('lesson', currentHomeworkId);
  url.searchParams.set('teacher', '1');
  if (contentFile) url.searchParams.set('variant', contentFile);
  
  if (activeCode) url.searchParams.set('code', activeCode);
  window.open(url.href, '_blank');
}

function openLessonModal(id) {
  editingLessonId = id || null;
  const l = id ? (curriculum[id] || {}) : {};
  document.getElementById('lessonModalTitle').textContent = id ? 'Edit lesson' : 'Create lesson';
  document.getElementById('lessonTitle').value = l.title || '';
  document.getElementById('lessonDesc').value = l.description || '';
  document.getElementById('lessonIcon').value = l.icon || '📘';
  document.getElementById('lessonCustomUrl').value = l.customUrl || '';
  document.getElementById('lessonContentUrl').value = (l.contentUrl || '').replace(/^content\//, '').replace(/\.json$/, '');
  document.getElementById('lessonDue').value = l.homeworkDue || '';
  document.getElementById('lessonParent').value = l.parentId || '';
  document.getElementById('lessonPublished').checked = l.published !== false;
  lessonVisibility = l.audience === 'all' ? 'all' : 'some';
  lessonType = l.homework ? 'homework' : 'classwork';
  setLessonVisibility(lessonVisibility);
  setLessonType(lessonType);
  renderStudentPickList(l.assignedTo || []);
  document.getElementById('lessonModal').classList.add('open');
}
function editLessonMeta(id) { openLessonModal(id); }
function closeLessonModal() { editingLessonId = null; document.getElementById('lessonModal').classList.remove('open'); }
function setLessonVisibility(vis) {
  lessonVisibility = vis;
  document.getElementById('visAllBtn').classList.toggle('primary', vis === 'all');
  document.getElementById('visSomeBtn').classList.toggle('primary', vis === 'some');
  document.getElementById('studentPickList').style.display = vis === 'some' ? 'block' : 'none';
}
function setLessonType(type) {
  lessonType = type;
  document.getElementById('typeClassworkBtn').classList.toggle('primary', type === 'classwork');
  document.getElementById('typeHomeworkBtn').classList.toggle('primary', type === 'homework');
  document.getElementById('homeworkExtras').style.display = type === 'homework' ? 'block' : 'none';
  
  if (type === 'homework') {
    const select = document.getElementById('lessonParent');
    setHtml(select, '<option value="">-- None / Independent --</option>');
    Object.keys(curriculum).forEach(id => {
      if (!curriculum[id].homework) {
        appendHtml(select, `<option value="${escapeHtml(id)}">${escapeHtml(curriculum[id].title || id)}</option>`);
      }
    });
  }
}
function renderStudentPickList(selected) {
  const list = document.getElementById('studentPickList');
  setHtml(list, Object.keys(studentsMap).map(function(code) {
    const checked = selected.indexOf(code) !== -1 ? ' checked' : '';
    return '<label style="display:flex;align-items:center;gap:8px;padding:6px;font-size:14px;text-transform:none;letter-spacing:0;color:var(--ink);margin:0;"><input type="checkbox" value="' + escapeHtml(code) + '"' + checked + ' style="width:auto;margin:0;"> ' + escapeHtml(studentsMap[code].name || code) + ' (' + escapeHtml(code) + ')</label>';
  }).join('') || '<div style="color:var(--ink-soft);font-size:14px;">No students yet.</div>');
}
function submitLesson() {
  const title = (document.getElementById('lessonTitle').value || '').trim();
  if (!title) { alert('Please enter a lesson title.'); return; }
  const customUrl = (document.getElementById('lessonCustomUrl').value || '').trim();
  if (customUrl && !safeUrl(customUrl, window.location.href)) {
    alert('Enter a secure HTTPS URL or a page on this site.');
    return;
  }
  const id = editingLessonId || ('lesson_' + Date.now());
  const assignedTo = lessonVisibility === 'some'
    ? Array.from(document.querySelectorAll('#studentPickList input:checked')).map(function(x) { return x.value; })
    : [];
  const payload = {
    title: title,
    description: (document.getElementById('lessonDesc').value || '').trim(),
    icon: (document.getElementById('lessonIcon').value || '📘').trim() || '📘',
    customUrl: customUrl,
    contentUrl: document.getElementById('lessonContentUrl').value.trim() ? 'content/' + document.getElementById('lessonContentUrl').value.trim() + '.json' : '',
    homework: lessonType === 'homework',
    homeworkDue: lessonType === 'homework' ? (document.getElementById('lessonDue').value || '').trim() : '',
    parentId: lessonType === 'homework' ? document.getElementById('lessonParent').value : '',
    assignedTo: assignedTo,
    audience: lessonVisibility === 'all' ? 'all' : 'assigned',
    stages: (curriculum[id] && curriculum[id].stages) || STAGE_LIST,
    published: document.getElementById('lessonPublished').checked,
    year: (curriculum[id] && curriculum[id].year) || String(new Date().getFullYear()),
    month: (curriculum[id] && curriculum[id].month) || new Date().toLocaleString('en', { month: 'long' }),
    updatedAt: Date.now()
  };
  if (!editingLessonId) payload.order = Date.now();
  writeChangesWithUndo([{ path: 'curriculum/' + id, value: payload }], (editingLessonId ? 'edit ' : 'create ') + title)
    .then(function() {
      closeLessonModal();
      showToast(editingLessonId ? 'Lesson saved' : 'Lesson created');
      if (payload.homework) { renderHomeworkTree(); if (currentHomeworkId === id) openHomework(id); }
      else { renderClassworkTree(); if (currentClassworkId === id) openClassworkLesson(id, currentClassworkCode); }
    })
    .catch(function(err) { alert('Save failed: ' + err.message); });
}
function deleteLesson(id) {
  if (!confirm('Delete this lesson? You can undo this.')) return;
  writeChangesWithUndo([{ path: 'curriculum/' + id, value: null }], 'delete lesson ' + id)
    .then(function() {
      if (currentClassworkId === id) { currentClassworkId = null; document.getElementById('classworkBar').style.display = 'none'; document.getElementById('classworkFrame').style.display = 'none'; document.getElementById('classworkPlaceholder').style.display = 'grid'; }
      if (currentHomeworkId === id) { currentHomeworkId = null; document.getElementById('homeworkBar').style.display = 'none'; document.getElementById('homeworkFrame').style.display = 'none'; document.getElementById('homeworkPlaceholder').style.display = 'grid'; }
      renderClassworkTree(); renderHomeworkTree();
    })
    .catch(function(err) { alert('Delete failed: ' + err.message); });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function(ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}
const clickAction = run => ({ event: "click", run });
installDelegatedActions({
  "leaderboard-rename": { event: "click", run: renameLeaderboardNickname },
  "leaderboard-remove": { event: "click", run: removeFromLeaderboard },
  "save-class-id": { event: "click", run: saveClassId },
  "save-placement-override": { event: "click", run: savePlacementOverride },
  "reset-placement": { event: "click", run: resetPlacement },
  "teacher-google-sign-in": clickAction(teacherGoogleSignIn),
  "deselect-student": clickAction(deselectStudent),
  "toggle-theme": clickAction(toggleTheme),
  "teacher-sign-out": clickAction(teacherSignOut),
  "open-add-student": clickAction(openAddStudent),
  "switch-main-tab": clickAction(element => {
    const tab = readActionEnum(element, "tab", ["students", "classwork", "homework"]);
    if (tab) switchMainTab(tab);
  }),
  "render-students-list": { event: "input", run: renderStudentsList },
  "open-student-classwork": clickAction(openStudentClasswork),
  "open-student-homework": clickAction(openStudentHomework),
  "rename-student": clickAction(renameStudent),
  "delete-student": clickAction(deleteStudent),
  "send-reset": clickAction(element => {
    const type = readActionEnum(element, "resetType", ["all", "vocab"]);
    if (type) sendReset(type);
  }),
  "attach-history-listener": { event: "change", run: attachHistoryListener },
  "clear-history-logs": clickAction(clearHistoryLogs),
  "generate-weekly-summary": clickAction(generateWeeklySummary),
  "download-weekly-summary": clickAction(downloadWeeklySummary),
  "clear-classwork-filter": clickAction(clearClassworkFilter),
  "open-lesson-modal": clickAction(openLessonModal),
  "open-current-classwork": clickAction(openCurrentClassworkInTab),
  "edit-current-classwork": clickAction(() => editLessonMeta(currentClassworkId)),
  "delete-current-classwork": clickAction(() => deleteLesson(currentClassworkId)),
  "open-current-homework": clickAction(openCurrentHomeworkInTab),
  "edit-current-homework": clickAction(() => editLessonMeta(currentHomeworkId)),
  "close-add-student": clickAction(closeAddStudent),
  "submit-add-student": clickAction(submitAddStudent),
  "close-link-modal": clickAction(closeLinkModal),
  "confirm-link-student": clickAction(confirmLinkStudent),
  "set-lesson-type": clickAction(element => {
    const type = readActionEnum(element, "lessonType", ["classwork", "homework"]);
    if (type) setLessonType(type);
  }),
  "set-lesson-visibility": clickAction(element => {
    const visibility = readActionEnum(element, "visibility", ["all", "some"]);
    if (visibility) setLessonVisibility(visibility);
  }),
  "close-lesson-modal": clickAction(closeLessonModal),
  "submit-lesson": clickAction(submitLesson),
  "approve-pending-student": clickAction(element => {
    const uid = readActionParam(element, "uid", /^[A-Za-z0-9_-]{1,128}$/);
    if (uid) approvePendingStudent(uid);
  }),
  "open-link-modal": clickAction(element => {
    const uid = readActionParam(element, "uid", /^[A-Za-z0-9_-]{1,128}$/);
    if (uid) openLinkModal(uid);
  }),
  "reject-pending-student": clickAction(element => {
    const uid = readActionParam(element, "uid", /^[A-Za-z0-9_-]{1,128}$/);
    if (uid) rejectPendingStudent(uid);
  }),
  "select-student": clickAction(element => {
    const code = readActionParam(element, "code", /^[A-Za-z0-9_-]{1,64}$/);
    if (code && studentsMap[code]) selectStudent(code);
  }),
  "send-goto": clickAction(element => {
    const stage = readActionInteger(element, "stage", 1, STAGE_LIST.length);
    if (stage) sendGoto(stage);
  }),
  "reset-stage": clickAction(element => {
    const stage = readActionInteger(element, "stage", 1, STAGE_LIST.length);
    if (stage) resetStage(stage);
  }),
  "undo-teacher-action": clickAction(element => {
    const id = readActionParam(element, "id", /^[A-Za-z0-9_-]{1,128}$/);
    const type = readActionParam(element, "undoType", /^[A-Za-z0-9_-]{1,64}$/);
    if (id && type) undoTeacherAction(id, type);
  }),
  "toggle-year": clickAction(element => {
    const year = readActionParam(element, "year", /^[^\u0000-\u001F\u007F]{1,32}$/u);
    if (year && Object.values(curriculum).some(item => String(item.year || "2026") === year)) {
      toggleYear(year);
    }
  }),
  "toggle-month": clickAction(element => {
    const year = readActionParam(element, "year", /^[^\u0000-\u001F\u007F]{1,32}$/u);
    const month = readActionParam(element, "month", /^[^\u0000-\u001F\u007F]{1,32}$/u);
    if (year && month && Object.values(curriculum).some(item =>
      String(item.year || "2026") === year && String(item.month || "October") === month
    )) {
      toggleMonth(year, month);
    }
  }),
  "open-homework": clickAction(element => {
    const id = readActionParam(element, "lessonId", /^[A-Za-z0-9_-]{1,64}$/);
    if (id && curriculum[id]) openHomework(id);
  }),
  "toggle-lesson-tree": clickAction(element => {
    const id = readActionParam(element, "lessonId", /^[A-Za-z0-9_-]{1,64}$/);
    if (id && curriculum[id]) toggleLessonTree(id);
  }),
  "open-classwork-lesson": clickAction(element => {
    const id = readActionParam(element, "lessonId", /^[A-Za-z0-9_-]{1,64}$/);
    const code = readActionParam(element, "code", /^[A-Za-z0-9_-]{1,64}$/);
    if (id && curriculum[id] && code && studentsMap[code]) openClassworkLesson(id, code);
  }),
  "toggle-homework-group": clickAction(element => {
    const name = readActionParam(element, "groupName", /^[^\u0000-\u001F\u007F]{1,80}$/u);
    const groupExists = name && Array.from(
      document.querySelectorAll("#homeworkTree [data-action='toggle-homework-group']")
    ).some(group => group.dataset.groupName === name);
    if (groupExists) toggleHwGroup(name);
  })
});

initFirebase();
updateThemeButton();
window.addEventListener('beforeunload', function() { if (activeFeedRef) activeFeedRef.off(); });


if (typeof toggleTheme === "function") globalThis["toggleTheme"] = toggleTheme;
if (typeof updateThemeButton === "function") globalThis["updateThemeButton"] = updateThemeButton;
if (typeof initFirebase === "function") globalThis["initFirebase"] = initFirebase;
if (typeof authErrorMessage === "function") globalThis["authErrorMessage"] = authErrorMessage;
if (typeof teacherGoogleSignIn === "function") globalThis["teacherGoogleSignIn"] = teacherGoogleSignIn;
if (typeof teacherSignOut === "function") globalThis["teacherSignOut"] = teacherSignOut;
if (typeof initTeacherData === "function") globalThis["initTeacherData"] = initTeacherData;
if (typeof updateConnUI === "function") globalThis["updateConnUI"] = updateConnUI;
if (typeof renderPendingApprovals === "function") globalThis["renderPendingApprovals"] = renderPendingApprovals;
if (typeof approvePendingStudent === "function") globalThis["approvePendingStudent"] = approvePendingStudent;
if (typeof rejectPendingStudent === "function") globalThis["rejectPendingStudent"] = rejectPendingStudent;
if (typeof openLinkModal === "function") globalThis["openLinkModal"] = openLinkModal;
if (typeof closeLinkModal === "function") globalThis["closeLinkModal"] = closeLinkModal;
if (typeof confirmLinkStudent === "function") globalThis["confirmLinkStudent"] = confirmLinkStudent;
if (typeof switchMainTab === "function") globalThis["switchMainTab"] = switchMainTab;
if (typeof clearClassworkFilter === "function") globalThis["clearClassworkFilter"] = clearClassworkFilter;
if (typeof generateCode === "function") globalThis["generateCode"] = generateCode;
if (typeof renderStudentsList === "function") globalThis["renderStudentsList"] = renderStudentsList;
if (typeof selectStudent === "function") globalThis["selectStudent"] = selectStudent;
if (typeof deselectStudent === "function") globalThis["deselectStudent"] = deselectStudent;
if (typeof renderSelectedView === "function") globalThis["renderSelectedView"] = renderSelectedView;
if (typeof attachGameProgressListener === "function") globalThis["attachGameProgressListener"] = attachGameProgressListener;
if (typeof renderGameAnalytics === "function") globalThis["renderGameAnalytics"] = renderGameAnalytics;
if (typeof attachHistoryListener === "function") globalThis["attachHistoryListener"] = attachHistoryListener;
if (typeof updateWeeklySummaryAvailability === "function") globalThis["updateWeeklySummaryAvailability"] = updateWeeklySummaryAvailability;
if (typeof generateWeeklySummary === "function") globalThis["generateWeeklySummary"] = generateWeeklySummary;
if (typeof downloadWeeklySummary === "function") globalThis["downloadWeeklySummary"] = downloadWeeklySummary;
if (typeof resetStage === "function") globalThis["resetStage"] = resetStage;
if (typeof undoTeacherAction === "function") globalThis["undoTeacherAction"] = undoTeacherAction;
if (typeof clearHistoryLogs === "function") globalThis["clearHistoryLogs"] = clearHistoryLogs;
if (typeof sendGoto === "function") globalThis["sendGoto"] = sendGoto;
if (typeof sendReset === "function") globalThis["sendReset"] = sendReset;
if (typeof renderStudentHomework === "function") globalThis["renderStudentHomework"] = renderStudentHomework;
if (typeof openStudentClasswork === "function") globalThis["openStudentClasswork"] = openStudentClasswork;
if (typeof openStudentHomework === "function") globalThis["openStudentHomework"] = openStudentHomework;
if (typeof renderOverview === "function") globalThis["renderOverview"] = renderOverview;
if (typeof openAddStudent === "function") globalThis["openAddStudent"] = openAddStudent;
if (typeof closeAddStudent === "function") globalThis["closeAddStudent"] = closeAddStudent;
if (typeof submitAddStudent === "function") globalThis["submitAddStudent"] = submitAddStudent;
if (typeof renameStudent === "function") globalThis["renameStudent"] = renameStudent;
if (typeof deleteStudent === "function") globalThis["deleteStudent"] = deleteStudent;
if (typeof loadUndoStack === "function") globalThis["loadUndoStack"] = loadUndoStack;
if (typeof updateUndoButton === "function") globalThis["updateUndoButton"] = updateUndoButton;
if (typeof rememberUndo === "function") globalThis["rememberUndo"] = rememberUndo;
if (typeof sameValue === "function") globalThis["sameValue"] = sameValue;
if (typeof writeChangesWithUndo === "function") globalThis["writeChangesWithUndo"] = writeChangesWithUndo;
if (typeof undoLastChange === "function") globalThis["undoLastChange"] = undoLastChange;
if (typeof renderClassworkTree === "function") globalThis["renderClassworkTree"] = renderClassworkTree;
if (typeof toggleYear === "function") globalThis["toggleYear"] = toggleYear;
if (typeof toggleMonth === "function") globalThis["toggleMonth"] = toggleMonth;
if (typeof toggleLessonTree === "function") globalThis["toggleLessonTree"] = toggleLessonTree;
if (typeof resolveContentName === "function") globalThis["resolveContentName"] = resolveContentName;
if (typeof openClassworkLesson === "function") globalThis["openClassworkLesson"] = openClassworkLesson;
if (typeof openCurrentClassworkInTab === "function") globalThis["openCurrentClassworkInTab"] = openCurrentClassworkInTab;
if (typeof renderHomeworkTree === "function") globalThis["renderHomeworkTree"] = renderHomeworkTree;
if (typeof toggleHwGroup === "function") globalThis["toggleHwGroup"] = toggleHwGroup;
if (typeof openHomework === "function") globalThis["openHomework"] = openHomework;
if (typeof openCurrentHomeworkInTab === "function") globalThis["openCurrentHomeworkInTab"] = openCurrentHomeworkInTab;
if (typeof openLessonModal === "function") globalThis["openLessonModal"] = openLessonModal;
if (typeof editLessonMeta === "function") globalThis["editLessonMeta"] = editLessonMeta;
if (typeof closeLessonModal === "function") globalThis["closeLessonModal"] = closeLessonModal;
if (typeof setLessonVisibility === "function") globalThis["setLessonVisibility"] = setLessonVisibility;
if (typeof setLessonType === "function") globalThis["setLessonType"] = setLessonType;
if (typeof renderStudentPickList === "function") globalThis["renderStudentPickList"] = renderStudentPickList;
if (typeof submitLesson === "function") globalThis["submitLesson"] = submitLesson;
if (typeof deleteLesson === "function") globalThis["deleteLesson"] = deleteLesson;
if (typeof escapeHtml === "function") globalThis["escapeHtml"] = escapeHtml;
if (typeof Number === "function") globalThis["Number"] = Number;
