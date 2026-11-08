
import { installDelegatedActions, readActionEnum } from "../delegated-actions.js";
import { clearElement, safeUrl, setHtml } from "../dom.js";
import { resolveMaxScore } from "../lesson-meta.js";
import { generateStudentCode } from "../student-code.js";
import { assessPlacement, canRetake, nextRetakeAt } from "../placement.js";
import { dueState } from "../schedule.js";
import { DEFAULT_CLASS_ID, encouragement, isoWeekId, previousWeekId, rankEntries, validateNickname, weeklyXpSince } from "../leaderboard.js";

let db = null;
let configModule = null;
let portalListeners = [];
const configReady = import('../config.js').then(function(config) {
  configModule = config;
  firebase.initializeApp(config.firebaseConfig);
  db = firebase.database();
});

function storedIdentity() {
  const remember = localStorage.getItem('nd_remember_student') === 'true';
  const storage = remember ? localStorage : sessionStorage;
  return {
    code: storage.getItem('nd_student_code') || '',
    name: storage.getItem('nd_student_name') || ''
  };
}

const state = {
  currentCode: storedIdentity().code,
  currentName: storedIdentity().name,
  lessons: {},
  progress: { scores: {}, done: {} },
  homework: {},
  gameProgress: {}
};

if (localStorage.getItem('nd_theme') === 'light') document.body.classList.add('light');
function applyThemeToggleState(){
  const toggle = document.getElementById('themeToggle');
  if (!toggle) return;
  const isLight = document.body.classList.contains('light');
  toggle.setAttribute('aria-pressed', String(isLight));
  toggle.setAttribute('aria-label', isLight ? 'Light theme (switch to dark)' : 'Dark theme (switch to light)');
  toggle.firstElementChild.textContent = isLight ? '☀️' : '🌙';
}
function toggleTheme(){
  document.body.classList.toggle('light');
  localStorage.setItem('nd_theme', document.body.classList.contains('light') ? 'light' : 'dark');
  applyThemeToggleState();
}
applyThemeToggleState();
if (document.body.classList.contains('light')) document.querySelector('.theme-toggle').textContent = '☀️';

