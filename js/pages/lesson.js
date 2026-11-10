import { listeningEntryFor } from "../listening/entry.js";
import { safeLocal, safeSession } from "../safe-storage.js";
import { startTabGuard } from "../tab-guard.js";
// Teacher previews do not save student work, so several open tabs are normal there and get no warning.
if (new URLSearchParams(location.search).get("teacher") !== "1") startTabGuard("lesson:" + location.search);
(() => {

  try{const t=safeLocal.getItem('nd_lesson_theme');if(t==='dark')document.documentElement.classList.add('dark')}catch(e){}

})();

import { isTeacher } from "../auth.js";
import { isLessonVisibleTo } from "../audience.js";
import { DEFAULT_STAGES, resolveMaxScore } from "../lesson-meta.js";
import { buildLessonPlan, scoreUnits, planMaxScore, sectionDone, neighbours, resolveSectionId } from "../lesson-plan.js";
import { showToast } from "../ui.js";
import { initReadingPrefs } from "../reading-prefs.js";
import { confetti } from "../celebrate.js";
import { mountBottomNav, mountOfflineBanner, showErrorPage, watchConnection } from "../shell.js";
import { initLessonClock } from "../lesson-clock-ui.js";
import { applySectionOverrides, buildSections } from "../sections.js";
import { validateLadder } from "../grammar-ladder.js";
import { renderGrammarLadder, renderRuleCard } from "../grammar-ladder-ui.js";
import { familyVisible } from "../word-family.js";
import { validateReadingTasks } from "../reading-tasks.js";
import { renderReadingTasks } from "../reading-tasks-ui.js";
import { renderFamilyPanel, renderFormTheWord } from "../word-family-ui.js";
import { allStagesDone, modeAllows, resolveGameMode, stageResult } from "../games/game-mode.js";
import { buildDeck, epicMessage, playInto, renderExtra, renderMission } from "../games/lesson-layer.js";
import { applyCalm, loadSettings } from "../games/settings.js";

mountOfflineBanner();
mountBottomNav("lesson");

initReadingPrefs();

// Feedback boxes are created empty and filled when an answer is checked, so marking them as polite
// live regions as soon as they appear lets screen readers announce the result.
new MutationObserver(function(records){
  records.forEach(function(record){
    record.addedNodes.forEach(function(node){
      if(!(node instanceof Element))return;
      const boxes=node.matches('.q-feedback')?[node]:Array.from(node.querySelectorAll('.q-feedback'));
      boxes.forEach(function(box){box.setAttribute('role','status');box.setAttribute('aria-live','polite')});
    });
  });
}).observe(document.body,{childList:true,subtree:true});

import { isAnswerCorrect } from "../grading.js";
import { appendBoundedRealtimeRecord } from "../bounded-realtime-list.js";
import { installDelegatedActions, readActionEnum, readActionInteger, readActionParam, registerDelegatedClick, runRegisteredClick } from "../delegated-actions.js";
import { appendHtml, clearElement, insertHtmlAfter, safeUrl, serializeChildren, setHtml } from "../dom.js";

/* SCRIPT REMAINS THE SAME EXCEPT FOR THE COLLAPSIBLE LOGIC */
let firebaseConfig;
let fbApp=null,fbDb=null,sessionRef=null,activityRef=null,commandRef=null,fbConnected=false;
const teacherPreviewRequested=new URLSearchParams(window.location.search).get('teacher')==='1';
let teacherMode=teacherPreviewRequested,teacherCanEdit=false,curriculumCache={};
let studentContext=null,studentStorage=null,contentFile='',contentHash='',schemaVersion=1,vocabMode='tracked',identityVerified=false;

let CURRICULUM = [{year:"2026",months:[{month:"October",lessons:[]}]}];

const state={currentYear:"2026",currentMonth:"October",currentLessonId:"lesson_1",currentStage:1,scores:{},done:{},streak:0,lastAction:''};

// NEW: Track expanded lessons in sidebar
let expandedLessons = {};

function getCurrentLesson(){
  const y=CURRICULUM.find(function(x){return x.year===state.currentYear});
  if(!y)return null;
  const m=y.months.find(function(x){return x.month===state.currentMonth});
  if(!m)return null;
  return m.lessons.find(function(l){return l.id===state.currentLessonId})||null
}
// The lesson's sections (js/lesson-plan.js), built from the content; scoring and the sidebar follow it.
let PLAN=[],LESSON_CONTENT={};
function currentSection(){ return PLAN.find(function(section){return section.id===state.currentStage})||null; }
function stagesOf(lesson){ if(PLAN.length)return scoreUnits(PLAN); return lesson && Array.isArray(lesson.stages) && lesson.stages.length ? lesson.stages : DEFAULT_STAGES; }
function grammarSections(){ return PLAN.filter(function(section){return section.kind==='grammar'}); }
function sectionScore(section,lessonId){ const ids=section.kind==='grammar'?section.exercises.map(function(e){return e.scoreId}):[section.id]; return ids.reduce(function(sum,id){return sum+(state.scores[lessonId+'_'+id]||0)},0); }
// Clears the score, done flag and saved answers of one section (every exercise of a grammar section).
function clearSectionProgress(sectionId){
  const section=PLAN.find(function(item){return item.id===sectionId});
  const ids=section&&section.kind==='grammar'?section.exercises.map(function(e){return e.scoreId}):[sectionId];
  ids.forEach(function(id){ const key=state.currentLessonId+'_'+id; state.scores[key]=0; state.done[key]=false; Object.keys(draftAnswers).forEach(function(k){ if(k.startsWith('g'+id+'_')||k.startsWith('sb'+id+'_')||k==='stage_'+id)delete draftAnswers[k]; }); });
  debouncedSaveDraft();
}
// ---- lesson clock (teacher-controlled, shared by teacher and student) ----
// ---- grammar ladder (rule card on the first grammar stage, six production steps after the last) ----
let readingTasks = null;
let listeningAvailable = false;
// Show "Listen & type" only when the lesson has a listening pack (content/manifest.json lists the file names).
let listeningChecked='';
function detectListening(lessonId){ if(listeningChecked===lessonId)return; listeningChecked=lessonId; fetch('content/manifest.json').then(function(r){return r.ok?r.json():{}}).then(function(m){ const next=Boolean(listeningEntryFor(m,lessonId,activeContentName?activeContentName+'.json':'')); if(next!==listeningAvailable){listeningAvailable=next; if(state.currentStage===1&&document.getElementById('flashGrid'))renderStage1();} }).catch(function(){}); }
function appendReadingTasks(){
  if(!readingTasks)return;
  const column=document.querySelector('#main .reading-questions'); if(!column)return;
  const block=renderReadingTasks({
    block:readingTasks, passageHtml:READING_HTML, isTeacher:teacherMode,
    store:{
      get:function(key){return draftAnswers[key]},
      set:function(key,value){ if(teacherMode)return; draftAnswers[key]=value; debouncedSaveDraft(); }
    },
    flag:function(id,prompt,answer,auto,extra){ flagForReview(id,prompt,answer,auto,3,extra); }
  });
  if(block)column.append(block);
}
let grammarLadder = null;
function ladderShown(){ return Boolean(grammarLadder) && (grammarLadder.status==='approved' || teacherMode); }
function decorateGrammarStage(stageId){
  if(!ladderShown())return;
  const view=document.querySelector('#main .stage-view'); if(!view)return;
  const grammarList=grammarSections(); const firstGrammar=grammarList.length?grammarList[0].id:-1, lastGrammar=grammarList.length?grammarList[grammarList.length-1].id:-1;
  if(stageId===firstGrammar){
    const card=renderRuleCard(grammarLadder);
    const firstBox=view.querySelector('.g-box');
    if(firstBox)view.insertBefore(card,firstBox); else view.insertBefore(card,view.firstChild);
  } else if(stageId===lastGrammar){
    const ladderStore={
      get:function(key){return draftAnswers[key]},
      set:function(key,value){ if(teacherMode)return; draftAnswers[key]=value; debouncedSaveDraft(); }
    };
    view.append(renderGrammarLadder({
      ladder:grammarLadder, store:ladderStore, isTeacher:teacherMode, stageId:lastGrammar,
      flag:function(id,prompt,answer,auto,extra){ flagForReview(id,prompt,answer,auto,lastGrammar,extra); }
    }));
  }
}

let lessonClock = null;
let lessonSections = null;
function clockSeconds(){ return lessonClock ? lessonClock.elapsedSeconds() : 0; }
function currentSections(){
  const overrides = curriculumCache && curriculumCache[state.currentLessonId] ? curriculumCache[state.currentLessonId].sectionOverrides : null;
  return applySectionOverrides(lessonSections || buildSections({ vocab: VOCAB, readingHtml: READING_HTML, readingQ: READING_Q, contextQ: CONTEXT_Q }), overrides);
}
let lessonRole='student',lessonCodeGetter=function(){return ''},whiteboard=null;
let lessonClipId=null,gameMode='light',studentGameMode=null,contentGameMode=null,errorHuntContent=null,bossActive=false;
applyCalm(loadSettings());
function startLessonClock(isTeacherView, getCode){
  lessonRole=isTeacherView?'teacher':'student'; lessonCodeGetter=getCode;
  if(lessonClock||!fbDb)return;
  lessonClock=initLessonClock({
    db:fbDb, auth:firebase.auth(), isTeacher:isTeacherView,
    getContext:function(){ const code=getCode(); return code?{code:code,lessonId:state.currentLessonId}:null },
    getSections:currentSections,
    getScore:function(){ return totalScore() }
  });
}

function totalScore(){
  const l=getCurrentLesson();
  if(!l)return 0;
  return stagesOf(l).reduce(function(s,st){return s+(state.scores[l.id+"_"+st.id]||0)},0)
}

let activeContentName = '';
let VOCAB = [];
let MATCH_DATA = [];
let READING_HTML = "";
let READING_Q = [];
let CONTEXT_Q = [];
let G6 = {};
let G7 = {};
let SB_PP = {};
let SB_PS = {};
let G10 = {};
let TEST_MCQ = [];
let TEST_SHORT = [];
let TEST_TFNG = [];
let TEST_COMPLETE = [];

let draftAnswers = {};
let draftSaveTimeout = null;
let isRemoteUpdate = false;

function debouncedSaveDraft() {
  if (isRemoteUpdate) return;
  clearTimeout(draftSaveTimeout);
  draftSaveTimeout = setTimeout(() => {
    try { if(studentStorage)studentStorage.set('draft_'+state.currentLessonId,draftAnswers); } catch(e) { console.error('Unable to persist lesson draft',e); }
    if (fbConnected && sessionRef) {
      sessionRef.child('draft/'+state.currentLessonId).set(draftAnswers).catch(console.error);
    }
  }, 400);
}

function loadDraft() {
  let local = {};
  try { if(studentStorage)local=studentStorage.get('draft_'+state.currentLessonId)||{}; } catch(e) { console.error('Unable to load lesson draft',e); }
  draftAnswers = local;
  
  if (fbConnected && sessionRef) {
    return sessionRef.child('draft/'+state.currentLessonId).once('value').then(snap => {
      const cloud = snap.val() || {};
      draftAnswers = Object.assign(draftAnswers, cloud);
      renderStage(); 
    });
  } else {
    renderStage();
    return Promise.resolve();
  }
}

function undoQuestion(prefix, i) {
  if (!teacherCanEdit) return;
  delete draftAnswers[prefix+i+'_draft'];
  delete draftAnswers[prefix+i+'_ok'];
  delete draftAnswers[prefix+i+'_selected'];
  debouncedSaveDraft();
  renderStage();
  showToast('Question reset by teacher');
}

let activeNoteId = null;
let savedRange = null; 
let contextTargetEdit = null;

document.addEventListener('DOMContentLoaded', () => {
  const menu = document.getElementById('customContextMenu');
  document.addEventListener('click', function(e) {
    if(e.target.closest('.context-menu')) return;
    menu.classList.remove('show');
    if(e.target.closest('.sticky-note')) return;
    const targetNote = e.target.closest('.user-note');
    if (targetNote) {
        if(!targetNote.dataset.id) targetNote.dataset.id = 'note_legacy_' + Date.now();
        openExistingNote(targetNote.dataset.id);
        return;
    }
    closeStickyNote();
  });
  document.addEventListener('contextmenu', function(e) {
    if(!e.target.closest('#passageBody')) return;
    e.preventDefault();
    clearElement(menu);
    contextTargetEdit = null;
    const selection = window.getSelection();
    const targetNote = e.target.closest('.user-note');
    let node = e.target;
    while (node && node !== document.body) {
        if (node.nodeType === 1) { 
            if (node.classList.contains('hl-yellow') || node.classList.contains('hl-green') || node.classList.contains('hl-blue') || node.classList.contains('hl-purple') || node.classList.contains('hl-pink') || node.classList.contains('underline')) {
                contextTargetEdit = node;
                break;
            }
        }
        node = node.parentNode;
    }
    if (targetNote) {
      if(!targetNote.dataset.id) targetNote.dataset.id = 'note_legacy_' + Date.now();
      setHtml(menu, `
        <div class="context-item" data-action="edit-note" data-note-id="${escapeAttr(targetNote.dataset.id)}">📝 Edit Note</div>
        <div class="context-item delete" data-action="delete-note" data-note-id="${escapeAttr(targetNote.dataset.id)}">🗑️ Delete Note</div>
      `);
    } else if (contextTargetEdit) {
      setHtml(menu, `
        <div class="context-item delete" data-action="remove-existing-edit">🗑️ Remove Edit</div>
      `);
    } else if (!selection.isCollapsed && selection.toString().trim().length > 0) {
      savedRange = selection.getRangeAt(0).cloneRange(); 
      setHtml(menu, `
        <div class="context-item has-submenu">
            🖍️ Highlight
            <div class="submenu">
                <div class="submenu-item" data-action="apply-annotation" data-annotation="hl-yellow"><span class="color-swatch" style="background:var(--ds-mark-yellow)"></span> Yellow</div>
                <div class="submenu-item" data-action="apply-annotation" data-annotation="hl-green"><span class="color-swatch" style="background:var(--ds-mark-green)"></span> Green</div>
                <div class="submenu-item" data-action="apply-annotation" data-annotation="hl-blue"><span class="color-swatch" style="background:var(--ds-mark-blue)"></span> Blue</div>
                <div class="submenu-item" data-action="apply-annotation" data-annotation="hl-purple"><span class="color-swatch" style="background:var(--ds-mark-blue)"></span> Purple</div>
                <div class="submenu-item" data-action="apply-annotation" data-annotation="hl-pink"><span class="color-swatch" style="background:var(--ds-mark-pink)"></span> Pink</div>
            </div>
        </div>
        <div class="context-item" data-action="apply-annotation" data-annotation="underline">U̲ Underline</div>
        <div class="context-item" data-action="create-note">💬 Add Note</div>
      `);
    } else {
      return; 
    }
    let x = e.pageX;
    let y = e.pageY;
    if (x + 160 > window.innerWidth) x -= 160;
    if (y + 200 > window.innerHeight) y -= 200;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.classList.add('show');
  });
  const dragHandle = document.getElementById('stickyDragHandle');
  const stickyNote = document.getElementById('stickyNote');
  let isDragging = false, startX, startY, initialX, initialY;
  dragHandle.addEventListener('mousedown', function(e) {
    if(e.target.tagName === 'BUTTON') return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    initialX = stickyNote.offsetLeft;
    initialY = stickyNote.offsetTop;
    document.body.style.userSelect = 'none';
  });
  document.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    stickyNote.style.left = (initialX + dx) + 'px';
    stickyNote.style.top = (initialY + dy) + 'px';
  });
  document.addEventListener('mouseup', function() {
    isDragging = false;
    document.body.style.userSelect = '';
  });
});

function applyAnnotation(className) {
  if(!savedRange) return;
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(savedRange);
  const span = document.createElement('span');
  span.className = className;
  if(className === 'underline') span.style.textDecoration = 'underline';
  try { span.appendChild(savedRange.extractContents()); savedRange.insertNode(span); } catch(e) { console.error("Highlight error:", e); }
  selection.removeAllRanges(); savedRange = null; document.getElementById('customContextMenu').classList.remove('show'); saveAnnotations();
}

function createNewNote() {
  if(!savedRange) return;
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(savedRange);
  const id = 'note_' + Date.now();
  const span = document.createElement('span');
  span.className = 'user-note'; span.dataset.id = id; span.dataset.note = "";
  try { span.appendChild(savedRange.extractContents()); savedRange.insertNode(span); } catch(e) { console.error("Note error:", e); }
  selection.removeAllRanges(); savedRange = null; document.getElementById('customContextMenu').classList.remove('show'); openExistingNote(id);
}

function removeExistingEdit() {
  if (!contextTargetEdit) return;
  const parent = contextTargetEdit.parentNode;
  while (contextTargetEdit.firstChild) parent.insertBefore(contextTargetEdit.firstChild, contextTargetEdit);
  parent.removeChild(contextTargetEdit); contextTargetEdit = null; document.getElementById('customContextMenu').classList.remove('show'); saveAnnotations(); showToast('Edit removed');
}

function openExistingNote(id) {
  const span = document.querySelector(`.user-note[data-id="${id}"]`); if(!span) return;
  activeNoteId = id; const rect = span.getBoundingClientRect(); const sticky = document.getElementById('stickyNote'); const textArea = document.getElementById('stickyText');
  textArea.value = span.dataset.note || ""; let posX = rect.right + 15; if (posX + 300 > window.innerWidth) posX = rect.left - 300; 
  sticky.style.left = posX + 'px'; sticky.style.top = (rect.top - 20) + 'px'; sticky.classList.add('show'); setTimeout(() => textArea.focus(), 50);
}

function closeStickyNote() {
  const sticky = document.getElementById('stickyNote'); if(!sticky.classList.contains('show')) return;
  if (activeNoteId) { const span = document.querySelector(`.user-note[data-id="${activeNoteId}"]`); if(span) { span.dataset.note = document.getElementById('stickyText').value; saveAnnotations(); } }
  sticky.classList.remove('show'); activeNoteId = null;
}

function deleteNoteById(id) {
  const span = document.querySelector(`.user-note[data-id="${id}"]`); if(!span) return;
  const parent = span.parentNode; while (span.firstChild) parent.insertBefore(span.firstChild, span); parent.removeChild(span);
  if(activeNoteId === id) closeStickyNote(); document.getElementById('customContextMenu').classList.remove('show'); saveAnnotations(); showToast('Note deleted');
}

function deleteCurrentNote() { if(activeNoteId) deleteNoteById(activeNoteId); }

function saveAnnotations() {
  if(fbConnected && sessionRef) {
    sessionRef.child('annotations/'+state.currentLessonId).set(serializeChildren(document.getElementById('passageBody'))).then(()=>{ if(typeof showToast === 'function') showToast('Annotations saved'); });
  }
}

