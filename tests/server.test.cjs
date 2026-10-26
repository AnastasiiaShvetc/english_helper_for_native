const {test}=require('node:test');
const assert=require('node:assert/strict');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const entry=path.resolve(__dirname,'../server/sync-server.cjs');
const freePort=()=>new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
test('API auth, CORS, one-time codes, merging and restart durability',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'english-sync-test-')),port=await freePort();
  const env={...process.env,SYNC_DB:path.join(dir,'test.sqlite'),SYNC_PORT:String(port)};
  const code=()=>execFileSync(process.execPath,[entry,'--create-code','test'],{env,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  const first=code(),second=code();let child;
  const start=async()=>{child=spawn(process.execPath,[entry],{env,stdio:'ignore'});for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/health`)).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw Error('start timeout');};
  const stop=async()=>{if(child.exitCode!==null)return;const done=new Promise(r=>child.once('exit',r));child.kill();await done;};
  const req=(route,body,token,origin)=>fetch(`http://127.0.0.1:${port}${route}`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(origin?{Origin:origin}:{})},body:JSON.stringify(body)});
  try{
    await start();assert.equal((await req('/v1/sync',{})).status,401);
    assert.equal((await req('/v1/pair',{code:first},null,'https://evil.example')).status,403);
    const r=await req('/v1/pair',{code:first},null,'https://anastasiiashvetc.github.io');
    assert.equal(r.headers.get('access-control-allow-origin'),'https://anastasiiashvetc.github.io');
    const one=(await r.json()).token;assert.equal((await req('/v1/pair',{code:first})).status,401);
    const two=(await(await req('/v1/pair',{code:second})).json()).token;
    const empty={version:1,progress:{},attempts:[],sessions:[],activeSession:null};
    const a={...empty,attempts:[{id:'a',key:'lesson-14/part-1/write/w1',stage:'write',verdict:'correct',day:'2026-10-26',at:100,answer:'test'}]};
    assert.equal((await req('/v1/sync',{data:{bad:true}},one)).status,400);
    await req('/v1/sync',{data:a},one);
    let response=await(await req('/v1/sync',{data:empty},two)).json();assert.equal(response.data.attempts.length,1);
    const rev=response.revision;response=await(await req('/v1/sync',{data:response.data},one)).json();assert.equal(response.revision,rev);
    await stop();await start();response=await(await req('/v1/sync',{data:empty},two)).json();assert.equal(response.data.attempts.length,1);
    const preflight=await fetch(`http://127.0.0.1:${port}/v1/sync`,{method:'OPTIONS',headers:{Origin:'https://anastasiiashvetc.github.io','Access-Control-Request-Headers':'authorization,content-type'}});assert.equal(preflight.status,204);
  }finally{await stop();fs.rmSync(dir,{recursive:true,force:true});}
});
