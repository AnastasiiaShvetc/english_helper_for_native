(function(root){
  'use strict';
  const days=[1,3,7,14,30,60];
  const keyOK=k=>typeof k==='string'&&k.length<=240&&k.split('/').length===4&&/^[\w./-]+$/.test(k);
  const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  function valid(v){return plain(v)&&v.version===1&&plain(v.progress)&&Array.isArray(v.attempts)&&Array.isArray(v.sessions)&&v.attempts.length<=100000&&v.sessions.length<=50000&&Object.keys(v.progress).every(keyOK)&&v.attempts.every(a=>plain(a)&&keyOK(a.key)&&Number.isFinite(a.at)&&a.at>=0&&typeof a.stage==='string'&&typeof a.day==='string'&&['correct','incorrect','unverified'].includes(a.verdict))&&v.sessions.every(s=>plain(s)&&typeof s.day==='string'&&Number.isFinite(s.count)&&s.count>=0&&s.count<=10&&Number.isFinite(s.seconds)&&s.seconds>=0);}
  function canonical(v){if(Array.isArray(v))return v.map(canonical);if(plain(v))return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));return v;}
  // Legacy records have no IDs. Preserve duplicate occurrences within each backup,
  // while recognizing the same old records copied between devices.
  function identified(rows,prefix){const counts=new Map();return rows.map(row=>{if(row.id)return row;const base=JSON.stringify(canonical(row)),n=counts.get(base)||0;counts.set(base,n+1);return {...row,id:`${prefix}:${base}:${n}`};});}
  function union(a,b,prefix){const found=new Map();for(const row of [...identified(a,prefix),...identified(b,prefix)]){const old=found.get(row.id);if(!old||JSON.stringify(canonical(row))>JSON.stringify(canonical(old)))found.set(row.id,row);}return [...found.values()].sort((x,y)=>(x.at||x.started||0)-(y.at||y.started||0)||x.id.localeCompare(y.id));}
  function merge(a,b){
    if(!valid(a)||!valid(b))throw Error('Invalid progress data');
    const attempts=union(a.attempts,b.attempts,'attempt'),sessions=union(a.sessions,b.sessions,'session');
    const progress=Object.create(null);
    for(const key of new Set([...Object.keys(a.progress),...Object.keys(b.progress)])){
      const x=a.progress[key],y=b.progress[key];
      progress[key]=!x?y:!y?x:JSON.stringify(canonical(x))>JSON.stringify(canonical(y))?x:y;
    }
    // Replay the union, so parallel offline answers contribute independently and
    // repeated synchronization cannot inflate successes or error counts.
    const replay=Object.create(null);
    for(const ev of attempts){
      if(ev.verdict==='unverified')continue;
      const old=replay[ev.key]||{status:'new',successes:0,wrongCount:0};
      if(ev.verdict==='correct'){
        const successes=old.status==='review'?old.successes+1:1;
        replay[ev.key]={status:'review',successes,wrongCount:old.wrongCount,due:ev.at+days[Math.min(successes-1,days.length-1)]*86400000,completedDay:ev.day,firstCompletedDay:old.firstCompletedDay||ev.day,lastVerdict:'correct'};
      }else replay[ev.key]={status:old.status==='review'?'review':'new',successes:0,wrongCount:old.wrongCount+1,due:old.status==='review'?ev.at:null,completedDay:old.completedDay||null,firstCompletedDay:old.firstCompletedDay||null,lastVerdict:'incorrect'};
    }
    Object.assign(progress,replay);
    const ta=Number(a.activeSessionAt)||0,tb=Number(b.activeSessionAt)||0;
    const active=ta>tb?a:tb>ta?b:JSON.stringify(canonical(a.activeSession||null))>JSON.stringify(canonical(b.activeSession||null))?a:b;
    return {version:1,progress,attempts,sessions,activeSession:active.activeSession||null,activeSessionAt:Math.max(ta,tb)};
  }
  const api={valid,merge,identified};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.EnglishSyncData=api;
})(typeof globalThis!=='undefined'?globalThis:this);