let currentEditWord = null; let currentEditMeaningIdx = null;
function editFlashcardImage(){
  if(!teacherCanEdit||!fbDb){alert('Sign in with the teacher account to edit.');return}
  if(!quizWord)return;
  const w=VOCAB.find(function(x){return x.en===quizWord});if(!w)return;
  currentEditWord = quizWord; currentEditMeaningIdx = quizCurrentIdx;
  const meaning = w.meanings[quizCurrentIdx]; const displayWord = meaning.displayEn || w.en;
  const imgKey = displayWord + '_' + quizCurrentIdx;
  const current = customImages[imgKey] || customImages[displayWord] || customImages[w.en] || '';
  document.getElementById('imageUrlInput').value = current; document.getElementById('imageUrlModal').classList.add('open');
}
function closeImageModal() { document.getElementById('imageUrlModal').classList.remove('open'); }
function saveImageUrl() {
  if(!teacherCanEdit){alert('Only a teacher can save a flashcard image.');return}
  const url = document.getElementById('imageUrlInput').value.trim();
  if(url && !/^https?:\/\//i.test(url)) { alert('URL must start with http:// or https://'); return; }
  const w = VOCAB.find(x => x.en === currentEditWord); const meaning = w.meanings[currentEditMeaningIdx];
  const displayWord = meaning.displayEn || w.en; const imgKey = displayWord + '_' + currentEditMeaningIdx;
  const lessonId=new URLSearchParams(window.location.search).get('lesson')||safeLocal.getItem('nd_current_lesson')||'lesson_1';
  fbDb.ref('curriculum/'+lessonId+'/flashcardImages/'+imgKey).set(url || null).then(function(){
    return fbDb.ref('curriculum/'+lessonId).once('value').then(function(snapshot){
      const assignment=snapshot.val()||{};
      let codes=Array.isArray(assignment.assignedTo)?assignment.assignedTo:[];
      if(assignment.audience==='all'){
        return fbDb.ref('students').once('value').then(function(students){
          codes=Object.keys(students.val()||{});
          return codes;
        });
      }
      return codes;
    }).then(function(codes){
      return Promise.all(codes.map(function(code){
        return fbDb.ref('studentCurriculum/'+code+'/'+lessonId+'/flashcardImages/'+imgKey).set(url||null);
      }));
    });
  }).then(function(){
    if(url) customImages[imgKey] = url; else delete customImages[imgKey];
    renderQuizModal(); renderFlashcards(); closeImageModal(); showToast('Image saved for meaning ' + (currentEditMeaningIdx+1));
  }).catch(function(e){alert('Failed: '+e.message)});
}

function updateCurriculumView(snapshot,code,teacherPreview){
  curriculumCache=snapshot.val()||{};
  const fbLessons=Object.keys(curriculumCache).map(function(id){
    const lesson=curriculumCache[id];
    if(!lesson||lesson.homework||lesson.published===false)return null;
    if(teacherPreview&&!isLessonVisibleTo(lesson,code))return null;
    return {id:id,title:lesson.title||'Untitled Lesson',stages:lesson.stages||DEFAULT_STAGES,year:lesson.year||'2026',month:lesson.month||'October',order:lesson.order||0,maxScore:resolveMaxScore(lesson)};
  }).filter(Boolean).sort(function(a,b){return a.order-b.order});
  CURRICULUM[0].months[0].lessons=fbLessons;
  if(!state.currentLessonId&&fbLessons.length)state.currentLessonId=fbLessons[0].id;
  if(state.currentLessonId&&expandedLessons[state.currentLessonId]===undefined)expandedLessons[state.currentLessonId]=true;
  if(identityVerified||teacherPreviewRequested){renderSidebar();renderStage()}
}

function initFirebase(){
  try{
    fbApp=firebase.apps.length?firebase.app():firebase.initializeApp(firebaseConfig);
    fbDb=firebase.database();
    watchConnection(fbDb);
    const lessonId=new URLSearchParams(window.location.search).get('lesson')||safeLocal.getItem('nd_current_lesson');
    
    if(lessonId) {
       const c = getSessionCode();
       if(c) {
          fbDb.ref('sessions/'+c+'/annotations/'+lessonId).on('value', function(s){
             if(s.exists() && !teacherPreviewRequested) {
                const body = document.getElementById('passageBody');
                if(body && state.currentStage===3) {
                    const savedHtml = s.val();
                    const currentTitleMatch = READING_HTML.match(/<h1>(.*?)<\/h1>/);
                    const currentTitle = currentTitleMatch ? currentTitleMatch[1].trim() : '';
                    if (currentTitle && savedHtml.includes(currentTitle)) {
                        setHtml(body, sanitizeRichHtml(savedHtml));
                    } else {
                        fbDb.ref('sessions/'+c+'/annotations/'+lessonId).remove();
                    }
                }
             }
          });
       }
    }
    
    if(teacherPreviewRequested){
      document.querySelector('.session-input').style.display='none';
      // Each step of the preview load is named and time-limited, so a stall shows which step and offers a retry
      // instead of leaving the loading placeholders up.
      let previewStep='checking sign-in',previewDone=false;
      const previewWatchdog=setTimeout(function(){
        if(previewDone)return;
        updateSyncUI('error');
        showErrorPage(document.getElementById('main'),new Error('Teacher preview timed out while '+previewStep+'.'),{title:'The lesson is taking too long to load'});
      },20000);
      let previewStarted=false;
      firebase.auth().onAuthStateChanged(async function(user){
        if(previewStarted&&user)return; // a token refresh, not a new sign-in
        previewStarted=!!user;
        try {
          previewStep='checking teacher access';
          teacherCanEdit=await isTeacher(user,fbDb);
        } catch(error) {
          teacherCanEdit=false;
          console.error('Teacher authorization check failed:',error);
        }
        teacherMode=teacherCanEdit;
        if(teacherCanEdit){
          try{
            const {loadProtectedContent}=await import('../protected-content.js');
            try{
              previewStep='loading the lesson content';
              const record=await loadProtectedContent(fbDb,state.currentLessonId,'classwork');
              activeContentName=String(record.sourceFile||'').replace(/\.json$/i,'')||activeContentName;
              await applyLessonContent(record.content,'Firebase protected content/'+state.currentLessonId+'/classwork');
            }catch(error){
              if(!error.message.includes('has not been imported'))throw error;
              await loadContent();
            }
          }catch(error){
            previewDone=true;clearTimeout(previewWatchdog);
            showErrorPage(document.getElementById('main'),error,{title:'Teacher preview content failed to load'});
            return;
          }
          previewDone=true;clearTimeout(previewWatchdog);
          const lessonId=state.currentLessonId;
          fbDb.ref('curriculum/'+lessonId+'/flashcardImages').on('value',function(s){customImages=s.val()||{};renderFlashcards();if(document.getElementById('fcModal').classList.contains('open'))renderQuizModal()});
          fbDb.ref('curriculum').on('value',function(s){updateCurriculumView(s,getSessionCode(),true)});
          const code = getSessionCode();
          if (code) {
            sessionRef = fbDb.ref('sessions/' + code); activityRef = sessionRef.child('history'); commandRef = sessionRef.child('commands'); fbConnected = true;
            sessionRef.child('state').once('value').then(function(snap){
              const st = snap.val() || {};
              if (st.scores) Object.assign(state.scores, st.scores);
              if (st.done) Object.assign(state.done, st.done);
              if (st.notes) document.getElementById('notesArea').value = st.notes;
              loadVocabStateCloud().then(function(){ loadDraft().then(() => { renderSidebar(); updateHUD(); }); });
            });
            fbDb.ref('students/' + code).once('value').then(snap => { document.getElementById('workspaceName').textContent = snap.val() ? snap.val().name : 'Student'; });
          } else { document.getElementById('workspaceName').textContent = 'Teacher Workspace'; }
          updateSyncUI('teacher');
          startLessonClock(true,getSessionCode); { const identityBanner=document.getElementById('studentIdentityBanner'); if(identityBanner)identityBanner.style.display='none'; } document.getElementById('scorePill').style.display='none'; document.getElementById('streakPill').style.display='none';
          renderStage();
        }
        else{previewDone=true;clearTimeout(previewWatchdog);teacherMode=true;updateSyncUI('error');setHtml(document.getElementById('main'), '<div class="card"><h2>Teacher sign-in required</h2></div>')}
      });
      return;
    }
    
    (async function() {
      try {
        const [{ resolveStudentContext }, storageModule, protectedModule] = await Promise.all([import('../student-context.js'), import('../storage.js'), import('../protected-content.js')]);
        const contentParam=new URLSearchParams(location.search).get('content');
        const context = await resolveStudentContext({auth:firebase.auth(),db:fbDb,lessonId:state.currentLessonId,contentId:contentParam||state.currentLessonId});
        studentContext=context;
        // Start the (slow) protected-content read now; the assignment checks below run while it is in flight.
        const protectedRecordPromise=protectedModule.loadProtectedContent(fbDb,context.lessonId,'classwork');
        protectedRecordPromise.catch(function(){});
        studentStorage={
          get:function(key){return storageModule.readStudentValue(context,key)},
          set:function(key,value){storageModule.writeStudentValue(context,key,value)}
        };
        document.getElementById('workspaceName').textContent=context.name;
        const banner=document.getElementById('studentIdentityBanner');
        document.getElementById('studentIdentityText').textContent='You are working as '+context.name+' ('+context.code+')';
        banner.classList.add('ready');
        const debug=new URLSearchParams(location.search).get('debug')==='1';
        if(debug){const overlay=document.getElementById('debugOverlay');overlay.textContent=JSON.stringify({code:context.code,uid:context.uid,lessonId:context.lessonId,contentFile:contentFile,contentHash:contentHash,schemaVersion:schemaVersion,storageNamespace:context.storageNamespace},null,2);overlay.hidden=false;}
        bc=new BroadcastChannel('nd_lesson_live_v4_'+context.code+'_'+context.lessonId);
        const lessonSnapshot=await fbDb.ref('studentCurriculum/'+context.code+'/'+context.lessonId).once('value');
        const selected=lessonSnapshot.val();
        if(!selected)throw new Error('Lesson assignment was not found.');
        if(selected.published===false)throw new Error('This lesson is not published.');
        lessonClipId=/^[A-Za-z0-9][A-Za-z0-9_-]{1,59}$/.test(String(selected.clipId||''))?selected.clipId:null; studentGameMode=selected.gameMode||null; gameMode=resolveGameMode(studentGameMode,contentGameMode);
        let expectedFile=selected.classworkContentUrl||selected.contentUrl;
        if(!expectedFile) {
          const manifestResponse=await fetch('content/manifest.json',{cache:'no-store'});
          if(!manifestResponse.ok)throw new Error('Content manifest could not be loaded.');
          const manifest=await manifestResponse.json();
          const entry=manifest[context.lessonId];
          if(entry)expectedFile=entry.classworkFile;
        }
        if(!expectedFile)throw new Error('No classwork content is configured for this lesson.');
        const expectedName=String(expectedFile).replace(/^content\//,'').replace(/\.json$/,'');
        if(contentParam&&expectedName!==contentParam)throw new Error('Lesson content does not match the assigned curriculum file.');
        if(!/^[a-z0-9_-]+$/i.test(expectedName))throw new Error('Invalid classwork content reference.');
        activeContentName=expectedName;
        const protectedRecord=await protectedRecordPromise;
        if(protectedRecord.sourceFile&&protectedRecord.sourceFile!==expectedName+'.json')throw new Error('Protected classwork does not match the assigned curriculum file.');
        await applyLessonContent(protectedRecord.content,'Firebase protected content/'+context.lessonId+'/classwork');
        fbDb.ref('studentCurriculum/'+context.code).on('value',function(s){updateCurriculumView(s,context.code,false)});
        fbDb.ref('studentCurriculum/'+context.code+'/'+context.lessonId+'/flashcardImages').on('value',function(s){customImages=s.val()||{};renderFlashcards();if(document.getElementById('fcModal').classList.contains('open'))renderQuizModal()});
        identityVerified=true;
        storageModule.migrateLegacyValue(context,'state','nd_state_sabina_v6',safeLocal.getItem('nd_state_owner_code'));
        if(!teacherPreviewRequested)loadState();
        await startStudentSession(context.code);
        renderSidebar();renderStage();startLessonClock(false,function(){return studentContext?studentContext.code:''});updateHUD();
      } catch(error) {
        console.error('Student identity verification failed',error);
        identityVerified=false;
        showErrorPage(document.getElementById('main'),error,{title:'We could not open your lesson'});
        updateSyncUI('error');
      }
    }());
  }catch(e){console.error(e);updateSyncUI('error');showErrorPage(document.getElementById('main'),e,{title:'We could not start the lesson'})}
}
async function startStudentSession(code){
  if(!code){updateSyncUI('nocode');return}
  sessionRef=fbDb.ref('sessions/'+code); activityRef=sessionRef.child('history'); commandRef=sessionRef.child('commands');
  const remoteSnapshot=await sessionRef.child('state').once('value');
  const remoteState=remoteSnapshot.val()||{};
  const localState=studentStorage?studentStorage.get('state'):null;
  state.scores=Object.assign({},remoteState.scores||{},state.scores||{});
  state.done=Object.assign({},remoteState.done||{},state.done||{});
  if(!localState&&remoteState.stage)state.currentStage=remoteState.stage;
  if(!localState&&typeof remoteState.notes==='string')document.getElementById('notesArea').value=remoteState.notes;
  if(!localState&&remoteState.streak)state.streak=remoteState.streak;
  listenForTeacherCommands();
  fbConnected=true;updateSyncUI('live');pushFullState();
  await loadDraft();
  
  if (!teacherMode) {
      sessionRef.child('draft/'+state.currentLessonId).on('value', snap => {
          const remote = snap.val() || {};
          let changed = false;
          Object.keys(draftAnswers).forEach(k => {
              if (!remote[k] && (k.endsWith('_ok') || k.endsWith('_draft'))) changed = true;
          });
          if (changed) {
              isRemoteUpdate = true;
              draftAnswers = remote;
              if ([1,9,10,11].indexOf(state.currentStage) === -1) {
                  renderStage();
              }
              setTimeout(() => { isRemoteUpdate = false; }, 100);
          }
      });
  }
}
function getSessionCode(){if(studentContext)return studentContext.code;if(teacherPreviewRequested)return (new URLSearchParams(location.search).get('code')||'').toUpperCase();return ''}
function changeSessionCode(){document.getElementById('main').textContent='Student codes can only be changed from the portal.'}
async function switchStudent(){try{await firebase.auth().signOut()}catch(error){console.error('Unable to sign out before switching student',error)}for(const storage of [safeLocal,safeSession])for(let i=storage.length-1;i>=0;i--){const key=storage.key(i);if(key&&(key.startsWith('nd_')||key.startsWith('nd:')))storage.removeItem(key)}window.location.href='portal.html'}
function updateSyncUI(s){const d=document.getElementById('syncDot');const t=document.getElementById('syncStatus');d.classList.remove('warn','off');if(s==='live')t.textContent='Live · Connected';else if(s==='teacher')t.textContent='Teacher preview';else if(s==='nocode'){d.classList.add('warn');t.textContent='Set code above'}else if(s==='error'){d.classList.add('off');t.textContent='Error'}}
const COMMAND_MAX_AGE_MS = 60 * 1000;
let serverTimeOffset = 0;

// Commands are append-only records { type, payload, createdAt (server time), ack }.
// A student applies each command once: the ack written back marks it as handled, and
// commands older than a minute (server clock, not the student's) are acknowledged but ignored.
function listenForTeacherCommands(){
  fbDb.ref('.info/serverTimeOffset').on('value',function(snap){serverTimeOffset=Number(snap.val())||0});
  commandRef.orderByKey().limitToLast(20).on('child_added',function(snap){
    const cmd=snap.val();
    if(!cmd||cmd.ack===true||typeof cmd.type!=='string')return;
    const age=Date.now()+serverTimeOffset-Number(cmd.createdAt);
    if(Number.isFinite(age)&&age<=COMMAND_MAX_AGE_MS)applyTeacherCommand(cmd);
    snap.ref.child('ack').set(true).catch(function(error){console.error('Unable to acknowledge teacher command',error)});
  });
}
function applyTeacherCommand(cmd){
  const stage=Number(cmd.payload&&cmd.payload.stage);
  if(cmd.type==='goto'&&Number.isInteger(stage)){goToStage(PLAN.length?resolveSectionId(PLAN,stage):stage);return}
  if(cmd.type==='resetStage'&&Number.isInteger(stage)){
    clearSectionProgress(stage);
    delete draftAnswers['stage_'+stage];
    if(sessionRef)sessionRef.child('draft/'+state.currentLessonId).remove().catch(function(error){console.error('Unable to clear stage draft',error)});
    saveState();renderSidebar();renderStage();updateHUD();
    return;
  }
  if(cmd.type==='resetVocab'){
    vocabState={}; saveVocabState(); const key = state.currentLessonId + "_1"; state.done[key] = false; state.scores[key] = 0; saveState();
    if(document.getElementById('fcModal').classList.contains('open')) closeFCModal();
    renderStage(); if(typeof showToast==='function') showToast('Vocabulary progress reset');
    return;
  }
  if(cmd.type==='resetAll')teacherReset();
}
function teacherReset(){Object.keys(state.scores).forEach(function(k){state.scores[k]=0});Object.keys(state.done).forEach(function(k){state.done[k]=false});state.currentStage=1;state.streak=0;vocabState={};customImages={};draftAnswers={};document.getElementById('notesArea').value='';if(sessionRef)sessionRef.child('draft/'+state.currentLessonId).remove();updateHUD();renderSidebar();renderStage();saveState()}

let audioCtx=null,soundOn=true;
function playTone(f,d,t,v){if(!soundOn)return;t=t||'sine';v=v||.12;try{if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=t;o.frequency.value=f;g.gain.setValueAtTime(v,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+d);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+d)}catch(e){}}
function sCorrect(){playTone(660,.12);setTimeout(function(){playTone(880,.18)},100)}
function sWrong(){playTone(180,.25,'sawtooth',.08)}
function sWin(){[523,659,784,1047].forEach(function(f,i){setTimeout(function(){playTone(f,.2)},i*110)})}
function sFlip(){playTone(500,.08,'sine',.06)}
function sPop(){playTone(700,.06,'sine',.05)}

let ukVoice=null;
function pickUKVoice(){if(!('speechSynthesis' in window))return null;const v=window.speechSynthesis.getVoices();return v.find(function(x){return x.lang==='en-GB'})||v.find(function(x){return x.lang&&x.lang.toLowerCase().startsWith('en-gb')})||v.find(function(x){return x.name&&/british|uk|england|daniel|kate|serena|oliver|libby|sonia/i.test(x.name)})||null}
if('speechSynthesis' in window){ukVoice=pickUKVoice();window.speechSynthesis.onvoiceschanged=function(){ukVoice=pickUKVoice()}}
function speak(text){if(!soundOn)return;if(!('speechSynthesis' in window))return;try{window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='en-GB';u.rate=.9;u.pitch=1;if(ukVoice)u.voice=ukVoice;window.speechSynthesis.speak(u)}catch(e){}}

let ttsState='idle',ttsUtterId=0,ttsFullText='',ttsCharStart=0;
function speakLong(text){
  if(!soundOn)return; if(!('speechSynthesis' in window))return;
  try{
    window.speechSynthesis.cancel(); ttsUtterId++; const myId=ttsUtterId; const raw=text!==undefined?text:document.getElementById('passageBody').innerText;
    ttsFullText=String(raw).replace(/\s+/g,' ').trim(); ttsCharStart=0; const u=new SpeechSynthesisUtterance(ttsFullText);
    u.lang='en-GB';u.rate=.9;u.pitch=1; if(ukVoice)u.voice=ukVoice;
    u.onboundary=function(e){if(ttsUtterId===myId&&typeof e.charIndex==='number')ttsCharStart=e.charIndex};
    u.onend=function(){if(ttsUtterId===myId){ttsState='idle';ttsCharStart=0;updateTTSButtons()}};
    u.onerror=function(){if(ttsUtterId===myId){ttsState='idle';updateTTSButtons()}};
    window.speechSynthesis.speak(u); ttsState='playing'; updateTTSButtons();
  }catch(e){}
}
function pauseTTS(){if(!('speechSynthesis' in window))return;if(ttsState!=='playing')return;try{window.speechSynthesis.pause()}catch(e){}ttsState='paused';updateTTSButtons()}
function resumeTTS(){ if(!('speechSynthesis' in window))return; if(ttsState!=='paused')return; ttsState='playing'; updateTTSButtons(); try{window.speechSynthesis.resume()}catch(e){} setTimeout(function(){ if(ttsState!=='playing')return; if(!window.speechSynthesis.speaking||window.speechSynthesis.paused){ try{ window.speechSynthesis.cancel(); ttsUtterId++; const myId=ttsUtterId; const baseOffset=ttsCharStart; const remaining=ttsFullText.substring(Math.max(0,baseOffset)).replace(/^\s+/,''); if(!remaining){ttsState='idle';updateTTSButtons();return} const u=new SpeechSynthesisUtterance(remaining); u.lang='en-GB';u.rate=.9;u.pitch=1; if(ukVoice)u.voice=ukVoice; u.onboundary=function(e){if(ttsUtterId===myId&&typeof e.charIndex==='number')ttsCharStart=baseOffset+e.charIndex}; u.onend=function(){if(ttsUtterId===myId){ttsState='idle';ttsCharStart=0;updateTTSButtons()}}; u.onerror=function(){if(ttsUtterId===myId){ttsState='idle';updateTTSButtons()}}; window.speechSynthesis.speak(u); }catch(e){} } },200); }
function stopTTS(){if(!('speechSynthesis' in window))return;ttsUtterId++;try{window.speechSynthesis.cancel()}catch(e){}ttsState='idle';ttsCharStart=0;updateTTSButtons()}
function updateTTSButtons(){ const p=document.getElementById('ttsPlay'); const pa=document.getElementById('ttsPause'); const r=document.getElementById('ttsResume'); const s=document.getElementById('ttsStop'); const setVis=function(el,on){if(!el)return;el.style.display=on?'inline-flex':'none'}; setVis(p,ttsState==='idle'); setVis(pa,ttsState==='playing'); setVis(r,ttsState==='paused'); setVis(s,ttsState!=='idle'); }

let bc=null;
// Compact per-student summary the teacher dashboard subscribes to, so it never has to download
// every student's full session (drafts, history, annotations) just to draw the overview.
function writeSessionSummary(payload){
  if(teacherMode||!studentContext||!fbDb)return;
  const done=payload.done||{};
  const summary={
    score:Number(payload.score)||0,
    stage:Math.min(40,Math.max(1,Number(payload.stage)||1)),
    streak:Number(payload.streak)||0,
    elapsed:Math.min(864000,Math.max(0,Number(payload.elapsed)||0)),
    // sections of the open lesson that are done, out of how many, and the name of the current one
    doneCount:PLAN.length?PLAN.filter(function(section){return section.id===1?(VOCAB.length>0&&getVocabCounts().learned===VOCAB.length)||Boolean(done[state.currentLessonId+'_1']):sectionDone(section,state.currentLessonId,done)}).length:Object.keys(done).filter(function(key){return done[key]===true}).length,
    lastUpdate:Date.now()
  };
  if(PLAN.length){ summary.sectionCount=PLAN.length; const section=currentSection(); if(section)summary.stageLabel=String(section.label).slice(0,80); }
  fbDb.ref('sessionSummary/'+studentContext.code).update(summary).catch(function(error){console.error('Unable to update session summary',error)});
}
function broadcast(type,payload){ if(teacherMode && !sessionRef)return; if(fbConnected&&sessionRef){try{if(type==='state'){sessionRef.child('state').set(Object.assign({},payload,{lastUpdate:Date.now()}));writeSessionSummary(payload)}else if(type==='action'){appendBoundedRealtimeRecord(activityRef,payload).catch(function(error){console.error('Unable to append lesson activity',error)});sessionRef.child('state').update({score:payload.score,stage:payload.stage,lastUpdate:Date.now()})}else if(type==='notes')sessionRef.child('state').update({notes:payload.text})}catch(e){console.error('Unable to broadcast lesson update',e)}} const msg={type:type,payload:payload,ts:Date.now()}; if(bc){try{bc.postMessage(msg)}catch(e){}} }
function pushFullState(){if(teacherMode||!fbConnected||!sessionRef)return;broadcast('state',{stage:state.currentStage,score:totalScore(),streak:state.streak,done:state.done,scores:state.scores,notes:document.getElementById('notesArea').value,elapsed:clockSeconds(),contentFile:contentFile,contentHash:contentHash,schemaVersion:schemaVersion})}
function broadcastAction(type,detail){ state.lastAction=detail; const payload = { stage:state.currentStage, type:type, detail:detail, score:totalScore(), ts:Date.now(), actor: teacherMode ? 'teacher' : 'student' }; broadcast('action', payload); }
function saveState(){ if(!teacherMode&&studentStorage) { try { studentStorage.set('state',{currentStage:state.currentStage,scores:state.scores,done:state.done,notes:document.getElementById('notesArea').value,dark:document.documentElement.classList.contains('dark'),soundOn:soundOn}); } catch(e) { console.error('Unable to save lesson state',e); } } if(identityVerified)broadcast('state',{stage:state.currentStage,score:totalScore(),streak:state.streak,done:state.done,scores:state.scores,notes:document.getElementById('notesArea').value,elapsed:clockSeconds()}); }
function loadState(){try{if(!studentStorage)return;const p=studentStorage.get('state');if(!p)return;if(p.currentStage)state.currentStage=p.currentStage;if(p.scores)Object.assign(state.scores,p.scores);if(p.done)Object.assign(state.done,p.done);if(p.notes)document.getElementById('notesArea').value=p.notes;if(p.dark)document.documentElement.classList.add('dark');if(p.soundOn!==undefined)soundOn=p.soundOn}catch(e){console.error('Unable to load lesson state',e)}}
let customImages={};

function escapeHtml(s){return String(s).replace(/[&<>"']/g,function(ch){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]})}
function escapeAttr(s){return escapeHtml(s)}
function shuffle(arr){const a=arr.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));const t=a[i];a[i]=a[j];a[j]=t}return a}
function norm(s){return String(s).toLowerCase().replace(/[.,!?;:]/g,'').replace(/\s+/g,' ').trim()}

function flagForReview(qId,prompt,studentAnswer,autoResult,stageId,extra){
  if(teacherMode)return; if(!fbConnected||!sessionRef){alert('Cannot send to teacher — no session connected.');return}
  const payload={stage:stageId,questionId:qId,prompt:prompt,studentAnswer:studentAnswer,autoResult:autoResult,ts:Date.now()};
  if(extra)Object.assign(payload,extra);
  appendBoundedRealtimeRecord(sessionRef.child('reviewQueue'),payload).then(function(){ broadcastAction('review_flagged',prompt.substring(0,40)); }).catch(function(e){alert('Failed to send: '+e.message)});
}

let s1CurrentIdx=0, s1Filter='learning', vocabState={}, vocabCloudLoaded=false, s1VisibleList=[], quizWord=null, quizMeanings=[], quizCurrentIdx=0, quizRoundWrongs=0, quizAnswers={}, quizOptionsCache={}, quizHintShown=false, quizRoundFinalized=false, practiceMode=false, practiceQueue=[], practiceIdx=0;

function vocabKey(){return 'vocab_'+state.currentLessonId}
function loadVocabStateLocal(){try{vocabState=studentStorage?studentStorage.get(vocabKey())||{}:{}}catch(e){console.error('Unable to load vocabulary state',e);vocabState={}}}
function cloudVocabKey(word){return String(word).toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,64)}
function loadVocabStateCloud(){ if(!fbConnected||!sessionRef)return Promise.resolve(); return sessionRef.child('state/vocabProgress/'+state.currentLessonId).once('value').then(function(snap){ const cloud=snap.val()||{}; Object.keys(cloud).forEach(function(key){ const vocab=VOCAB.find(function(item){return cloudVocabKey(item.en)===key}); if(vocab)vocabState[vocab.en]=cloud[key]; }); saveVocabStateLocal(); }).catch(function(error){console.error('Unable to load cloud vocabulary progress',error);throw error}); }
function saveVocabStateLocal(){try{if(studentStorage)studentStorage.set(vocabKey(),vocabState)}catch(e){console.error('Unable to save vocabulary state',e)}}
function saveVocabStateCloud(){if(!fbConnected||!sessionRef)return;try{ const cloudState={}; Object.keys(vocabState).forEach(function(word){const key=cloudVocabKey(word);if(key)cloudState[key]=vocabState[word]}); sessionRef.child('state/vocabProgress/'+state.currentLessonId).set(cloudState).catch(function(error){console.error('Unable to save cloud vocabulary state',error)}); }catch(error){console.error('Unable to save cloud vocabulary state',error)}}
function saveVocabState(){saveVocabStateLocal();saveVocabStateCloud()}