function escapeHtml(s){return String(s).replace(/[&<>"']/g,function(ch){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]})}
function showAlert(msg, type){
  const el = document.getElementById('alertBox');
  el.className = 'alert show ' + type;
  el.textContent = msg;
  setTimeout(() => { el.className = 'alert'; }, 5000);
}
function saveIdentity(code, name, remember) {
  clearStudentSession();
  const storage = remember ? localStorage : sessionStorage;
  localStorage.setItem('nd_remember_student', remember ? 'true' : 'false');
  storage.setItem('nd_student_code', code);
  storage.setItem('nd_student_name', name);
}

function switchTab(which){
  document.getElementById('tabLogin').classList.toggle('active', which === 'login');
  document.getElementById('tabRegister').classList.toggle('active', which === 'register');
  document.getElementById('tabLogin').setAttribute('aria-pressed', String(which !== 'register'));
  document.getElementById('tabRegister').setAttribute('aria-pressed', String(which === 'register'));
  document.getElementById('loginForm').style.display = which === 'login' ? 'block' : 'none';
  document.getElementById('registerForm').style.display = which === 'register' ? 'block' : 'none';
  document.getElementById('alertBox').className = 'alert';
}

async function doLogin(){
  const code = (document.getElementById('loginCode').value || '').toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
  if (!code) { showAlert('Please enter your student code.', 'error'); return; }
  try {
  await configReady;
  await firebase.auth().setPersistence(document.getElementById('rememberMe').checked
    ? firebase.auth.Auth.Persistence.LOCAL
    : firebase.auth.Auth.Persistence.SESSION);
  // The rules only let signed-in users read a student record, so a first-time code login must
  // have an (anonymous) identity before the lookup. Existing sessions are reused.
  if (!firebase.auth().currentUser) {
    await new Promise((resolve, reject) => {
      const stop = firebase.auth().onAuthStateChanged(user => { stop(); resolve(user); }, reject);
    });
    if (!firebase.auth().currentUser) await firebase.auth().signInAnonymously();
  }
  const snap=await db.ref('students/' + code).once('value');
    const data = snap.val();
    if (!data) {
      showAlert('Code "' + code + '" not found. Check the spelling or register a new account.', 'error');
      return;
    }
    
    // Ensure we wait for Auth state to resolve
    const currentUser = await new Promise((resolve, reject) => {
        const unsubscribe = firebase.auth().onAuthStateChanged(u => { unsubscribe(); resolve(u); }, reject);
    });

    if (data.uid) {
        if (!currentUser || currentUser.uid !== data.uid) {
            showAlert('This account is linked to a Google account. You must sign in with Google on this device first to access it.', 'error');
            return;
        }
    }

    const { bindStudentCode } = await import('../student-context.js');
    const bound = await bindStudentCode({ auth: firebase.auth(), db, code });
    state.currentCode = code;
    state.currentName = data.name || 'Student';
    state.currentName = bound.student.name || state.currentName;
    saveIdentity(code, state.currentName, document.getElementById('rememberMe').checked);
    await db.ref('students/' + code).update({ lastLogin: firebase.database.ServerValue.TIMESTAMP });
    enterPortal();
  } catch(error) {
    showAlert('Connection error: ' + error.message, 'error');
  }
}

function doRegister(){
  const name = (document.getElementById('regName').value || '').trim();
  if (!name) { showAlert('Please enter your name.', 'error'); return; }
  if (name.length < 2) { showAlert('Name must be at least 2 characters.', 'error'); return; }
  configReady.then(async function() {
    const remember = document.getElementById('rememberRegister').checked;
    await firebase.auth().setPersistence(remember
      ? firebase.auth.Auth.Persistence.LOCAL
      : firebase.auth.Auth.Persistence.SESSION);
    if(firebase.auth().currentUser)await firebase.auth().signOut();
    const credential = await firebase.auth().signInAnonymously();
    let code = '';
    let claimed = false;
    for (let attempt = 0; attempt < 10 && !claimed; attempt++) {
      code = generateStudentCode();
      const result = await db.ref('students/' + code).transaction(current => {
        if (current !== null) return;
        return {
          name: name,
          code: code,
          uid: credential.user.uid,
          createdAt: firebase.database.ServerValue.TIMESTAMP,
          lastLogin: firebase.database.ServerValue.TIMESTAMP,
          selfRegistered: true
        };
      });
      claimed = result.committed;
    }
    if (!claimed) throw new Error('Could not reserve a unique student code. Please try again.');
    return db.ref('studentByUid/' + credential.user.uid).set(code).then(() => {
      state.currentCode = code;
      state.currentName = name;
      saveIdentity(code, name, remember);
      const el = document.getElementById('alertBox');
      el.className = 'alert show success';
      setHtml(el, '✓ Welcome, <b>' + escapeHtml(name) + '</b>!<br>Your code is: <span class="code-badge">' + escapeHtml(code) + '</span><br><span style="font-size:14px;">Save this code — you\'ll need it to sign in next time.</span>');
      setTimeout(() => enterPortal(), 2500);
    });
  }).catch(err => showAlert('Error: ' + err.message, 'error'));
}

async function doGoogleLogin() {
  try {
    await configReady;
    await firebase.auth().setPersistence(localStorage.getItem('nd_remember_student') === 'true'
      ? firebase.auth.Auth.Persistence.LOCAL
      : firebase.auth.Auth.Persistence.SESSION);
    const provider = new firebase.auth.GoogleAuthProvider();
    const result = await firebase.auth().signInWithPopup(provider);
    const user = result.user;
    const linked = await db.ref('studentByUid/' + user.uid).once('value');
    if (linked.exists()) {
      const code = linked.val();
      const student = await db.ref('students/' + code).once('value');
      if(!student.exists())throw new Error('The student record linked to this Google account is missing.');
      const {bindStudentCode}=await import('../student-context.js');
      const bound=await bindStudentCode({auth:firebase.auth(),db,code});
      state.currentCode=code;
      state.currentName=bound.student.name||'Student';
      saveIdentity(code,state.currentName,localStorage.getItem('nd_remember_student')==='true');
      enterPortal();
      return;
    }

    const pending=await db.ref('pendingStudents/'+user.uid).once('value');
    if(pending.exists()) {
      showAlert('Your registration is pending teacher approval.','success');
      return;
    }
    await db.ref('pendingStudents/'+user.uid).set({
      name:user.displayName||'Student',
      email:user.email,
      ts:firebase.database.ServerValue.TIMESTAMP
    });
    showAlert('Registration sent! Please wait for teacher approval.','success');
  } catch(error) {
    showAlert(error.message,'error');
  }
}

function enterPortal(){
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('lessonsScreen').style.display = 'block';
  document.body.classList.add('portal-authenticated');
  setHtml(document.getElementById('welcomeBox'), '<div class="avatar">' + escapeHtml(state.currentName.charAt(0).toUpperCase()) + '</div>' +
    '<h2>Welcome, ' + escapeHtml(state.currentName) + '! 👋</h2>' +
    '<p>Code: <b style="color:var(--accent);font-family:var(--ds-font-mono);letter-spacing:2px;">' + escapeHtml(state.currentCode) + '</b></p>');
  loadLessons();
  startLeaderboard();
}

function clearPortalListeners(){
  detachLeaderboardListener();
  portalListeners.forEach(function(entry){entry.ref.off(entry.event,entry.callback)});
  portalListeners=[];
}

function loadLessons(){
  clearPortalListeners();
  const curriculumRef=db.ref('studentCurriculum/' + state.currentCode);
  const curriculumListener=snap => {
    state.lessons = snap.val() || {};
    renderLessons();
  };
  curriculumRef.on('value',curriculumListener);
  portalListeners.push({ref:curriculumRef,event:'value',callback:curriculumListener});
  const homeworkRef=db.ref('sessions/' + state.currentCode + '/homework');
  const homeworkListener=hwSnap => {
    state.homework = hwSnap.val() || {};
    renderLessons();
  };
  homeworkRef.on('value',homeworkListener);
  portalListeners.push({ref:homeworkRef,event:'value',callback:homeworkListener});
  const progressRef=db.ref('sessions/' + state.currentCode + '/state');
  const progressListener=progSnap => {
    const st = progSnap.val() || {};
    state.progress = { scores: st.scores || {}, done: st.done || {} };
    renderLessons();
  };
  progressRef.on('value',progressListener);
  portalListeners.push({ref:progressRef,event:'value',callback:progressListener});
  const gameProgressRef=db.ref('studentProgress/' + state.currentCode);
  const gameProgressListener=progressSnap => {
    state.gameProgress = progressSnap.val() || {};
    renderGameStats();
  };
  gameProgressRef.on('value',gameProgressListener);
  portalListeners.push({ref:gameProgressRef,event:'value',callback:gameProgressListener});
}

let placementBank = null;
async function loadPlacementBank() {
  if (placementBank) return placementBank;
  try {
    const response = await fetch('content/placement/items.json', { cache: 'no-cache' });
    placementBank = response.ok ? (await response.json()).items || [] : [];
  } catch (error) { placementBank = []; }
  return placementBank;
}

// Shows the saved placement level and a practice path rebuilt from the stored answers.
async function renderPlacement(){
  const panel=document.getElementById('placementPanel');
  const placement=(state.gameProgress||{}).placement;
  if(!panel)return;
  if(!placement||!placement.cefr){
    panel.hidden=false;
    document.getElementById('placementLevel').textContent='Not sure where to start?';
    document.getElementById('placementHint').textContent='Take the short English level check to get a suggested path.';
    const steps=document.getElementById('recommendedSteps');
    steps.replaceChildren();
    const li=document.createElement('li');const link=document.createElement('a');
    link.href='placement.html';link.textContent='🧭 Take the English level check';
    li.append(link);steps.append(li);
    return;
  }
  const level=placement.teacherLevel||placement.cefr;
  document.getElementById('placementLevel').textContent='Your level: '+level+(placement.teacherLevel?' (set by your teacher)':' (estimated)');
  panel.hidden=false;
  const steps=document.getElementById('recommendedSteps');
  steps.replaceChildren();
  const bank=await loadPlacementBank();
  const byId=new Map(bank.map(item=>[item.id,item]));
  const answered=Object.values(placement.answers||{}).map(answer=>{
    const item=byId.get(answer.id);
    return item?{id:item.id,cefr:item.cefr,tag:item.tag,correct:answer.correct===true}:null;
  }).filter(Boolean);
  const path=answered.length?assessPlacement(answered).suggestedPath.filter(step=>step.kind==='practice'):[];
  path.forEach(step=>{
    const li=document.createElement('li');const link=document.createElement('a');
    link.href='practice.html';link.textContent='🎯 '+step.label;
    li.append(link);steps.append(li);
  });
  if(canRetake(placement.takenAt)){
    const li=document.createElement('li');const link=document.createElement('a');
    link.href='placement.html';link.textContent='🔁 Retake the level check';
    li.append(link);steps.append(li);
  } else {
    const li=document.createElement('li');
    li.textContent='You can retake the level check after '+new Date(nextRetakeAt(placement.takenAt)).toLocaleDateString()+'.';
    steps.append(li);
  }
}

// ---- opt-in class leaderboard --------------------------------------------------------------
const leaderboard = { classId: DEFAULT_CLASS_ID, uid: '', joined: false, members: {}, weeks: {}, tab: 'weekly', ref: null, listener: null };

async function startLeaderboard(){
  const user=firebase.auth().currentUser;
  if(!user||!state.currentCode)return;
  leaderboard.uid=user.uid;
  try {
    const classSnap=await db.ref('students/'+state.currentCode+'/classId').once('value');
    leaderboard.classId=classSnap.val()||DEFAULT_CLASS_ID;
    const mine=await db.ref('leaderboard/'+leaderboard.classId+'/members/'+leaderboard.uid).once('value');
    leaderboard.joined=mine.exists();
  } catch (error) { console.error('Leaderboard unavailable', error); }
  renderLeaderboard();
  if(leaderboard.joined)attachLeaderboardListener();
}

function attachLeaderboardListener(){
  detachLeaderboardListener();
  leaderboard.ref=db.ref('leaderboard/'+leaderboard.classId);
  leaderboard.listener=snap=>{
    const value=snap.val()||{};
    leaderboard.members=value.members||{};
    leaderboard.weeks=value.weeks||{};
    renderLeaderboard();
  };
  leaderboard.ref.on('value',leaderboard.listener,error=>console.error('Leaderboard read failed',error));
}
function detachLeaderboardListener(){
  if(leaderboard.ref&&leaderboard.listener)leaderboard.ref.off('value',leaderboard.listener);
  leaderboard.ref=null;leaderboard.listener=null;
}

function renderLeaderboard(){
  const join=document.getElementById('leaderboardJoin');
  const board=document.getElementById('leaderboardBoard');
  if(!join||!board)return;
  join.hidden=leaderboard.joined;
  board.hidden=!leaderboard.joined;
  if(!leaderboard.joined)return;
  const nicknames={};
  Object.keys(leaderboard.members).forEach(uid=>{nicknames[uid]=leaderboard.members[uid].nickname});
  const week=leaderboard.weeks[isoWeekId()]||{};
  const lastWeek=leaderboard.weeks[previousWeekId()]||{};
  const scores={};
  Object.keys(nicknames).forEach(uid=>{
    scores[uid]=leaderboard.tab==='weekly'?Number((week[uid]||{}).weeklyXp)||0:Number(leaderboard.members[uid].totalXp)||0;
  });
  const ranked=rankEntries(scores,nicknames,leaderboard.uid,10);
  const list=document.getElementById('leaderboardList');
  list.replaceChildren();
  ranked.top.forEach(row=>{
    const li=document.createElement('li');
    li.className=row.isOwn?'lb-own':'';
    li.value=row.rank;
    const name=document.createElement('span');name.textContent=row.nickname+(row.isOwn?' (you)':'');
    const xp=document.createElement('b');xp.textContent=row.xp+' XP';
    li.append(name,xp);
    list.append(li);
  });
  const ownWeekly=Number((week[leaderboard.uid]||{}).weeklyXp)||0;
  document.getElementById('leaderboardMessage').textContent=encouragement({rank:ranked.own?ranked.own.rank:0,total:ranked.total,xp:ownWeekly,lastWeekXp:Number((lastWeek[leaderboard.uid]||{}).weeklyXp)||0});
  document.getElementById('leaderboardOwn').textContent=ranked.own&&!ranked.top.some(row=>row.isOwn)?'Your place: #'+ranked.own.rank+' ('+ranked.own.xp+' XP)':'';
  document.getElementById('lbWeekly').setAttribute('aria-pressed',String(leaderboard.tab==='weekly'));
  document.getElementById('lbAll').setAttribute('aria-pressed',String(leaderboard.tab==='all'));
}

// Keeps the student's own entries current. Weekly XP is the gain since the week's baseline.
async function syncLeaderboard(){
  if(!leaderboard.joined||!leaderboard.uid)return;
  const xp=Number((state.gameProgress||{}).xp)||0;
  const base='leaderboard/'+leaderboard.classId;
  const weekRef=db.ref(base+'/weeks/'+isoWeekId()+'/'+leaderboard.uid);
  try {
    const existing=(await weekRef.once('value')).val();
    const baselineXp=existing?Number(existing.baselineXp)||0:xp;
    await weekRef.set({weeklyXp:weeklyXpSince(baselineXp,xp),baselineXp:baselineXp,updatedAt:Date.now()});
    await db.ref(base+'/members/'+leaderboard.uid+'/totalXp').set(xp);
    await db.ref(base+'/members/'+leaderboard.uid+'/updatedAt').set(Date.now());
  } catch (error) { console.error('Leaderboard sync failed', error); }
}

async function joinLeaderboard(){
  const error=document.getElementById('leaderboardError');
  const check=validateNickname(document.getElementById('leaderboardNickname').value);
  if(!check.valid){error.textContent=check.reason;return}
  error.textContent='';
  try {
    await db.ref('leaderboard/'+leaderboard.classId+'/members/'+leaderboard.uid).set({nickname:check.nickname,totalXp:Number((state.gameProgress||{}).xp)||0,updatedAt:Date.now()});
    leaderboard.joined=true;
    attachLeaderboardListener();
    await syncLeaderboard();
    renderLeaderboard();
  } catch (failure) { error.textContent='Could not join: '+failure.message; }
}

async function leaveLeaderboard(){
  if(!confirm('Leave the leaderboard? Your nickname and scores will be removed.'))return;
  const base='leaderboard/'+leaderboard.classId;
  try {
    await db.ref(base+'/weeks/'+isoWeekId()+'/'+leaderboard.uid).remove();
    await db.ref(base+'/weeks/'+previousWeekId()+'/'+leaderboard.uid).remove();
    await db.ref(base+'/members/'+leaderboard.uid).remove();
    detachLeaderboardListener();
    leaderboard.joined=false;leaderboard.members={};leaderboard.weeks={};
    renderLeaderboard();
  } catch (failure) { showAlert('Could not leave the leaderboard: '+failure.message,'error'); }
}

function renderGameStats(){
  const summary=document.getElementById('studentSummary');
  const progress=state.gameProgress||{};
  const values=[
    ['Level',progress.level||1],
    ['XP',progress.xp||0],
    ['Gems',progress.gems||0],
    ['Daily streak',String(progress.streak||0)+' days']
  ];
  summary.replaceChildren();
  values.forEach(([label,value])=>{
    const item=document.createElement('div');
    item.className='student-summary-item';
    const strong=document.createElement('b');
    strong.textContent=String(value);
    const caption=document.createElement('span');
    caption.textContent=label;
    item.append(strong,caption);
    summary.append(item);
  });
  renderPlacement();
  syncLeaderboard();
}

function renderLessons(){
  const grid = document.getElementById('lessonsGrid');
  const empty = document.getElementById('emptyLessons');
  const lessons = Object.values(state.lessons || {}).filter(function(l) {
    if (l.published === false) return false;
    return true;
  });
  lessons.sort((a, b) => (a.order || 0) - (b.order || 0));

  if (!lessons.length) {
    clearElement(grid);
    document.getElementById('practiceLinks').replaceChildren();
    document.getElementById('pathSteps').replaceChildren();
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';
  clearElement(grid);
  const practiceLinks=document.getElementById('practiceLinks');
  const pathSteps=document.getElementById('pathSteps');
  practiceLinks.replaceChildren();
  pathSteps.replaceChildren();
  lessons.forEach(lesson => {
    const lessonId = lesson.id || Object.keys(state.lessons).find(k => state.lessons[k] === lesson);
    const stages = lesson.stages || [];
    let totalStages = stages.length;
    let doneCount = stages.filter(s => state.progress.done[lessonId + '_' + s.id]).length;
    let pct = totalStages ? Math.round((doneCount / totalStages) * 100) : 0;
    let lessonScore = stages.reduce((sum, s) => sum + (Number(state.progress.scores[lessonId + '_' + s.id]) || 0), 0);
    let maxScore = resolveMaxScore(lesson);
    const homeworkResult = (state.homework || {})[lessonId];
    if (lesson.customUrl && lesson.customUrl.indexOf('homework.html') !== -1) {
      totalStages = 1;
      doneCount = homeworkResult && homeworkResult.completed ? 1 : 0;
      pct = doneCount ? 100 : 0;
      lessonScore = homeworkResult ? (Number(homeworkResult.score) || 0) : 0;
      maxScore = homeworkResult ? (Number(homeworkResult.total) || 16) : (Number(lesson.maxScore) || 16);
    }

    const isPrivate = lesson.audience !== 'all';

    const targetFile = lesson.customUrl ? lesson.customUrl : 'lesson.html';
    const targetUrl = safeUrl(targetFile, window.location.href);
    if (!targetUrl) {
      console.error('Skipping lesson with an unsafe custom URL', { lessonId });
      showAlert('A lesson link is invalid. Please ask your teacher to update it.', 'error');
      return;
    }
    targetUrl.searchParams.set('code', state.currentCode);
    targetUrl.searchParams.set('lesson', lessonId);
    
    // Pass variant for homework to ensure correct file is loaded
    if (lesson.contentUrl) {
        const contentFile = lesson.contentUrl.replace(/^content\//, '').replace(/\.json$/, '');
        targetUrl.searchParams.set('variant', contentFile);
    }

    const isHomework = lesson.customUrl && lesson.customUrl.indexOf('homework.html') !== -1;
    if (!isHomework) {
      const practiceUrl=new URL('practice.html',window.location.href);
      practiceUrl.searchParams.set('code',state.currentCode);
      practiceUrl.searchParams.set('lesson',lessonId);
      const practiceLink=document.createElement('a');
      practiceLink.className='practice-link';
      practiceLink.href=practiceUrl.href;
      practiceLink.textContent='🎮 Practice '+(lesson.title||'lesson');
      practiceLinks.append(practiceLink);
    }
    if (lesson.clipId) {
      const clipUrl=new URL('clip.html',window.location.href);
      clipUrl.searchParams.set('code',state.currentCode);
      clipUrl.searchParams.set('lesson',lessonId);
      const clipLink=document.createElement('a');
      clipLink.className='practice-link';
      clipLink.href=clipUrl.href;
      clipLink.textContent='🎬 Clip Lab '+(lesson.title||'lesson');
      practiceLinks.append(clipLink);
    }
    if (lesson.features && lesson.features.mangaReader === true && lesson.mangaId) {
      const mangaUrl=new URL('manga.html',window.location.href);
      mangaUrl.searchParams.set('code',state.currentCode);
      mangaUrl.searchParams.set('lesson',lessonId);
      const mangaLink=document.createElement('a');
      mangaLink.className='practice-link';
      mangaLink.href=mangaUrl.href;
      mangaLink.textContent='📖 Manga Reader';
      practiceLinks.append(mangaLink);
    }

    const pathItem=document.createElement('li');
    const pathLink=document.createElement('a');
    pathLink.href=targetUrl.href;
    pathLink.textContent=(lesson.icon||'📘')+' '+(lesson.title||'Untitled lesson');
    pathItem.append(pathLink);
    pathSteps.append(pathItem);

    const due = dueState(lesson);
    let card = document.createElement('a');
    card.className = 'lesson-card';
    card.href = targetUrl.href;
    setHtml(card, (isPrivate ? '<div class="private-tag">🔒 Personal</div>' : '') +
      (lesson.homework ? '<div class="homework-tag">📌 Homework' + (lesson.homeworkDue ? ' · ' + escapeHtml(lesson.homeworkDue) : '') + '</div>' : '') +
      (due.label ? '<div class="due-tag due-' + escapeHtml(due.state) + '">' + (due.state === 'locked' ? '🔒 ' : due.state === 'overdue' ? '⚠️ ' : '⏰ ') + escapeHtml(due.label) + '</div>' : '') +
      '<div class="icon">' + escapeHtml(lesson.icon || '📘') + '</div>' +
      '<div class="title">' + escapeHtml(lesson.title || 'Untitled lesson') + '</div>' +
      '<div class="desc">' + escapeHtml(lesson.description || 'No description.') + '</div>' +
      '<div class="meta"><span>📍 ' + doneCount + ' / ' + totalStages + ' stages</span><span>🏆 <b>' + lessonScore + '</b> / ' + maxScore + '</span></div>' +
      '<div class="progress-rail"><div class="progress-fill" style="width:' + pct + '%;"></div></div>' +
      '<button class="open-btn">' + (pct === 0 ? '▶ Start lesson' : (pct === 100 ? '✓ Review lesson' : '▶ Continue')) + '</button>');
    if (due.state === 'locked') { card.removeAttribute('href'); card.setAttribute('aria-disabled', 'true'); card.classList.add('locked'); }
    grid.appendChild(card);
  });
}

async function signOut(){
  if (!confirm('Sign out? You can log back in with your code.')) return;
  try { await firebase.auth().signOut(); }
  catch(err) { showAlert('Could not sign out: ' + err.message, 'error'); return; }
  clearPortalListeners();
  clearStudentSession();
  state.currentCode = '';
  state.currentName = '';
  state.lessons = {};
  state.homework = {};
  state.progress = { scores: {}, done: {} };
  document.getElementById('lessonsGrid').replaceChildren();
  document.getElementById('loginScreen').style.display = 'block';
  document.getElementById('lessonsScreen').style.display = 'none';
  document.getElementById('loginCode').value = '';
  document.getElementById('regName').value = '';
}

function clearStudentSession() {
  for (const storage of [localStorage, sessionStorage]) {
    for (let index = storage.length - 1; index >= 0; index--) {
      const key = storage.key(index);
      if (key && (key.startsWith('nd_') || key.startsWith('nd:'))) storage.removeItem(key);
    }
  }
}

// Removes per-student browser data but keeps UI preferences (theme, remember flag).
function clearLegacyStudentData() {
  const keep = new Set(['nd_theme', 'nd_remember_student']);
  for (const storage of [localStorage, sessionStorage]) {
    for (let index = storage.length - 1; index >= 0; index--) {
      const key = storage.key(index);
      if (key && (key.startsWith('nd_') || key.startsWith('nd:')) && !keep.has(key)) storage.removeItem(key);
    }
  }
}

async function switchStudent() {
  try { await firebase.auth().signOut(); } catch(error) { showAlert('Could not end the current sign-in: '+error.message,'error'); return; }
  clearPortalListeners();
  clearStudentSession();
  state.currentCode = '';
  state.currentName = '';
  state.lessons = {};
  state.homework = {};
  state.progress = { scores: {}, done: {} };
  document.getElementById('loginCode').value = '';
  document.getElementById('lessonsGrid').replaceChildren();
  document.getElementById('lessonsScreen').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'block';
}

function showCodeInfo(){
  alert('Your student code is:\n\n  ' + state.currentCode + '\n\nWrite it down! You\'ll need it to sign in from another device or after clearing your browser data.');
}

const clickAction = run => ({ event: "click", run });
installDelegatedActions({
  "leaderboard-join": clickAction(joinLeaderboard),
  "leaderboard-leave": clickAction(leaveLeaderboard),
  "leaderboard-tab": clickAction(element => {
    const tab = readActionEnum(element, "tab", ["weekly", "all"]);
    if (tab) { leaderboard.tab = tab; renderLeaderboard(); }
  }),
  "toggle-theme": clickAction(toggleTheme),
  "switch-tab": clickAction(element => {
    const tab = readActionEnum(element, "tab", ["login", "register"]);
    if (tab) switchTab(tab);
  }),
  "google-login": clickAction(doGoogleLogin),
  "login": clickAction(doLogin),
  "register": clickAction(doRegister),
  "switch-student": clickAction(switchStudent),
  "sign-out": clickAction(signOut),
  "show-code-info": clickAction(showCodeInfo),
  "login-enter": {
    event: "keydown",
    run: (_element, event) => {
      if (event.key === "Enter") doLogin();
    }
  },
  "register-enter": {
    event: "keydown",
    run: (_element, event) => {
      if (event.key === "Enter") doRegister();
    }
  }
});

configReady.then(async function() {
  await firebase.auth().setPersistence(localStorage.getItem('nd_remember_student') === 'true'
    ? firebase.auth.Auth.Persistence.LOCAL
    : firebase.auth.Auth.Persistence.SESSION);
  const identity = storedIdentity();
  if (identity.code && identity.name) {
    try {
      const { bindStudentCode } = await import('../student-context.js');
      const bound = await bindStudentCode({ auth: firebase.auth(), db, code: identity.code });
      state.currentCode = bound.code;
      state.currentName = bound.student.name || identity.name;
      enterPortal();
    } catch (error) {
      clearStudentSession();
      showAlert('Your saved sign-in could not be verified. Please enter your student code or use Google sign-in.', 'error');
    }
  } else {
    // No saved identity: drop orphaned per-student data (state, drafts, vocab) left by earlier sessions.
    clearLegacyStudentData();
    setTimeout(() => document.getElementById('loginCode').focus(), 200);
  }
}).catch(error => showAlert('Firebase could not be initialized: ' + error.message, 'error'));

if (typeof storedIdentity === "function") globalThis["storedIdentity"] = storedIdentity;
if (typeof toggleTheme === "function") globalThis["toggleTheme"] = toggleTheme;
if (typeof escapeHtml === "function") globalThis["escapeHtml"] = escapeHtml;
if (typeof showAlert === "function") globalThis["showAlert"] = showAlert;
if (typeof saveIdentity === "function") globalThis["saveIdentity"] = saveIdentity;
if (typeof switchTab === "function") globalThis["switchTab"] = switchTab;
if (typeof doLogin === "function") globalThis["doLogin"] = doLogin;
if (typeof doRegister === "function") globalThis["doRegister"] = doRegister;
if (typeof doGoogleLogin === "function") globalThis["doGoogleLogin"] = doGoogleLogin;
if (typeof enterPortal === "function") globalThis["enterPortal"] = enterPortal;
if (typeof clearPortalListeners === "function") globalThis["clearPortalListeners"] = clearPortalListeners;
if (typeof loadLessons === "function") globalThis["loadLessons"] = loadLessons;
if (typeof renderGameStats === "function") globalThis["renderGameStats"] = renderGameStats;
if (typeof renderLessons === "function") globalThis["renderLessons"] = renderLessons;
if (typeof signOut === "function") globalThis["signOut"] = signOut;
if (typeof clearStudentSession === "function") globalThis["clearStudentSession"] = clearStudentSession;
if (typeof switchStudent === "function") globalThis["switchStudent"] = switchStudent;
if (typeof showCodeInfo === "function") globalThis["showCodeInfo"] = showCodeInfo;
if (typeof curriculumListener === "function") globalThis["curriculumListener"] = curriculumListener;
if (typeof homeworkListener === "function") globalThis["homeworkListener"] = homeworkListener;
if (typeof progressListener === "function") globalThis["progressListener"] = progressListener;
if (typeof gameProgressListener === "function") globalThis["gameProgressListener"] = gameProgressListener;
