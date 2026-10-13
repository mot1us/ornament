import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { passwordHash } from '../src/security.js';

const image=process.argv[2];
if(!image)throw new Error('Usage: node test/container-smoke.js IMAGE');
const name=`ornament-smoke-${randomUUID()}`;
const volumes=[`${name}-data`,`${name}-backups`];
function docker(args, required=true) {
  const result=spawnSync('docker',args,{encoding:'utf8',timeout:60_000});
  if(required && result.status!==0)throw new Error(result.stderr||result.error?.message||'Docker command failed.');
  return result;
}
try {
  docker(['run','--detach','--name',name,'--read-only','--tmpfs','/tmp',
    '--memory','256m','--cpus','0.50','--pids-limit','100',
    '--cap-drop','ALL','--security-opt','no-new-privileges:true','--network','none',
    '--env',`ADMIN_PASSWORD_HASH=${passwordHash('synthetic-container-check')}`,
    '--env','PUBLIC_URL=https://ornament.example.com','--env','COOKIE_SECURE=true',
    '--env','TRUST_PROXY_HOPS=1','--env','EMAIL_MODE=preview',
    '--volume',`${volumes[0]}:/data`,'--volume',`${volumes[1]}:/backups`,image]);
  let ready=false;
  for(let attempt=0;attempt<30;attempt++) {
    const result=docker(['exec',name,'node','-e',
      "fetch('http://127.0.0.1:3080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"],false);
    if(result.status===0){ready=true;break;}
    await setTimeout(1000);
  }
  assert(ready,'The container must serve its health endpoint.');
  const verify=`
    const assert=require('node:assert/strict');
    const fs=require('node:fs');
    const {DatabaseSync}=require('node:sqlite');
    assert.equal(process.getuid(),1000);
    assert.equal(process.env.EMAIL_MODE,'preview');
    assert(!fs.existsSync('/app/.env'));
    assert(!fs.existsSync('/app/data'));
    const db=new DatabaseSync('/data/secret-santa.sqlite');
    assert.equal(db.prepare('SELECT count(*) AS n FROM people').get().n,0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM assignments').get().n,0);
    assert.equal(db.prepare('SELECT count(*) AS n FROM outbox').get().n,0);
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
    db.close();
  `;
  docker(['exec',name,'node','-e',verify]);
  docker(['exec',name,'node','scripts/backup.js','/backups']);
  docker(['exec',name,'node','-e',
    "require('node:assert/strict')(require('node:fs').readdirSync('/backups').some(n=>n.endsWith('.sqlite')))"]);
  console.log('Container health, empty private database, capped non-root runtime, and backup passed.');
} catch(error) {
  process.stderr.write(docker(['logs',name],false).stderr||'');
  throw error;
} finally {
  docker(['rm','--force',name],false);
  for(const volume of volumes)docker(['volume','rm',volume],false);
}
