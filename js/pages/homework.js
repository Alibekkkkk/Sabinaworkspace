import { safeLocal, safeSession } from "../safe-storage.js";
import { startTabGuard } from "../tab-guard.js";
if (new URLSearchParams(location.search).get("teacher") !== "1") startTabGuard("homework:" + location.search);
(() => {


})();

import { isTeacher } from "../auth.js";
import { expandContractions, isAnswerCorrect } from "../grading.js";

import { appendBoundedRealtimeRecord } from "../bounded-realtime-list.js";
import { installDelegatedActions, readActionEnum, readActionInteger, readActionParam } from "../delegated-actions.js";
import { clearElement, serializeChildren, setHtml } from "../dom.js";
import { answerKey, migrateLegacyAnswerKeys } from "../homework-answers.js";
import { showToast } from "../ui.js";
import { initReadingPrefs } from "../reading-prefs.js";

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

import { confetti } from "../celebrate.js";
import { mountBottomNav, mountOfflineBanner, showErrorPage, watchConnection } from "../shell.js";

mountOfflineBanner();
mountBottomNav("homework");
// Keyword matching for long answers ignores punctuation entirely.
function normalizeString(str) { return expandContractions(String(str).toLowerCase().trim()).replace(/[.,!?;:'"()\[\]{}]/g, '').replace(/\s+/g, ' '); }

let firebaseConfig;
let fbApp=null,fbDb=null,fbAuth=null,sessionRef=null,teacherMode=false,teacherCanEdit=false;

const params=new URLSearchParams(location.search);
const variant=params.get('variant')||'';
let code=(params.get('code')||'').toUpperCase();
const homeworkId=params.get('lesson')||('homework_'+variant);
const homeworkVersion=6;
const teacherPreviewRequested=params.get('teacher')==='1';
let studentContext=null,contentFile='',contentHash='',schemaVersion=1;

let lesson = null;

function escapeHtml(s){return String(s).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]))}
function escapeAttr(s){return escapeHtml(s)}
function shuffle(a){const r=a.slice();for(let i=r.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[r[i],r[j]]=[r[j],r[i]]}return r}