function getMeaningStatus(word, meaningIdx) {
   if(vocabMode==='preLearned') return 'learned';
   const wordState = vocabState[word]; if(!wordState || !wordState.meanings || !wordState.meanings[meaningIdx]) return 'learning';
   const s = wordState.meanings[meaningIdx]; if(s.perfectStreak >= 2) return 'learned'; if(s.wrongCount >= 2) return 'practice'; return 'learning';
}

function getWordStatus(word){ const w = VOCAB.find(x => x.en === word); if(!w) return 'learning'; let statuses = w.meanings.map((_, i) => getMeaningStatus(word, i)); if(statuses.every(s => s === 'learned')) return 'learned'; if(statuses.some(s => s === 'practice')) return 'practice'; return 'learning'; }
function getVocabCounts(){ const c={learning:0,learned:0,practice:0}; VOCAB.forEach(function(w){c[getWordStatus(w.en)]++}); return c; }
function shouldShowPractice(){ if(vocabMode==='preLearned') return false; if(!Object.keys(vocabState).length)return false; return Object.keys(vocabState).some(function(w){return getWordStatus(w)!=='learned'}); }

// ---- word families (flashcard "Word family" panel and the "Form the word" exercise) ----
function wordFamilyStore(){
  return {
    get:function(key){return draftAnswers[key]},
    set:function(key,value){ if(teacherMode)return; draftAnswers[key]=value; debouncedSaveDraft(); }
  };
}
function appendFormTheWord(view){
  if(!VOCAB.some(function(w){return familyVisible(w,teacherMode)}))return;
  const exercise=renderFormTheWord({vocab:VOCAB,store:wordFamilyStore(),isTeacher:teacherMode});
  if(exercise)view.append(exercise);
}
function showWordFamily(){
  const w=VOCAB.find(function(x){return x.en===quizWord}); const area=document.getElementById('fcRevealArea'); if(!w||!area)return;
  const back=document.createElement('button'); back.type='button'; back.className='ds-btn ds-btn--secondary ds-btn--small'; back.textContent='← Back to the quiz';
  back.addEventListener('click',function(){renderQuizModal()});
  area.replaceChildren(renderFamilyPanel(w,{isTeacher:teacherMode}),back);
}

function renderStage1(){
  detectListening(state.currentLessonId);
  const main=document.getElementById('main'); if(!main)return; clearElement(main); loadVocabStateLocal();
  const v=document.createElement('div');v.className='stage-view active'; const counts=getVocabCounts(); const showPractice=shouldShowPractice(); const listeningHref=listeningAvailable?'listening.html?code='+encodeURIComponent(studentContext?studentContext.code:'')+'&lesson='+encodeURIComponent(state.currentLessonId):'';
  setHtml(v, '<div class="eyebrow">Vocabulary</div><h2>🌪️ Adaptive Vocabulary</h2>'+
  '<div class="lead">Every card is a small quiz. Choose the correct translation for each meaning of the word. Your answers automatically sort cards into three sections — <b>Learning</b>, <b>Learned</b>, and <b>Need Practice</b>.<span class="ru">Каждая карточка — небольшой тест. Ваши ответы автоматически сортируют карточки по трём разделам.</span></div>'+
  '<div class="flash-toolbar">'+
  '<button class="filt '+(s1Filter==='learning'?'active':'')+'" data-action="set-vocab-filter" data-filter="learning">📖 Learning ('+counts.learning+')</button>'+
  '<button class="filt '+(s1Filter==='learned'?'active':'')+'" data-action="set-vocab-filter" data-filter="learned">✓ Learned ('+counts.learned+')</button>'+
  '<button class="filt '+(s1Filter==='practice'?'active':'')+'" data-action="set-vocab-filter" data-filter="practice">🔁 Need Practice ('+counts.practice+')</button>'+
  '<button class="btn practice-btn'+(showPractice?' show':'')+'" data-action="start-practice">🎯 Practise</button>'+
  (listeningHref?'<a class="btn ghost" href="'+escapeAttr(listeningHref)+'">🎧 Listen &amp; type</a>':'')+
  '</div><div class="flash-grid" id="flashGrid"></div>');
  main.appendChild(v);main.appendChild(stageFooter(null,2)); renderFlashcards(); appendFormTheWord(v);
  if(fbConnected&&!vocabCloudLoaded){vocabCloudLoaded=true;loadVocabStateCloud().then(function(){renderStage()})}
}
function setFilter(f){s1Filter=f;renderStage()}

function renderFlashcards(){
  const grid=document.getElementById('flashGrid');if(!grid)return;clearElement(grid);
  const list=VOCAB.filter(function(w){return getWordStatus(w.en)===s1Filter}); s1VisibleList=list;
  if(!list.length){
    const emptyMsg=s1Filter==='learned'?'No learned words yet — keep practising.':(s1Filter==='practice'?'No words need practice. Great job!':'No words here.');
    setHtml(grid, '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--ink-soft);font-size:17px">'+emptyMsg+'</div>'); return;
  }
  list.forEach(function(w,idx){
    const card=document.createElement('div');card.className='flashcard';
    const status=getWordStatus(w.en); if(status==='learned')card.classList.add('known'); if(status==='practice')card.classList.add('needs-practice');
    const firstMeaning = w.meanings[0]; const imgKey = (firstMeaning && firstMeaning.displayEn) ? firstMeaning.displayEn + '_0' : w.en + '_0'; const img = customImages[imgKey] || customImages[w.en];
    setHtml(card, '<div class="flashcard-img">'+(img?'<img src="'+escapeAttr(img)+'" alt="'+escapeAttr(w.en)+'" loading="lazy">':escapeHtml(w.emoji||'📖'))+'</div><div class="flashcard-word">'+escapeHtml(w.en)+'</div>');
    const image=card.querySelector('.flashcard-img img');
    if(image)image.addEventListener('error',function(){image.parentNode.textContent=w.emoji||'📖'},{once:true});
    registerDelegatedClick(card, () => openQuiz(idx)); grid.appendChild(card);
  });
}

function openQuiz(idx){ s1CurrentIdx=idx; const w=s1VisibleList[idx];if(!w)return; practiceMode=false; openQuizWord(w.en, w.meanings.map((_, i) => i)); }

function openQuizWord(word, meaningIndices){
  try{
    quizWord=word; quizOptionsCache={}; quizHintShown=false; quizRoundFinalized=false;
    const w=VOCAB.find(function(x){return x.en===word});if(!w){console.warn('Word not found:',word);return}
    quizMeanings = meaningIndices.map(i => ({ idx: i, data: w.meanings[i] })); quizCurrentIdx=0; quizRoundWrongs=0; quizAnswers={};
    renderQuizModal(); const modal=document.getElementById('fcModal'); if(!modal){alert('Modal element missing from page');return} modal.classList.add('open');
    try{sFlip()}catch(e){} try{broadcastAction('flashcard_open',word)}catch(e){}
  }catch(err){ console.error('openQuizWord failed:',err); alert('Cannot open quiz: '+err.message); }
}
function closeFCModal(){
  const modal=document.getElementById('fcModal'); if(modal){ modal.classList.remove('open'); modal.style.display=''; modal.style.position=''; modal.style.inset=''; modal.style.zIndex=''; }
  practiceMode=false; practiceQueue=[]; practiceIdx=0; renderStage1();
}

function buildQuizOptions(word,meaningIdx){
  const key=word+'::'+meaningIdx; if(quizOptionsCache[key])return quizOptionsCache[key];
  const v=VOCAB.find(function(x){return x.en===word});if(!v)return{options:[],correct:''};
  const correctRu=v.meanings[meaningIdx].ru; const pool=[];
  VOCAB.forEach(function(w){ if(w.en===word)return; w.meanings.forEach(function(m){if(m.ru!==correctRu)pool.push(m.ru)}); });
  const unique=Array.from(new Set(pool)); const distractors=shuffle(unique).slice(0,3); const options=shuffle(distractors.concat([correctRu]));
  const result={options:options,correct:correctRu}; quizOptionsCache[key]=result; return result;
}

function renderQuizModal(){
  const w=VOCAB.find(function(x){return x.en===quizWord});if(!w)return; const activeMeaningObj = quizMeanings[quizCurrentIdx]; if(!activeMeaningObj) return;
  const meaning = activeMeaningObj.data; const displayWord = meaning.displayEn || w.en; const realMeaningIdx = activeMeaningObj.idx; const imgKey = displayWord + '_' + realMeaningIdx; 
  const img = customImages[imgKey] || customImages[displayWord] || customImages[w.en];
  const modalImage=document.getElementById('fcModalImg');
  setHtml(modalImage, (img?'<img src="'+escapeAttr(img)+'" alt="'+escapeAttr(displayWord)+'">':'<div style="font-size:180px;line-height:1;">'+escapeHtml(w.emoji||'📖')+'</div>')+'<div class="label">WORD</div>');
  const modalImg=modalImage.querySelector('img');
  if(modalImg)modalImg.addEventListener('error',function(){const fallback=document.createElement('div');fallback.style.fontSize='180px';fallback.style.lineHeight='1';fallback.textContent=w.emoji||'📖';modalImg.replaceWith(fallback)},{once:true});
  document.getElementById('fcModalWord').textContent=displayWord;
  const q=buildQuizOptions(quizWord,realMeaningIdx); const answered=quizAnswers[quizCurrentIdx];
  let posBadge = ''; if (meaning.pos) { posBadge = `<span class="pos-badge">${escapeHtml(meaning.pos)}</span>`; }
  let html='<div class="quiz-progress">'+(practiceMode?'Practice · ':'')+'Meaning '+(quizCurrentIdx+1)+' of '+quizMeanings.length+'</div>';
  html+='<div class="quiz-hint-row"><button class="quiz-hint-btn" data-action="toggle-quiz-hint">'+(quizHintShown?'🙈 Hide hint':'💡 Show hint')+'</button></div>';
  if(quizHintShown){ html+='<div class="quiz-context"><span class="hint-label">Hint · English meaning</span>'+escapeHtml(meaning.context)+'</div>'; }
  html+='<div class="quiz-question" style="display:flex;justify-content:space-between;align-items:center">Choose the correct translation: '+posBadge+'</div>';
  html+='<div class="quiz-options">';
  q.options.forEach(function(opt){
    let cls='quiz-opt'; if(answered){ if(opt===q.correct)cls+=' correct'; else if(opt===answered.selected&&!answered.correct)cls+=' wrong'; }
    html+='<button class="'+cls+'" '+(answered?'disabled':'')+' data-opt="'+escapeAttr(opt)+'" data-action="answer-quiz">'+escapeHtml(opt)+'</button>';
  });
  html+='</div>';
  if(answered){ const exClean=meaning.ex.replace(/<[^>]*>/g,''); if(answered.correct){html+='<div class="q-feedback correct" style="display:block">✓ Correct!<span class="exp">'+escapeHtml(exClean)+'</span></div>'} else{html+='<div class="q-feedback wrong" style="display:block">✗ Not quite. Correct answer: <b>'+escapeHtml(q.correct)+'</b><span class="exp">'+escapeHtml(exClean)+'</span></div>'} }
  setHtml(document.getElementById('fcRevealArea'), html); document.getElementById('fcRevealArea').classList.add('show'); document.getElementById('fcCounter').textContent=(quizCurrentIdx+1)+' / '+quizMeanings.length;
  document.querySelector('.fc-modal-actions').style.display='none';
  const tools=document.querySelector('.fc-modal-tools');
  if(tools){ setHtml(tools, '<button class="tool" data-action="quiz-speak">🔊 Listen</button>'+(familyVisible(w,teacherMode)?'<button class="tool" data-action="show-word-family">🌳 Word family</button>':'')+(teacherCanEdit?'<button class="tool" data-action="edit-flashcard-image">🖼️ Set image</button>':'')+(teacherCanEdit?'<button class="tool" data-action="undo-vocab-word" data-word="'+escapeAttr(quizWord)+'" data-meaning-index="'+realMeaningIdx+'" style="color:var(--error)">↺ Reset Word</button>':'')); }
  const nav=document.querySelector('.fc-modal-nav');if(nav)nav.style.display='';
  const navBtns=document.querySelectorAll('.fc-modal-nav button');
  if(navBtns.length>=2){ registerDelegatedClick(navBtns[0], quizPrev); registerDelegatedClick(navBtns[navBtns.length-1], quizNext); navBtns[navBtns.length-1].textContent=(quizCurrentIdx>=quizMeanings.length-1)?'Next Flashcard →':'Next →'; }
}
function undoVocabWord(word, idx) {
    if (!teacherCanEdit) return;
    if (vocabState[word] && vocabState[word].meanings) {
        vocabState[word].meanings[idx] = { perfectStreak: 0, wrongCount: 0 };
        saveVocabState();
        quizAnswers = {};
        renderQuizModal();
        renderFlashcards();
        showToast('Vocabulary word reset by teacher');
    }
}

function answerQuiz(btn){
  if(quizAnswers[quizCurrentIdx])return; const opt=btn.dataset.opt; const w=VOCAB.find(function(x){return x.en===quizWord});if(!w)return; const realMeaningIdx = quizMeanings[quizCurrentIdx].idx; const q=buildQuizOptions(quizWord,realMeaningIdx); const correct=opt===q.correct;
  quizAnswers[quizCurrentIdx]={selected:opt,correct:correct};
  if(!vocabState[quizWord]) vocabState[quizWord] = { meanings: {} }; if(!vocabState[quizWord].meanings) vocabState[quizWord].meanings = {}; if(!vocabState[quizWord].meanings[realMeaningIdx]) vocabState[quizWord].meanings[realMeaningIdx] = { perfectStreak: 0, wrongCount: 0 };
  if(correct){ vocabState[quizWord].meanings[realMeaningIdx].meaningsCorrect = 'correct'; sCorrect(); }else{ quizRoundWrongs++; sWrong(); }
  saveVocabState(); renderQuizModal(); broadcastAction('vocab_answer',quizWord+' → '+(correct?'correct':'wrong'));
}

function quizNext(){ if(!quizAnswers[quizCurrentIdx])return; const w=VOCAB.find(function(x){return x.en===quizWord});if(!w)return; if(quizCurrentIdx<quizMeanings.length-1){quizCurrentIdx++;quizHintShown=false;renderQuizModal()} else{finalizeRound()} }
function quizPrev(){if(quizCurrentIdx>0){quizCurrentIdx--;quizHintShown=false;renderQuizModal()}}
function toggleQuizHint(){quizHintShown=!quizHintShown;renderQuizModal()}

function finalizeRound(){
  if(!quizWord)return; if(quizRoundFinalized)return; quizRoundFinalized=true; const wState = vocabState[quizWord]; if(!wState || !wState.meanings) return;
  quizMeanings.forEach((mObj, i) => { const idx = mObj.idx; const answered = quizAnswers[i]; const s = wState.meanings[idx]; if(!s) return; if(answered && answered.correct) { s.perfectStreak = (s.perfectStreak || 0) + 1; if(s.perfectStreak >= 2) s.wrongCount = 0; } else { s.perfectStreak = 0; s.wrongCount = (s.wrongCount || 0) + 1; } });
  saveVocabState(); const learned=VOCAB.filter(function(x){return getWordStatus(x.en)==='learned'}).length; const key=state.currentLessonId+"_1";
  if(learned===VOCAB.length){ if(!state.done[key]){setScore(1,10);markDone(1)} } else { state.done[key] = false; setScore(1,Math.min(10,Math.floor(learned/1.5))); }
  broadcastAction('vocab_round_done',quizWord+' ('+getWordStatus(quizWord)+')');
  if(practiceMode){ practiceIdx++; if(practiceIdx<practiceQueue.length){ const nextItem = practiceQueue[practiceIdx]; setTimeout(function(){openQuizWord(nextItem.word.en, nextItem.meanings)},400); return; } setTimeout(continuePracticeQueue,400); return; }
  setTimeout(advanceToNextCard,400);
}

