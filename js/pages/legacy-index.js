import { installDelegatedActions, readActionInteger, readActionParam, registerDelegatedClick, runRegisteredClick } from "../delegated-actions.js";

const stages=[{name:'Warm-up',tag:'01',title:'What do you notice?'},{name:'New words',tag:'02',title:'Meet the vocabulary'},{name:'Read',tag:'03',title:'Follow the weather'},{name:'Understand',tag:'04',title:'Reading detectives'},{name:'Passive voice',tag:'05',title:'Notice the hidden doer'},{name:'Present perfect',tag:'06',title:'Connect then to now'}];
const hazards=[['🌨️','blizzard'],['🏜️','drought'],['🌎','earthquake'],['🌧️','flood'],['🌡️','heat wave'],['🌀','hurricane'],['⛈️','thunderstorm'],['🌪️','tornado'],['🌊','tsunami'],['🔥','wildfire']];
const vocab=[['🌨️','blizzard','a long, strong snowstorm','метель'],['🏜️','drought','a long time with very little rain','засуха'],['〰️','tremor','a small shaking movement','толчок'],['🌊','overflow','to spill over the edge','выходить из берегов'],['🌡️','heat wave','a period of unusually hot weather','период сильной жары'],['🧭','region','an area or part of a country','регион'],['💨','humid','warm and slightly wet in the air','влажный'],['〰️','surge','a sudden, powerful movement forward','резкий мощный поток'],['🕳️','crust','the hard outer layer of the Earth','земная кора'],['🌳','deforestation','the removal of many trees','вырубка лесов'],['🌬️','spread','to move over a larger area','распространяться'],['⏱️','magnitude','the size or strength of something','величина / сила']];
const matching=[{w:'tremor',d:'a small shaking movement'},{w:'overflow',d:'spill over the edge'},{w:'humid',d:'warm and wet in the air'},{w:'crust',d:'the Earth’s hard outer layer'},{w:'spread',d:'move over a larger area'},{w:'magnitude',d:'the size or strength of something'}];
const passage=[
  {title:'1 · A world of weather',text:'Nature can change quickly. A blizzard is a long snowstorm with strong winds that lasts for three hours or more. It can form when cold air meets warm air. A drought is different: an area gets very little rain for a long time. People can affect the land, too. When many trees are removed, this is called deforestation. It can make dry conditions worse and increase the risk of a drought.'},
  {title:'2 · When the ground moves',text:'An earthquake happens when the Earth’s crust moves suddenly and violently. The shaking can be small, with only a few tremors, or very strong. Scientists call its strength its magnitude. A powerful earthquake can topple buildings, damage bridges, and break other structures. The ground may shake for only a short time, but the damage can remain after the shaking stops.'},
  {title:'3 · Too much water, too much heat',text:'A flood happens when water covers land that is usually dry. Heavy rain or melting snow can make rivers and other bodies of water overflow. The extra water then spreads across nearby land. Floods are the most common natural disaster in the United States; FEMA says nearly 90 percent of disasters there involve flooding. A heat wave brings temperatures that are much higher than usual in a region. High pressure can hold hot air near the ground. This makes rain less likely, so a drought may follow.'},
  {title:'4 · Storms in the sky',text:'A hurricane is a giant, swirling storm with severe thunderstorms and winds that can reach 160 miles per hour. In some parts of the world, hurricanes are called typhoons, and they happen during particular seasons. A thunderstorm often brings lightning, wind, and heavy rain, although it can also bring hail, sleet, or snow. These storms can begin when warm, humid air rises. A tornado is a destructive, rotating column of air. Its winds may reach 100 to 300 miles per hour. It often looks like a funnel and may form over land or water.'},
  {title:'5 · Waves, fire, and other hazards',text:'A tsunami is a very large ocean wave that surges onto land. The waves can reach 100 feet high. Most tsunamis are caused by underwater earthquakes; the shaking disturbs the water and sends waves outward. Some tsunamis can also happen in lakes. A wildfire is a forest, bush, or grass fire that can spread quickly and unpredictably. People start many wildfires, while dry weather and strong winds can help them spread. Landslides and avalanches can follow earthquakes, heavy rain, or snow. When volcanoes erupt, they send ash into the air and lava onto the ground. Each event is different, so learning about hazards helps people prepare.'}
];
const defs=Object.fromEntries(vocab.map(v=>[v[1],v[2]]));
const readingHTML={blizzard:'a long snowstorm',drought:'a long time with very little rain',deforestation:'the removal of many trees',crust:'the Earth’s hard outer layer',tremors:'small shaking movements',magnitude:'the size or strength',overflow:'spill over the edge',region:'an area or part of a country',humid:'warm and wet in the air',surges:'moves forward suddenly and powerfully',spread:'move over a larger area'};
function markWords(text){return text.replace(/\b(blizzard|drought|deforestation|crust|tremors|magnitude|overflow|region|humid|surges|spread)\b/gi,w=>`<button class="gloss" data-gloss="${w.toLowerCase()}">${w}</button>`)}
let state={stage:0,done:new Set(),matches:0,selected:null,checked:new Set(),grammarRight:0,ppChecked:false,ppBuiltCorrect:false,builder:[]};
function nav(){const el=document.getElementById('stepNav');el.innerHTML=stages.map((s,i)=>`<button class="step-button ${i===state.stage?'active':''} ${state.done.has(i)?'done':''}" data-action="go-to-stage" data-stage="${i}"><span class="step-index">${s.tag} ${state.done.has(i)?'✓':''}</span><span class="step-title">${s.name}</span></button>`).join('');document.getElementById('progressText').textContent=`TODAY'S JOURNEY · ${state.done.size} OF 6`;document.getElementById('progressPct').textContent=Math.round(state.done.size/6*100)+'%';document.getElementById('progressFill').style.width=(state.done.size/6*100)+'%'}
function go(n){state.stage=n;nav();render();window.scrollTo({top:0,behavior:'smooth'})}
function doneNext(){state.done.add(state.stage);if(state.stage<5)go(state.stage+1);else{nav();render()}}
function render(){const w=document.getElementById('workspace');const s=stages[state.stage];w.innerHTML=`<section class="stage active"><div class="stage-head"><div><div class="eyebrow">${s.tag} / 06 · ${s.title}</div><h2>${stageTitles[state.stage]}</h2></div><p>${stageSubs[state.stage]}</p></div>${renderStage(state.stage)}</section>`;bindStage()}
const stageTitles=['Start with a guess','Let’s make the words familiar','A reading passage: natural disasters','Find the facts in the passage','How does the sentence work?','A new bridge: past to now'];
const stageSubs=['No need to know every answer. Look at the picture clues, guess together, and talk about weather you have seen.','Tap a word card to reveal a helpful Russian meaning. Then try a short matching game before reading.','Read one short section at a time. Tap an underlined word whenever you want a simple meaning. Pause after each section and retell it in your own words.','Choose an answer for each clue. Read the explanation together, then go back to the passage to find the evidence.','Use the event to notice present simple passive for facts and past simple passive for completed events. Choose, then build a sentence together.','Now that the topic is familiar, meet present perfect. Notice how an earlier experience or change connects to life now.'];
function renderStage(i){if(i===0)return warmup();if(i===1)return vocabulary();if(i===2)return reading();if(i===3)return comprehension();if(i===4)return passive();return presentPerfect()}
function warmup(){return `<div class="panel"><div class="panel-title">Picture prediction · tap any card to reveal its name</div><div class="guess-grid">${hazards.map(([e,w],i)=>`<button class="guess" data-reveal="${i}"><span class="emoji">${e}</span><span class="answer">Tap to reveal</span></button>`).join('')}</div><div class="teacher-prompt"><b>Talk together:</b> Which of these have you seen in a picture or film? Which do you think are caused by water, wind, heat, or movement in the ground?</div><div class="feedback" id="warmFeedback">Reveal at least five cards to unlock the next step.</div><div class="actions"><span class="progress-label">A gentle prediction warm-up</span><button class="btn" id="continue" disabled>Meet the new words →</button></div></div>`}
function vocabulary(){const order=[...Array(vocab.length).keys()];return `<div class="grid two-col"><article class="panel"><div class="vocab-help"><span>Tap a card to see a translation. Say the word aloud.</span><button class="btn secondary" id="sayVocab">🔊 Hear the words</button></div><div class="vocab-grid">${vocab.map((v,i)=>`<button class="vocab" data-vocab="${i}"><span class="v-icon">${v[0]}</span><span class="word">${v[1]}</span><span class="short-def">${v[2]}</span><span class="translation">${v[3]}</span></button>`).join('')}</div><div class="note" style="margin-top:12px"><strong>Teacher move:</strong> Model each word, ask the student to point to the matching icon, then use it in a short sentence.</div></article><article class="panel"><div class="panel-title">Match the word to its meaning · ${state.matches}/6</div><p style="font-size:11px;color:var(--muted);line-height:1.5">Choose one word on the left and its meaning on the right. If it doesn’t match, try another.</p><div class="match-game" id="matchGame">${matchButtons()}</div><div class="feedback" id="matchFeedback">Start with “tremor”.</div><div class="actions"><span class="progress-label">Six quick matches</span><button class="btn" id="continue" ${state.matches<6?'disabled':''}>Ready to read →</button></div></article></div>`}
function matchButtons(){const meanings=[...matching].sort((a,b)=>a.w.localeCompare(b.w));const words=[...matching].sort((a,b)=>b.w.localeCompare(a.w));return `<div>${words.map((m,i)=>`<button class="match-btn word-match" data-word="${m.w}">${m.w}</button>`).join('')}</div><div>${meanings.map(m=>`<button class="match-btn def-match" data-def="${m.w}">${m.d}</button>`).join('')}</div>`}
function reading(){return `<div class="read-columns"><article class="panel"><div class="read-tools"><span class="instruction">Tap the underlined vocabulary for a quick meaning. Take turns reading sections.</span><button class="btn secondary" id="readAloud">🔊 Read aloud</button></div><div class="passage">${passage.map(p=>`<section class="passage-card"><h3>${p.title}</h3><p>${markWords(p.text)}</p><div class="passage-tip"></div></section>`).join('')}</div><div class="actions"><span class="progress-label">Teacher can pause after each section</span><button class="btn" id="continue">I’ve read the passage →</button></div></article><aside class="read-aside"><div class="panel"><div class="panel-title">Reading map</div><h3>Five small chapters</h3><p>Read a section, pause, and ask: “What is the main idea?” The goal is understanding, not translating every word.</p><div class="fact-chip"><strong>Look for:</strong> what happens, what causes it, and one interesting detail.</div><div class="fact-chip"><strong>Helpful strategy:</strong> circle the key word, then use the sentence around it.</div></div><div class="panel" style="margin-top:10px"><div class="panel-title">Try saying</div><p style="font-size:11px;line-height:1.55;color:var(--muted);margin:0">“A ___ happens when…”<br>“It is caused by…”<br>“One new fact I learned is…”</p></div></aside></div>`}
const compQs=[
  {q:'What can make a drought worse?',opts:['Removing many trees','A few small tremors','Cold air meeting warm air'],a:0,why:'The passage says deforestation can make dry conditions worse.'},
  {q:'What does “magnitude” describe?',opts:['The strength of an earthquake','The amount of rain in a flood','The shape of a tornado'],a:0,why:'Magnitude means the size or strength of something; here, an earthquake.'},
  {q:'What can make rivers overflow?',opts:['Heavy rain or melting snow','High pressure only','A funnel-shaped cloud'],a:0,why:'The passage connects heavy rain and melting snow to overflowing rivers.'},
  {q:'Which detail about thunderstorms is true?',opts:['They always bring snow','They can bring hail, sleet, or snow','They only happen over the sea'],a:1,why:'The passage says thunderstorms often bring rain, but can also bring hail, sleet, or snow.'},
  {q:'What causes most tsunamis in the passage?',opts:['Underwater earthquakes','Strong summer sunshine','Wildfires near the coast'],a:0,why:'Underwater earthquakes disturb the water and send waves outward.'},
  {q:'What can help a wildfire spread?',opts:['Dry weather and strong winds','Melting ice and snow','A humid breeze only'],a:0,why:'Dry weather and strong winds can help wildfires spread.'}
];
function comprehension(){return `<div class="panel"><div class="panel-title">Six evidence hunts · ${state.checked.size}/6 answered correctly</div><div class="note" style="margin-bottom:13px"><strong>How to play:</strong> Student chooses; teacher asks “Which part of the text helped you?” A wrong answer stays available for another try.</div><div class="question-list">${compQs.map((q,i)=>`<article class="q-card"><div class="q-top">Clue ${i+1} · find the evidence</div><div class="q-text">${q.q}</div><div class="q-options">${q.opts.map((o,j)=>`<button class="option" data-comp="${i}" data-opt="${j}" ${state.checked.has(i)?'disabled':''}>${o}</button>`).join('')}</div><div class="q-feedback" id="compfb${i}"></div></article>`).join('')}</div><div class="feedback" id="compTotal">${state.checked.size===6?'Excellent evidence finding!':'Try all six clues. You can return to the passage at any time.'}</div><div class="actions"><span class="progress-label">Read together; explain the clue</span><button class="btn" id="continue" ${state.checked.size<6?'disabled':''}>Investigate the grammar →</button></div></div>`}
const passiveQs=[
  {q:'General science fact: “Blizzards ___ when cold air meets warm air.”',opts:['are caused','were caused'],a:0,ex:'A general fact uses present simple passive: are + past participle.'},
  {q:'A completed event: “The town ___ by the flood last year.”',opts:['is covered','was covered'],a:1,ex:'“Last year” is a finished past time: was + past participle.'},
  {q:'General fact: “Tsunamis ___ by underwater earthquakes.”',opts:['are caused','were caused'],a:0,ex:'This describes how tsunamis generally happen: are caused.'},
  {q:'Past event: “Several bridges ___ in the earthquake.”',opts:['are damaged','were damaged'],a:1,ex:'A specific completed earthquake event: were damaged.'}
];
function passive(){return `<div class="grid two-col"><article class="panel"><div class="panel-title">Notice the pattern · subject + be + V3</div><div class="grammar-formula"><span>subject</span><b>+</b><span>am / is / are</span><b>or</b><span>was / were</span><b>+</b><em>past participle</em></div><div class="example-switch"><div class="grammar-example"><span class="example-label">Present simple · usual fact</span><strong>Floods are caused by heavy rain.</strong>It happens generally or repeatedly.</div><div class="grammar-example"><span class="example-label">Past simple · finished event</span><strong>The town was flooded last year.</strong>“Last year” tells us the event is finished.</div></div><div class="note" style="margin-top:12px"><strong>Passive voice spotlight:</strong> We focus on the event or thing affected. The person or force doing it can follow <em>by</em>, or be left out.</div><div class="panel-title" style="margin-top:17px">Build the sentence · tap the words in order</div><div class="built-sentence" id="builtSentence">Your sentence will appear here…</div><div class="builder" id="builderTokens">${['Tsunamis','are','caused','by','underwater','earthquakes.'].map((t,i)=>`<button class="token" data-token="${i}">${t}</button>`).join('')}</div><div class="feedback" id="builderFeedback"></div><div class="actions"><button class="btn secondary" id="resetBuild">Clear</button><span class="progress-label">Make a present simple passive fact</span></div></article><article class="panel"><div class="panel-title">Choose: present fact or past event? · ${state.grammarRight}/4</div><div class="question-list">${passiveQs.map((q,i)=>`<article class="q-card"><div class="q-text">${q.q}</div><div class="q-options">${q.opts.map((o,j)=>`<button class="option" data-passive="${i}" data-opt="${j}" ${state.passiveDone?.has(i)?'disabled':''}>${o}</button>`).join('')}</div><div class="q-feedback" id="passfb${i}"></div></article>`).join('')}</div><div class="feedback" id="passTotal">Use the time clue, then check singular/plural.</div><div class="actions"><span class="progress-label">Present simple + past simple passive</span><button class="btn" id="continue" ${state.grammarRight<4?'disabled':''}>One last tense →</button></div></article></div>`}
function presentPerfect(){return `<div class="grid two-col"><article class="panel"><div class="panel-title">The time bridge · an experience before now matters now</div><div class="time-line"><span class="time-node">past</span><div class="line"><i class="past-point"></i><i class="now-point"></i></div><span class="time-node">now</span></div><p style="font:600 21px 'Fraunces',serif;margin:15px 0 7px">“I have seen a tornado in a film.”</p><p style="font-size:11px;color:var(--muted);line-height:1.55">The experience happened before now. We do not say exactly when; the experience is part of my life up to now.</p><div class="grammar-formula"><span>I / you / we / they</span><b>+</b><span><em>have</em></span><b>+</b><span>past participle</span></div><div class="grammar-formula" style="margin-top:0"><span>he / she / it</span><b>+</b><span><em>has</em></span><b>+</b><span>past participle</span></div><div class="example-switch"><div class="grammar-example"><span class="example-label">Experience · no finished date</span><strong>Have you ever seen hail?</strong>ever = at any time in your life</div><div class="grammar-example"><span class="example-label">Finished past time · use past simple</span><strong>I saw hail last winter.</strong>“Last winter” names a finished time.</div></div></article><article class="panel"><div class="panel-title">Sentence studio · build a question</div><p style="font-size:12px;line-height:1.55;color:var(--muted)">Tap the words in order to ask about a life experience.</p><div class="built-sentence" id="ppBuilt">Tap the words to build the question…</div><div class="builder" id="ppTokens">${['Have','you','ever','experienced','a','heat','wave?'].map((t,i)=>`<button class="token" data-pp="${i}">${t}</button>`).join('')}</div><div class="feedback" id="ppFeedback"></div><div class="grammar-example" style="margin-top:15px"><span class="example-label">Ask your student</span><strong>Have you ever experienced a heat wave?</strong>Follow up: “When was it?” → “I experienced one last summer.”</div><div class="actions"><button class="btn secondary" id="ppReset">Clear</button><span class="progress-label">Build a question, then say your answer</span></div></article></div><article class="panel" style="margin-top:13px"><div class="panel-title">Quick check · present perfect or past simple?</div><div class="grid three-col">${[
  ['No exact time: “I ___ a tsunami in a documentary.”',['have seen','saw'],0],['Finished time: “We ___ about floods yesterday.”',['have learned','learned'],1],['Life experience: “___ you ever heard thunder?”',['Have','Did'],0]
].map((q,i)=>`<article class="q-card"><div class="q-text">${q[0]}</div><div class="q-options">${q[1].map((o,j)=>`<button class="option" data-ppq="${i}" data-opt="${j}" ${state.ppAnswers?.has(i)?'disabled':''}>${o}</button>`).join('')}</div><div class="q-feedback" id="ppqfb${i}"></div></article>`).join('')}</div><div class="feedback" id="ppTotal"></div><div class="actions"><span class="progress-label">Finish by asking and answering one “Have you ever…?” question</span><button class="btn" id="finish" ${!state.ppChecked?'disabled':''}>Finish today’s lesson ✓</button></div></article>`}
function bindStage(){
  if(state.stage===0){
    const reveal=new Set();
    document.querySelectorAll('[data-reveal]').forEach(button=>registerDelegatedClick(button,()=>{
      const index=readActionInteger(button,'reveal',0,hazards.length-1);
      if(index===null)return;
      reveal.add(index);button.classList.add('revealed');
      button.querySelector('.answer').textContent=hazards[index][1];
      if(reveal.size>=5){document.getElementById('continue').disabled=false;document.getElementById('warmFeedback').textContent='Nice noticing! Continue when you are ready.'}
    }));
    registerDelegatedClick(document.getElementById('continue'),doneNext);
  }
  if(state.stage===1){
    document.querySelectorAll('[data-vocab]').forEach(button=>registerDelegatedClick(button,()=>button.classList.toggle('open')));
    registerDelegatedClick(document.getElementById('sayVocab'),()=>speak(vocab.map(word=>word[1]).join('. ')));
    document.querySelectorAll('.word-match').forEach(button=>registerDelegatedClick(button,()=>{
      if(readActionParam(button,'word',/^[a-z ]{1,32}$/)&&matching.some(item=>item.w===button.dataset.word))selectMatch(button,'word');
    }));
    document.querySelectorAll('.def-match').forEach(button=>registerDelegatedClick(button,()=>{
      if(readActionParam(button,'def',/^[a-z ]{1,32}$/)&&matching.some(item=>item.w===button.dataset.def))selectMatch(button,'def');
    }));
    registerDelegatedClick(document.getElementById('continue'),doneNext);
  }
  if(state.stage===2){
    document.querySelectorAll('.gloss').forEach(button=>registerDelegatedClick(button,()=>{
      const word=readActionParam(button,'gloss',/^[a-z ]{1,32}$/);
      if(!word||(!Object.hasOwn(readingHTML,word)&&!Object.hasOwn(defs,word)))return;
      const card=button.closest('.passage-card'),tip=card?.querySelector('.passage-tip');
      if(tip){tip.textContent=word+': '+(readingHTML[word]||defs[word]||'a useful new word');tip.classList.add('show')}
    }));
    registerDelegatedClick(document.getElementById('readAloud'),()=>speak(passage.map(item=>item.title+'. '+item.text).join(' ')));
    registerDelegatedClick(document.getElementById('continue'),doneNext);
  }
  if(state.stage===3){
    document.querySelectorAll('[data-comp]').forEach(button=>registerDelegatedClick(button,()=>{
      const index=readActionInteger(button,'comp',0,compQs.length-1);
      const option=readActionInteger(button,'opt',0,2);
      const question=index===null?null:compQs[index];
      if(!question||option===null||option>=question.opts.length)return;
      const feedback=document.getElementById('compfb'+index);
      if(option===question.a){
        state.checked.add(index);
        document.querySelectorAll(`[data-comp="${index}"]`).forEach(item=>{item.disabled=true;if(+item.dataset.opt===question.a)item.classList.add('correct')});
        feedback.textContent='Yes. '+question.why;feedback.style.color='var(--green)';
      }else{
        button.classList.add('wrong');button.disabled=true;feedback.textContent='Look back at the passage and try one more choice.';feedback.style.color='#bd5739';
      }
      document.getElementById('compTotal').textContent=state.checked.size===6?'Excellent evidence finding! You’re ready to look at the grammar.':`${state.checked.size} of 6 clues solved. Keep looking for evidence.`;
      document.getElementById('continue').disabled=state.checked.size<6;
    }));
    registerDelegatedClick(document.getElementById('continue'),doneNext);
  }
  if(state.stage===4){
    document.querySelectorAll('[data-passive]').forEach(button=>registerDelegatedClick(button,()=>{
      const index=readActionInteger(button,'passive',0,passiveQs.length-1);
      const option=readActionInteger(button,'opt',0,1);
      const question=index===null?null:passiveQs[index];
      if(!question||option===null)return;
      state.passiveDone??=new Set();
      if(option===question.a){
        state.passiveDone.add(index);state.grammarRight=state.passiveDone.size;
        document.querySelectorAll(`[data-passive="${index}"]`).forEach(item=>{item.disabled=true;if(+item.dataset.opt===question.a)item.classList.add('correct')});
        document.getElementById('passfb'+index).textContent=question.ex;document.getElementById('passfb'+index).style.color='var(--green)';
      }else{
        button.disabled=true;button.classList.add('wrong');document.getElementById('passfb'+index).textContent='Check the time clue and try again.';
      }
      document.getElementById('passTotal').textContent=`${state.grammarRight} of 4 correct.`;document.getElementById('continue').disabled=state.grammarRight<4;
    }));
    document.querySelectorAll('[data-token]').forEach(button=>registerDelegatedClick(button,()=>{
      const index=readActionInteger(button,'token',0,5);
      if(index===null)return;
      if(state.builder.includes(index)){state.builder=state.builder.filter(item=>item!==index);button.classList.remove('selected')}
      else{state.builder.push(index);button.classList.add('selected')}
      const words=['Tsunamis','are','caused','by','underwater','earthquakes.'];
      document.getElementById('builtSentence').textContent=state.builder.length?state.builder.map(item=>words[item]).join(' '):'Your sentence will appear here…';
      if(state.builder.length===6){
        const correct=state.builder.join(',')==='0,1,2,3,4,5';
        document.getElementById('builderFeedback').textContent=correct?'Great: affected thing + are + V3 + by + cause.':'Check the order: thing affected, be, V3, then by + cause.';
        document.getElementById('builderFeedback').className='feedback '+(correct?'good':'try');
      }
    }));
    registerDelegatedClick(document.getElementById('resetBuild'),()=>{
      state.builder=[];document.querySelectorAll('[data-token]').forEach(button=>button.classList.remove('selected'));
      document.getElementById('builtSentence').textContent='Your sentence will appear here…';document.getElementById('builderFeedback').textContent='';
    });
    registerDelegatedClick(document.getElementById('continue'),doneNext);
  }
  if(state.stage===5){
    document.querySelectorAll('[data-pp]').forEach(button=>registerDelegatedClick(button,()=>{
      const index=readActionInteger(button,'pp',0,6);
      if(index===null)return;
      if(state.builder.includes(index)){state.builder=state.builder.filter(item=>item!==index);button.classList.remove('selected')}
      else{state.builder.push(index);button.classList.add('selected')}
      const words=['Have','you','ever','experienced','a','heat','wave?'];
      document.getElementById('ppBuilt').textContent=state.builder.length?state.builder.map(item=>words[item]).join(' '):'Tap the words to build the question…';
      state.ppBuiltCorrect=false;updateFinalLock();
      if(state.builder.length===7){
        const correct=state.builder.join(',')==='0,1,2,3,4,5,6';
        document.getElementById('ppFeedback').textContent=correct?'Excellent! Have + subject + ever + past participle.':'Try again: Have + you + ever + past participle + the experience.';
        document.getElementById('ppFeedback').className='feedback '+(correct?'good':'try');
        if(correct){state.ppBuiltCorrect=true;updateFinalLock()}
      }
    }));
    registerDelegatedClick(document.getElementById('ppReset'),()=>{
      state.builder=[];document.querySelectorAll('[data-pp]').forEach(button=>button.classList.remove('selected'));
      document.getElementById('ppBuilt').textContent='Tap the words to build the question…';document.getElementById('ppFeedback').textContent='';
      state.ppBuiltCorrect=false;updateFinalLock();
    });
    document.querySelectorAll('[data-ppq]').forEach(button=>registerDelegatedClick(button,()=>{
      const index=readActionInteger(button,'ppq',0,2),option=readActionInteger(button,'opt',0,1);
      if(index===null||option===null)return;
      const answers=[0,1,0],explanations=['“Have you ever…” asks about experience at any time up to now.','“Yesterday” is a finished time, so use past simple.','Use Have + you + ever + past participle for an experience question.'];
      state.ppAnswers??=new Set();
      if(option===answers[index]){
        state.ppAnswers.add(index);
        document.querySelectorAll(`[data-ppq="${index}"]`).forEach(item=>{item.disabled=true;if(+item.dataset.opt===option)item.classList.add('correct')});
        document.getElementById('ppqfb'+index).textContent=explanations[index];document.getElementById('ppqfb'+index).style.color='var(--green)';
      }else{
        button.disabled=true;button.classList.add('wrong');document.getElementById('ppqfb'+index).textContent='Check whether the time is finished or the experience connects to now.';
      }
      document.getElementById('ppTotal').textContent=`${state.ppAnswers.size} of 3 quick checks solved.`;updateFinalLock();
    }));
    registerDelegatedClick(document.getElementById('finish'),()=>{
      state.done.add(5);nav();
      document.querySelector('.stage-head h2').textContent='Lesson complete — what a journey!';
      document.querySelector('.stage-head p').textContent='You explored new vocabulary, read for meaning, revised passive voice, and used present perfect to talk about experience.';
      document.getElementById('workspace').insertAdjacentHTML('beforeend',`<div class="panel" style="text-align:center;background:var(--mint);padding:32px"><div style="font-size:42px">🌟</div><h2 style="font:600 27px 'Fraunces',serif;margin:10px">You connected past and present.</h2><p style="font-size:12px;color:var(--muted)">Finish by asking each other: “Have you ever experienced a heat wave?”</p><button class="btn secondary" data-action="reset-lesson">Start the lesson again ↻</button></div>`);
      document.getElementById('progressText').textContent="TODAY'S JOURNEY · 6 OF 6";
      document.getElementById('progressPct').textContent='100%';document.getElementById('progressFill').style.width='100%';
    });
  }
}
function selectMatch(b,type){if(b.classList.contains('matched'))return;if(!state.selected){state.selected={b,type};b.classList.add('selected');return}if(state.selected.type===type){state.selected.b.classList.remove('selected');state.selected={b,type};b.classList.add('selected');return}let word=type==='word'?b.dataset.word:state.selected.b.dataset.word,def=type==='def'?b.dataset.def:state.selected.b.dataset.def,first=state.selected.b;first.classList.remove('selected');state.selected=null;if(word===def){first.classList.add('matched');b.classList.add('matched');first.disabled=b.disabled=true;state.matches++;document.getElementById('matchFeedback').textContent=`Matched: ${word}. ${state.matches===6?'All done — lovely work!':'Find another pair.'}`;document.getElementById('matchFeedback').className='feedback good';if(state.matches===6)document.getElementById('continue').disabled=false}else{first.classList.add('miss');b.classList.add('miss');setTimeout(()=>{first.classList.remove('miss');b.classList.remove('miss')},300);document.getElementById('matchFeedback').textContent='Not that pair. Read each meaning closely and try again.';document.getElementById('matchFeedback').className='feedback try'}}
function speak(t){if(!('speechSynthesis'in window))return;speechSynthesis.cancel();let u=new SpeechSynthesisUtterance(t);u.lang='en-US';u.rate=.86;speechSynthesis.speak(u)}
function updateFinalLock(){state.ppChecked=state.ppBuiltCorrect&&state.ppAnswers?.size===3;const finish=document.getElementById('finish');if(finish)finish.disabled=!state.ppChecked}
function resetLesson(){state={stage:0,done:new Set(),matches:0,selected:null,checked:new Set(),grammarRight:0,ppChecked:false,ppBuiltCorrect:false,builder:[]};render();nav()}
installDelegatedActions({
  'go-to-stage':{event:'click',run:element=>{const stage=readActionInteger(element,'stage',0,stages.length-1);if(stage!==null)go(stage)}},
  'reset-lesson':{event:'click',run:resetLesson},
  'registered-click':{event:'click',run:runRegisteredClick}
});
nav();render();