/* ================== ANNOTATION & NOTES LOGIC ================== */
let activeNoteId = null; let savedRange = null; let contextTargetEdit = null;
document.addEventListener('DOMContentLoaded', () => {
  const menu = document.getElementById('customContextMenu');
  document.addEventListener('click', function(e) {
    if(e.target.closest('.context-menu')) return; menu.classList.remove('show'); if(e.target.closest('.sticky-note')) return;
    const targetNote = e.target.closest('.user-note'); if (targetNote) { if(!targetNote.dataset.id) targetNote.dataset.id = 'note_legacy_' + Date.now(); openExistingNote(targetNote.dataset.id); return; } closeStickyNote();
  });
  document.addEventListener('contextmenu', function(e) {
    if(!e.target.closest('#passageBody')) return; e.preventDefault(); clearElement(menu); contextTargetEdit = null;
    const selection = window.getSelection(); const targetNote = e.target.closest('.user-note'); let node = e.target;
    while (node && node !== document.body) { if (node.nodeType === 1) { if (node.classList.contains('hl-yellow') || node.classList.contains('hl-green') || node.classList.contains('hl-blue') || node.classList.contains('hl-purple') || node.classList.contains('hl-pink') || node.classList.contains('underline')) { contextTargetEdit = node; break; } } node = node.parentNode; }
    if (targetNote) { if(!targetNote.dataset.id) targetNote.dataset.id = 'note_legacy_' + Date.now(); setHtml(menu, `<div class="context-item" data-action="edit-note" data-note-id="${escapeAttr(targetNote.dataset.id)}">📝 Edit Note</div><div class="context-item delete" data-action="delete-note" data-note-id="${escapeAttr(targetNote.dataset.id)}">🗑️ Delete Note</div>`); }
    else if (contextTargetEdit) { setHtml(menu, `<div class="context-item delete" data-action="remove-existing-edit">🗑️ Remove Edit</div>`); }
    else if (!selection.isCollapsed && selection.toString().trim().length > 0) {
      savedRange = selection.getRangeAt(0).cloneRange(); 
      setHtml(menu, `<div class="context-item has-submenu">🖍️ Highlight<div class="submenu"><div class="submenu-item" data-action="apply-annotation" data-annotation="hl-yellow"><span class="color-swatch" style="background:var(--ds-mark-yellow)"></span> Yellow</div><div class="submenu-item" data-action="apply-annotation" data-annotation="hl-green"><span class="color-swatch" style="background:var(--ds-mark-green)"></span> Green</div><div class="submenu-item" data-action="apply-annotation" data-annotation="hl-blue"><span class="color-swatch" style="background:var(--ds-mark-blue)"></span> Blue</div><div class="submenu-item" data-action="apply-annotation" data-annotation="hl-purple"><span class="color-swatch" style="background:var(--ds-mark-blue)"></span> Purple</div><div class="submenu-item" data-action="apply-annotation" data-annotation="hl-pink"><span class="color-swatch" style="background:var(--ds-mark-pink)"></span> Pink</div></div></div><div class="context-item" data-action="apply-annotation" data-annotation="underline">U̲ Underline</div><div class="context-item" data-action="create-note">💬 Add Note</div>`);
    } else { return; }
    let x = e.pageX; let y = e.pageY; if (x + 160 > window.innerWidth) x -= 160; if (y + 200 > window.innerHeight) y -= 200; menu.style.left = x + 'px'; menu.style.top = y + 'px'; menu.classList.add('show');
  });
  const dragHandle = document.getElementById('stickyDragHandle'); const stickyNote = document.getElementById('stickyNote'); let isDragging = false, startX, startY, initialX, initialY;
  dragHandle.addEventListener('mousedown', function(e) { if(e.target.tagName === 'BUTTON') return; isDragging = true; startX = e.clientX; startY = e.clientY; initialX = stickyNote.offsetLeft; initialY = stickyNote.offsetTop; document.body.style.userSelect = 'none'; });
  document.addEventListener('mousemove', function(e) { if (!isDragging) return; const dx = e.clientX - startX; const dy = e.clientY - startY; stickyNote.style.left = (initialX + dx) + 'px'; stickyNote.style.top = (initialY + dy) + 'px'; });
  document.addEventListener('mouseup', function() { isDragging = false; document.body.style.userSelect = ''; });
});
function applyAnnotation(className) { if(!savedRange) return; const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(savedRange); const span = document.createElement('span'); span.className = className; if(className === 'underline') span.style.textDecoration = 'underline'; try { span.appendChild(savedRange.extractContents()); savedRange.insertNode(span); } catch(e) { console.error("Highlight error:", e); } selection.removeAllRanges(); savedRange = null; document.getElementById('customContextMenu').classList.remove('show'); saveAnnotations(); }
function createNewNote() { if(!savedRange) return; const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(savedRange); const id = 'note_' + Date.now(); const span = document.createElement('span'); span.className = 'user-note'; span.dataset.id = id; span.dataset.note = ""; try { span.appendChild(savedRange.extractContents()); savedRange.insertNode(span); } catch(e) { console.error("Note error:", e); } selection.removeAllRanges(); savedRange = null; document.getElementById('customContextMenu').classList.remove('show'); openExistingNote(id); }
function removeExistingEdit() { if (!contextTargetEdit) return; const parent = contextTargetEdit.parentNode; while (contextTargetEdit.firstChild) parent.insertBefore(contextTargetEdit.firstChild, contextTargetEdit); parent.removeChild(contextTargetEdit); contextTargetEdit = null; document.getElementById('customContextMenu').classList.remove('show'); saveAnnotations(); showToast('Edit removed'); }
function openExistingNote(id) { const span = document.querySelector(`.user-note[data-id="${id}"]`); if(!span) return; activeNoteId = id; const rect = span.getBoundingClientRect(); const sticky = document.getElementById('stickyNote'); const textArea = document.getElementById('stickyText'); textArea.value = span.dataset.note || ""; let posX = rect.right + 15; if (posX + 300 > window.innerWidth) posX = rect.left - 300; sticky.style.left = posX + 'px'; sticky.style.top = (rect.top - 20) + 'px'; sticky.classList.add('show'); setTimeout(() => textArea.focus(), 50); }
function closeStickyNote() { const sticky = document.getElementById('stickyNote'); if(!sticky.classList.contains('show')) return; if (activeNoteId) { const span = document.querySelector(`.user-note[data-id="${activeNoteId}"]`); if(span) { span.dataset.note = document.getElementById('stickyText').value; saveAnnotations(); } } sticky.classList.remove('show'); activeNoteId = null; }
function deleteNoteById(id) { const span = document.querySelector(`.user-note[data-id="${id}"]`); if(!span) return; const parent = span.parentNode; while (span.firstChild) parent.insertBefore(span.firstChild, span); parent.removeChild(span); if(activeNoteId === id) closeStickyNote(); document.getElementById('customContextMenu').classList.remove('show'); saveAnnotations(); showToast('Note deleted'); }
function deleteCurrentNote() { if(activeNoteId) deleteNoteById(activeNoteId); }
function saveAnnotations() { if(fbDb && code && !teacherMode) { fbDb.ref('sessions/'+code+'/homework_annotations/'+homeworkId).set(serializeChildren(document.getElementById('passageBody'))).then(()=>{ if(typeof showToast === 'function') showToast('Annotations saved'); }); } }

/* ================== FIREBASE ================== */
function toggleTheme(){ if(window.LSTheme)window.LSTheme.toggle(); const dark=document.documentElement.dataset.theme!=='light'; const b=document.getElementById('themeButton');if(b)b.textContent=dark?'Light theme':'Dark theme'; }
document.getElementById('themeButton').textContent=document.documentElement.classList.contains('dark')?'☀️ Theme':'🌙 Theme';

let answers={}; let submitted=false; let saveTimeout;

