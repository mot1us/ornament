import { readFileSync } from 'node:fs';
import { openDatabase, importHistory } from '../src/database.js';
process.umask(0o077);
const files=process.argv.slice(2);
if(!files.length)throw new Error('Usage: npm run import-history -- /path/to/history.json [...]');
const db=openDatabase(process.env.DATA_DIR||'./data');
try{for(const file of files){const input=JSON.parse(readFileSync(file,'utf8'));importHistory(db,input);console.log(`Imported ${input.year} history (${input.status==='verified'?'verified':'provisional'}).`);}}
finally{db.close();}