function advanceToNextCard(){ if(!s1VisibleList||!s1VisibleList.length){closeFCModal();return} if(s1CurrentIdx<s1VisibleList.length-1){ s1CurrentIdx++; const w = s1VisibleList[s1CurrentIdx]; openQuizWord(w.en, w.meanings.map((_, i) => i)); }else{ closeFCModal(); } }
function continuePracticeQueue(){
  const stillNeeds = [];
  VOCAB.forEach(w => { const indicesToPractice = []; w.meanings.forEach((m, idx) => { const st = getMeaningStatus(w.en, idx); if(st === 'practice' || (st === 'learning' && vocabState[w.en] && vocabState[w.en].meanings && vocabState[w.en].meanings[idx])) { indicesToPractice.push(idx); } }); if(indicesToPractice.length > 0) { stillNeeds.push({ word: w, meanings: indicesToPractice }); } });
  if(!stillNeeds.length){ showPracticeSummary(); return; }
  practiceQueue=shuffle(stillNeeds); practiceIdx=0; openQuizWord(practiceQueue[0].word.en, practiceQueue[0].meanings);
}

function showPracticeSummary(){
  const counts=getVocabCounts();
  setHtml(document.getElementById('fcModalImg'), '<div style="font-size:120px;line-height:1">🎉</div>'); document.getElementById('fcModalWord').textContent='Practice complete!';
  setHtml(document.getElementById('fcRevealArea'), '<div style="text-align:left"><p style="font-size:17px;color:var(--ink);margin-bottom:12px">🎉 All your words are now <b>Learned</b>!</p>'+ '<div style="padding:14px;background:var(--bg);border-radius:12px">'+ '<div style="padding:6px 0">📖 Learning: <b style="color:var(--accent)">'+counts.learning+'</b></div>'+ '<div style="padding:6px 0">✓ Learned: <b style="color:var(--success)">'+counts.learned+'</b></div>'+ '<div style="padding:6px 0">🔁 Need Practice: <b style="color:var(--warn)">'+counts.practice+'</b></div>'+ '</div></div>');
  document.getElementById('fcCounter').textContent='—'; const nav=document.querySelector('.fc-modal-nav');if(nav)nav.style.display='none'; const tools=document.querySelector('.fc-modal-tools');
  if(tools)setHtml(tools, '<button class="tool" data-action="restart-practice">↻ Practise again</button><button class="tool" data-action="close-flashcard-modal">← Back to Vocabulary</button>');
}
function restartPractice(){practiceMode=false;practiceQueue=[];document.getElementById('fcModal').classList.remove('open');setTimeout(function(){startPractice()},200)}
function startPractice(){
  try{
    const toPractice = [];
    VOCAB.forEach(w => { const indices = []; w.meanings.forEach((m, idx) => { const st = getMeaningStatus(w.en, idx); if(st === 'practice' || (st === 'learning' && vocabState[w.en] && vocabState[w.en].meanings && vocabState[w.en].meanings[idx])) { indices.push(idx); } }); if(indices.length > 0) toPractice.push({ word: w, meanings: indices }); });
    if(!toPractice.length){ showToast('Nothing to practise yet — open some flashcards first!'); return; }
    practiceMode=true; practiceQueue=shuffle(toPractice); practiceIdx=0; openQuizWord(practiceQueue[0].word.en, practiceQueue[0].meanings);
  }catch(err){ console.error('startPractice failed:',err); alert('Practice could not start: '+err.message); }
}
function quizSpeak(){ const w=VOCAB.find(function(x){return x.en===quizWord}); if(w){ const realMeaningIdx = quizMeanings[quizCurrentIdx].idx; const d=w.meanings[realMeaningIdx].displayEn||w.en; speak(d); } }
function fcPrev(){quizPrev()} function fcNext(){quizNext()} function fcReveal(){} function fcMarkKnow(){} function fcMarkAgain(){}

function renderStage2(){
  const main=document.getElementById('main'); if(!main)return; clearElement(main);
  const v=document.createElement('div');v.className='stage-view active';
  setHtml(v, '<div class="eyebrow">Word Match</div><h2>🔗 Drag & Drop Match</h2>'+
  '<div class="lead">Drag each English word onto its meaning.<span class="ru">Перетащите слово к его значению.</span></div>'+
  '<div class="card" style="display:flex;justify-content:space-between;align-items:center"><div style="font-size:14px;font-weight:700;color:var(--ink-soft)">Matched: <span id="s2count" style="color:var(--accent);font-size:18px">0</span> / '+MATCH_DATA.length+'</div><button class="btn ghost small" data-action="reset-stage-2">↻ Reset</button></div>'+
  '<div class="dd-area"><div><div class="dd-col-title">English Words</div><div class="dd-words" id="ddWords"></div></div><div><div class="dd-col-title">Meaning</div><div class="dd-slots" id="ddSlots"></div></div></div>');
  main.appendChild(v);main.appendChild(stageFooter(1,3));renderDD();
}
function renderDD(){
  const wEl=document.getElementById('ddWords'),sEl=document.getElementById('ddSlots');if(!wEl||!sEl)return;clearElement(wEl);clearElement(sEl);
  const words=shuffle(MATCH_DATA);const meanings=shuffle(MATCH_DATA); const matched = draftAnswers['match_correct'] || [];
  words.forEach(function(item){
    const d=document.createElement('div');d.className='dd-word';d.draggable=true;d.dataset.word=item.word;d.textContent=item.word;
    if(matched.includes(item.word)) d.classList.add('used');
    d.addEventListener('dragstart',function(e){if(d.classList.contains('used')){e.preventDefault();return}e.dataTransfer.setData('text/plain',item.word)});
    registerDelegatedClick(d, function(){if(d.classList.contains('used'))return;document.querySelectorAll('.dd-word').forEach(function(x){x.style.outline=''});d.style.outline='3px solid var(--accent)';d.style.outlineOffset='2px';window.__selDD=item.word});
    wEl.appendChild(d);
  });
  meanings.forEach(function(item){
    const s=document.createElement('div');s.className='dd-slot';s.dataset.answer=item.word;setHtml(s, '<span class="slot-label">'+escapeHtml(item.meaning)+'</span>');
    if(matched.includes(item.word)){
        s.classList.add('correct'); appendHtml(s, '<span class="dropped-word ok">'+escapeHtml(item.word)+'</span>');
        if(teacherCanEdit) {
            const rm = document.createElement('span'); setHtml(rm, ' ❌'); rm.style.cssText = 'cursor:pointer; font-size:16px; margin-left:8px; color:var(--error);';
            registerDelegatedClick(rm, e => { e.stopPropagation(); draftAnswers['match_correct'] = draftAnswers['match_correct'].filter(x => x !== item.word); debouncedSaveDraft(); renderStage(); });
            s.appendChild(rm);
        }
    }
    s.addEventListener('dragover',function(e){e.preventDefault();if(!s.classList.contains('correct'))s.classList.add('over')});
    s.addEventListener('dragleave',function(){s.classList.remove('over')});
    s.addEventListener('drop',function(e){e.preventDefault();s.classList.remove('over');tryPlace(e.dataTransfer.getData('text/plain'),s)});
    registerDelegatedClick(s,function(){if(s.classList.contains('correct'))return;if(window.__selDD){tryPlace(window.__selDD,s);window.__selDD=null;document.querySelectorAll('.dd-word').forEach(function(x){x.style.outline=''})}});
    sEl.appendChild(s);
  });
  updateDDCount(); checkDDComplete(true);
}
function tryPlace(word,slot){
  if(!word||slot.classList.contains('correct'))return;
  if(slot.dataset.answer===word){
    slot.classList.add('correct');
    setHtml(slot, '<span class="slot-label">'+slot.querySelector('.slot-label').textContent+'</span><span class="dropped-word ok">'+escapeHtml(word)+'</span>');
    document.querySelectorAll('.dd-word').forEach(function(d){if(d.dataset.word===word)d.classList.add('used')});
    draftAnswers['match_correct'] = draftAnswers['match_correct'] || [];
    if(!draftAnswers['match_correct'].includes(word)) draftAnswers['match_correct'].push(word);
    debouncedSaveDraft(); sCorrect();updateDDCount();checkDDComplete();broadcastAction('match_correct',word);
  }else{slot.classList.add('wrong');sWrong();setTimeout(function(){slot.classList.remove('wrong')},500);broadcastAction('match_wrong',word+' → '+slot.dataset.answer)}
}
function updateDDCount(){const c=document.querySelectorAll('.dd-slot.correct').length;const el=document.getElementById('s2count');if(el)el.textContent=c}
function checkDDComplete(silent){
   const c=document.querySelectorAll('.dd-slot.correct').length;
   if(c===MATCH_DATA.length){ setScore(2,15); if(!silent) markDone(2); else { state.done[state.currentLessonId+"_2"] = true; renderSidebar(); } }
   else { setScore(2,Math.floor(c*15/MATCH_DATA.length)); }
}
function resetStage2(){setScore(2,0);state.done[state.currentLessonId+"_2"]=false;draftAnswers['match_correct']=[];debouncedSaveDraft();renderSidebar();renderStage2();updateHUD()}

let s4Answers={};
function renderStage3(){
  const main=document.getElementById('main'); if(!main)return; clearElement(main);
  const v=document.createElement('div');v.className='stage-view active';
  setHtml(v, '<div class="eyebrow">Reading Comprehension</div><h2>📖 Read the Article & Answer</h2>'+
  '<div class="lead">Watch the video, read the article on the left, and highlight text to save notes. Answer every question on the right — the article stays visible so you can look back.<span class="ru">Смотрите видео, читайте текст слева, выделяйте важное, отвечайте на вопросы справа.</span></div>'+
  '<div class="reading-split">'+
    '<section class="reading-pane">'+
      '<div class="card" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px">'+
        '<button class="btn small" id="ttsPlay" data-action="speak-passage">▶️ Listen</button>'+
        '<button class="btn small" id="ttsPause" style="display:none" data-action="pause-tts">⏸ Pause</button>'+
        '<button class="btn small" id="ttsResume" style="display:none" data-action="resume-tts">▶️ Resume</button>'+
        '<button class="btn ghost small" id="ttsStop" style="display:none" data-action="stop-tts">⏹ Stop</button>'+
      '</div>'+
      '<div class="passage" id="passageBody">'+READING_HTML+'</div>'+
    '</section>'+
    '<section class="reading-questions">'+
      '<div class="card" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'+
        '<div style="font-weight:700">Answered: <span id="s3Progress" style="color:var(--accent);font-size:18px">0</span> / <span id="s3Total">'+(READING_Q.length+CONTEXT_Q.length)+'</span></div>'+
      '</div>'+
      '<h3 style="font-family:\'Fira Code\',monospace;font-size:13px;letter-spacing:1.5px;color:var(--ink-soft);text-transform:uppercase;margin:10px 0 12px">Part A — Reading comprehension</h3>'+
      '<div id="readingQ"></div>'+
      '<h3 style="font-family:\'Fira Code\',monospace;font-size:13px;letter-spacing:1.5px;color:var(--ink-soft);text-transform:uppercase;margin:26px 0 12px">Part B — Vocabulary in context</h3>'+
      '<div id="contextQ"></div>'+
    '</section>'+
  '</div>');
  main.appendChild(v);main.appendChild(stageFooter(2,4,'<button class="btn success" data-action="complete-reading">✓ Mark reading stage complete</button>'));
  
  s4Answers={};
  READING_Q.forEach(function(_,i){ if(draftAnswers['r'+i+'_ok'] === true) s4Answers['r'+i]=true; });
  CONTEXT_Q.forEach(function(_,i){ if(draftAnswers['c'+i+'_ok'] === true) s4Answers['c'+i]=true; });
  
  renderReadingQuestions(); renderContextQ(); updateS3Progress(); checkS4(true); appendReadingTasks(); 
  
  if(fbConnected && sessionRef) {
     sessionRef.child('annotations/'+state.currentLessonId).once('value').then(snap => {
         if(snap.exists()) {
             const savedHtml = snap.val();
             const currentTitleMatch = READING_HTML.match(/<h1>(.*?)<\/h1>/);
             const currentTitle = currentTitleMatch ? currentTitleMatch[1].trim() : '';
             
             if (currentTitle && savedHtml.includes(currentTitle)) {
                 setHtml(document.getElementById('passageBody'), savedHtml);
                 document.querySelectorAll('.user-note').forEach((note, i) => { if(!note.dataset.id) note.dataset.id = 'legacy_' + Date.now() + '_' + i; });
             } else {
                 sessionRef.child('annotations/'+state.currentLessonId).remove();
             }
         }
     });
  }
}

function updateS3Progress(){const el=document.getElementById('s3Progress');if(el)el.textContent=Object.keys(s4Answers).length}

function renderReadingQuestions(){
  const body=document.getElementById('readingQ');if(!body)return;clearElement(body);
  READING_Q.forEach(function(item,i){
    const card=document.createElement('div');card.className='q-card';
    const typeLabel={short:'Short answer',tfng:'True / False / Not Given',long:'Long answer',mcq:'Multiple choice'}[item.type];
    const ruHtml = item.ru ? '<span class="ru-prompt">'+escapeHtml(item.ru)+'</span>' : '';
    setHtml(card, '<div class="q-num">Question '+(i+1)+' <span class="q-type">'+typeLabel+'</span></div><div class="q-prompt">'+escapeHtml(item.prompt)+ruHtml+'</div>');
    
    if(item.type==='short'){
      const row=document.createElement('div');row.className='q-input-row';
      const inp=document.createElement('input');inp.type='text';inp.className='q-input';inp.placeholder='Type your answer...';
      const val = draftAnswers['r'+i+'_draft'] || ''; const isOk = draftAnswers['r'+i+'_ok'] === true; if(val) inp.value = val;
      const btn=document.createElement('button');btn.className='btn';btn.textContent='✓ Check'; const fb=document.createElement('div');fb.className='q-feedback';
      let done=isOk; let flagAdded=false;
      
      if(isOk){
        inp.classList.add('correct');inp.disabled=true;btn.disabled=true;
        fb.className='q-feedback correct';setHtml(fb, '✓ Correct!<span class="exp">'+escapeHtml(item.exp)+'</span>');
      }

      function submit(){
        if(done)return; const ok=isAnswerCorrect(inp.value, item.answers, { mode: "fuzzy" });
        if(ok){
          inp.classList.add('correct');inp.disabled=true;btn.disabled=true;done=true;
          fb.className='q-feedback correct';setHtml(fb, '✓ Correct!<span class="exp">'+escapeHtml(item.exp)+'</span>');
          sCorrect();s4Answers['r'+i]=true;checkS4();
          draftAnswers['r'+i+'_draft'] = inp.value; draftAnswers['r'+i+'_ok'] = true; debouncedSaveDraft();
          if (teacherCanEdit) {
             const rst = document.createElement('button'); rst.className='btn small danger'; rst.textContent='↺ Undo'; rst.style.marginTop='10px';
             registerDelegatedClick(rst, () => undoQuestion('r', i)); card.appendChild(rst);
          }
        } else {
          inp.classList.add('wrong');sWrong(); fb.className='q-feedback wrong';setHtml(fb, '✗ Not quite. Try again — check the passage.');
          setTimeout(function(){inp.classList.remove('wrong')},600); draftAnswers['r'+i+'_draft'] = inp.value; debouncedSaveDraft();
          if(!flagAdded) { card.appendChild(buildFlagRow('r'+i,item.prompt,inp.value,'wrong')); flagAdded = true; }
        }
      }
      registerDelegatedClick(btn, submit); inp.addEventListener('keydown',function(e){if(e.key==='Enter')submit()});
      inp.addEventListener('input', function() { draftAnswers['r'+i+'_draft'] = inp.value; debouncedSaveDraft(); });
      row.appendChild(inp);row.appendChild(btn);card.appendChild(row);card.appendChild(fb);
      
      if (isOk && teacherCanEdit) {
         const rst = document.createElement('button'); rst.className='btn small danger'; rst.textContent='↺ Undo'; rst.style.marginTop='10px';
         registerDelegatedClick(rst, () => undoQuestion('r', i)); card.appendChild(rst);
      }
    }else if(item.type==='tfng'){
      const opts=document.createElement('div');opts.className='tfng-opts'; const chosen = draftAnswers['r'+i+'_draft']; const isOk = draftAnswers['r'+i+'_ok'] === true; let flagAdded = false;
      shuffle(['True','False','Not Given']).forEach(function(o){
        const b=document.createElement('button');b.className='q-opt';b.textContent=o;
        if(chosen){ b.disabled=true; if(o===item.answer)b.classList.add('correct'); if(o===chosen && o!==item.answer)b.classList.add('wrong'); } 
        else {
          registerDelegatedClick(b, function(){
            if(b.disabled)return; draftAnswers['r'+i+'_draft'] = o; draftAnswers['r'+i+'_ok'] = (o === item.answer); debouncedSaveDraft();
            opts.querySelectorAll('button').forEach(function(x){x.disabled=true}); const fb=card.querySelector('.q-feedback');
            if(o===item.answer){b.classList.add('correct');sCorrect();fb.className='q-feedback correct';setHtml(fb, '✓ Correct!<span class="exp">'+escapeHtml(item.exp)+'</span>');s4Answers['r'+i]=true}
            else{b.classList.add('wrong');opts.querySelectorAll('button').forEach(function(x){if(x.textContent===item.answer)x.classList.add('correct')});sWrong();fb.className='q-feedback wrong';setHtml(fb, '✗ Not quite.<span class="exp">'+escapeHtml(item.exp)+'</span>')}
            checkS4();
            if (teacherCanEdit) {
               const rst = document.createElement('button'); rst.className='btn small danger'; rst.textContent='↺ Undo'; rst.style.marginTop='10px';
               registerDelegatedClick(rst, () => undoQuestion('r', i)); card.appendChild(rst);
            }
          });
        }
        opts.appendChild(b);
      });
      card.appendChild(opts); const fb=document.createElement('div');fb.className='q-feedback';
      if(chosen){ if(isOk){fb.className='q-feedback correct';setHtml(fb, '✓ Correct!<span class="exp">'+escapeHtml(item.exp)+'</span>')} else{fb.className='q-feedback wrong';setHtml(fb, '✗ Not quite.<span class="exp">'+escapeHtml(item.exp)+'</span>')} }
      card.appendChild(fb);
      if (isOk && teacherCanEdit) { const rst = document.createElement('button'); rst.className='btn small danger'; rst.textContent='↺ Undo'; rst.style.marginTop='10px'; registerDelegatedClick(rst, () => undoQuestion('r', i)); card.appendChild(rst); }
    }else if(item.type==='long'){
      const ta=document.createElement('textarea');ta.className='q-textarea';ta.placeholder='Write your answer in full sentences...'; const val = draftAnswers['r'+i+'_draft'] || ''; const isOk = draftAnswers['r'+i+'_ok'] === true; if(val) ta.value = val;
      const row=document.createElement('div');row.className='q-input-row';row.style.marginTop='10px'; const btn=document.createElement('button');btn.className='btn';btn.textContent='✓ Check my answer'; const fb=document.createElement('div');fb.className='q-feedback'; let done=isOk; let flagAdded=false;
      if(isOk){ ta.classList.add('correct');ta.disabled=true;btn.disabled=true; const res=checkLongAnswer(ta.value,item.keywordGroups,item.minWords,item.minGroups); fb.className='q-feedback correct';setHtml(fb, '✓ Looks correct! You matched '+res.matched+' key ideas.<span class="exp">'+escapeHtml(item.exp)+'</span>'); }
      function submit(){
        if(done)return; const txt=ta.value.trim(); const res=checkLongAnswer(txt,item.keywordGroups,item.minWords,item.minGroups);
        if(res.pass){
            ta.classList.add('correct');ta.disabled=true;btn.disabled=true;done=true; fb.className='q-feedback correct';setHtml(fb, '✓ Looks correct! You matched '+res.matched+' key ideas.<span class="exp">'+escapeHtml(item.exp)+'</span>'); sCorrect();s4Answers['r'+i]=true;checkS4(); draftAnswers['r'+i+'_draft'] = txt; draftAnswers['r'+i+'_ok'] = true; debouncedSaveDraft();
            if (teacherCanEdit) { const rst = document.createElement('button'); rst.className='btn small danger'; rst.textContent='↺ Undo'; rst.style.marginTop='10px'; registerDelegatedClick(rst, () => undoQuestion('r', i)); card.appendChild(rst); }
        } else { ta.classList.add('wrong');sWrong();fb.className='q-feedback wrong';setHtml(fb, '✗ '+res.reason+'<span class="sample"><b>Sample answer:</b> '+escapeHtml(item.sample)+'</span>'); draftAnswers['r'+i+'_draft'] = txt; debouncedSaveDraft(); }
        if(!flagAdded) { insertHtmlAfter(ta, buildFlagRow('s3_r'+i,item.prompt,txt,res.pass?'correct':'wrong')); flagAdded = true; }
      }
      registerDelegatedClick(btn, submit); ta.addEventListener('input', function() { draftAnswers['r'+i+'_draft'] = ta.value; debouncedSaveDraft(); });
      row.appendChild(btn);card.appendChild(ta);card.appendChild(row);card.appendChild(fb);
      if (isOk && teacherCanEdit) { const rst = document.createElement('button'); rst.className='btn small danger'; rst.textContent='↺ Undo'; rst.style.marginTop='10px'; registerDelegatedClick(rst, () => undoQuestion('r', i)); card.appendChild(rst); }
    }else if(item.type==='mcq'){
      const opts=document.createElement('div');opts.className='q-opts'; const chosen = draftAnswers['r'+i+'_draft']; const isOk = draftAnswers['r'+i+'_ok'] === true;
      shuffle(item.options).forEach(function(o){
        const b=document.createElement('button');b.className='q-opt';b.textContent=o;
        if(chosen){ b.disabled=true; if(o===item.correct)b.classList.add('correct'); if(o===chosen && o!==item.correct)b.classList.add('wrong'); } 
        else {
          registerDelegatedClick(b, function(){
            if(b.disabled)return; draftAnswers['r'+i+'_draft'] = o; draftAnswers['r'+i+'_ok'] = (o === item.correct); debouncedSaveDraft();
            opts.querySelectorAll('button').forEach(function(x){x.disabled=true}); const fb=card.querySelector('.q-feedback');
            if(o===item.correct){b.classList.add('correct');sCorrect();fb.className='q-feedback correct';setHtml(fb, '✓ Correct!<span class="exp">'+escapeHtml(item.exp)+'</span>');s4Answers['r'+i]=true}
            else{b.classList.add('wrong');opts.querySelectorAll('button').forEach(function(x){if(x.textContent===item.correct)x.classList.add('correct')});sWrong();fb.className='q-feedback wrong';setHtml(fb, '✗ Not quite.<span class="exp">'+escapeHtml(item.exp)+'</span>')}
            checkS4();
            if (teacherCanEdit) { const rst = document.createElement('button'); rst.className='btn small danger'; rst.textContent='↺ Undo'; rst.style.marginTop='10px'; registerDelegatedClick(rst, () => undoQuestion('r', i)); card.appendChild(rst); }
          });
        }
        opts.appendChild(b);
      });
      card.appendChild(opts); const fb=document.createElement('div');fb.className='q-feedback';
      if(chosen){ if(isOk){fb.className='q-feedback correct';setHtml(fb, '✓ Correct!<span class="exp">'+escapeHtml(item.exp)+'</span>')} else{fb.className='q-feedback wrong';setHtml(fb, '✗ Not quite.<span class="exp">'+escapeHtml(item.exp)+'</span>')} }
      card.appendChild(fb);
      if (isOk && teacherCanEdit) { const rst = document.createElement('button'); rst.className='btn small danger'; rst.textContent='↺ Undo'; rst.style.marginTop='10px'; registerDelegatedClick(rst, () => undoQuestion('r', i)); card.appendChild(rst); }
    }
    body.appendChild(card);
  });
}