let retryTimer = 0;
function setSaveState(state) {
  const el = document.getElementById('saveState');
  if (!el) return;
  const labels = { saving: 'Saving\u2026', saved: 'Saved \u2713 ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), failed: 'Not saved \u2014 retrying\u2026', idle: '' };
  el.textContent = labels[state] || '';
  el.dataset.state = state;
}

function debouncedSave(){
  if(teacherMode) return;
  setSaveState('saving');
  clearTimeout(saveTimeout); saveTimeout=setTimeout(saveAnswersNow,400);
}

function saveAnswersNow(){
  if(!sessionRef||submitted)return;
  clearTimeout(retryTimer);
  sessionRef.child('homework/'+homeworkId).update({ version:homeworkVersion, answers:answers, updatedAt:Date.now() })
    .then(function(){ setSaveState('saved'); writeHomeworkSummary({ submitted:false, completed:false }); })
    .catch(function(error){ console.error('Autosave failed',error); setSaveState('failed'); retryTimer=setTimeout(saveAnswersNow,5000); });
}


function renderPassage(){
  const p=lesson.reading; const body=document.getElementById('passageBody'); if(!body)return;
  let html='<h2>'+escapeHtml(p.title)+'</h2><div class="subtitle">'+escapeHtml(p.subtitle)+'</div>'; const vocabWords=lesson.vocab.map(v=>v.en);
  p.paragraphs.forEach(function(par){ let text=escapeHtml(par.text); vocabWords.forEach(function(w){ let matchStr = w; if (w.startsWith('to ')) matchStr = w.substring(3); const escW=matchStr.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); const re=new RegExp('\\b('+escW+'[a-z]*)\\b','gi'); text=text.replace(re,'<span class="v-word" data-vocab="'+escapeAttr(w)+'">$1</span>'); }); html+='<p><span class="para-label">'+escapeHtml(par.label)+'</span>'+text+'</p>'; });
  setHtml(body, sanitizeRichHtml(html)); body.querySelectorAll('.v-word').forEach(function(el){ el.dataset.action = "open-vocab"; });
  if(fbDb && code) { fbDb.ref('sessions/'+code+'/homework_annotations/'+homeworkId).once('value').then(snap => { if(snap.exists()) { 
      const savedHtml = snap.val();
      const currentTitle = p.title;
      if (currentTitle && savedHtml.includes(currentTitle)) {
          setHtml(body, sanitizeRichHtml(savedHtml));
          body.querySelectorAll('.v-word').forEach(function(el){ el.dataset.action = "open-vocab"; });
          body.querySelectorAll('.user-note').forEach((note, i) => { if(!note.dataset.id) note.dataset.id = 'legacy_' + Date.now() + '_' + i; }); 
      } else {
          fbDb.ref('sessions/'+code+'/homework_annotations/'+homeworkId).remove();
      }
  } }); }
}
function openVocab(word){ const v=lesson.vocab.find(function(x){return x.en===word}); if(!v)return; document.getElementById('vocabEmoji').textContent=v.emoji||'📖'; document.getElementById('vocabWord').textContent=v.en; setHtml(document.getElementById('vocabMeanings'), v.meanings.map(function(m){ const head = m.displayEn ? `<b>${escapeHtml(m.displayEn)}</b><br>` : ''; const posBadge = m.pos ? `<span class="pos-badge">${escapeHtml(m.pos)}</span>` : ''; return '<div class="fc-meaning"><div class="context">'+escapeHtml(m.context)+' '+posBadge+'</div>'+ '<div class="translation">'+head+escapeHtml(m.ru)+'</div>'+ '<div class="example">'+sanitizeRichHtml(m.ex)+'</div></div>'; }).join('')); document.getElementById('vocabBackdrop').classList.add('open'); }
function closeVocab(){document.getElementById('vocabBackdrop').classList.remove('open')}

function updateProgress(){
  const total=lesson.questions.length; const answered=Object.keys(answers).length; const pct=total?Math.round(answered/total*100):0;
  const pf=document.getElementById('progressFill');if(pf)pf.style.width=pct+'%'; const pp=document.getElementById('progressPct');if(pp)pp.textContent=pct+'%'; const pc=document.getElementById('progressCount');if(pc)pc.textContent=answered+' / '+total+' answered';
  const remaining=total-answered; const hint=document.getElementById('submitHint'); const btn=document.getElementById('submitBtn');
  if(submitted){ if(btn){btn.disabled=true;btn.textContent='✓ Submitted'} if(hint)setHtml(hint, 'Homework already submitted.'); return; }
  if(remaining===0){ if(hint)setHtml(hint, 'All questions answered. Ready to submit!'); } else { if(hint)setHtml(hint, '<b>'+remaining+' unanswered.</b> You can still submit; we will show you what is missing first.'); }
  if(btn)btn.disabled=answered===0;
}

function checkLongAnswer(text,keywordGroups,minWords,minGroups){ const t=normalizeString(text); const words=t.split(/\s+/).filter(function(w){return w.length>0}); if(words.length<minWords)return{pass:false,reason:'Your answer is too short. Aim for at least '+minWords+' words.',matched:0}; let matched=0; keywordGroups.forEach(function(g){if(g.some(function(k){return t.indexOf(normalizeString(k))!==-1}))matched++}); if(matched>=minGroups)return{pass:true,matched:matched,total:keywordGroups.length}; return{pass:false,reason:'You matched '+matched+' of '+keywordGroups.length+' key ideas. Check the passage again and try to include more.',matched:matched}; }

// Compact homework status for the teacher dashboard (sessionSummary), kept apart from the answers.
function writeHomeworkSummary(fields) {
  if (teacherMode || !fbDb || !studentContext) return;
  const summary = Object.assign({ updatedAt: Date.now() }, fields);
  fbDb.ref('sessionSummary/' + studentContext.code + '/homework/' + homeworkId).update(summary)
    .catch(function(error) { console.error('Unable to update homework summary', error); });
}

function undoHomeworkQuestion(idx) {
  if (!teacherCanEdit) return;
  const key = answerKey(lesson.questions[idx], idx);
  delete answers[key];
  if (sessionRef) {
      sessionRef.child('homework/'+homeworkId+'/answers').update({ [key]: null }).then(() => {
          renderQuestions();
          showToast('Question reset by teacher');
      });
  } else {
      renderQuestions();
  }
}

