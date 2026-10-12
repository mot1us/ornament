import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
process.umask(0o077);
const directory=resolve(process.env.DATA_DIR||'./data');
const output=resolve(process.argv[2]||'./backups');
mkdirSync(output,{recursive:true,mode:0o700});
const db=new DatabaseSync(join(directory,'secret-santa.sqlite'),{readOnly:true});
const path=join(output,`secret-santa-${new Date().toISOString().replaceAll(':','-')}.sqlite`);
try{await backup(db,path);const checked=new DatabaseSync(path,{readOnly:true});try{if(checked.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('Backup integrity check failed.');}finally{checked.close();}console.log(path);}
finally{db.close();}
