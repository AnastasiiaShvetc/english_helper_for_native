const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs'),path=require('node:path');
process.umask(0o077);
const dir=process.env.SYNC_BACKUPS||'/var/lib/english-sync/backups';
fs.mkdirSync(dir,{recursive:true,mode:0o700});
const db=new DatabaseSync(process.env.SYNC_DB||'/var/lib/english-sync/progress.sqlite');
const target=path.join(dir,new Date().toISOString().replace(/[:.]/g,'-')+'.sqlite');
db.prepare('VACUUM INTO ?').run(target);db.close();fs.chmodSync(target,0o600);
for(const name of fs.readdirSync(dir)){const p=path.join(dir,name);if(name.endsWith('.sqlite')&&Date.now()-fs.statSync(p).mtimeMs>30*86400000)fs.unlinkSync(p);}
console.log('Progress database backup created');
