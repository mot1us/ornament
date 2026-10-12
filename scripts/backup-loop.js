import { spawnSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
for(;;) {
  const result=spawnSync(process.execPath,['scripts/backup.js','/backups'],{stdio:'inherit'});
  if(result.status!==0)console.error('Backup failed; the next attempt will be in one hour.');
  await setTimeout(result.status===0?24*3600000:3600000);
}