async function switchStudent() {
  try { await firebase.auth().signOut(); } catch(error) { console.error('Unable to sign out before switching student',error); }
  for(const storage of [safeLocal,safeSession]) {
    for(let index=storage.length-1;index>=0;index--) {
      const key=storage.key(index);
      if(key&&(key.startsWith('nd_')||key.startsWith('nd:')))storage.removeItem(key);
    }
  }
  window.location.href='portal.html';
}

function renderQuestions(){
  const host=document.getElementById('questionsHost');if(!host)return; clearElement(host);
  lesson.questions.forEach(function(q,idx){
    const ak=answerKey(q,idx);
    const card=document.createElement('div');card.className='q-card';
    const typeLabel={short:'Short answer',tfng:'True / False / Not Given',mcq:'Multiple choice',long:'Long answer',complete:'Complete the sentence'}[q.type]||'';
    setHtml(card, '<div class="q-num">Question '+(idx+1)+' <span class="q-type">'+typeLabel+'</span></div><div class="q-prompt">'+escapeHtml(q.prompt).replace('___','<b style="color:var(--accent)">___</b>')+'</div>');
    const body=document.createElement('div'); card.appendChild(body);
    
    if(q.type==='short'||q.type==='complete'){
      const row=document.createElement('div');row.className='q-input-row'; const inp=document.createElement('input');inp.type='text';inp.className='q-input';inp.placeholder='Type your answer...';inp.autocomplete='off';
      if(submitted){inp.value=answers[ak]||'';inp.disabled=true} else { inp.value=answers[ak]||''; inp.addEventListener('input',function(){ if(inp.value.trim().length>0){answers[ak]=inp.value;} else{delete answers[ak];} updateProgress(); debouncedSave(); }); }
      row.appendChild(inp);body.appendChild(row);
      if(submitted){ const ok = isAnswerCorrect(inp.value, q.answers || [q.answer], { mode: q.type === "short" ? "fuzzy" : "exact" }); if(ok)inp.classList.add('correct'); else inp.classList.add('wrong'); const fb=document.createElement('div'); fb.className='q-feedback ' + (ok ? 'correct' : 'wrong'); setHtml(fb, (ok ? '✓ Correct!' : '✗ Incorrect. Expected: '+escapeHtml(q.answers[0]||q.answer))+'<span class="exp">'+escapeHtml(q.exp||'')+'</span>'); fb.style.display='block'; body.appendChild(fb); }
    }else if(q.type==='tfng'){
      const opts=document.createElement('div');opts.className='q-opts';
      ['True','False','Not Given'].forEach(function(o){ const b=document.createElement('button');b.className='q-opt';b.textContent=o; if(submitted){ b.disabled=true; if(o===q.answer)b.classList.add('correct'); if(answers[ak]===o && o!==q.answer)b.classList.add('wrong'); } else { b.dataset.action = "choose-answer"; b.dataset.questionIndex = String(idx); b.dataset.answer = o; if(answers[ak]===o) b.classList.add('selected'); } opts.appendChild(b); });
      body.appendChild(opts);
      if(submitted){ const fb=document.createElement('div'); fb.className='q-feedback ' + (answers[ak]===q.answer ? 'correct' : 'wrong'); setHtml(fb, (answers[ak]===q.answer ? '✓ Correct!' : '✗ Incorrect.') + '<span class="exp">'+escapeHtml(q.exp||'')+'</span>'); fb.style.display='block'; body.appendChild(fb); }
    }else if(q.type==='mcq'){
      const opts=document.createElement('div');opts.className='q-opts';
      shuffle(q.options).forEach(function(o){ const b=document.createElement('button');b.className='q-opt';b.textContent=o; if(submitted){ b.disabled=true; if(o===q.correct)b.classList.add('correct'); if(answers[ak]===o && o!==q.correct)b.classList.add('wrong'); } else { b.dataset.action = "choose-answer"; b.dataset.questionIndex = String(idx); b.dataset.answer = o; if(answers[ak]===o) b.classList.add('selected'); } opts.appendChild(b); });
      body.appendChild(opts);
      if(submitted){ const fb=document.createElement('div'); fb.className='q-feedback ' + (answers[ak]===q.correct ? 'correct' : 'wrong'); setHtml(fb, (answers[ak]===q.correct ? '✓ Correct!' : '✗ Incorrect.') + '<span class="exp">'+escapeHtml(q.exp||'')+'</span>'); fb.style.display='block'; body.appendChild(fb); }
    }else if(q.type==='long'){
      const ta=document.createElement('textarea');ta.className='q-textarea';ta.placeholder='Write your answer in full sentences...';
      if(submitted){ta.value=answers[ak]||'';ta.disabled=true} else { ta.value=answers[ak]||''; ta.addEventListener('input',function(){ if(ta.value.trim().length>0){answers[ak]=ta.value;} else{delete answers[ak];} updateProgress();debouncedSave(); }); }
      body.appendChild(ta);
      if(submitted){ const res=checkLongAnswer(answers[ak]||'',q.keywordGroups,q.minWords,q.minGroups); if(res.pass)ta.classList.add('correct'); else ta.classList.add('wrong'); const fb=document.createElement('div'); fb.className='q-feedback ' + (res.pass ? 'correct' : 'wrong'); setHtml(fb, (res.pass ? '✓ Looks correct!' : '✗ '+res.reason) + '<span class="sample"><b>Sample answer:</b> '+escapeHtml(q.sample)+'</span>'); fb.style.display='block'; body.appendChild(fb); }
    }

    if(submitted && teacherCanEdit) {
        const rst = document.createElement('button');
        rst.className = 'btn danger small'; rst.textContent = '↺ Undo Question'; rst.style.marginTop = '10px';
        rst.dataset.action = "undo-homework-question";
        rst.dataset.questionIndex = String(idx);
        card.appendChild(rst);
    }

    host.appendChild(card);
  });
  updateProgress();
}