function renderContextQ(){
  const body=document.getElementById('contextQ');if(!body)return;clearElement(body);
  CONTEXT_Q.forEach(function(item,i){
    const card=document.createElement('div');card.className='q-card'; const ruHtml = item.ru ? '<span class="ru-prompt">'+escapeHtml(item.ru)+'</span>' : '';
    setHtml(card, '<div class="q-num">Context '+(i+1)+'</div><div class="q-prompt">'+escapeHtml(item.prompt)+ruHtml+'</div>');
    const opts=document.createElement('div');opts.className='q-opts'; const chosen = draftAnswers['c'+i+'_draft']; const isOk = draftAnswers['c'+i+'_ok'] === true;
    
    shuffle(item.options).forEach(function(o){
      const b=document.createElement('button');b.className='q-opt';b.textContent=o;
      if(chosen){ b.disabled=true; if(o===item.correct)b.classList.add('correct'); if(o===chosen && o!==item.correct)b.classList.add('wrong'); } 
      else {
        registerDelegatedClick(b, function(){
          if(b.disabled)return; draftAnswers['c'+i+'_draft'] = o; draftAnswers['c'+i+'_ok'] = (o === item.correct); debouncedSaveDraft();
          opts.querySelectorAll('button').forEach(function(x){x.disabled=true}); const fb=card.querySelector('.q-feedback');
          if(o===item.correct){b.classList.add('correct');sCorrect();fb.className='q-feedback correct';setHtml(fb, '✓ Correct!<span class="exp">'+escapeHtml(item.exp)+'</span>');s4Answers['c'+i]=true}
          else{b.classList.add('wrong');opts.querySelectorAll('button').forEach(function(x){if(x.textContent===item.correct)x.classList.add('correct')});sWrong();fb.className='q-feedback wrong';setHtml(fb, '✗ Not quite.<span class="exp">'+escapeHtml(item.exp)+'</span>')}
          checkS4();
          if (teacherCanEdit) { const rst = document.createElement('button'); rst.className='btn small danger'; rst.textContent='↺ Undo'; rst.style.marginTop='10px'; registerDelegatedClick(rst, () => undoQuestion('c', i)); card.appendChild(rst); }
        });
      }
      opts.appendChild(b);
    });
    card.appendChild(opts); const fb=document.createElement('div');fb.className='q-feedback';
    if(chosen){ if(isOk){fb.className='q-feedback correct';setHtml(fb, '✓ Correct!<span class="exp">'+escapeHtml(item.exp)+'</span>')} else{fb.className='q-feedback wrong';setHtml(fb, '✗ Not quite.<span class="exp">'+escapeHtml(item.exp)+'</span>')} }
    card.appendChild(fb);
    if (isOk && teacherCanEdit) { const rst = document.createElement('button'); rst.className='btn small danger'; rst.textContent='↺ Undo'; rst.style.marginTop='10px'; registerDelegatedClick(rst, () => undoQuestion('c', i)); card.appendChild(rst); }
    body.appendChild(card);
  });
}

function buildFlagRow(qId,prompt,answer,autoResult){ return '<div class="review-btn-row"><button class="btn flag small" data-action="flag-for-review" data-review-id="'+escapeAttr('s3_'+qId)+'" data-review-prompt="'+escapeAttr(String(prompt).substring(0,120))+'" data-review-answer="'+escapeAttr(String(answer).substring(0,300))+'" data-review-result="'+escapeAttr(autoResult)+'" data-stage="3">🚩 Flag for teacher review</button><span class="hint">If you believe your answer is correct, click here.</span></div>'; }
function checkLongAnswer(text,keywordGroups,minWords,minGroups){ const t=norm(text); const words=t.split(/\s+/).filter(function(w){return w.length>0}); if(words.length<minWords)return{pass:false,reason:'Your answer is too short. Aim for at least '+minWords+' words.',matched:0}; let matched=0; keywordGroups.forEach(function(g){if(g.some(function(k){return t.indexOf(norm(k))!==-1}))matched++}); if(matched>=minGroups)return{pass:true,matched:matched,total:keywordGroups.length}; return{pass:false,reason:'You matched '+matched+' of '+keywordGroups.length+' key ideas. Check the passage again and try to include more.',matched:matched}; }
function checkS4(silent){ const total=READING_Q.length+CONTEXT_Q.length; const c=Object.keys(s4Answers).length; updateS3Progress(); if(c===total){ setScore(3,25); if(!silent) markDone(3); else { state.done[state.currentLessonId+"_3"] = true; renderSidebar(); } }else{ setScore(3,Math.floor(c*25/total)); } }
function completeReading(){const key=state.currentLessonId+"_3";if(!state.done[key]){state.done[key]=true;renderSidebar();saveState();broadcastAction('stage_done','Reading complete')}goToStage(4)}

function renderCompletingSentence(data,stageId,prevId,nextId,title,eyebrow,formula,listHTML,lead,host){
  const main=document.getElementById('main');if(!main)return; if(!host)clearElement(main);
  data={pos:data&&data.pos||[],neg:data&&data.neg||[],q:data&&data.q||[],shuffled:data&&data.shuffled||[]};
  const v=document.createElement('div');v.className=host?'exercise-block':'stage-view active';
  setHtml(v, (host?'':'<div class="eyebrow">'+eyebrow+'</div><h2>'+title+'</h2>'+
  '<div class="g-box"><h3>Reminder</h3><div class="g-formula">'+formula+'</div><ul>'+listHTML+'</ul></div>'+
  '<div class="lead">'+lead+'</div>')+
  '<div class="card" style="display:flex;justify-content:space-between;align-items:center"><div style="font-weight:700;color:var(--ink-soft)">Score: <span id="p'+stageId+'live" style="color:var(--accent);font-size:18px">0</span> / '+(data.pos.length+data.neg.length+data.q.length+data.shuffled.length)+'</div><button class="btn ghost small" data-action="reset-grammar-stage" data-stage="'+stageId+'">↻ Reset</button></div>'+
  '<div id="p'+stageId+'body"></div>');
  (host||main).appendChild(v); if(!host)main.appendChild(stageFooter(prevId,nextId));
  let score=0;const body=document.getElementById('p'+stageId+'body');
  
  function addSection(heading,items,startNum){
    if(heading){const h=document.createElement('div');h.className='section-head';h.textContent=heading;body.appendChild(h)}
    items.forEach(function(item,i){
      const card=document.createElement('div');card.className='q-card'; const idx = startNum + i;
      const draftKey = 'g'+stageId+'_'+idx+'_draft'; const okKey = 'g'+stageId+'_'+idx+'_ok'; const isOk = draftAnswers[okKey] === true;
      setHtml(card, '<div class="q-num">Question '+idx+'</div><div class="q-prompt">'+escapeHtml(item.p).replace('___','<b style="color:var(--accent)">___</b>')+'</div>');
      const row=document.createElement('div');row.className='q-input-row'; const inp=document.createElement('input');inp.type='text';inp.className='q-input';inp.placeholder='Type the missing word(s)...';inp.autocomplete='off';inp.spellcheck=false; if(draftAnswers[draftKey]) inp.value = draftAnswers[draftKey];
      const btn=document.createElement('button');btn.className='btn';btn.textContent='✓ Check'; const fb=document.createElement('div');fb.className='q-feedback'; let answered=isOk;
      if(isOk){ inp.classList.add('correct');inp.disabled=true;btn.disabled=true; fb.className='q-feedback correct';setHtml(fb, '✓ Correct!'+(item.ex?'<span class="exp">'+sanitizeRichHtml(item.ex)+'</span>':'')); score++; }
      
      function submit(){
        if(answered)return; const ok = isAnswerCorrect(inp.value, [item.a]);
        if(ok){
          inp.classList.add('correct');inp.disabled=true;btn.disabled=true;answered=true; fb.className='q-feedback correct';setHtml(fb, '✓ Correct!'+(item.ex?'<span class="exp">'+sanitizeRichHtml(item.ex)+'</span>':''));
          sCorrect();score++;document.getElementById('p'+stageId+'live').textContent=score; const total=data.pos.length+data.neg.length+data.q.length+data.shuffled.length; setScore(stageId,Math.floor(score*10/total)); if(score===total){setScore(stageId,10);markDone(stageId)}
          broadcastAction('answer_correct',item.p.substring(0,40)+' → '+item.a); draftAnswers[draftKey] = inp.value; draftAnswers[okKey] = true; debouncedSaveDraft();
          if (teacherCanEdit) { const rst = document.createElement('button'); rst.className='btn small danger'; rst.textContent='↺ Undo'; rst.style.marginTop='10px'; registerDelegatedClick(rst, () => undoQuestion('g'+stageId+'_', idx)); card.appendChild(rst); }
        }else{
          inp.classList.add('wrong');sWrong(); fb.className='q-feedback wrong';setHtml(fb, '✗ Not quite. Try again!'); setTimeout(function(){inp.classList.remove('wrong')},600); draftAnswers[draftKey] = inp.value; debouncedSaveDraft();
        }
      }
      registerDelegatedClick(btn, submit); inp.addEventListener('keydown',function(e){if(e.key==='Enter')submit()});
      inp.addEventListener('input', function() { draftAnswers[draftKey] = inp.value; debouncedSaveDraft(); });
      row.appendChild(inp);row.appendChild(btn); card.appendChild(row);card.appendChild(fb);
      if (isOk && teacherCanEdit) { const rst = document.createElement('button'); rst.className='btn small danger'; rst.textContent='↺ Undo'; rst.style.marginTop='10px'; registerDelegatedClick(rst, () => undoQuestion('g'+stageId+'_', idx)); card.appendChild(rst); }
      body.appendChild(card);
    });
  }
  addSection('Part 1 — Positive sentences',data.pos,1);
  addSection('Part 2 — Negative sentences',data.neg,data.pos.length+1);
  addSection('Part 3 — Questions',data.q,data.pos.length+data.neg.length+1);
  addSection('Part 4 — Mixed practice (shuffled)',shuffle(data.shuffled),data.pos.length+data.neg.length+data.q.length+1);
  
  document.getElementById('p'+stageId+'live').textContent = score; const total = data.pos.length+data.neg.length+data.q.length+data.shuffled.length;
  if(score === total && total > 0){ setScore(stageId, 10); state.done[state.currentLessonId+"_"+stageId] = true; renderSidebar(); } else { setScore(stageId, Math.floor(score*10/total)); }
}
function resetGrammarStage(id){
  setScore(id,0);state.done[state.currentLessonId+"_"+id]=false;
  Object.keys(draftAnswers).forEach(k=>{ if(k.startsWith('g'+id+'_') || k.startsWith('sb'+id+'_')) delete draftAnswers[k]; });
  debouncedSaveDraft(); renderSidebar();renderStage();updateHUD();
}
const SB_STATE={}; const SB_DATA={};
function renderSentenceBuilder(data,stageId,prevId,nextId,title,eyebrow,formula,listHTML,lead,host){
  const main=document.getElementById('main');if(!main)return; if(!host)clearElement(main);
  data={pos:data&&data.pos||[],neg:data&&data.neg||[],q:data&&data.q||[],shuffled:data&&data.shuffled||[]};
  const v=document.createElement('div');v.className=host?'exercise-block':'stage-view active';
  setHtml(v, (host?'':'<div class="eyebrow">'+eyebrow+'</div><h2>'+title+'</h2>'+
  '<div class="g-box"><h3>Reminder</h3><div class="g-formula">'+formula+'</div><ul>'+listHTML+'</ul></div>'+
  '<div class="lead">'+lead+'</div>')+
  '<div class="card" style="display:flex;justify-content:space-between;align-items:center"><div style="font-weight:700;color:var(--ink-soft);">Score: <span id="sb'+stageId+'live" style="color:var(--accent);font-size:18px">0</span> / '+(data.pos.length+data.neg.length+data.q.length+data.shuffled.length)+'</div><button class="btn ghost small" data-action="reset-grammar-stage" data-stage="'+stageId+'">↻ Reset</button></div>'+
  '<div id="sb'+stageId+'body"></div>');
  (host||main).appendChild(v); if(!host)main.appendChild(stageFooter(prevId,nextId));
  const body=document.getElementById('sb'+stageId+'body'); const total=data.pos.length+data.neg.length+data.q.length+data.shuffled.length; SB_DATA[stageId]={pos:data.pos,neg:data.neg,q:data.q,shuffled:data.shuffled};
  let score = 0;
  
  function addSection(heading,items,startNum){
    if(heading){const h=document.createElement('div');h.className='section-head';h.textContent=heading;body.appendChild(h)}
    items.forEach(function(item,i){
      const card=document.createElement('div');card.className='q-card'; const idx=startNum+i; const draftKey = 'sb'+stageId+'_'+idx+'_draft'; const okKey = 'sb'+stageId+'_'+idx+'_ok'; const isOk = draftAnswers[okKey] === true;
      setHtml(card, '<div class="q-num">Question '+idx+'</div><div class="q-prompt" style="font-size:19px; line-height:1.6;">'+item.prompt+'</div>'+
      '<div class="sb-chips" id="sbChips'+stageId+'_'+idx+'"></div>'+
      '<div class="sb-area" id="sbArea'+stageId+'_'+idx+'"><span class="placeholder">Click the words below...</span></div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn small" id="sbCheck_'+stageId+'_'+idx+'" data-action="check-sentence-builder-item" data-stage="'+stageId+'" data-question-index="'+idx+'">✓ Check</button><button class="btn ghost small" id="sbReset_'+stageId+'_'+idx+'" data-action="reset-sentence-builder-item" data-stage="'+stageId+'" data-question-index="'+idx+'">↻ Reset</button></div>'+
      '<div class="q-feedback" id="sbFb'+stageId+'_'+idx+'"></div>');
      body.appendChild(card);
      const chipsEl=document.getElementById('sbChips'+stageId+'_'+idx); const scrambled=shuffle(item.correct.map(function(w,ii){return{w:w,i:ii}})); const draftOrder = draftAnswers[draftKey] || []; 
      
      scrambled.forEach(function(entry){ const chip=document.createElement('div');chip.className='sb-chip';chip.textContent=entry.w;chip.dataset.origIndex=entry.i; registerDelegatedClick(chip, function(){moveChip(stageId,idx,chip,entry.w,entry.i)}); chipsEl.appendChild(chip); });
      SB_STATE[stageId+'_'+idx]=[];
      
      if (draftOrder.length > 0) {
         const area = document.getElementById('sbArea'+stageId+'_'+idx); if(area.querySelector('.placeholder')) area.querySelector('.placeholder').remove(); area.classList.add('filled');
         draftOrder.forEach(origIdx => {
             const chipToMove = chipsEl.querySelector('.sb-chip[data-orig-index="'+origIdx+'"]');
             if (chipToMove) {
                 chipToMove.remove(); const newChip = document.createElement('div'); newChip.className = 'sb-chip'; newChip.textContent = item.correct[origIdx]; newChip.dataset.origIndex = origIdx;
                 registerDelegatedClick(newChip, function() {
                     if(isOk) return; newChip.remove(); const back = document.createElement('div'); back.className = 'sb-chip'; back.textContent = item.correct[origIdx]; back.dataset.origIndex = origIdx;
                     registerDelegatedClick(back, function() { moveChip(stageId, idx, back, item.correct[origIdx], origIdx); }); chipsEl.appendChild(back);
                     SB_STATE[stageId+'_'+idx] = (SB_STATE[stageId+'_'+idx] || []).filter(x => x !== origIdx); draftAnswers[draftKey] = SB_STATE[stageId+'_'+idx]; debouncedSaveDraft();
                     if (!area.querySelector('.sb-chip')) { setHtml(area, '<span class="placeholder">Click the words below...</span>'); area.classList.remove('filled'); }
                 });
                 area.appendChild(newChip); SB_STATE[stageId+'_'+idx].push(origIdx);
             }
         });
         if(isOk){ window['sbDone_'+stageId+'_'+idx] = true; score++; const fb=document.getElementById('sbFb'+stageId+'_'+idx); fb.className='q-feedback correct';setHtml(fb, '✓ Correct!'); document.getElementById('sbCheck_'+stageId+'_'+idx).disabled = true; }
      }
      if (isOk && teacherCanEdit) { const rst = document.createElement('button'); rst.className='btn small danger'; rst.textContent='↺ Undo'; rst.style.marginTop='10px'; registerDelegatedClick(rst, () => undoQuestion('sb'+stageId+'_', idx)); card.appendChild(rst); }
    });
  }
  addSection('Part 1 — Positive sentences',data.pos,1);
  addSection('Part 2 — Negative sentences',data.neg,data.pos.length+1);
  addSection('Part 3 — Questions',data.q,data.pos.length+data.neg.length+1);
  addSection('Part 4 — Mixed practice (shuffled)',shuffle(data.shuffled),data.pos.length+data.neg.length+data.q.length+1);
  
  document.getElementById('sb'+stageId+'live').textContent = score;
  if(score === total && total > 0){ setScore(stageId, 10); state.done[state.currentLessonId+"_"+stageId] = true; renderSidebar(); } else { setScore(stageId, Math.floor(score*10/total)); }
}
function moveChip(stageId,idx,chip,word,origIdx){
  const area=document.getElementById('sbArea'+stageId+'_'+idx);if(!area)return; const ph=area.querySelector('.placeholder');if(ph)ph.remove();
  const newChip=document.createElement('div');newChip.className='sb-chip';newChip.textContent=word;newChip.dataset.origIndex=origIdx;
  registerDelegatedClick(newChip,function(){
    newChip.remove(); const chipsEl=document.getElementById('sbChips'+stageId+'_'+idx); const back=document.createElement('div');back.className='sb-chip';back.textContent=word;back.dataset.origIndex=origIdx;
    registerDelegatedClick(back,function(){moveChip(stageId,idx,back,word,origIdx)}); chipsEl.appendChild(back);
    SB_STATE[stageId+'_'+idx]=(SB_STATE[stageId+'_'+idx]||[]).filter(function(x){return x!==origIdx}); draftAnswers['sb'+stageId+'_'+idx+'_draft'] = SB_STATE[stageId+'_'+idx]; debouncedSaveDraft();
    if(!area.querySelector('.sb-chip')){setHtml(area, '<span class="placeholder">Click the words below...</span>');area.classList.remove('filled')}
  });
  area.appendChild(newChip);area.classList.add('filled');chip.remove();sPop();
  if(!SB_STATE[stageId+'_'+idx])SB_STATE[stageId+'_'+idx]=[]; SB_STATE[stageId+'_'+idx].push(origIdx);
  draftAnswers['sb'+stageId+'_'+idx+'_draft'] = SB_STATE[stageId+'_'+idx]; debouncedSaveDraft();
}
function resetSBItem(stageId,idx){
  const area=document.getElementById('sbArea'+stageId+'_'+idx);const chipsEl=document.getElementById('sbChips'+stageId+'_'+idx); if(!area||!chipsEl)return;
  area.querySelectorAll('.sb-chip').forEach(function(ch){ const back=document.createElement('div');back.className='sb-chip';back.textContent=ch.textContent;back.dataset.origIndex=ch.dataset.origIndex; registerDelegatedClick(back,function(){moveChip(stageId,idx,back,ch.textContent,Number(ch.dataset.origIndex))}); chipsEl.appendChild(back); });
  setHtml(area, '<span class="placeholder">Click the words below...</span>'); area.classList.remove('filled'); SB_STATE[stageId+'_'+idx]=[];
  draftAnswers['sb'+stageId+'_'+idx+'_draft'] = []; delete draftAnswers['sb'+stageId+'_'+idx+'_ok']; debouncedSaveDraft();
  const fb=document.getElementById('sbFb'+stageId+'_'+idx);if(fb)fb.className='q-feedback'; document.getElementById('sbCheck_'+stageId+'_'+idx).disabled = false;
}
function checkSBItem(stageId,idx){
  const area=document.getElementById('sbArea'+stageId+'_'+idx);if(!area)return; const userOrder=Array.from(area.querySelectorAll('.sb-chip')).map(function(c){return Number(c.dataset.origIndex)}); const fb=document.getElementById('sbFb'+stageId+'_'+idx); const expected=Array.from({length:userOrder.length},function(_,i){return i});
  if(userOrder.length!==expected.length){fb.className='q-feedback wrong';setHtml(fb, 'Use all the words.');sWrong();return}
  const ok=userOrder.every(function(v,i){return v===i});
  if(ok){
    fb.className='q-feedback correct';setHtml(fb, '✓ Correct!');sCorrect(); draftAnswers['sb'+stageId+'_'+idx+'_ok'] = true; debouncedSaveDraft(); document.getElementById('sbCheck_'+stageId+'_'+idx).disabled = true;
    if(!window['sbDone_'+stageId+'_'+idx]){ window['sbDone_'+stageId+'_'+idx]=true; const el=document.getElementById('sb'+stageId+'live'); let cur=Number(el.textContent)||0;cur++;el.textContent=cur; const tot=(SB_DATA[stageId].pos.length+SB_DATA[stageId].neg.length+SB_DATA[stageId].q.length+SB_DATA[stageId].shuffled.length); setScore(stageId,Math.floor(cur*10/tot)); if(cur===tot){setScore(stageId,10);markDone(stageId)} }
  }else{fb.className='q-feedback wrong';setHtml(fb, '✗ Not quite. Check the word order.');sWrong()}
}
// A grammar section: the topic's rule once, then each of its exercises (complete the sentences, build the sentences).
// Each exercise scores on its own id (section id × 10 + its position), up to 10 points.
function renderGrammarSection(section){
  const main=document.getElementById('main');if(!main)return; clearElement(main);
  const topic=section.topic||{}; const rule=topic.rule||{};
  const v=document.createElement('div');v.className='stage-view active grammar-section';
  const points=(Array.isArray(rule.points)?rule.points:[]).map(function(point){return '<li>'+sanitizeRichHtml(point)+'</li>'}).join('');
  setHtml(v,'<div class="eyebrow">'+escapeHtml(section.shortLabel||'Grammar')+'</div><h2>'+escapeHtml(topic.title||section.label)+'</h2>'+
    '<div class="g-box"><h3>Rule</h3><div class="g-formula">'+escapeHtml(rule.formula||'')+'</div>'+(points?'<ul>'+points+'</ul>':'')+'</div>'+
    (topic.lead?'<div class="lead">'+escapeHtml(topic.lead)+'</div>':''));
  main.appendChild(v);
  section.exercises.forEach(function(exercise,index){
    const block=document.createElement('section'); block.className='grammar-exercise';
    const heading=document.createElement('h3'); heading.className='grammar-exercise__title';
    heading.textContent=(section.exercises.length>1?(index+1)+'. ':'')+(exercise.kind==='build'?'Build the sentences':'Complete the sentences');
    block.appendChild(heading); v.appendChild(block);
    const data=LESSON_CONTENT[exercise.key];
    if(exercise.kind==='build')renderSentenceBuilder(data,exercise.scoreId,null,null,'','','','','',block);
    else renderCompletingSentence(data,exercise.scoreId,null,null,'','','','','',block);
  });
  main.appendChild(stageFooter());
}