if (typeof markWords === "function") globalThis["markWords"] = markWords;
if (typeof nav === "function") globalThis["nav"] = nav;
if (typeof go === "function") globalThis["go"] = go;
if (typeof doneNext === "function") globalThis["doneNext"] = doneNext;
if (typeof render === "function") globalThis["render"] = render;
if (typeof renderStage === "function") globalThis["renderStage"] = renderStage;
if (typeof warmup === "function") globalThis["warmup"] = warmup;
if (typeof vocabulary === "function") globalThis["vocabulary"] = vocabulary;
if (typeof matchButtons === "function") globalThis["matchButtons"] = matchButtons;
if (typeof reading === "function") globalThis["reading"] = reading;
if (typeof comprehension === "function") globalThis["comprehension"] = comprehension;
if (typeof passive === "function") globalThis["passive"] = passive;
if (typeof presentPerfect === "function") globalThis["presentPerfect"] = presentPerfect;
if (typeof bindStage === "function") globalThis["bindStage"] = bindStage;
if (typeof selectMatch === "function") globalThis["selectMatch"] = selectMatch;
if (typeof speak === "function") globalThis["speak"] = speak;
if (typeof updateFinalLock === "function") globalThis["updateFinalLock"] = updateFinalLock;
if (typeof resetLesson === "function") globalThis["resetLesson"] = resetLesson;