function unansweredNumbers(){
  return lesson.questions.map(function(q,idx){ return answers[answerKey(q,idx)]===undefined?idx+1:0; }).filter(Boolean);
}

let modalReturnFocus = null;
function openSubmitModal(){
  const missing = unansweredNumbers();
  const body = document.getElementById('submitModalBody');
  body.replaceChildren();
  const summary = document.createElement('p');
  summary.textContent = missing.length
    ? 'You have answered ' + (lesson.questions.length - missing.length) + ' of ' + lesson.questions.length + ' questions. Unanswered: ' + missing.map(function(n){ return 'Question ' + n; }).join(', ') + '.'
    : 'You answered all ' + lesson.questions.length + ' questions. Ready to send it to your teacher?';
  body.append(summary);
  modalReturnFocus = document.activeElement;
  document.getElementById('submitModal').hidden = false;
  document.getElementById('keepWorkingBtn').focus();
}
function closeSubmitModal(){
  document.getElementById('submitModal').hidden = true;
  if (modalReturnFocus && modalReturnFocus.focus) modalReturnFocus.focus();
}
function requestSubmit(){
  if (submitted || !lesson || !lesson.questions) return;
  openSubmitModal();
}

async function submitAll(){
  if(submitted)return; const total=lesson.questions.length;
  let score=0; lesson.questions.forEach(function(q,idx){ const a=answers[answerKey(q,idx)]; if(a===undefined)return; if(q.type==='short'||q.type==='complete'){ if(isAnswerCorrect(a, q.answers || [q.answer], { mode: q.type === "short" ? "fuzzy" : "exact" })) score++; }else if(q.type==='tfng'){ if(a===q.answer)score++; }else if(q.type==='mcq'){ if(a===q.correct)score++; }else if(q.type==='long'){ const res=checkLongAnswer(String(a),q.keywordGroups,q.minWords,q.minGroups); if(res.pass)score++; } });
  if(!sessionRef||!studentContext)throw new Error('Verified student session is unavailable; your work was not submitted.');
  try {
      await sessionRef.child('homework/'+homeworkId).update({
        version:homeworkVersion,
        answers:answers,
        rawAnswers:answers,
        score:score,
        total:total,
        submitted:true,
        completed:true,
        submittedAt:firebase.database.ServerValue.TIMESTAMP,
        submittedBy:{name:studentContext.name,code:studentContext.code},
        contentFile:contentFile,
        contentHash:contentHash,
        schemaVersion:schemaVersion,
        updatedAt:firebase.database.ServerValue.TIMESTAMP
      });
      await appendBoundedRealtimeRecord(sessionRef.child('history'), {
          actor: 'student',
          type: 'homework_submit',
          detail: 'Submitted homework: ' + (lesson.title || homeworkId),
          ts: Date.now(),
          contentFile:contentFile,
          contentHash:contentHash
      });
  } catch(error) {
    console.error('Homework submission failed',error);
    document.getElementById('submitHint').textContent='Submission failed: '+error.message+'. Your answers are still on this page; please retry.';
    return;
  }
  submitted=true;
  writeHomeworkSummary({ submitted:true, completed:true, score:score, total:total });
  
  renderQuestions(); const host=document.getElementById('questionsHost');
  const banner=document.createElement('div');banner.className='result-banner';
  const xpEarned = score * 10 + (score === total ? 5 : 0);
  awardHomeworkXp(xpEarned);
  setHtml(banner, '<div class="icon">🎉</div><h3>Homework complete!</h3><div class="big">' + score + ' / ' + total + '</div>' +
    '<p class="xp-earned">+' + xpEarned + ' XP earned' + (score === total ? ' (perfect score bonus!)' : '') + '</p>' +
    '<p>Your answers have been sent to your teacher. Scroll down to see what each question was looking for.</p>' +
    '<p class="submit-once">This homework can only be submitted once.</p>' +
    '<p><a class="ds-btn ds-btn--primary" href="portal.html">Back to my lessons</a></p>');
  const receipt=document.createElement('p');
  receipt.textContent='Submitted as '+studentContext.name+' at '+new Date().toLocaleString();
  banner.appendChild(receipt);
  host.insertBefore(banner,host.firstChild); window.scrollTo({top:0,behavior:'smooth'}); confetti(); updateProgress();
}

// XP for finished homework: 10 per correct answer, +5 for a perfect score (same rule as the practice games).
function awardHomeworkXp(xpEarned){
  if(!fbDb||!studentContext||xpEarned<=0)return;
  fbDb.ref('studentProgress/'+studentContext.code).transaction(function(current){
    const state=current&&typeof current==='object'?current:{};
    const xp=Math.max(0,Number(state.xp)||0)+xpEarned;
    return Object.assign({},state,{xp:xp,level:Math.floor(xp/100)+1});
  }).catch(function(error){ console.error('Could not record homework XP',error); });
}