// Games and Listening Training run the practice and listening pages inside the lesson (?embed=1). In a teacher preview they
// open read-only. A finished game or round tells the lesson (postMessage, same site only), which marks the section done.
const EMBED_PAGES={
  games:{page:'practice.html',eyebrow:'Games',lead:'Short games built from this lesson. Finish any game to complete this section.'},
  listening:{page:'listening.html',eyebrow:'Listening Training',lead:'Listen to each sentence and type the missing words. Finish a round to complete this section.'}
};
function renderEmbeddedSection(section){
  const main=document.getElementById('main');if(!main)return; clearElement(main);
  const info=EMBED_PAGES[section.kind];
  const v=document.createElement('div');v.className='stage-view active embed-section';
  setHtml(v,'<div class="eyebrow">'+escapeHtml(info.eyebrow)+'</div><h2>'+escapeHtml(section.label)+'</h2><div class="lead">'+escapeHtml(info.lead)+'</div>');
  main.appendChild(v);
  const code=getSessionCode();
  if(!code){ const note=document.createElement('p'); note.className='card'; note.textContent='Open the lesson with a student code to use this section.'; v.appendChild(note); main.appendChild(stageFooter()); return; }
  const params=new URLSearchParams({embed:'1',lesson:state.currentLessonId,code:code}); if(teacherMode)params.set('teacher','1');
  const frame=document.createElement('iframe'); frame.className='embed-frame'; frame.title=section.label;
  frame.setAttribute('allow','microphone; autoplay; clipboard-write');
  frame.src=info.page+'?'+params.toString();
  frame.addEventListener('load',function(){
    try{
      const doc=frame.contentDocument; if(!doc)return;
      // Measure the page's own content (its <main>), not the document, which is at least as tall as the frame itself.
      const content=doc.querySelector('main')||doc.body;
      const fit=function(){ const height=Math.max(560,Math.ceil(content.getBoundingClientRect().bottom+(doc.defaultView?doc.defaultView.scrollY:0))+24); if(Math.abs(height-frame.offsetHeight)>4)frame.style.height=height+'px'; };
      // Re-measure when the frame's content changes, and on a light timer as a fallback (resize events pause in background
      // tabs). Both stop once the section is left and the frame is gone.
      const view=doc.defaultView; fit();
      let pending=0; const schedule=function(){ if(!pending)pending=setTimeout(function(){ pending=0; if(frame.isConnected)fit(); },120); };
      if(view&&view.MutationObserver)new view.MutationObserver(schedule).observe(content,{childList:true,subtree:true,attributes:true,characterData:true});
      const timer=setInterval(function(){ if(!frame.isConnected){clearInterval(timer);return} fit(); },1500);
    }catch(error){ console.error('The embedded section could not be sized',error); }
  });
  v.appendChild(frame); main.appendChild(stageFooter());
}
window.addEventListener('message',function(event){
  const data=event.data;
  if(event.origin!==location.origin||!data||data.source!=='learning-studio'||data.type!=='section-complete'||teacherMode)return;
  const section=PLAN.find(function(item){return item.kind===data.section&&(item.kind==='games'||item.kind==='listening')}); if(!section)return;
  const total=Math.max(1,Number(data.total)||1), score=Math.max(0,Math.min(total,Number(data.score)||0));
  const earned=Math.round(section.points*score/total), key=state.currentLessonId+'_'+section.id;
  if(earned>(state.scores[key]||0))setScore(section.id,earned);
  markDone(section.id);
});

let testState={active:false,questions:[],idx:0,correct:0,total:0,timeLeft:0,timer:null};
function getTestTimeLimit() { const totalQuestions = TEST_MCQ.length + TEST_SHORT.length + TEST_TFNG.length + TEST_COMPLETE.length; return Math.max(300, totalQuestions * 30); }
function buildTestQuestions(){ const qs=[]; TEST_MCQ.forEach(function(q){qs.push({type:'mcq',prompt:q.q,options:q.options,correct:q.correct,exp:q.exp})}); TEST_SHORT.forEach(function(q){qs.push({type:'short',prompt:q.q,answers:q.answers,exp:q.exp})}); TEST_TFNG.forEach(function(q){qs.push({type:'tfng',prompt:q.q,answer:q.answer,exp:q.exp})}); TEST_COMPLETE.forEach(function(q){qs.push({type:'complete',prompt:q.p,answer:q.a})}); return shuffle(qs); }
function renderStage9(){
  const main=document.getElementById('main');if(!main)return; clearElement(main);
  const v=document.createElement('div');v.className='stage-view active'; const limitMins = Math.floor(getTestTimeLimit() / 60);
  setHtml(v, '<div class="eyebrow">Test Your Knowledge</div><h2>⚡ Lesson 1 — Timed Test</h2>'+
  '<div class="lead">This is a strict, timed test. You have <b>'+limitMins+' minutes</b> in total. You can only take this test <b>once</b>. After time runs out, the test closes automatically.<span class="ru">Строгий тест на время: '+limitMins+' минут, одна попытка.</span></div>'+
  '<div id="testRoot"></div>');
  main.appendChild(v);
  if (teacherCanEdit) { const resetBtn = document.createElement('button'); resetBtn.className = 'btn danger small'; resetBtn.style.marginBottom = '15px'; resetBtn.textContent = '🔄 Give Second Chance (Reset Test)'; registerDelegatedClick(resetBtn, function() { resetStageTeacher(9); }); v.insertBefore(resetBtn, document.getElementById('testRoot')); }
  main.appendChild(stageFooter(8,null));
  if(state.done[state.currentLessonId+"_9"]) { const score = state.scores[state.currentLessonId+"_9"] || 0; setHtml(document.getElementById('testRoot'), '<div class="complete-banner"><div class="trophy">🏁</div><h3>Test already completed</h3>'+ '<p>You have already finished this test. Your score was: <b>' + score + ' / 10</b>.</p>'+ '<p style="font-size:14px;color:var(--ink-soft);margin-top:8px">You cannot retake the test, but you can review the grammar stages or practice vocabulary.</p>'+ '<div style="margin-top:20px"><button class="btn ghost" data-action="go-to-stage" data-stage="1">← Back to start</button></div></div>'); }
  else { renderTestIntro(); }
}
function renderTestIntro(){ const r=document.getElementById('testRoot');if(!r)return; if(testState.timer){clearInterval(testState.timer);testState.timer=null} testState.active=false; const preview=buildTestQuestions().length; const limitMins = Math.floor(getTestTimeLimit() / 60); setHtml(r, '<div class="complete-banner"><div class="trophy">⚡</div><h3>Ready to begin?</h3>'+ '<p>'+preview+' questions · '+limitMins+' minutes · one attempt only</p>'+ '<p style="font-size:14px;color:var(--ink-soft);margin-top:8px">You cannot go back. Each question must be answered before the next one appears.</p>'+ '<div style="margin-top:20px"><button class="btn success" style="font-size:18px;padding:14px 32px" data-action="start-test">▶ Start the test</button>'+(modeAllows(gameMode,'extras')&&!teacherMode?' <button class="btn ghost" style="font-size:18px;padding:14px 32px" data-action="start-boss">⚔ Start as a Boss Battle</button>':'')+'</div></div>'); }
function startTest(){
  testState={active:true,questions:buildTestQuestions(),idx:0,correct:0,total:0,timeLeft:0,timer:null}; testState.total=testState.questions.length; testState.timeLeft = getTestTimeLimit();
  const limitMins = Math.floor(testState.timeLeft / 60); const limitSecs = testState.timeLeft % 60; const formattedTime = String(limitMins).padStart(2, '0') + ':' + String(limitSecs).padStart(2, '0');
  const r=document.getElementById('testRoot');if(!r)return; setHtml(r, '<div class="test-hud">'+ '<div class="tcell"><span class="lbl">Time</span><span class="val" id="testTimer">'+formattedTime+'</span></div>'+ '<div class="tcell"><span class="lbl">Question</span><span class="val" id="testQNum">1 / '+testState.total+'</span></div>'+ '<div class="tcell"><span class="lbl">Correct</span><span class="val" id="testCorrect">0</span></div>'+ '</div>'+ '<div class="test-progress-rail"><div class="test-progress-fill" id="testProgress"></div></div>'+ '<div id="testQuestion"></div>');
  updateTestTimer(); testState.timer=setInterval(function(){ testState.timeLeft--; updateTestTimer(); if(testState.timeLeft<=0)endTest(true); },1000); broadcastAction('test_start','Timed test started'); renderTestQuestion();
}
function updateTestTimer(){ const t=document.getElementById('testTimer');if(!t)return; const m=String(Math.floor(Math.max(0,testState.timeLeft)/60)).padStart(2,'0'); const s=String(Math.max(0,testState.timeLeft)%60).padStart(2,'0'); t.textContent=m+':'+s; if(testState.timeLeft<=60)t.classList.add('danger');else t.classList.remove('danger'); }
function renderTestQuestion(){
  const q=testState.questions[testState.idx];if(!q)return; const root=document.getElementById('testQuestion');if(!root)return; const qn=document.getElementById('testQNum');if(qn)qn.textContent=(testState.idx+1)+' / '+testState.total; const cc=document.getElementById('testCorrect');if(cc)cc.textContent=testState.correct; const tp=document.getElementById('testProgress');if(tp)tp.style.width=(testState.idx/testState.total*100)+'%';
  let html='<div class="q-card test-card"><div class="q-num">Question '+(testState.idx+1)+' of '+testState.total+'</div><div class="test-q-text">'+escapeHtml(q.prompt)+'</div>';
  if(q.type==='mcq'){ html+='<div class="q-opts">'+shuffle(q.options).map(function(o){return '<button class="q-opt" data-opt="'+escapeAttr(o)+'" data-action="answer-test-mcq">'+escapeHtml(o)+'</button>'}).join('')+'</div>'; }
  else if(q.type==='tfng'){ html+='<div class="tfng-opts">'+shuffle(['True','False','Not Given']).map(function(o){return '<button class="q-opt" data-opt="'+o+'" data-action="answer-test-tfng">'+o+'</button>'}).join('')+'</div>'; }
  else if(q.type==='short'){ html+='<div class="q-input-row"><input type="text" class="q-input" id="testInput" placeholder="Type your answer..." autocomplete="off" data-action="answer-test-short-enter" data-action-event="keydown"><button class="btn" data-action="answer-test-short">Submit</button></div>'; }
  else if(q.type==='complete'){ html+='<div class="q-input-row"><input type="text" class="q-input" id="testInput" placeholder="Type the missing word(s)..." autocomplete="off" data-action="answer-test-complete-enter" data-action-event="keydown"><button class="btn" data-action="answer-test-complete">Submit</button></div>'; }
  html+='<div class="q-feedback" id="testFeedback"></div><div id="testNextArea"></div></div>'; setHtml(root, html); const inp=document.getElementById('testInput'); if(inp)setTimeout(function(){inp.focus()},80);
}
function lockTestOptions(){document.querySelectorAll('#testQuestion .q-opt').forEach(function(b){b.disabled=true})}
function showTestFeedback(ok,exp){ const fb=document.getElementById('testFeedback');if(!fb)return; fb.className='q-feedback '+(ok?'correct':'wrong'); setHtml(fb, (ok?'✓ Correct!':'✗ Incorrect.')+(exp?'<span class="exp">'+escapeHtml(exp)+'</span>':'')); }
function showTestNext(){ const area=document.getElementById('testNextArea');if(!area)return; const isLast=testState.idx>=testState.total-1; setHtml(area, '<div style="margin-top:18px;text-align:right"><button class="btn" data-action="next-test-question">'+(isLast?'Finish test →':'Next question →')+'</button></div>'); }
function answerTestMCQ(btn){ const q=testState.questions[testState.idx];if(!q)return; const opt=btn.dataset.opt;const ok=opt===q.correct; if(ok)testState.correct++; lockTestOptions(); document.querySelectorAll('#testQuestion .q-opt').forEach(function(b){ if(b.dataset.opt===q.correct)b.classList.add('correct'); else if(b.dataset.opt===opt&&!ok)b.classList.add('wrong'); }); showTestFeedback(ok,q.exp); const cc=document.getElementById('testCorrect');if(cc)cc.textContent=testState.correct; showTestNext(); broadcastAction('test_answer',(ok?'correct: ':'wrong: ')+q.prompt.substring(0,40)); }
function answerTestTFNG(btn){ const q=testState.questions[testState.idx];if(!q)return; const opt=btn.dataset.opt;const ok=opt===q.answer; if(ok)testState.correct++; lockTestOptions(); document.querySelectorAll('#testQuestion .q-opt').forEach(function(b){ if(b.dataset.opt===q.answer)b.classList.add('correct'); else if(b.dataset.opt===opt&&!ok)b.classList.add('wrong'); }); showTestFeedback(ok,q.exp); const cc=document.getElementById('testCorrect');if(cc)cc.textContent=testState.correct; showTestNext(); broadcastAction('test_answer',(ok?'correct: ':'wrong: ')+q.prompt.substring(0,40)); }
function answerTestShort(){ const q=testState.questions[testState.idx];if(!q)return; const inp=document.getElementById('testInput');if(!inp)return; const ok=isAnswerCorrect(inp.value, q.answers, { mode: "fuzzy" }); if(ok)testState.correct++; inp.disabled=true; if(ok)inp.classList.add('correct');else inp.classList.add('wrong'); showTestFeedback(ok,q.exp); const cc=document.getElementById('testCorrect');if(cc)cc.textContent=testState.correct; showTestNext(); broadcastAction('test_answer',(ok?'correct: ':'wrong: ')+q.prompt.substring(0,40)); }
function answerTestComplete(){ const q=testState.questions[testState.idx];if(!q)return; const inp=document.getElementById('testInput');if(!inp)return; const ok=isAnswerCorrect(inp.value, [q.answer]); if(ok)testState.correct++; inp.disabled=true; if(ok)inp.classList.add('correct');else inp.classList.add('wrong'); showTestFeedback(ok,'Expected: '+q.answer); const cc=document.getElementById('testCorrect');if(cc)cc.textContent=testState.correct; showTestNext(); broadcastAction('test_answer',(ok?'correct: ':'wrong: ')+q.prompt.substring(0,40)); }
function nextTestQuestion(){ testState.idx++; if(testState.idx>=testState.total){endTest(false);return} renderTestQuestion(); }
function endTest(timedOut,customReason){
  if(!testState.active&&!timedOut)return; testState.active=false; if(testState.timer){clearInterval(testState.timer);testState.timer=null}
  const total=testState.total||1; const score=Math.round((testState.correct/total)*10);
  try { state.done[state.currentLessonId+"_9"] = true; setScore(9, score); saveState(); } catch(e) { console.error("State save failed", e); }
  const elapsed=getTestTimeLimit()-testState.timeLeft; const mins=Math.floor(elapsed/60),secs=elapsed%60; const root=document.getElementById('testRoot');if(!root)return; const msg=customReason?customReason:(timedOut?'You ran out of time.':'Test complete!');
  setHtml(root, '<div class="'+(timedOut||customReason?'test-timeout':'test-result')+'">'+ '<div class="icon">'+(timedOut||customReason?'⏰':'🏁')+'</div>'+ '<h3>'+(customReason?'Test Failed':(timedOut?'Time is up!':'Test complete!'))+'</h3>'+ '<div class="big">'+Number(testState.correct||0)+' / '+Number(total||0)+'</div>'+ '<p>'+escapeHtml(msg)+' You answered <b>'+Number(testState.correct||0)+'</b> correctly in <b>'+mins+'m '+secs+'s</b>.</p>'+ '<p style="color:var(--accent);font-weight:700;margin-top:10px">This test can only be taken once. You cannot retake it.</p>'+ '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:20px"><button class="btn ghost" data-action="go-to-stage" data-stage="1">← Back to start</button></div></div>');
  if(!timedOut&&!customReason){sWin();confetti();} broadcastAction('test_end','Score: '+testState.correct+'/'+total);
  if(!customReason)afterStageDone(9);
}

