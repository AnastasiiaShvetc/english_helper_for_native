'use strict';
const APP_VERSION='lesson-14-transfer-v1';
const STORAGE_KEY='my-english-progress-v1';
const MASCOT_ASSET=window.MASCOT_DATA||'./assets/mascots.png';
const REVIEW_DAYS=[1,3,7,14,30,60];
const MOTIVATION=[
  'Гордимся тобой: сегодня ты нашла время для английского!',
  'У тебя всё получится. Каждая тренировка приближает тебя к цели.',
  'Ты шикарна — и твой английский становится увереннее!',
  'Ещё немного практики — и Шекспир попросит у тебя совет.',
  'Каждое новое слово делает твой мир чуть больше. Продолжай!',
  'Кот и чайка аплодируют твоему упорству!'
];
const STAGES={
  recognize:{label:'Слово → 4 перевода',block:'words',type:'choice'},
  write:{label:'Написать выражение',block:'words',type:'text'},
  contextChoice:{label:'Выбрать слово в предложении',block:'context',type:'choice'},
  contextWrite:{label:'Заполнить пропуск',block:'context',type:'text'},
  contextTranslate:{label:'Перевести предложение',block:'context',type:'free'},
  rule:{label:'Изучить правило',block:'grammar',type:'read'},
  grammarChoice:{label:'Выбрать верный вариант',block:'grammar',type:'choice'},
  grammarTranslate:{label:'Перевести с правилом',block:'grammar',type:'free'}
};
const BLOCKS={words:{label:'Слова и выражения',icon:'📚'},context:{label:'Слова в предложениях',icon:'💬'},grammar:{label:'Грамматика',icon:'✨'}};
const app=document.getElementById('screen'),nav=document.getElementById('nav');
const content=window.ENGLISH_CONTENT;
const ui={page:'home',lesson:null,part:'all',block:'words',stage:'recognize',mode:'lesson',reviewType:'due',session:null,message:''};
function emptyData(){return {version:1,progress:{},attempts:[],sessions:[],activeSession:null}}
let data=emptyData();
try{const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));if(saved&&saved.version===1&&saved.progress&&Array.isArray(saved.attempts)&&Array.isArray(saved.sessions))data=saved}catch(e){ui.message='Не удалось прочитать сохранённый прогресс. Создайте копию данных перед продолжением.'}
function persist(){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(data));return true}catch(e){ui.message='Браузер не смог сохранить ответ. Проверьте свободное место и настройки хранения.';return false}}
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))}
function normalize(value){return String(value??'').normalize('NFKC').toLowerCase().replace(/[’‘]/g,"'").replace(/\s+/g,' ').trim().replace(/[.!?]+$/,'')}
function plural(n,one,few,many){const a=n%10,b=n%100;return b>=11&&b<=14?many:a===1?one:a>=2&&a<=4?few:many}
function moscowDay(date=new Date()){const pieces=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Moscow',year:'numeric',month:'numeric',day:'numeric'}).formatToParts(date);const p=Object.fromEntries(pieces.filter(x=>x.type!=='literal').map(x=>[x.type,Number(x.value)]));return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`}
function dayNumber(day){return Math.floor(Date.parse(day+'T00:00:00Z')/86400000)}
function allItems(){return content.lessons.flatMap(l=>l.parts.flatMap(p=>[
  ...p.words.map(x=>({item:x,kind:'word',lesson:l,part:p})),
  ...p.grammar.map(x=>({item:x,kind:'grammar',lesson:l,part:p}))
]))}
function itemKey(row,stage){return `${row.lesson.id}/${row.part.id}/${stage}/${row.item.id}`}
function progress(row,stage){return data.progress[itemKey(row,stage)]}
function isGrammar(stage){return STAGES[stage].block==='grammar'}
function eligible(row,stage){return isGrammar(stage)?row.kind==='grammar':row.kind==='word'}
function locationRows(){return allItems().filter(r=>ui.mode==='review'||(r.lesson.id===ui.lesson&&(ui.part==='all'||r.part.id===ui.part)))}
function pool(stage,kind='new'){
  if(stage==='rule')return locationRows().filter(r=>r.kind==='grammar');
  return locationRows().filter(r=>eligible(r,stage)).filter(r=>{
    const p=progress(r,stage);
    if(ui.mode==='review'){
      if(ui.reviewType==='due')return p?.status==='review'&&p.due<=Date.now();
      if(ui.reviewType==='errors')return (p?.wrongCount||0)>0;
      return Boolean(p);
    }
    return p?.status!=='review';
  });
}
function shuffle(rows){const result=[...rows];for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]]}return result}
function daySessions(){return new Set(data.sessions.filter(s=>s.count===10).map(s=>s.day))}
function streak(){const days=daySessions();let n=dayNumber(moscowDay());if(!days.has(moscowDay()))n--;let count=0;while(days.has(new Date(n*86400000).toISOString().slice(0,10))){count++;n--}return count}
function learned(row){return row.kind==='word'&&progress(row,'write')?.lastVerdict==='correct'&&progress(row,'contextTranslate')?.lastVerdict==='correct'}
function learnedCount(){return allItems().filter(learned).length}
function dueCount(){return allItems().reduce((count,row)=>count+Object.keys(STAGES).filter(stage=>stage!=='rule'&&eligible(row,stage)&&progress(row,stage)?.status==='review'&&progress(row,stage).due<=Date.now()).length,0)}
function currentWeekDays(){const now=dayNumber(moscowDay());const weekday=(new Date(now*86400000).getUTCDay()+6)%7;return Array.from({length:7},(_,i)=>new Date((now-weekday+i)*86400000).toISOString().slice(0,10))}
function motivation(){return MOTIVATION[dayNumber(moscowDay())%MOTIVATION.length]}
function saveActive(){if(!ui.session)return;data.activeSession={stage:ui.stage,mode:ui.mode,lesson:ui.lesson,part:ui.part,reviewType:ui.reviewType,keys:ui.session.rows.map(r=>itemKey(r,ui.stage)),index:ui.session.index,first:ui.session.first,answer:ui.session.answer,result:ui.session.result,started:ui.session.started,choices:ui.session.choices};persist()}
function resume(){const saved=data.activeSession;if(!saved)return;const items=allItems(),rows=saved.keys.map(key=>items.find(r=>itemKey(r,saved.stage)===key));if(rows.some(r=>!r)){data.activeSession=null;persist();ui.message='Материал этой тренировки изменился. Начните новую подборку.';navigate('home');return}Object.assign(ui,{stage:saved.stage,mode:saved.mode,lesson:saved.lesson,part:saved.part,reviewType:saved.reviewType,session:{rows,index:saved.index,first:saved.first,answer:saved.answer,result:saved.result,started:saved.started,choices:saved.choices||{}}});navigate(saved.stage==='rule'?'rule':'question')}
function btn(label,action,cls=''){return `<button class="btn ${cls}" data-action="${action}">${esc(label)}</button>`}
function card(inner,action,extra=''){return `<div class="card ${extra} ${action?'clickable':''}" ${action?`role="button" tabindex="0" data-action="${action}"`:''}>${inner}</div>`}
function home(){
  const days=daySessions(),week=currentWeekDays(),current=moscowDay();
  const weekStart=week[0];
  const gained=allItems().filter(r=>learned(r)&&[progress(r,'write')?.firstCompletedDay,progress(r,'contextTranslate')?.firstCompletedDay].sort().at(-1)>=weekStart).length;
  const rules=new Set(data.attempts.filter(a=>a.day>=weekStart&&a.stage.startsWith('grammar')).map(a=>a.key.split('/').slice(0,2).join('/')+'/'+a.itemId)).size;
  const minutes=Math.round(data.sessions.filter(s=>s.day>=weekStart).reduce((n,s)=>n+(s.seconds||0),0)/60);
  return `<div class="badge">МОЙ АНГЛИЙСКИЙ · УРОК 14</div><div class="top"><div><p class="eyebrow">Рада вас видеть ☀️</p><h1>Мой <span class="gradient">английский</span></h1></div><div class="avatar"><img class="mascot-small" src="${MASCOT_ASSET}" alt="Рыжий учёный кот и чайка"></div></div>
  ${card(`<div class="streak-header"><strong>🔥 ${streak()} ${plural(streak(),'день','дня','дней')} подряд</strong><span class="pill">Ваша неделя</span></div><div class="week">${week.map((d,i)=>`<div class="day">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][i]}<div class="dot ${days.has(d)?'done':d===current?'today':''}">${days.has(d)?'✓':'·'}</div></div>`).join('')}</div>`)}
  <div class="metric-grid">${card(`<span>Всего дней занятий</span><strong>${days.size}</strong>`,null,'metric')}${card(`<span>Выучено слов</span><strong>${learnedCount()}</strong>`,null,'metric')}</div>
  ${data.activeSession?card('<strong>Продолжить незавершённую тренировку →</strong>','resume'):''}${card(`<img class="illustration" src="${MASCOT_ASSET}" alt="Кот и чайка"><span class="pill">СЕГОДНЯ</span><h2>Пора немного повторить</h2><p>${dueCount()} заданий ждут вас</p>${btn('К повторению →','review')}`,'review','hero')}
  <h2 class="section-title">Мои уроки</h2>${content.lessons.map(l=>card(`<div class="lesson"><div class="lesson-icon">📖</div><div><h3>Урок ${l.number} · ${esc(l.title)}</h3><p>${l.parts.length} ${plural(l.parts.length,'часть','части','частей')} · ${l.demo?'демонстрационный материал':'учебный материал'}</p></div><div class="chev">›</div></div>`,`lesson:${l.id}`)).join('')}
  <h2 class="section-title">Ваш рост</h2>${card(`<strong>🌱 За эту неделю вы выучили ${gained} новых слов</strong>`,'progress')}${card(`<strong>✨ Отработали ${rules} правил грамматики</strong>`,'progress')}${card(`<strong>⏱️ Занимались ${minutes} минут</strong>`,'progress')}
  <div class="motivation"><img src="${MASCOT_ASSET}" alt="Кот и чайка"><div class="motivation-copy"><strong>${esc(motivation())}</strong></div></div>`;
}
function lesson(){const l=content.lessons.find(x=>x.id===ui.lesson);return `<button class="back" data-action="home">‹ Главная</button><div class="badge">${l.demo?'ДЕМОНСТРАЦИОННЫЙ УРОК':'МОИ УРОКИ'}</div><h1>Урок ${l.number} · ${esc(l.title)}</h1><p class="sub">Выберите часть или весь урок.</p>${card(`<div class="block"><div class="icon">🌈</div><div><h3>Весь урок</h3><p>Все части вместе</p></div><div class="chev">›</div></div>`,'part:all')}${l.parts.map(p=>card(`<div class="block"><div class="icon">📝</div><div><h3>Часть ${p.number}</h3><p>${p.words.length} слов и выражений · ${p.grammar.length} ${plural(p.grammar.length,'правило','правила','правил')}</p></div><div class="chev">›</div></div>`,`part:${p.id}`)).join('')}`}
function blocks(){return `<button class="back" data-action="lesson-back">‹ Урок</button><div class="badge">${ui.mode==='review'?'ПОВТОРЕНИЕ':ui.part==='all'?'ВЕСЬ УРОК':'ЧАСТЬ УРОКА'}</div><h1>Что потренируем?</h1><p class="sub">Можно сразу открыть любой блок.</p>${ui.mode==='lesson'?card(`<div class="block"><div class="icon">📖</div><div><h3>Посмотреть материал</h3><p>Слова, примеры и правила</p></div><div class="chev">›</div></div>`,'catalog'):''}${Object.entries(BLOCKS).map(([id,b])=>card(`<div class="block"><div class="icon">${b.icon}</div><div><h3>${b.label}</h3><p>Выбрать вид задания</p></div><div class="chev">›</div></div>`,`block:${id}`)).join('')}`}
function catalog(){const rows=locationRows(),words=rows.filter(r=>r.kind==='word'),rules=rows.filter(r=>r.kind==='grammar');return `<button class="back" data-action="blocks">‹ К видам занятий</button><div class="badge">УРОК 14 · МАТЕРИАЛЫ</div><h1>Слова и правила</h1><p class="sub">Нажмите на карточку, чтобы увидеть перевод и пример.</p><h2 class="section-title">Слова и выражения · ${words.length}</h2>${words.map(r=>`<details class="card study-entry"><summary>${esc(r.item.en)}</summary><p><strong>${esc(r.item.ru)}</strong></p>${r.item.sourceEn?`<p><strong>Из переданного учебного файла:</strong> ${esc(r.item.sourceEn)}</p>`:r.item.source?`<p><strong>Из конспекта:</strong> ${esc(r.item.source)}</p>`:''}<p><strong>Пример:</strong> ${esc(r.item.sampleEn)}<br>${esc(r.item.sampleRu)}</p></details>`).join('')}<h2 class="section-title">Грамматика · ${rules.length}</h2>${rules.map(r=>`<details class="card study-entry"><summary>${esc(r.item.title)}</summary>${r.item.rule.map(line=>`<p>${esc(line)}</p>`).join('')}</details>`).join('')}`}
function stages(){const b=BLOCKS[ui.block];return `<button class="back" data-action="blocks-back">‹ Назад</button><div class="badge">${ui.mode==='review'?'ПОВТОРЕНИЕ':'УРОК'}</div><h1>${b.label}</h1><p class="sub">Для каждого вида считается свой прогресс.</p><div class="stages-list">${Object.entries(STAGES).filter(([id,s])=>s.block===ui.block&&(ui.mode!=='review'||id!=='rule')).map(([id,s])=>card(`<div class="block"><div class="icon">${s.type==='read'?'📖':s.type==='choice'?'☀️':'✏️'}</div><div><h3>${s.label}</h3><p>${id==='rule'?`${pool(id).length} ${plural(pool(id).length,'правило','правила','правил')}`:`${pool(id).length} доступно`}</p></div><div class="chev">›</div></div>`,`stage:${id}`)).join('')}</div>`}
function review(){return `<button class="back" data-action="home">‹ Главная</button><div class="badge">ПОВТОРЕНИЕ ВСЕГО</div><h1>Время закрепить ✨</h1><p class="sub">Материал из разных уроков. Выберите режим, а затем вид задания.</p>${card(`<div class="block"><div class="icon">📅</div><div><h3>Пора повторить</h3><p>${dueCount()} заданий по расписанию</p></div><div class="chev">›</div></div>`,'review:due')}${card(`<div class="block"><div class="icon">🎯</div><div><h3>Мои частые ошибки</h3><p>То, что раньше вызывало трудности</p></div><div class="chev">›</div></div>`,'review:errors')}${card(`<div class="block"><div class="icon">🎲</div><div><h3>Смешанная тренировка</h3><p>Из уже пройденного материала</p></div><div class="chev">›</div></div>`,'review:mixed')}`}
function promptFor(row,stage){const x=row.item;return stage==='recognize'?x.en:stage==='write'?x.ru:stage==='contextChoice'||stage==='contextWrite'?x.gap:stage==='contextTranslate'||stage==='grammarTranslate'?x.prompt:stage==='grammarChoice'?x.choicePrompt:x.title}
function answerFor(row,stage){const x=row.item;return stage==='recognize'?x.ru:stage==='write'?x.en:stage==='contextChoice'||stage==='contextWrite'?x.gapAnswer:stage==='grammarChoice'?x.choiceAnswer:x.answers?.[0]}
function optionsFor(row,stage){const x=row.item;return shuffle(stage==='recognize'?x.ruChoices:stage==='contextChoice'?x.gapChoices:x.choiceOptions)}
function start(stage){const found=pool(stage);if(!found.length){ui.message='Сейчас заданий этого вида нет.';render();return}ui.stage=stage;ui.session={rows:shuffle(found).slice(0,10),index:0,first:0,answer:'',result:null,choices:{},started:Date.now()};ui.page=stage==='rule'?'rule':'question';saveActive();render()}
function rule(){const s=ui.session,r=s.rows[s.index];if(!r)return `<button class="back" data-action="stages">‹ Назад</button><h1>Все правила просмотрены</h1>${btn('К видам заданий','stages')}`;return `<button class="back" data-action="stages">‹ Виды заданий</button><div class="badge">ПРАВИЛО ${s.index+1} ИЗ ${s.rows.length}</div><h1>${esc(r.item.title)}</h1>${card(`<div class="rule-lines">${r.item.rule.map(line=>`<p>${esc(line)}</p>`).join('')}</div>`)}${btn(s.index+1===s.rows.length?'Готово':'Следующее правило','next-rule','full')}`}
function question(){const s=ui.session;if(s.index>=s.rows.length)return result();const r=s.rows[s.index],stage=ui.stage,kind=STAGES[stage].type,correct=answerFor(r,stage),value=s.answer;const selectedOptions=kind==='choice'?(s.choices[s.index]??=optionsFor(r,stage)):[];const input=kind==='choice'?`<div class="options">${selectedOptions.map(o=>`<button class="choice ${s.result?(normalize(o)===normalize(correct)?'correct':o===value?'wrong':''):''}" data-choice="${esc(o)}" ${s.result?'disabled':''}>${esc(o)}</button>`).join('')}</div>`:`<input class="input ${s.result?(s.result.verdict==='correct'?'correct':s.result.verdict==='incorrect'?'wrong':'unknown'):''}" id="answer" autocomplete="off" autocapitalize="off" value="${esc(value)}" placeholder="Напишите ответ на английском" ${s.result?'disabled':''}>`;
  const feedback=s.result?`<div class="study-feedback ${s.result.verdict==='correct'?'success':s.result.verdict==='incorrect'?'error':'warning'}"><strong>${s.result.verdict==='correct'?'Верно! 🌟':s.result.verdict==='incorrect'?'Пока есть ошибка 💡':'Нужна проверка 🔎'}</strong><p>${esc(s.result.message)}</p><p><strong>Верно:</strong> ${esc(correct)}</p>${s.result.verdict==='unverified'?'<p>Этот вариант не был подготовлен заранее. Мы не считаем его ошибкой и не меняем прогресс.</p>':''}</div>`:'';
  const more=s.result?(r.kind==='word'?`<details class="card study-entry"><summary>Пример и источник</summary><p><strong>${esc(r.item.en)}</strong> — ${esc(r.item.ru)}</p>${r.item.sourceEn?`<p><strong>Из переданного учебного файла:</strong> ${esc(r.item.sourceEn)}</p>`:r.item.source?`<p><strong>Из конспекта:</strong> ${esc(r.item.source)}</p>`:''}<p><strong>Новый пример:</strong> ${esc(r.item.sampleEn)}<br>${esc(r.item.sampleRu)}</p></details>`:`<details class="card study-entry"><summary>Объяснение правила</summary>${r.item.rule.map(line=>`<p>${esc(line)}</p>`).join('')}</details>`):'';
  return `<button class="back" data-action="stages">‹ Виды заданий</button><div class="badge">${ui.mode==='review'?'ПОВТОРЕНИЕ':'УРОК '+r.lesson.number}</div><div class="row"><h2>${STAGES[stage].label}</h2><strong>${s.index+1}/${s.rows.length}</strong></div><div class="bar"><span style="width:${(s.index+1)/s.rows.length*100}%"></span></div>${card(`<span class="panel-label">${kind==='choice'?'ВЫБЕРИТЕ ОТВЕТ':'НАПИШИТЕ ОТВЕТ'}</span><h2 class="question">${esc(promptFor(r,stage))}</h2>${input}`)}${feedback}${more}${s.result?btn(s.index+1===s.rows.length?'Посмотреть результат':'Следующее задание →','next','full'):kind==='choice'?'':btn('Проверить','check','full')}`;
}
function evaluate(row,stage,value){const x=row.item,expected=answerFor(row,stage),kind=STAGES[stage].type;
  if(kind==='choice')return normalize(value)===normalize(expected)?{verdict:'correct',message:'Отлично! '+(x.explain||'Правильный вариант выбран.') }:{verdict:'incorrect',message:x.explain||'Посмотрите на правильную форму и попробуйте ещё раз в следующей тренировке.'};
  if(kind==='text'){const accepted=stage==='write'?x.writeAnswers||[expected]:x.gapAnswers||[expected];return accepted.some(answer=>normalize(answer)===normalize(value))?{verdict:'correct',message:x.explain||'Верно.'}:{verdict:'incorrect',message:'Проверьте изучаемую форму, написание и обязательные части выражения. '+(x.explain||'')};}
  if(x.answers.some(v=>normalize(v)===normalize(value)))return {verdict:'correct',message:'Смысл и целевая конструкция соответствуют подготовленному ответу.'};
  const known=x.known.find(([candidate])=>normalize(candidate)===normalize(value));
  if(known)return {verdict:'incorrect',message:known[1]};
  return {verdict:'unverified',message:'Заранее подготовленные ответы не содержат вашу формулировку. Она может быть правильной; без живой проверки мы этого не утверждаем.'};
}
function submit(value){const s=ui.session;if(s.result||!String(value).trim())return;const row=s.rows[s.index],stage=ui.stage;const result=evaluate(row,stage,value);s.answer=value;s.result=result;
  const key=itemKey(row,stage),old=data.progress[key]||{status:'new',successes:0,wrongCount:0};
  data.attempts.push({key,itemId:row.item.id,stage,answer:value,verdict:result.verdict,day:moscowDay(),at:Date.now()});
  if(result.verdict==='correct'){
    s.first++;const successes=old.status==='review'?old.successes+1:1;
    data.progress[key]={status:'review',successes,wrongCount:old.wrongCount,due:Date.now()+REVIEW_DAYS[Math.min(successes-1,REVIEW_DAYS.length-1)]*86400000,completedDay:moscowDay(),firstCompletedDay:old.firstCompletedDay||moscowDay(),lastVerdict:'correct'};
  }else if(result.verdict==='incorrect'){
    data.progress[key]={status:old.status==='review'?'review':'new',successes:0,wrongCount:old.wrongCount+1,due:old.status==='review'?Date.now():null,completedDay:old.completedDay||null,firstCompletedDay:old.firstCompletedDay||null,lastVerdict:'incorrect'};
  }
  saveActive();render();
}
function finish(){const s=ui.session;if(!s.finished){const record={day:moscowDay(),count:s.rows.length,first:s.first,seconds:Math.max(1,Math.round((Date.now()-s.started)/1000))};data.sessions.push(record);s.finished=true;data.activeSession=null;persist()}}
function result(){finish();const s=ui.session;return `<button class="back" data-action="home">‹ Главная</button><div class="center"><div class="result-mascots"><img src="${MASCOT_ASSET}" alt="Кот и чайка поздравляют"></div><div class="badge">ТРЕНИРОВКА ЗАВЕРШЕНА</div><h1>Хорошая работа!</h1><p class="sub">Вы уделили время английскому — это уже шаг вперёд.</p></div>${card(`<div class="center"><strong class="stat">${s.first}/${s.rows.length}</strong><p>правильных с первой попытки</p><p class="sub">${s.first>=8?'Вы уверенно справились с этой подборкой ✨':s.first>=4?'С каждым повторением ответы будут даваться легче 🌱':'Трудные задания подскажут, что потренировать дальше 💛'}</p></div>`)}${btn('Ещё одна подборка','again','full')}<div style="height:9px"></div>${btn('Закончить','home','secondary full')}${s.rows.length<10?'<p class="muted-small">Сегодня было меньше десяти доступных заданий. Для календаря занятий засчитывается завершённая десятка.</p>':''}`}
function progressPage(){const total=allItems().filter(r=>r.kind==='word').length;return `<button class="back" data-action="home">‹ Главная</button><div class="badge">МОЙ ПРОГРЕСС</div><h1>Видно, как вы растёте 🌱</h1><div class="metric-grid">${card(`<span>Дней занятий</span><strong>${daySessions().size}</strong>`)}${card(`<span>Выучено слов</span><strong>${learnedCount()} из ${total}</strong>`)}</div><h2 class="section-title">По видам практики</h2>${Object.entries(STAGES).filter(([id])=>id!=='rule').map(([id,s])=>{const rows=allItems().filter(r=>eligible(r,id)),done=rows.filter(r=>progress(r,id)?.status==='review').length;return card(`<div class="row"><strong>${s.label}</strong><strong>${done}/${rows.length}</strong></div><div class="bar"><span style="width:${rows.length?done/rows.length*100:0}%"></span></div>`)}).join('')}<p class="muted-small">Выбор перевода и самостоятельное употребление слова считаются отдельно.</p>`}
function settings(){return `<button class="back" data-action="home">‹ Главная</button><div class="badge">ДАННЫЕ И НАСТРОЙКИ</div><h1>Ваш прогресс</h1>${card(`<strong>Сохранён на этом устройстве</strong><p class="sub">Обычное закрытие страницы его не удаляет. Очистка данных браузера или смена телефона может удалить прогресс.</p><div class="btn-row">${btn('Скачать копию','export')}${btn('Восстановить копию','import','secondary')}</div><input type="file" id="file-import" accept="application/json,.json">`)}${card('<strong>О приложении</strong><p class="sub">Урок 14 содержит ваши учебные материалы. Свободные переводы автоматически сверяются с заранее подготовленными ответами. Неожиданный вариант не объявляется неверным и требует отдельной проверки.</p>')}<p class="muted-small">Версия ${APP_VERSION}. Данные не отправляются на GitHub автоматически.</p>`}
function render(){if(!content){app.innerHTML='<p class="error">Не удалось загрузить учебный материал.</p>';return}app.innerHTML=({home,lesson,blocks,catalog,stages,review,question,rule,result,progress:progressPage,settings}[ui.page]||home)();if(ui.message){app.insertAdjacentHTML('afterbegin',`<div class="warning">${esc(ui.message)}</div>`);ui.message=''}nav.innerHTML=[['home','⌂','Главная'],['review','◷','Повторение'],['progress','▥','Прогресс'],['settings','☺','Данные']].map(([id,icon,label])=>`<button data-action="${id}" class="${ui.page===id?'active':''}"><span>${icon}</span>${label}</button>`).join('')}
function navigate(page){ui.page=page;render();window.scrollTo(0,0)}
function exportData(){const blob=new Blob([JSON.stringify({format:'my-english-progress',exportedAt:new Date().toISOString(),data},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`my-english-progress-${moscowDay()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
async function importData(file){try{const parsed=JSON.parse(await file.text());const saved=parsed.data;if(parsed.format!=='my-english-progress'||saved?.version!==1||!saved.progress||!Array.isArray(saved.attempts)||!Array.isArray(saved.sessions))throw Error('Файл не похож на копию прогресса.');if(!confirm('Заменить текущий прогресс данными из выбранного файла? Сначала скачайте копию текущих данных, если они нужны.'))return;data=saved;persist();ui.message='Прогресс восстановлен из файла.';navigate('settings')}catch(e){ui.message='Не удалось восстановить файл: '+e.message;render()}}
async function importFromPrivateLink(){
  const hash=location.hash;
  if(!hash.startsWith('#progress='))return;
  history.replaceState(null,'',location.pathname+location.search);
  try{
    const encoded=hash.slice('#progress='.length);
    if(!/^[A-Za-z0-9_-]{1,20000}$/.test(encoded)||typeof DecompressionStream==='undefined')throw Error('Не удалось открыть ссылку с прогрессом в этом браузере.');
    const binary=atob(encoded.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-encoded.length%4)%4));
    const bytes=Uint8Array.from(binary,character=>character.charCodeAt(0));
    const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    const parsed=JSON.parse(await new Response(stream).text()),saved=parsed.data;
    if(parsed.format!=='my-english-progress'||saved?.version!==1||!saved.progress||!Array.isArray(saved.attempts)||!Array.isArray(saved.sessions))throw Error('Ссылка не содержит подходящий прогресс.');
    if(data.attempts.length&&!confirm('На этом устройстве уже есть результаты занятий. Заменить их прогрессом с телефона?')){ui.message='Прогресс на этом устройстве оставлен без изменений.';navigate('settings');return}
    data=saved;
    if(!persist())throw Error('Браузер не смог сохранить прогресс.');
    ui.message='Готово: прогресс с телефона перенесён на это устройство.';
    navigate('settings');
  }catch(e){ui.message='Не удалось перенести прогресс по ссылке. '+e.message;navigate('settings')}
}
document.addEventListener('click',event=>{const choice=event.target.closest('[data-choice]');if(choice){if(ui.session?.result)return;submit(choice.dataset.choice);return}const button=event.target.closest('[data-action]');if(!button)return;const action=button.dataset.action;if(action==='check'){submit(document.getElementById('answer')?.value||'');return}if(action==='next'){ui.session.index++;ui.session.answer='';ui.session.result=null;saveActive();navigate('question');return}if(action==='next-rule'){ui.session.index++;saveActive();navigate('rule');return}if(action==='again'){start(ui.stage);return}if(action==='resume'){resume();return}if(action==='export'){exportData();return}if(action==='import'){document.getElementById('file-import').click();return}if(action.startsWith('lesson:')){ui.mode='lesson';ui.lesson=action.split(':')[1];navigate('lesson');return}if(action.startsWith('part:')){ui.part=action.split(':')[1];navigate('blocks');return}if(action.startsWith('block:')){ui.block=action.split(':')[1];navigate('stages');return}if(action.startsWith('stage:')){start(action.split(':')[1]);return}if(action.startsWith('review:')){ui.mode='review';ui.reviewType=action.split(':')[1];navigate('blocks');return}if(action==='lesson-back'){navigate(ui.mode==='review'?'review':'lesson');return}if(action==='blocks-back'){navigate('blocks');return}if(action==='stages'){navigate('stages');return}if(action==='review'){ui.mode='review';navigate('review');return}navigate(action)});
document.addEventListener('change',event=>{if(event.target.id==='file-import'&&event.target.files[0])importData(event.target.files[0])});
document.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target.matches('.card.clickable'))event.target.click();if(event.key==='Enter'&&event.target.id==='answer'&&!ui.session?.result)submit(event.target.value)});
setInterval(()=>{if(ui.page==='home'&&moscowDay()!==window.lastDay){window.lastDay=moscowDay();render()}},30000);window.lastDay=moscowDay();
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});
render();
importFromPrivateLink();