async function loadHomeworkContent() {
  const [{ resolveStudentContext }, protectedModule] = await Promise.all([import('../student-context.js'), import('../protected-content.js')]);
  if(teacherPreviewRequested) {
    const fileName=variant.startsWith('homework_')?variant:'homework_'+variant;
    if(!/^homework_[a-z0-9_]+$/i.test(fileName))throw new Error('Invalid teacher-preview content selection.');
    const {loadProtectedContent}=protectedModule;
    try {
      const protectedRecord=await loadProtectedContent(fbDb,homeworkId,'homework');
      if(protectedRecord.sourceFile&&protectedRecord.sourceFile!==fileName+'.json')throw new Error('Protected homework does not match the selected preview file.');
      lesson=protectedRecord.content;
      contentFile='Firebase protected content/'+homeworkId+'/homework';
    } catch(error) {
      if(!error.message.includes('has not been imported'))throw error;
      contentFile='content/'+fileName+'.json';
      const response=await fetch(contentFile,{cache:'no-store'});
      if(!response.ok)throw new Error('Content not found. Tell your teacher (lessonId='+homeworkId+', file='+contentFile+').');
      lesson=await response.json();
    }
  } else {
    studentContext=await resolveStudentContext({auth:fbAuth,db:fbDb,lessonId:homeworkId});
    code=studentContext.code;
    const snapshot=await fbDb.ref('studentCurriculum/'+code+'/'+homeworkId).once('value');
    if(!snapshot.exists())throw new Error('Homework assignment not found. Tell your teacher (lessonId='+homeworkId+').');
    const assignment=snapshot.val();
    if(!assignment.homework||assignment.published===false)throw new Error('This homework is not assigned to this student.');
    const manifestResponse=await fetch('content/manifest.json',{cache:'no-store'});
    if(!manifestResponse.ok)throw new Error('Content manifest could not be loaded.');
    const manifest=await manifestResponse.json();
    const entry=manifest[homeworkId];
    const contentUrl=String(assignment.contentUrl||'').replace(/^content\//,'');
    const homeworkUrl=assignment.homeworkContentUrl||
      (/^homework_[a-z0-9_-]+\.json$/i.test(contentUrl)?contentUrl:null);
    const requested=homeworkUrl||entry&&entry.homeworkFile;
    if(!requested||typeof requested!=='string')throw new Error('Content not found. Tell your teacher (lessonId='+homeworkId+', file=unassigned).');
    const fileName=requested.replace(/^content\//,'');
    if(fileName.includes('..')||fileName.includes('/')||!/^homework_[a-z0-9_]+\.json$/i.test(fileName))throw new Error('Invalid homework content reference.');
    const {loadProtectedContent}=protectedModule;
    const protectedRecord=await loadProtectedContent(fbDb,homeworkId,'homework');
    if(protectedRecord.sourceFile&&protectedRecord.sourceFile!==fileName)throw new Error('Protected homework does not match the assigned content file.');
    lesson=protectedRecord.content;
    contentFile='Firebase protected content/'+homeworkId+'/homework';
  }
  if(!lesson||!Array.isArray(lesson.questions))throw new Error('Homework content has an invalid question set.');
  schemaVersion=lesson.schemaVersion||1;
  if(crypto&&crypto.subtle){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(lesson)));contentHash=Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('')}
  return studentContext;
}

// A teacher reset never destroys a submission: the current record is archived under `attempts`
// (bounded to the last 10) and then cleared so the student can retake the homework.
async function resetHomeworkTeacher() {
  if(!confirm('Reset this homework for the student? Their current answers are archived and they can take it again.')) return;
  if(!sessionRef) return;
  try {
    const recordRef = sessionRef.child('homework/'+homeworkId);
    const data = (await recordRef.once('value')).val() || {};
    if (Object.keys(data).length) await appendBoundedRealtimeRecord(recordRef.child('attempts'), archivedHomeworkData(data), 10);
    await recordRef.update({
      version: homeworkVersion, answers: null, rawAnswers: null, score: null, total: null,
      submitted: false, completed: false, submittedAt: null, submittedBy: null, updatedAt: null
    });
    alert('Homework reset. The previous attempt was archived and the student can retake it.');
    location.reload();
  } catch (error) { alert('Reset failed: ' + error.message); }
}

async function initFirebase(){
  const config=await import('../config.js');
  firebaseConfig=config.firebaseConfig;
  fbApp=firebase.apps.length?firebase.app():firebase.initializeApp(firebaseConfig);
  fbDb=firebase.database();
  watchConnection(fbDb);
  fbAuth=firebase.auth();
  if(teacherPreviewRequested) {
    const user=await new Promise(function(resolve,reject){
      let unsubscribe=()=>{};
      unsubscribe=fbAuth.onAuthStateChanged(function(current){unsubscribe();resolve(current)},function(error){unsubscribe();reject(error)});
    });
    teacherCanEdit=await isTeacher(user,fbDb);
    teacherMode=teacherCanEdit;
    if(!teacherCanEdit)throw new Error('Teacher sign-in required.');
    document.getElementById('teacherResetArea').style.display='block';
    await loadHomeworkContent();
    document.title=lesson.title;
    document.getElementById('hwTitle').textContent=lesson.title;
    document.getElementById('hwSub').textContent=lesson.sub||'';
    document.getElementById('heroEyebrow').textContent=lesson.eyebrow||'';
    document.getElementById('heroHeadline').textContent=lesson.headline||lesson.title;
    document.getElementById('heroIntro').textContent=lesson.intro||'';
    return;
  }
  await loadHomeworkContent();
  document.title=lesson.title;
  document.getElementById('hwTitle').textContent=lesson.title;
  document.getElementById('hwSub').textContent=lesson.sub||'';
  document.getElementById('heroEyebrow').textContent=lesson.eyebrow||'';
  document.getElementById('heroHeadline').textContent=lesson.headline||lesson.title;
  document.getElementById('heroIntro').textContent=lesson.intro||'';
  const banner=document.getElementById('studentIdentityBanner');
  document.getElementById('studentIdentityText').textContent='You are working as '+studentContext.name+' ('+studentContext.code+') — '+lesson.title+' · '+contentFile;
  banner.classList.add('ready');
  if(new URLSearchParams(location.search).get('debug')==='1') {
    const debug=document.createElement('pre');
    debug.textContent=JSON.stringify({code:studentContext.code,uid:studentContext.uid,lessonId:studentContext.lessonId,contentFile,contentHash,schemaVersion,storageNamespace:studentContext.storageNamespace},null,2);
    banner.after(debug);
  }
}

