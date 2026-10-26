const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const {spawn,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const freePort=()=>new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
(async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'english-sync-browser-')),apiPort=await freePort();
  const site=http.createServer((req,res)=>{const rel=new URL(req.url,'http://local').pathname;const file=path.join(root,rel==='/'?'web/index.html':rel.endsWith('/')?rel+'index.html':rel);if(!file.startsWith(root)||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'text/html');fs.createReadStream(file).pipe(res);});
  await new Promise(r=>site.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${site.address().port}`;
  const env={...process.env,SYNC_DB:path.join(dir,'test.sqlite'),SYNC_PORT:String(apiPort),SYNC_ORIGIN:origin};
  const code=()=>execFileSync(process.execPath,[path.join(root,'server/sync-server.cjs'),'--create-code','browser-test'],{env,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  const a=code(),b=code(),child=spawn(process.execPath,[path.join(root,'server/sync-server.cjs')],{env,stdio:'ignore'});
  let browser;
  try{
    for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${apiPort}/health`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
    browser=await chromium.launch({executablePath:process.env.CHROME_PATH||(process.platform==='win32'?'C:/Program Files/Google/Chrome/Application/chrome.exe':undefined),headless:true});
    const phone=await browser.newContext({viewport:{width:375,height:812},serviceWorkers:'block'}),desktop=await browser.newContext({viewport:{width:1440,height:900},serviceWorkers:'block'});
    const errors=[];
    const init=async(ctx,id,at)=>{
      await ctx.addInitScript(({endpoint,id,at})=>{
        window.ENGLISH_SYNC_ENDPOINT=endpoint;
        if(!localStorage.getItem('my-english-progress-v1'))localStorage.setItem('my-english-progress-v1',JSON.stringify({version:1,progress:{},attempts:[{key:`lesson-14/part-1/write/${id}`,itemId:id,stage:'write',answer:'legacy',verdict:'correct',day:'2026-10-26',at}],sessions:[],activeSession:null}));
      },{endpoint:`http://127.0.0.1:${apiPort}`,id,at});
      const page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));return page;
    };
    const p1=await init(phone,'phone-old',100),p2=await init(desktop,'desktop-old',200);
    await p1.goto(origin+'/web/#sync='+a);await p1.waitForFunction(()=>progressSync.state==='synced');
    await p2.goto(origin+'/web/');await p2.locator('[data-action=settings]').click();await p2.locator('#sync-link').fill(origin+'/web/#sync='+b);await p2.locator('[data-action=connect-sync]').click();await p2.waitForFunction(()=>progressSync.state==='synced');
    await p1.evaluate(()=>progressSync.sync());
    assert.equal(await p1.evaluate(()=>data.attempts.length),2);assert.equal(await p2.evaluate(()=>data.attempts.length),2);
    assert.equal(await p1.evaluate(()=>JSON.parse(localStorage.getItem('my-english-before-sync-v1')).attempts.length),1);
    await phone.setOffline(true);
    await p1.evaluate(()=>{data.attempts.push({id:'offline-answer',key:'lesson-14/part-1/write/offline',itemId:'offline',stage:'write',answer:'offline',verdict:'correct',day:'2026-10-26',at:300});persist();});
    await p1.evaluate(()=>progressSync.sync());assert.equal(await p1.evaluate(()=>progressSync.state),'offline');
    await phone.setOffline(false);await p1.evaluate(()=>progressSync.sync());await p2.evaluate(()=>progressSync.sync());
    assert.equal(await p2.evaluate(()=>data.attempts.length),3);
    await p2.evaluate(()=>progressSync.sync());assert.equal(await p2.evaluate(()=>data.attempts.length),3);
    await p1.locator('[data-action=settings]').click();assert.match(await p1.locator('#screen').innerText(),/Прогресс синхронизирован/);
    assert.equal(await p1.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await p1.reload();await p1.waitForFunction(()=>progressSync.state==='synced');assert.equal(await p1.evaluate(()=>data.attempts.length),3);
    assert.deepEqual(errors,[]);
    console.log('PASS: two isolated browsers, legacy merge, local backups, offline recovery, idempotence, reload, mobile layout; no page errors');
  }finally{if(browser)await browser.close();child.kill();await new Promise(r=>child.exitCode!==null?r():child.once('exit',r));await new Promise(r=>site.close(r));fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