function updateHUD(){ const maxEl=document.getElementById('scoreMax'); if(maxEl){const lesson=getCurrentLesson(); const max=PLAN.length?planMaxScore(PLAN):(lesson?resolveMaxScore(lesson):0); maxEl.textContent=max?String(max):'–'} const el=document.getElementById('scoreDisplay'); if(el){el.textContent=totalScore();el.classList.remove('bump');void el.offsetWidth;el.classList.add('bump')} const sd=document.getElementById('streakDisplay');if(sd)sd.textContent=state.streak; const lesson=getCurrentLesson();if(!lesson)return; const doneCount=lesson.stages.filter(function(s){return state.done[lesson.id+"_"+s.id]}).length; const pct=Math.round((doneCount/lesson.stages.length)*100); const pp=document.getElementById('progressPct');if(pp)pp.textContent=pct+'%'; const pf=document.getElementById('progressFill');if(pf)pf.style.width=pct+'%'; }
// ---- game layer (mission line, card map, extra games, stage XP). Never changes grading. ----
function stagePoints(stageId){ const lesson=getCurrentLesson(); const stage=stagesOf(lesson).find(function(x){return x.id===stageId}); return stage&&stage.points?stage.points:10; }
function afterStageDone(stageId){
  if(!modeAllows(gameMode,'mission')||teacherMode||!studentContext||!fbDb)return;
  import('../games/progress.js').then(function(mod){
    return mod.saveGameProgress({db:fbDb,code:studentContext.code,game:{id:'lesson-stage-'+stageId,type:'lesson-stage',title:'Lesson stages'},result:Object.assign({timeSpentSeconds:0},stageResult(stagePoints(stageId))),options:{hearts:false}});
  }).catch(function(error){console.error('Stage XP could not be saved',error)});
  const lesson=getCurrentLesson();
  if(lesson&&allStagesDone(stagesOf(lesson),state.currentLessonId,state.done)){
    const view=document.querySelector('#main .stage-view'); if(view&&!view.querySelector('.gl-epic'))view.insertBefore(epicMessage(),view.firstChild);
    import('../celebrate.js').then(function(c){c.confetti(120)});
  }
}
// A short video for this lesson, offered on the vocabulary and the first grammar stage. It opens in Clip Lab and comes back here.
function decorateClipLink(stageId){
  const firstGrammarSection=grammarSections()[0]; if(!lessonClipId||teacherMode||!studentContext||(stageId!==1&&!(firstGrammarSection&&stageId===firstGrammarSection.id)))return;
  const view=document.querySelector('#main .stage-view'); if(!view||view.querySelector('.gl-clip'))return;
  const box=document.createElement('aside'); box.className='gl-clip'; box.setAttribute('aria-label','Video for this lesson');
  const text=document.createElement('p'); text.textContent=stageId===1?'🎬 Watch a short video that uses these words.':'🎬 Watch a short video with this grammar in use.';
  const link=document.createElement('a'); link.className='btn ghost'; link.textContent='Open the clip';
  link.href='clip.html?code='+encodeURIComponent(studentContext.code)+'&lesson='+encodeURIComponent(state.currentLessonId)+'&from=lesson';
  box.append(text,link); view.insertBefore(box,view.children[1]||null);
}
function decorateGameLayer(stageId){
  if(!modeAllows(gameMode,'mission'))return;
  const view=document.querySelector('#main .stage-view'); if(!view||view.querySelector('.gl-mission'))return;
  let deck=null;
  if(stageId===1&&Array.isArray(VOCAB)&&VOCAB.length&&vocabMode!=='preLearned'){
    deck=buildDeck(VOCAB.map(function(w){return w.en}),getWordStatus,function(w){return Boolean(vocabState[w])});
  }
  const mission=renderMission({stageId:stageId,mode:gameMode,deck:deck});
  if(mission)view.insertBefore(mission,view.children[1]||null);
  const grammarAll=grammarSections(); if(modeAllows(gameMode,'extras')&&errorHuntContent&&(stageId===3||(grammarAll.length&&stageId===grammarAll[grammarAll.length-1].id))&&!teacherMode)appendErrorHunt(view);
}
function appendErrorHunt(view){
  view.append(renderExtra({
    title:'Extra practice: Error Hunt', intro:'Find the mistake in each sentence and fix it. This is practice only: it does not change your stage score.',
    load:async function(host){
      const engine=await import('../games/engine.js');
      const game=engine.createPracticeGames({errorHunt:errorHuntContent}).find(function(g){return g.type==='error-hunt'});
      if(!game){host.textContent='No Error Hunt sentences are ready for this lesson yet.';return}
      await playInto(host,game,{onResult:function(result){
        const note=document.createElement('p'); note.className='gl-hint'; note.textContent='You got '+result.score+' of '+result.total+' right.'; host.append(note);
        if(studentContext&&fbDb)import('../games/progress.js').then(function(mod){return mod.saveGameProgress({db:fbDb,code:studentContext.code,game:game,result:result,options:{hearts:false}})}).catch(function(e){console.error(e)});
      }});
    }
  }));
}
function startBoss(){
  if(!modeAllows(gameMode,'extras')||bossActive)return; bossActive=true;
  const r=document.getElementById('testRoot'); if(!r)return;
  const items=[]; import('../games/types/boss-battle.js').then(function(mod){
    mod.fromContent({testMcq:TEST_MCQ,testShort:TEST_SHORT,testTfng:TEST_TFNG,testComplete:TEST_COMPLETE}).forEach(function(i){items.push(i)});
    if(!items.length){bossActive=false;return}
    testState={active:true,questions:items,idx:0,correct:0,total:items.length,timeLeft:getTestTimeLimit(),timer:null};
    clearElement(r);
    const hud=document.createElement('p'); hud.className='gl-hint'; hud.setAttribute('aria-live','off'); r.appendChild(hud);
    const host=document.createElement('div'); r.appendChild(host);
    const paintTime=function(){const m=String(Math.floor(Math.max(0,testState.timeLeft)/60)).padStart(2,'0'),sec=String(Math.max(0,testState.timeLeft)%60).padStart(2,'0'); hud.textContent='Time left: '+m+':'+sec+' · one attempt only';};
    paintTime();
    const game={id:'boss-battle',type:'boss-battle',title:'Final test: Boss Battle',instructions:'Same questions, same time limit, one attempt. Correct answers hurt the boss.',questions:items};
    playInto(host,game,{
      reportAnswer:function(correct){ if(correct)testState.correct++; },
      onResult:function(){ bossActive=false; const pending=document.createElement('p'); host.append(pending); endTest(false); }
    }).then(function(handle){
      testState.timer=setInterval(function(){ testState.timeLeft--; paintTime(); if(testState.timeLeft<=0){ if(handle&&handle.destroy)handle.destroy(); bossActive=false; endTest(true); } },1000);
    });
  });
  broadcastAction('test_start','Timed test started (boss battle)');
}
function markDone(stageId){ const key=state.currentLessonId+"_"+stageId; if(state.done[key])return; state.done[key]=true; sWin();confetti();renderSidebar();updateHUD();saveState(); broadcastAction('stage_complete','Stage '+stageId+' complete!'); afterStageDone(stageId); }
function setScore(stageId,amount){ const key=state.currentLessonId+"_"+stageId; state.scores[key]=amount; updateHUD();saveState(); }

let expandedYears=["2026"],expandedMonths=["October"];

function resetStageTeacher(stageId) {
  if(!teacherCanEdit) return; if(!confirm('Are you sure you want to reset progress for Stage ' + stageId + '?')) return;
  clearSectionProgress(stageId); if (stageId === 1) { vocabState = {}; saveVocabStateLocal(); }
  saveState(); renderSidebar(); renderStage(); updateHUD(); broadcastAction('teacher_reset_stage', 'Teacher manually reset Stage ' + stageId); if (typeof showToast === 'function') showToast('Stage ' + stageId + ' reset');
}