function archivedHomeworkData(data) {
  const archived = {
    version: Number.isInteger(data.version) && data.version >= 1 && data.version <= 100
      ? data.version
      : homeworkVersion
  };
  for (const field of ["answers", "rawAnswers"]) {
    const source = data[field];
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    const safeAnswers = Object.fromEntries(Object.entries(source)
      .filter(([key, value]) => /^[A-Za-z0-9_-]{1,64}$/.test(key) &&
        (typeof value === "string" ? value.length <= 2000 :
          typeof value === "number" ? Number.isFinite(value) : typeof value === "boolean"))
      .slice(0, 500));
    if (Object.keys(safeAnswers).length) archived[field] = safeAnswers;
  }
  if (Number.isFinite(data.score) && data.score >= 0 && data.score <= 500 &&
      Number.isFinite(data.total) && data.total >= 1 && data.total <= 500 &&
      data.score <= data.total) {
    archived.score = data.score;
    archived.total = data.total;
  }
  for (const field of ["submitted", "completed"]) {
    if (typeof data[field] === "boolean") archived[field] = data[field];
  }
  for (const field of ["submittedAt", "updatedAt"]) {
    if (Number.isFinite(data[field]) && data[field] >= 0) archived[field] = data[field];
  }
  if (data.submittedBy && typeof data.submittedBy === "object" &&
      typeof data.submittedBy.name === "string" &&
      typeof data.submittedBy.code === "string" &&
      /^[A-Z0-9]{4,12}$/.test(data.submittedBy.code)) {
    archived.submittedBy = {
      name: data.submittedBy.name.slice(0, 80),
      code: data.submittedBy.code
    };
  }
  for (const field of ["contentFile", "contentHash"]) {
    if (typeof data[field] === "string") {
      archived[field] = data[field].slice(0, field === "contentFile" ? 160 : 128);
    }
  }
  if (Number.isInteger(data.schemaVersion) && data.schemaVersion >= 1 && data.schemaVersion <= 100) {
    archived.schemaVersion = data.schemaVersion;
  }
  return archived;
}

const clickAction = run => ({ event: "click", run });
installDelegatedActions({
  "switch-student": clickAction(switchStudent),
  "reset-homework-teacher": clickAction(resetHomeworkTeacher),
  "toggle-theme": clickAction(toggleTheme),
  "submit-homework": clickAction(requestSubmit),
  "cancel-submit": clickAction(closeSubmitModal),
  "confirm-submit": clickAction(function() { closeSubmitModal(); submitAll(); }),
  "delete-current-note": clickAction(deleteCurrentNote),
  "close-sticky-note": clickAction(closeStickyNote),
  "close-vocab-backdrop": clickAction((element, event) => {
    if (event.target === element) closeVocab();
  }),
  "close-vocab": clickAction(closeVocab),
  "edit-note": clickAction((element, event) => {
    const id = readActionParam(element, "noteId", /^(?:note|legacy)_[A-Za-z0-9_-]{1,64}$/);
    if (!id) return;
    event.preventDefault();
    openExistingNote(id);
  }),
  "delete-note": clickAction((element, event) => {
    const id = readActionParam(element, "noteId", /^(?:note|legacy)_[A-Za-z0-9_-]{1,64}$/);
    if (!id) return;
    event.preventDefault();
    deleteNoteById(id);
  }),
  "remove-existing-edit": clickAction((element, event) => {
    event.preventDefault();
    removeExistingEdit();
  }),
  "apply-annotation": clickAction((element, event) => {
    const annotation = readActionEnum(element, "annotation", [
      "hl-yellow", "hl-green", "hl-blue", "hl-purple", "hl-pink", "underline"
    ]);
    if (!annotation) return;
    event.preventDefault();
    applyAnnotation(annotation);
  }),
  "create-note": clickAction((element, event) => {
    event.preventDefault();
    createNewNote();
  }),
  "open-vocab": clickAction(element => {
    const word = readActionParam(element, "vocab", /^[\s\S]{1,100}$/);
    if (word && lesson?.vocab?.some(item => item.en === word)) openVocab(word);
  }),
  "choose-answer": clickAction(element => {
    if (submitted || !Array.isArray(lesson?.questions)) return;
    const index = readActionInteger(element, "questionIndex", 0, lesson.questions.length - 1);
    const answer = readActionParam(element, "answer", /^[\s\S]{1,500}$/);
    const question = index === null ? null : lesson.questions[index];
    if (!question || !answer) return;
    const validAnswers = question.type === "tfng"
      ? ["True", "False", "Not Given"]
      : question.type === "mcq" && Array.isArray(question.options)
        ? question.options
        : [];
    if (!validAnswers.includes(answer)) return;
    const options = element.closest(".q-opts");
    if (!options) return;
    options.querySelectorAll("button").forEach(button => button.classList.remove("selected"));
    element.classList.add("selected");
    answers[answerKey(question, index)] = answer;
    updateProgress();
    debouncedSave();
  }),
  "undo-homework-question": clickAction(element => {
    if (!Array.isArray(lesson?.questions)) return;
    const index = readActionInteger(element, "questionIndex", 0, lesson.questions.length - 1);
    if (index !== null && submitted && teacherCanEdit) undoHomeworkQuestion(index);
  })
});

