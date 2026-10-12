import { passwordHash } from '../src/security.js';
let password='';
if(process.stdin.isTTY) {
  process.stderr.write('New organizer password (at least 12 characters; input hidden): ');
  process.stdin.setRawMode(true);process.stdin.resume();process.stdin.setEncoding('utf8');
  await new Promise((resolve,reject)=>{
    process.stdin.on('data',chunk=>{
      for(const char of chunk) {
        if(char==='\u0003'){process.stdin.setRawMode(false);process.exit(130);}
        if(char==='\r'||char==='\n'){process.stdin.setRawMode(false);process.stdin.pause();process.stderr.write('\n');resolve();return;}
        if(char==='\u007f')password=password.slice(0,-1);
        else if(char>=' ')password+=char;
      }
      if(password.length>1024)reject(new Error('Password too long.'));
    });
  });
} else for await(const chunk of process.stdin)password+=chunk;
password=password.replace(/[\r\n]+$/,'');
if(password.length<12||password.length>1024)throw new Error('Use a password between 12 and 1024 characters.');
console.log(`ADMIN_PASSWORD_HASH=${passwordHash(password)}`);