// UPDATED: Collapsible sidebar logic
function renderSidebar(){
  const list=document.getElementById('stageList');if(!list)return;clearElement(list);

  CURRICULUM.forEach(function(yearObj){
    const isY=expandedYears.includes(yearObj.year); const yearEl=document.createElement('div');yearEl.className='year-item'+(isY?' open':'');
    setHtml(yearEl, '<span>📅 '+escapeHtml(yearObj.year)+'</span><span class="arrow">▶</span>'); registerDelegatedClick(yearEl,function(){if(isY)expandedYears=expandedYears.filter(function(y){return y!==yearObj.year});else expandedYears.push(yearObj.year);renderSidebar()}); list.appendChild(yearEl);
    if(isY)yearObj.months.forEach(function(m){
      const isM=expandedMonths.includes(m.month); const mEl=document.createElement('div');mEl.className='month-item'+(isM?' open':'');
      setHtml(mEl, '<span>📁 '+escapeHtml(m.month)+'</span><span class="arrow">▶</span>'); registerDelegatedClick(mEl,function(){if(isM)expandedMonths=expandedMonths.filter(function(x){return x!==m.month});else expandedMonths.push(m.month);renderSidebar()}); list.appendChild(mEl);
      if(isM)m.lessons.forEach(function(lesson){
        const isActive=lesson.id===state.currentLessonId;
        const isOpen = expandedLessons[lesson.id] !== undefined ? expandedLessons[lesson.id] : isActive;
        const fbLesson = curriculumCache[lesson.id]; const title = (fbLesson && fbLesson.title) ? fbLesson.title : lesson.title;
        
        const lEl=document.createElement('div');lEl.className='lesson-item'+(isActive?' active':'');
        setHtml(lEl, '<span style="flex:1;">📘 '+escapeHtml(title)+'</span><span class="arrow" style="font-size:10px;">'+(isOpen?'▼':'▶')+'</span>');
        registerDelegatedClick(lEl,function(){
            if(state.currentLessonId === lesson.id) {
                expandedLessons[lesson.id] = !isOpen;
                renderSidebar();
            } else {
                state.currentLessonId=lesson.id; 
                expandedLessons[lesson.id] = true;
                state.currentStage=1;
                renderSidebar();renderStage();loadDraft();
            }
        });
        list.appendChild(lEl);
        
        if(isActive && isOpen){
          const studentCode=getSessionCode();
          if (studentCode) {
            const assignedHW=Object.keys(curriculumCache||{}).map(id=>curriculumCache[id]).filter(it=>{ 
                return it && it.homework && it.published!==false && it.parentId === lesson.id; 
            });
            if(assignedHW.length){
              const hwList=document.createElement('div');hwList.className='homework-sub-list'; setHtml(hwList, '<div class="homework-sub-label">Homework</div>'+assignedHW.map(function(it){ const id=it.id||Object.keys(curriculumCache).find(function(k){return curriculumCache[k]===it}); const url=safeUrl(it.customUrl||'homework.html',window.location.href); if(!url){console.error('Skipping homework with an unsafe custom URL',{lessonId:id});return '<span class="homework-sub-item">📝 '+escapeHtml(it.title||'Homework')+' (link unavailable)</span>';} url.searchParams.set('lesson',id); if(studentCode)url.searchParams.set('code',studentCode); const contentFile = (it.contentUrl || '').replace(/^content\//, '').replace(/\.json$/, ''); if (contentFile) url.searchParams.set('variant', contentFile); return '<a class="homework-sub-item" href="'+escapeAttr(url.href)+'">📝 '+escapeHtml(it.title||'Homework')+' ↗</a>'; }).join(''));
              hwList.addEventListener('click',function(e){e.stopPropagation()}); list.appendChild(hwList);
            }
          }
          const sub=document.createElement('div');sub.className='stage-sub-list';
          PLAN.forEach(function(st){
            const isA=st.id===state.currentStage; let isD = false;
            if (st.id === 1) { const counts = getVocabCounts(); isD = VOCAB.length>0 && counts.learned === VOCAB.length; } else { isD = sectionDone(st, lesson.id, state.done); }
            if (vocabMode==='preLearned' && (st.id === 1 || st.id === 2)) isD = true;
            const isMastered = Boolean(isD && st.points && sectionScore(st, lesson.id) >= st.points); let statusIcon = isMastered ? '⭐' : (isD ? '✅' : (isA ? '📍' : '🔒')); const stateWord = isMastered ? 'mastered' : (isD ? 'done' : (isA ? 'current stage' : 'not started'));
            const row = document.createElement('div'); row.style.display = 'flex'; row.style.alignItems = 'stretch'; row.style.gap = '4px';
            const stEl=document.createElement('button'); stEl.className='stage-sub-item'+(isA?' active':'')+(isD?' done':''); stEl.style.flex = '1'; const displayLabel = st.label;
            setHtml(stEl, '<span class="icon" style="font-size:14px; margin-right:8px;" aria-hidden="true">'+statusIcon+'</span> <span>'+escapeHtml(displayLabel)+'</span>'); stEl.setAttribute('aria-label', displayLabel+': '+stateWord); if(isA) stEl.setAttribute('aria-current','step'); stEl.dataset.state = isMastered ? 'mastered' : (isD ? 'done' : (isA ? 'current' : 'todo')); registerDelegatedClick(stEl,function(){goToStage(st.id)}); row.appendChild(stEl);
            if (teacherCanEdit) { const resetBtn = document.createElement('button'); resetBtn.textContent = '🔄'; resetBtn.title = 'Reset this stage (Teacher only)'; resetBtn.style.cssText = 'background:var(--panel-2); border:1px solid var(--border); border-radius:8px; cursor:pointer; font-size:14px; padding:0 8px; color:var(--ink-soft); display:flex; align-items:center; justify-content:center; transition:all 0.15s;'; resetBtn.addEventListener('mouseover', () => { resetBtn.style.color = 'var(--error)'; resetBtn.style.borderColor = 'var(--error)'; }); resetBtn.addEventListener('mouseout', () => { resetBtn.style.color = 'var(--ink-soft)'; resetBtn.style.borderColor = 'var(--border)'; }); registerDelegatedClick(resetBtn, function(e) { e.stopPropagation(); resetStageTeacher(st.id); }); row.appendChild(resetBtn); }
            sub.appendChild(row);
          });
          list.appendChild(sub);
        }
      });
    });
  });
}
function goToStage(n){
  if(testState.active){ if(!confirm('⚠️ You are in the middle of a timed test. Leaving this page will abandon your test and discard your progress. Are you sure you want to leave?')) return; endTest(true, 'Test aborted: you navigated away.'); }
  state.currentStage=n;renderSidebar();renderStage();const m=document.getElementById('main');if(m)m.scrollTo({top:0,behavior:'smooth'});broadcastAction('stage_open','Stage '+n);
}
const SECTION_ICONS={vocab:'🌪️',match:'🔗',reading:'📖',games:'🎮',listening:'🎧',grammar:'⏳',test:'⚡'};
function renderStage(){
  const main=document.getElementById('main');if(!main)return;
  if(!PLAN.length)return; // the content has not loaded yet: keep the loading placeholders
  if(!PLAN.some(function(item){return item.id===state.currentStage}))state.currentStage=resolveSectionId(PLAN,state.currentStage);
  clearElement(main);
  const lesson=getCurrentLesson(); const section=currentSection();
  const renderers={vocab:renderStage1,match:renderStage2,reading:renderStage3,test:renderStage9,
    grammar:function(){renderGrammarSection(section)},games:function(){renderEmbeddedSection(section)},listening:function(){renderEmbeddedSection(section)}};
  try{
    renderers[section.kind]();
    const title=lesson?lesson.title:'Lesson';
    const header=document.createElement('div'); header.className='lesson-heading';
    if(section.kind==='reading')header.classList.add('lesson-heading--wide');
    setHtml(header,'<span class="lesson-heading__icon" aria-hidden="true">'+(SECTION_ICONS[section.kind]||'📘')+'</span> <span>'+escapeHtml(title)+'</span>');
    main.insertBefore(header,main.firstChild);
    decorateGrammarStage(state.currentStage);
    decorateGameLayer(state.currentStage);
    decorateClipLink(state.currentStage);
  }catch(e){ console.error(e); setHtml(main,'<p>Error loading this section.</p>'); }
}

function stageFooter(prevId,nextId,extraHTML){ if(PLAN.length){ const near=neighbours(PLAN,state.currentStage); prevId=near.previous?near.previous.id:null; nextId=near.next?near.next.id:null; } const f=document.createElement('div');f.className='stage-footer';let html=''; if(prevId)html+='<button class="btn ghost" data-action="go-to-stage" data-stage="'+prevId+'">← Previous</button>';else html+='<span></span>'; html+='<div style="display:flex;gap:10px;flex-wrap:wrap">'+(extraHTML||'')+'</div>'; if(nextId)html+='<button class="btn" data-action="go-to-stage" data-stage="'+nextId+'">Next →</button>';else html+='<span></span>'; setHtml(f, html);return f; }
function toggleSound(){soundOn=!soundOn;const st=document.getElementById('soundToggle');if(st){st.classList.toggle('active',soundOn);st.textContent=soundOn?'🔊':'🔇'}saveState()}
function toggleDark(){ document.documentElement.classList.toggle('dark'); const dark = document.documentElement.classList.contains('dark'); try{safeLocal.setItem('nd_lesson_theme', dark ? 'dark' : 'light')}catch(e){} const dt=document.getElementById('darkToggle'); if(dt)dt.classList.toggle('active',dark); saveState(); }
function closeWhiteboard(){const drawer=document.getElementById('wbDrawer'),toggle=document.getElementById('wbToggle'); if(drawer)drawer.hidden=true; document.body.classList.remove('wb-open'); if(toggle){toggle.setAttribute('aria-expanded','false');toggle.focus()}}
async function toggleWhiteboard(){
  const drawer=document.getElementById('wbDrawer'),toggle=document.getElementById('wbToggle'); if(!drawer)return;
  if(!drawer.hidden){closeWhiteboard();return}
  const code=lessonCodeGetter(), user=window.firebase&&firebase.auth().currentUser;
  if(!code||!fbDb||!user){ if(typeof showToast==='function')showToast('Open the lesson with a student code first.'); return }
  drawer.hidden=false; document.body.classList.add('wb-open'); if(toggle)toggle.setAttribute('aria-expanded','true');
  const lessonId=state.currentLessonId;
  if(whiteboard&&(whiteboard.code!==code||whiteboard.lessonId!==lessonId)){whiteboard.handle.destroy();whiteboard=null}
  if(!whiteboard){
    const host=document.getElementById('wbDrawerHost'); const mod=await import('../whiteboard/app.js');
    const handle=mod.mountWhiteboard({host:host,db:fbDb,code:code,lessonId:lessonId,uid:user.uid,role:lessonRole,name:lessonRole==='teacher'?'Teacher':((studentContext&&studentContext.name)||'Student'),onBack:closeWhiteboard});
    whiteboard={code:code,lessonId:lessonId,handle:handle};
  } else whiteboard.handle.resize();
  const first=drawer.querySelector('.wb'); if(first)first.focus();
}
function toggleNotes(){const np=document.getElementById('notesPanel');if(np)np.classList.toggle('open')}
document.getElementById('notesArea').addEventListener('input',function(){saveState();broadcast('notes',{text:this.value})});

async function applyLessonContent(c,sourceFile) {
  if(!c||typeof c!=='object')throw new Error('Lesson content is invalid.');
  contentFile=sourceFile;
  vocabMode=c.vocabMode||'tracked';
  schemaVersion=c.schemaVersion||1;
  lessonSections=Array.isArray(c.sections)?c.sections:null;
  contentGameMode=c.gameMode||null; errorHuntContent=Array.isArray(c.errorHunt)?c.errorHunt:null; gameMode=resolveGameMode(studentGameMode,contentGameMode);
  grammarLadder=null;
  if(c.grammarLadder){
    const ladderErrors=validateLadder(c.grammarLadder);
    if(ladderErrors.length)console.warn('Grammar ladder ignored:',ladderErrors);
    else grammarLadder=c.grammarLadder;
  }
  readingTasks=null;
  if(c.readingTasks){
    const taskErrors=validateReadingTasks(c.readingTasks,c.readingHtml);
    if(taskErrors.length)console.warn('Reading tasks ignored:',taskErrors);
    else readingTasks=c.readingTasks;
  }
  if(lessonClock)lessonClock.refreshSections();
  if(crypto&&crypto.subtle){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(c)));contentHash=Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('')}
  VOCAB         = c.vocab; MATCH_DATA    = c.matchData; READING_HTML  = c.readingHtml; READING_Q     = c.readingQ; CONTEXT_Q     = c.contextQ;
  G6            = c.g6; G7            = c.g7; SB_PP         = c.sbPp; SB_PS         = c.sbPs; G10           = c.g10;
  TEST_MCQ      = c.testMcq; TEST_SHORT    = c.testShort; TEST_TFNG     = c.testTfng; TEST_COMPLETE = c.testComplete;
  // Copies imported before content v3 have no grammar topics: borrow them from the published lesson file of the same name,
  // as long as they name exercises this copy has. Re-importing the content makes this unnecessary.
  if(!Array.isArray(c.grammar)&&/^[a-z0-9_-]+$/i.test(activeContentName||'')){
    try{
      const response=await fetch('content/'+activeContentName+'.json');
      const published=response.ok?await response.json():null;
      if(published&&Array.isArray(published.grammar)&&published.grammar.every(function(topic){return Array.isArray(topic.exercises)&&topic.exercises.every(function(key){return c[key]})}))c=Object.assign({},c,{grammar:published.grammar});
    }catch(error){ console.warn('Grammar topics could not be loaded; generic grammar sections are shown.',error); }
  }
  LESSON_CONTENT = c; PLAN = buildLessonPlan(c);
  state.currentStage = resolveSectionId(PLAN, state.currentStage);
  if(lessonClock)lessonClock.refreshSections();
}

async function loadContent() {
  const params = new URLSearchParams(location.search);
  activeContentName = params.get('content') || '';
  if (!activeContentName) {
    // Teacher preview without an explicit file: resolve it from the manifest, never guess a student.
    const manifestResponse = await fetch('content/manifest.json', { cache: 'no-store' });
    if (!manifestResponse.ok) throw new Error('Content manifest could not be loaded.');
    const entry = (await manifestResponse.json())[params.get('lesson') || ''];
    activeContentName = String((entry && entry.classworkFile) || '').replace(/^content\//, '').replace(/\.json$/, '');
  }
  if (!/^[a-z0-9_-]+$/i.test(activeContentName)) throw new Error('No classwork content is configured for this lesson.');
  const contentFileName='content/'+activeContentName+'.json';
  const res = await fetch(contentFileName, { cache: 'no-store' });
  if (!res.ok) throw new Error(contentFileName+' not found');
  await applyLessonContent(await res.json(),contentFileName);
}

const clickAction = run => ({ event: "click", run });
installDelegatedActions({
  "change-session-code": clickAction(changeSessionCode),
  "change-session-code-enter": {
    event: "keydown",
    run: (_element, event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        changeSessionCode();
      }
    }
  },
  "toggle-sound": clickAction(toggleSound),
  "toggle-dark": clickAction(toggleDark),
  "toggle-notes": clickAction(toggleNotes),
  "toggle-whiteboard": clickAction(toggleWhiteboard),
  "switch-student": clickAction(switchStudent),
  "delete-current-note": clickAction(deleteCurrentNote),
  "close-sticky-note": clickAction(closeStickyNote),
  "close-image-backdrop": clickAction((element, event) => {
    if (event.target === element) closeImageModal();
  }),
  "close-image-modal": clickAction(closeImageModal),
  "save-image-url": clickAction(saveImageUrl),
  "close-flashcard-backdrop": clickAction((element, event) => {
    if (event.target === element) closeFCModal();
  }),
  "close-flashcard-modal": clickAction(closeFCModal),
  "flashcard-mark-known": clickAction(fcMarkKnow),
  "flashcard-mark-again": clickAction(fcMarkAgain),
  "flashcard-speak": clickAction(quizSpeak),
  "edit-flashcard-image": clickAction(editFlashcardImage),
  "flashcard-previous": clickAction(fcPrev),
  "flashcard-next": clickAction(fcNext),
  "edit-note": clickAction((element, event) => {
    const id = readActionParam(element, "noteId", /^(?:note|legacy)_[A-Za-z0-9_-]{1,64}$/);
    if (id) {
      event.preventDefault();
      openExistingNote(id);
    }
  }),
  "delete-note": clickAction((element, event) => {
    const id = readActionParam(element, "noteId", /^(?:note|legacy)_[A-Za-z0-9_-]{1,64}$/);
    if (id) {
      event.preventDefault();
      deleteNoteById(id);
    }
  }),
  "remove-existing-edit": clickAction((element, event) => {
    event.preventDefault();
    removeExistingEdit();
  }),
  "apply-annotation": clickAction((element, event) => {
    const annotation = readActionEnum(element, "annotation", [
      "hl-yellow", "hl-green", "hl-blue", "hl-purple", "hl-pink", "underline"
    ]);
    if (annotation) {
      event.preventDefault();
      applyAnnotation(annotation);
    }
  }),
  "create-note": clickAction((element, event) => {
    event.preventDefault();
    createNewNote();
  }),
  "set-vocab-filter": clickAction(element => {
    const filter = readActionEnum(element, "filter", ["learning", "learned", "practice"]);
    if (filter) setFilter(filter);
  }),
  "start-practice": clickAction(startPractice),
  "toggle-quiz-hint": clickAction(toggleQuizHint),
  "answer-quiz": clickAction(element => {
    const option = readActionParam(element, "opt", /^[\s\S]{1,500}$/);
    const meaning = quizMeanings[quizCurrentIdx];
    if (!option || !meaning) return;
    const options = buildQuizOptions(quizWord, meaning.idx).options;
    if (options.includes(option)) answerQuiz(element);
  }),
  "quiz-speak": clickAction(quizSpeak),
  "show-word-family": clickAction(showWordFamily),
  "restart-practice": clickAction(restartPractice),
  "reset-stage-2": clickAction(resetStage2),
  "speak-passage": clickAction(() => {
    const passage = document.getElementById("passageBody");
    if (passage) speakLong(passage.innerText);
  }),
  "pause-tts": clickAction(pauseTTS),
  "resume-tts": clickAction(resumeTTS),
  "stop-tts": clickAction(stopTTS),
  "complete-reading": clickAction(completeReading),
  "flag-for-review": clickAction(element => {
    const id = readActionParam(element, "reviewId", /^s3_[A-Za-z0-9_-]{1,64}$/);
    const prompt = readActionParam(element, "reviewPrompt", /^[\s\S]{0,120}$/);
    const answer = readActionParam(element, "reviewAnswer", /^[\s\S]{0,300}$/);
    const result = readActionEnum(element, "reviewResult", ["correct", "wrong"]);
    const stage = readActionInteger(element, "stage", 3, 3);
    if (id && prompt !== null && answer !== null && result && stage) {
      flagForReview(id, prompt, answer, result, stage);
    }
  }),
  "reset-grammar-stage": clickAction(element => {
    const stage = readActionInteger(element, "stage", 210, 299);
    if (stage) resetGrammarStage(stage);
  }),
  "check-sentence-builder-item": clickAction(element => {
    const stage = readActionInteger(element, "stage", 210, 299);
    const data = stage === null ? null : SB_DATA[stage];
    const total = data && data.pos.length + data.neg.length + data.q.length + data.shuffled.length;
    const index = total ? readActionInteger(element, "questionIndex", 1, total) : null;
    if (stage && index !== null) checkSBItem(stage, index);
  }),
  "reset-sentence-builder-item": clickAction(element => {
    const stage = readActionInteger(element, "stage", 210, 299);
    const data = stage === null ? null : SB_DATA[stage];
    const total = data && data.pos.length + data.neg.length + data.q.length + data.shuffled.length;
    const index = total ? readActionInteger(element, "questionIndex", 1, total) : null;
    if (stage && index !== null) resetSBItem(stage, index);
  }),
  "go-to-stage": clickAction(element => {
    const stage = readActionInteger(element, "stage", 1, 40);
    if (stage && PLAN.some(item => item.id === stage)) goToStage(stage);
  }),
  "start-test": clickAction(startTest),
  "start-boss": clickAction(startBoss),
  "answer-test-mcq": clickAction(element => {
    const question = testState.questions[testState.idx];
    const option = readActionParam(element, "opt", /^[\s\S]{1,500}$/);
    if (testState.active && question?.type === "mcq" && option && question.options.includes(option)) {
      answerTestMCQ(element);
    }
  }),
  "answer-test-tfng": clickAction(element => {
    const question = testState.questions[testState.idx];
    const option = readActionEnum(element, "opt", ["True", "False", "Not Given"]);
    if (testState.active && question?.type === "tfng" && option) answerTestTFNG(element);
  }),
  "answer-test-short": clickAction(() => {
    if (testState.active && testState.questions[testState.idx]?.type === "short") answerTestShort();
  }),
  "answer-test-short-enter": {
    event: "keydown",
    run: (_element, event) => {
      if (event.key === "Enter" && testState.active &&
          testState.questions[testState.idx]?.type === "short") {
        event.preventDefault();
        answerTestShort();
      }
    }
  },
  "answer-test-complete": clickAction(() => {
    if (testState.active && testState.questions[testState.idx]?.type === "complete") {
      answerTestComplete();
    }
  }),
  "answer-test-complete-enter": {
    event: "keydown",
    run: (_element, event) => {
      if (event.key === "Enter" && testState.active &&
          testState.questions[testState.idx]?.type === "complete") {
        event.preventDefault();
        answerTestComplete();
      }
    }
  },
  "next-test-question": clickAction(() => {
    const feedback = document.getElementById("testFeedback");
    if (testState.active && feedback &&
        (feedback.classList.contains("correct") || feedback.classList.contains("wrong"))) {
      nextTestQuestion();
    }
  }),
  "registered-click": clickAction(runRegisteredClick),
  "undo-vocab-word": clickAction(element => {
    const word = readActionParam(element, "word", /^[\s\S]{1,100}$/);
    const index = readActionInteger(element, "meaningIndex", 0, 100);
    const vocabWord = word && VOCAB.find(item => item.en === word);
    if (vocabWord && index !== null && index < vocabWord.meanings.length) undoVocabWord(word, index);
  })
});

(async function boot() {
  try {
    const config=await import('../config.js');
    firebaseConfig=config.firebaseConfig;
  } catch (e) {
    setHtml(document.getElementById('main'), '<div class="card" style="max-width:520px;margin:80px auto;text-align:center;padding:34px">' + '<h2>Content failed to load</h2>' + '<p style="color:var(--ink-soft)">' + escapeHtml(e.message) + '</p>' + '</div>');
    return;
  }
  const lessonFromUrl=new URLSearchParams(window.location.search).get('lesson');
  if(lessonFromUrl)state.currentLessonId=lessonFromUrl;
  const savedCode=teacherPreviewRequested?'':getSessionCode();
  if(savedCode){const sci=document.getElementById('sessionCodeInput');if(sci)sci.value=savedCode}
  if (savedCode) { // Name loading handled in initFirebase
  } else { document.getElementById('workspaceName').textContent = 'Teacher Workspace'; }
  if(soundOn){const st=document.getElementById('soundToggle');if(st)st.classList.add('active')}
  if(document.documentElement.classList.contains('dark')){const dt=document.getElementById('darkToggle');if(dt)dt.classList.add('active')}
  initFirebase();
})();

document.addEventListener('visibilitychange', function() { if (document.visibilityState === 'hidden' && testState.active) { endTest(true, 'Test aborted: you switched tabs or left the window.'); } });
window.addEventListener('beforeunload', function(e) { if (testState.active) { e.preventDefault(); e.returnValue = ''; } });


if (typeof getCurrentLesson === "function") globalThis["getCurrentLesson"] = getCurrentLesson;
if (typeof totalScore === "function") globalThis["totalScore"] = totalScore;
if (typeof debouncedSaveDraft === "function") globalThis["debouncedSaveDraft"] = debouncedSaveDraft;
if (typeof loadDraft === "function") globalThis["loadDraft"] = loadDraft;
if (typeof undoQuestion === "function") globalThis["undoQuestion"] = undoQuestion;
if (typeof applyAnnotation === "function") globalThis["applyAnnotation"] = applyAnnotation;
if (typeof createNewNote === "function") globalThis["createNewNote"] = createNewNote;
if (typeof removeExistingEdit === "function") globalThis["removeExistingEdit"] = removeExistingEdit;
if (typeof openExistingNote === "function") globalThis["openExistingNote"] = openExistingNote;
if (typeof closeStickyNote === "function") globalThis["closeStickyNote"] = closeStickyNote;
if (typeof deleteNoteById === "function") globalThis["deleteNoteById"] = deleteNoteById;
if (typeof deleteCurrentNote === "function") globalThis["deleteCurrentNote"] = deleteCurrentNote;
if (typeof saveAnnotations === "function") globalThis["saveAnnotations"] = saveAnnotations;
if (typeof editFlashcardImage === "function") globalThis["editFlashcardImage"] = editFlashcardImage;
if (typeof closeImageModal === "function") globalThis["closeImageModal"] = closeImageModal;
if (typeof saveImageUrl === "function") globalThis["saveImageUrl"] = saveImageUrl;
if (typeof updateCurriculumView === "function") globalThis["updateCurriculumView"] = updateCurriculumView;
if (typeof initFirebase === "function") globalThis["initFirebase"] = initFirebase;
if (typeof startStudentSession === "function") globalThis["startStudentSession"] = startStudentSession;
if (typeof getSessionCode === "function") globalThis["getSessionCode"] = getSessionCode;
if (typeof changeSessionCode === "function") globalThis["changeSessionCode"] = changeSessionCode;
if (typeof switchStudent === "function") globalThis["switchStudent"] = switchStudent;
if (typeof updateSyncUI === "function") globalThis["updateSyncUI"] = updateSyncUI;
if (typeof teacherReset === "function") globalThis["teacherReset"] = teacherReset;
if (typeof playTone === "function") globalThis["playTone"] = playTone;
if (typeof sCorrect === "function") globalThis["sCorrect"] = sCorrect;
if (typeof sWrong === "function") globalThis["sWrong"] = sWrong;
if (typeof sWin === "function") globalThis["sWin"] = sWin;
if (typeof sFlip === "function") globalThis["sFlip"] = sFlip;
if (typeof sPop === "function") globalThis["sPop"] = sPop;
if (typeof confetti === "function") globalThis["confetti"] = confetti;
if (typeof pickUKVoice === "function") globalThis["pickUKVoice"] = pickUKVoice;
if (typeof speak === "function") globalThis["speak"] = speak;
if (typeof speakLong === "function") globalThis["speakLong"] = speakLong;
if (typeof pauseTTS === "function") globalThis["pauseTTS"] = pauseTTS;
if (typeof resumeTTS === "function") globalThis["resumeTTS"] = resumeTTS;
if (typeof stopTTS === "function") globalThis["stopTTS"] = stopTTS;
if (typeof updateTTSButtons === "function") globalThis["updateTTSButtons"] = updateTTSButtons;
if (typeof broadcast === "function") globalThis["broadcast"] = broadcast;
if (typeof pushFullState === "function") globalThis["pushFullState"] = pushFullState;
if (typeof broadcastAction === "function") globalThis["broadcastAction"] = broadcastAction;
if (typeof saveState === "function") globalThis["saveState"] = saveState;
if (typeof loadState === "function") globalThis["loadState"] = loadState;
if (typeof escapeHtml === "function") globalThis["escapeHtml"] = escapeHtml;
if (typeof escapeAttr === "function") globalThis["escapeAttr"] = escapeAttr;
if (typeof shuffle === "function") globalThis["shuffle"] = shuffle;
if (typeof norm === "function") globalThis["norm"] = norm;
if (typeof flagForReview === "function") globalThis["flagForReview"] = flagForReview;
if (typeof vocabKey === "function") globalThis["vocabKey"] = vocabKey;
if (typeof loadVocabStateLocal === "function") globalThis["loadVocabStateLocal"] = loadVocabStateLocal;
if (typeof loadVocabStateCloud === "function") globalThis["loadVocabStateCloud"] = loadVocabStateCloud;
if (typeof saveVocabStateLocal === "function") globalThis["saveVocabStateLocal"] = saveVocabStateLocal;
if (typeof saveVocabStateCloud === "function") globalThis["saveVocabStateCloud"] = saveVocabStateCloud;
if (typeof saveVocabState === "function") globalThis["saveVocabState"] = saveVocabState;
if (typeof getMeaningStatus === "function") globalThis["getMeaningStatus"] = getMeaningStatus;
if (typeof getWordStatus === "function") globalThis["getWordStatus"] = getWordStatus;
if (typeof getVocabCounts === "function") globalThis["getVocabCounts"] = getVocabCounts;
if (typeof shouldShowPractice === "function") globalThis["shouldShowPractice"] = shouldShowPractice;
if (typeof renderStage1 === "function") globalThis["renderStage1"] = renderStage1;
if (typeof setFilter === "function") globalThis["setFilter"] = setFilter;
if (typeof renderFlashcards === "function") globalThis["renderFlashcards"] = renderFlashcards;
if (typeof openQuiz === "function") globalThis["openQuiz"] = openQuiz;
if (typeof openQuizWord === "function") globalThis["openQuizWord"] = openQuizWord;
if (typeof closeFCModal === "function") globalThis["closeFCModal"] = closeFCModal;
if (typeof buildQuizOptions === "function") globalThis["buildQuizOptions"] = buildQuizOptions;
if (typeof renderQuizModal === "function") globalThis["renderQuizModal"] = renderQuizModal;
if (typeof undoVocabWord === "function") globalThis["undoVocabWord"] = undoVocabWord;
if (typeof answerQuiz === "function") globalThis["answerQuiz"] = answerQuiz;
if (typeof quizNext === "function") globalThis["quizNext"] = quizNext;
if (typeof quizPrev === "function") globalThis["quizPrev"] = quizPrev;
if (typeof toggleQuizHint === "function") globalThis["toggleQuizHint"] = toggleQuizHint;
if (typeof finalizeRound === "function") globalThis["finalizeRound"] = finalizeRound;
if (typeof advanceToNextCard === "function") globalThis["advanceToNextCard"] = advanceToNextCard;
if (typeof continuePracticeQueue === "function") globalThis["continuePracticeQueue"] = continuePracticeQueue;
if (typeof showPracticeSummary === "function") globalThis["showPracticeSummary"] = showPracticeSummary;
if (typeof restartPractice === "function") globalThis["restartPractice"] = restartPractice;
if (typeof startPractice === "function") globalThis["startPractice"] = startPractice;
if (typeof quizSpeak === "function") globalThis["quizSpeak"] = quizSpeak;
if (typeof fcPrev === "function") globalThis["fcPrev"] = fcPrev;
if (typeof fcNext === "function") globalThis["fcNext"] = fcNext;
if (typeof fcReveal === "function") globalThis["fcReveal"] = fcReveal;
if (typeof fcMarkKnow === "function") globalThis["fcMarkKnow"] = fcMarkKnow;
if (typeof fcMarkAgain === "function") globalThis["fcMarkAgain"] = fcMarkAgain;
if (typeof renderStage2 === "function") globalThis["renderStage2"] = renderStage2;
if (typeof renderDD === "function") globalThis["renderDD"] = renderDD;
if (typeof tryPlace === "function") globalThis["tryPlace"] = tryPlace;
if (typeof updateDDCount === "function") globalThis["updateDDCount"] = updateDDCount;
if (typeof checkDDComplete === "function") globalThis["checkDDComplete"] = checkDDComplete;
if (typeof resetStage2 === "function") globalThis["resetStage2"] = resetStage2;
if (typeof renderStage3 === "function") globalThis["renderStage3"] = renderStage3;
if (typeof updateS3Progress === "function") globalThis["updateS3Progress"] = updateS3Progress;
if (typeof renderReadingQuestions === "function") globalThis["renderReadingQuestions"] = renderReadingQuestions;
if (typeof submit === "function") globalThis["submit"] = submit;
if (typeof renderContextQ === "function") globalThis["renderContextQ"] = renderContextQ;
if (typeof buildFlagRow === "function") globalThis["buildFlagRow"] = buildFlagRow;
if (typeof checkLongAnswer === "function") globalThis["checkLongAnswer"] = checkLongAnswer;
if (typeof checkS4 === "function") globalThis["checkS4"] = checkS4;
if (typeof completeReading === "function") globalThis["completeReading"] = completeReading;
if (typeof renderCompletingSentence === "function") globalThis["renderCompletingSentence"] = renderCompletingSentence;
if (typeof addSection === "function") globalThis["addSection"] = addSection;
if (typeof resetGrammarStage === "function") globalThis["resetGrammarStage"] = resetGrammarStage;
if (typeof renderSentenceBuilder === "function") globalThis["renderSentenceBuilder"] = renderSentenceBuilder;
if (typeof moveChip === "function") globalThis["moveChip"] = moveChip;
if (typeof resetSBItem === "function") globalThis["resetSBItem"] = resetSBItem;
if (typeof checkSBItem === "function") globalThis["checkSBItem"] = checkSBItem;
if (typeof getTestTimeLimit === "function") globalThis["getTestTimeLimit"] = getTestTimeLimit;
if (typeof buildTestQuestions === "function") globalThis["buildTestQuestions"] = buildTestQuestions;
if (typeof renderStage9 === "function") globalThis["renderStage9"] = renderStage9;
if (typeof renderTestIntro === "function") globalThis["renderTestIntro"] = renderTestIntro;
if (typeof startTest === "function") globalThis["startTest"] = startTest;
if (typeof updateTestTimer === "function") globalThis["updateTestTimer"] = updateTestTimer;
if (typeof renderTestQuestion === "function") globalThis["renderTestQuestion"] = renderTestQuestion;
if (typeof lockTestOptions === "function") globalThis["lockTestOptions"] = lockTestOptions;
if (typeof showTestFeedback === "function") globalThis["showTestFeedback"] = showTestFeedback;
if (typeof showTestNext === "function") globalThis["showTestNext"] = showTestNext;
if (typeof answerTestMCQ === "function") globalThis["answerTestMCQ"] = answerTestMCQ;
if (typeof answerTestTFNG === "function") globalThis["answerTestTFNG"] = answerTestTFNG;
if (typeof answerTestShort === "function") globalThis["answerTestShort"] = answerTestShort;
if (typeof answerTestComplete === "function") globalThis["answerTestComplete"] = answerTestComplete;
if (typeof nextTestQuestion === "function") globalThis["nextTestQuestion"] = nextTestQuestion;
if (typeof endTest === "function") globalThis["endTest"] = endTest;
if (typeof updateHUD === "function") globalThis["updateHUD"] = updateHUD;
if (typeof markDone === "function") globalThis["markDone"] = markDone;
if (typeof setScore === "function") globalThis["setScore"] = setScore;
if (typeof resetStageTeacher === "function") globalThis["resetStageTeacher"] = resetStageTeacher;
if (typeof renderSidebar === "function") globalThis["renderSidebar"] = renderSidebar;
if (typeof goToStage === "function") globalThis["goToStage"] = goToStage;
if (typeof renderStage === "function") globalThis["renderStage"] = renderStage;
if (typeof stageFooter === "function") globalThis["stageFooter"] = stageFooter;
if (typeof toggleSound === "function") globalThis["toggleSound"] = toggleSound;
if (typeof toggleDark === "function") globalThis["toggleDark"] = toggleDark;
if (typeof toggleNotes === "function") globalThis["toggleNotes"] = toggleNotes;
if (typeof applyLessonContent === "function") globalThis["applyLessonContent"] = applyLessonContent;
if (typeof loadContent === "function") globalThis["loadContent"] = loadContent;
if (typeof boot === "function") globalThis["boot"] = boot;
if (typeof setVis === "function") globalThis["setVis"] = setVis;
