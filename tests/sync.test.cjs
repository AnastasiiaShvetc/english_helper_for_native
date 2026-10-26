const {test}=require('node:test');
const assert=require('node:assert/strict');
const {merge,valid}=require('../web/sync-data.js');
const empty=()=>({version:1,progress:{},attempts:[],sessions:[],activeSession:null});
const key='lesson-14/part-1/write/word-1';
const ev=(id,at,verdict='correct')=>({id,key,itemId:'word-1',stage:'write',answer:'test',verdict,day:'2026-10-26',at});
test('legacy import and repeated merge do not duplicate answers',()=>{
  const a=empty();const old=ev('unused',100);delete old.id;a.attempts=[old];
  const joined=merge(a,empty());assert.equal(joined.attempts.length,1);
  assert.equal(merge(joined,a).attempts.length,1);assert.equal(joined.progress[key].successes,1);
});
test('offline answers from two devices are combined and replayed',()=>{
  const a=empty(),b=empty();a.attempts=[ev('a',100),ev('c',300)];b.attempts=[ev('b',200,'incorrect')];
  const joined=merge(a,b);assert.equal(joined.attempts.length,3);
  assert.equal(joined.progress[key].wrongCount,1);assert.equal(joined.progress[key].successes,1);
  assert.deepEqual(merge(a,b),merge(b,a));assert.deepEqual(merge(joined,a),joined);
});
test('legacy sessions preserve multiplicity but deduplicate shared copies',()=>{
  const a=empty(),b=empty();const s={day:'2026-10-26',count:10,first:7,seconds:120};
  a.sessions=[s,{...s}];b.sessions=[{...s}];assert.equal(merge(a,b).sessions.length,2);
});
test('new session IDs preserve distinct sessions with identical statistics',()=>{
  const a=empty(),b=empty();const s={day:'2026-10-26',count:10,first:7,seconds:120};
  a.sessions=[{...s,id:'a'}];b.sessions=[{...s,id:'b'}];assert.equal(merge(a,b).sessions.length,2);
});
test('active session completion is a timestamped tombstone',()=>{
  const a={...empty(),activeSession:{stage:'write'},activeSessionAt:100};
  const b={...empty(),activeSession:null,activeSessionAt:200};assert.equal(merge(a,b).activeSession,null);
});
test('malformed imports are rejected',()=>{
  assert.equal(valid({...empty(),attempts:[{}]}),false);
  assert.equal(valid({...empty(),progress:JSON.parse('{"__proto__":{}}')}),false);
});
