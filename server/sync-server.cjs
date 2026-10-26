'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {valid,merge}=require('../web/sync-data.js');
process.umask(0o077);
const dbPath=process.env.SYNC_DB||'/var/lib/english-sync/progress.sqlite';
fs.mkdirSync(path.dirname(dbPath),{recursive:true,mode:0o700});
const db=new DatabaseSync(dbPath);
fs.chmodSync(dbPath,0o600);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
CREATE TABLE IF NOT EXISTS devices (hash TEXT PRIMARY KEY, label TEXT, created INTEGER);
CREATE TABLE IF NOT EXISTS codes (hash TEXT PRIMARY KEY, label TEXT, expires INTEGER, used INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), revision INTEGER NOT NULL, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS snapshots (id INTEGER PRIMARY KEY, created INTEGER, device TEXT, kind TEXT, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS imports (device TEXT PRIMARY KEY, created INTEGER, data TEXT NOT NULL);`);
const empty=()=>({version:1,progress:{},attempts:[],sessions:[],activeSession:null});
db.prepare('INSERT OR IGNORE INTO state VALUES(1,0,?)').run(JSON.stringify(empty()));
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
if(process.argv.includes('--create-code')){
  const code=crypto.randomBytes(24).toString('base64url'),label=process.argv[process.argv.indexOf('--create-code')+1]||'device';
  db.prepare('INSERT INTO codes(hash,label,expires) VALUES(?,?,?)').run(hash(code),label,Date.now()+7*86400000);
  process.stdout.write(code+'\n');db.close();process.exit(0);
}
const origin=process.env.SYNC_ORIGIN||'https://anastasiiashvetc.github.io';
const rates=new Map();
function limited(ip){const now=Date.now();let bucket=rates.get(ip);if(!bucket||bucket.until<now){bucket={until:now+60000,n:0};rates.set(ip,bucket);}if(rates.size>10000)for(const [k,v]of rates)if(v.until<now)rates.delete(k);return ++bucket.n>20;}
const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  if(req.headers.origin===origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
  const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  try{
    if(req.headers.origin&&req.headers.origin!==origin)return reply(403,{error:'origin_denied'});
    if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Max-Age','600');res.writeHead(204);return res.end();}
    if(req.url==='/health'&&req.method==='GET')return reply(200,{ok:true,service:'english-sync',version:1});
    if(!['/v1/pair','/v1/sync'].includes(req.url)||req.method!=='POST')return reply(404,{error:'not_found'});
    let device;
    if(req.url==='/v1/sync'){
      const bearer=(req.headers.authorization||'').match(/^Bearer ([A-Za-z0-9_-]{43})$/);
      device=bearer&&db.prepare('SELECT hash FROM devices WHERE hash=?').get(hash(bearer[1]));
      if(!device)return reply(401,{error:'unauthorized'});
    }else if(limited(req.headers['x-real-ip']||req.socket.remoteAddress))return reply(429,{error:'try_later'});
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>8*1024*1024){reply(413,{error:'too_large'});return;}chunks.push(chunk);}
    let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return reply(400,{error:'invalid_json'});}
    if(req.url==='/v1/pair'){
      if(typeof body.code!=='string'||!/^[A-Za-z0-9_-]{32}$/.test(body.code))return reply(401,{error:'invalid_code'});
      const code=db.prepare('SELECT * FROM codes WHERE hash=?').get(hash(body.code));
      if(!code||code.used||code.expires<Date.now())return reply(401,{error:'invalid_code'});
      const token=crypto.randomBytes(32).toString('base64url');
      db.exec('BEGIN IMMEDIATE');
      try{db.prepare('UPDATE codes SET used=1 WHERE hash=?').run(code.hash);db.prepare('INSERT INTO devices VALUES(?,?,?)').run(hash(token),code.label,Date.now());db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
      return reply(200,{token});
    }
    if(!valid(body.data))return reply(400,{error:'invalid_progress'});
    db.exec('BEGIN IMMEDIATE');
    try{
      const old=db.prepare('SELECT * FROM state WHERE id=1').get();
      db.prepare('INSERT OR IGNORE INTO imports VALUES(?,?,?)').run(device.hash,Date.now(),JSON.stringify(body.data));
      const joined=merge(JSON.parse(old.data),body.data),encoded=JSON.stringify(joined),changed=encoded!==old.data;
      if(changed){
        db.prepare('INSERT INTO snapshots(created,device,kind,data) VALUES(?,?,?,?)').run(Date.now(),device.hash,'before-merge',old.data);
        db.prepare('UPDATE state SET revision=?,data=? WHERE id=1').run(old.revision+1,encoded);
        db.exec('DELETE FROM snapshots WHERE id NOT IN (SELECT id FROM snapshots ORDER BY id DESC LIMIT 200)');
      }
      db.exec('COMMIT');
      return reply(200,{data:joined,revision:old.revision+(changed?1:0),syncedAt:Date.now()});
    }catch(e){db.exec('ROLLBACK');throw e;}
  }catch(e){console.error('request_failed',e.name);if(!res.headersSent)reply(500,{error:'server_error'});else res.end();}
});
server.requestTimeout=30000;server.headersTimeout=10000;
server.listen(Number(process.env.SYNC_PORT||8791),'127.0.0.1',()=>console.log('english-sync listening on loopback'));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
