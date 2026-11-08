
import { installDelegatedActions, readActionEnum } from "../delegated-actions.js";
import { clearElement, safeUrl, setHtml } from "../dom.js";

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
function toggleTheme(){
  document.body.classList.toggle('light');
  const isLight = document.body.classList.contains('light');
  localStorage.setItem('nd_theme', isLight ? 'light' : 'dark');
  document.querySelector('.theme-toggle').textContent = isLight ? '☀️' : '🌙';
}
if (document.body.classList.contains('light')) document.querySelector('.theme-toggle').textContent = '☀️';

function escapeHtml(s){return String(s).replace(/[&<>"']/g,function(ch){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]})}
function showAlert(msg, type){
  const el = document.getElementById('alertBox');
  el.className = 'alert show ' + type;
  el.textContent = msg;
  setTimeout(() => { el.className = 'alert'; }, 5000);
}
function generateCode(existing){
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'S';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
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
      code = generateCode();
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
    '<p>Code: <b style="color:var(--accent);font-family:Fira Code,monospace;letter-spacing:2px;">' + escapeHtml(state.currentCode) + '</b></p>');
  loadLessons();
}

function clearPortalListeners(){
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
    let maxScore = Number(lesson.maxScore) || 80;
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

    let card = document.createElement('a');
    card.className = 'lesson-card';
    card.href = targetUrl.href;
    setHtml(card, (isPrivate ? '<div class="private-tag">🔒 Personal</div>' : '') +
      (lesson.homework ? '<div class="homework-tag">📌 Homework' + (lesson.homeworkDue ? ' · ' + escapeHtml(lesson.homeworkDue) : '') + '</div>' : '') +
      '<div class="icon">' + escapeHtml(lesson.icon || '📘') + '</div>' +
      '<div class="title">' + escapeHtml(lesson.title || 'Untitled lesson') + '</div>' +
      '<div class="desc">' + escapeHtml(lesson.description || 'No description.') + '</div>' +
      '<div class="meta"><span>📍 ' + doneCount + ' / ' + totalStages + ' stages</span><span>🏆 <b>' + lessonScore + '</b> / ' + maxScore + '</span></div>' +
      '<div class="progress-rail"><div class="progress-fill" style="width:' + pct + '%;"></div></div>' +
      '<button class="open-btn">' + (pct === 0 ? '▶ Start lesson' : (pct === 100 ? '✓ Review lesson' : '▶ Continue')) + '</button>');
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
    setTimeout(() => document.getElementById('loginCode').focus(), 200);
  }
}).catch(error => showAlert('Firebase could not be initialized: ' + error.message, 'error'));

if (typeof storedIdentity === "function") globalThis["storedIdentity"] = storedIdentity;
if (typeof toggleTheme === "function") globalThis["toggleTheme"] = toggleTheme;
if (typeof escapeHtml === "function") globalThis["escapeHtml"] = escapeHtml;
if (typeof showAlert === "function") globalThis["showAlert"] = showAlert;
if (typeof generateCode === "function") globalThis["generateCode"] = generateCode;
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
