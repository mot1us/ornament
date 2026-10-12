import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const manifest=JSON.parse(readFileSync('package.json','utf8'));
const lock=JSON.parse(readFileSync('package-lock.json','utf8'));
if(manifest.version!==lock.version || manifest.version!==lock.packages?.['']?.version) {
  throw new Error('Keep package.json and package-lock.json versions in sync.');
}
if(!readFileSync('CHANGELOG.md','utf8').split(/\r?\n/).includes(`## ${manifest.version}`)) {
  throw new Error(`Add a CHANGELOG.md entry for ${manifest.version}.`);
}
for (const directory of ['src','public','scripts','test']) {
  for (const name of readdirSync(directory).filter(n=>n.endsWith('.js'))) {
    const result=spawnSync(process.execPath,['--check',join(directory,name)],{stdio:'inherit'});
    if(result.status!==0)process.exit(result.status||1);
  }
}
console.log('JavaScript syntax checks passed.');