async function startHomework(){
  if(!fbDb||(!studentContext&&!teacherMode))throw new Error('Verified student context is required to start homework.');
  if(teacherMode&&!code){renderPassage();renderQuestions();return}
  sessionRef=fbDb.ref('sessions/'+code);
  const recordRef=sessionRef.child('homework/'+homeworkId);
  const snapshot=await recordRef.once('value');
  const data=snapshot.val()||{};
  if(data.submitted===true) {
    answers=migrateLegacyAnswerKeys(data.answers, lesson.questions);
    submitted=true;
  } else {
    if(Number(data.version)===homeworkVersion) {
      answers=migrateLegacyAnswerKeys(data.answers, lesson.questions);
      await recordRef.update({contentFile,contentHash,schemaVersion});
    }
    else {
      if(Object.keys(data).length) {
        await appendBoundedRealtimeRecord(recordRef.child('attempts'),archivedHomeworkData(data),10);
      }
      answers={};submitted=false;
      await recordRef.update({version:homeworkVersion,answers:{},score:0,total:lesson.questions.length,completed:false,contentFile,contentHash,schemaVersion});
    }
  }
  renderPassage();renderQuestions();
  if(submitted){ const host=document.getElementById('questionsHost'); const banner=document.createElement('div');banner.className='result-banner'; setHtml(banner, '<div class="icon">✓</div><h3>Homework already submitted</h3>'+ '<p>Your teacher has your answers. You can review the feedback below.</p>'); host.insertBefore(banner,host.firstChild); }
}

(async function boot() {
  try {
    await initFirebase();
    await startHomework();
  } catch (error) {
    console.error('Homework access or content initialization failed',error);
    const message=document.createElement('main');
    message.className='ds-error-wrap';
    document.body.replaceChildren(message);
    showErrorPage(message,error,{title:'Homework could not be opened'});
  }
})();


if (typeof escapeHtml === "function") globalThis["escapeHtml"] = escapeHtml;
if (typeof escapeAttr === "function") globalThis["escapeAttr"] = escapeAttr;
if (typeof shuffle === "function") globalThis["shuffle"] = shuffle;
if (typeof applyAnnotation === "function") globalThis["applyAnnotation"] = applyAnnotation;
if (typeof createNewNote === "function") globalThis["createNewNote"] = createNewNote;
if (typeof removeExistingEdit === "function") globalThis["removeExistingEdit"] = removeExistingEdit;
if (typeof openExistingNote === "function") globalThis["openExistingNote"] = openExistingNote;
if (typeof closeStickyNote === "function") globalThis["closeStickyNote"] = closeStickyNote;
if (typeof deleteNoteById === "function") globalThis["deleteNoteById"] = deleteNoteById;
if (typeof deleteCurrentNote === "function") globalThis["deleteCurrentNote"] = deleteCurrentNote;
if (typeof saveAnnotations === "function") globalThis["saveAnnotations"] = saveAnnotations;
if (typeof toggleTheme === "function") globalThis["toggleTheme"] = toggleTheme;
if (typeof debouncedSave === "function") globalThis["debouncedSave"] = debouncedSave;
if (typeof renderPassage === "function") globalThis["renderPassage"] = renderPassage;
if (typeof openVocab === "function") globalThis["openVocab"] = openVocab;
if (typeof closeVocab === "function") globalThis["closeVocab"] = closeVocab;
if (typeof updateProgress === "function") globalThis["updateProgress"] = updateProgress;
if (typeof checkLongAnswer === "function") globalThis["checkLongAnswer"] = checkLongAnswer;
if (typeof undoHomeworkQuestion === "function") globalThis["undoHomeworkQuestion"] = undoHomeworkQuestion;
if (typeof switchStudent === "function") globalThis["switchStudent"] = switchStudent;
if (typeof renderQuestions === "function") globalThis["renderQuestions"] = renderQuestions;
if (typeof submitAll === "function") globalThis["submitAll"] = submitAll;
if (typeof confetti === "function") globalThis["confetti"] = confetti;
if (typeof loadHomeworkContent === "function") globalThis["loadHomeworkContent"] = loadHomeworkContent;
if (typeof resetHomeworkTeacher === "function") globalThis["resetHomeworkTeacher"] = resetHomeworkTeacher;
if (typeof initFirebase === "function") globalThis["initFirebase"] = initFirebase;
if (typeof startHomework === "function") globalThis["startHomework"] = startHomework;
if (typeof boot === "function") globalThis["boot"] = boot;
if (typeof unsubscribe === "function") globalThis["unsubscribe"] = unsubscribe;

document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape' && !document.getElementById('submitModal').hidden) closeSubmitModal();
});
