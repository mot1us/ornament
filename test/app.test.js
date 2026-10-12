import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { openDatabase, importHistory, members } from '../src/database.js';
import { createExchange, savePerson, inviteLink, draftDraw, lockDraw, prepareMail } from '../src/service.js';
import { passwordHash, readConfig } from '../src/security.js';
import { createApp } from '../src/server.js';
import { createMailer } from '../src/mail.js';

async function fixture(t) {
  const dir=mkdtempSync(join(tmpdir(),'santa-test-'));
  const db=openDatabase(dir);
  const config=readConfig({ADMIN_PASSWORD_HASH:passwordHash('a-valid-test-password'),DATA_DIR:dir,EMAIL_MODE:'preview'});
  const server=createApp(config,db).listen(0,'127.0.0.1');await once(server,'listening');
  config.publicUrl=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{server.close();server.closeAllConnections();await once(server,'close');db.close();rmSync(dir,{recursive:true,force:true});});
  const call=async(path,body,auth={})=>{
    const response=await fetch(`${config.publicUrl}/api${path}`,{method:body===undefined?'GET':'POST',
      headers:{'Content-Type':'application/json',Origin:config.publicUrl,...(auth.cookie?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf}:{}),...auth.headers},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  const login=await call('/login',{password:'a-valid-test-password'});
  const admin={cookie:login.cookie,csrf:login.data.csrf};
  return {db,config,call,admin,dir};
}
function history(year,offset=1,names=Array.from({length:10},(_,i)=>`Person ${i}`)) {
  return {year,status:'verified',source:'Test fixture',assignments:names.map((giver,i)=>({giver,recipient:names[(i+offset)%names.length]}))};
}
function seed(db,status='verified') {
  importHistory(db,history(2024,1));importHistory(db,{...history(2025,2),status});
  createExchange(db,2026,2025);
  for(const p of members(db,2026))savePerson(db,2026,{...p,email:`person-${p.id}@example.test`,active:true});
}

test('organizer login, CSRF, and origin restrictions protect private admin data',async t=>{
  const {call,admin}=await fixture(t);
  assert.equal((await call('/admin/state')).status,403);
  assert.equal((await call('/admin/exchanges',{year:2026},{...admin,csrf:'wrong'})).status,403);
  assert.equal((await call('/admin/exchanges',{year:2026},{...admin,headers:{Origin:'https://attacker.test'}})).status,403);
  assert.equal((await call('/login',{password:'wrong'})).status,401);
  assert.equal((await call('/admin/exchanges',{year:2026},admin)).status,200);
});
test('personal links scope access to one person, hide unfinalized recipients, and can be revoked',async t=>{
  const {db,config,call,admin}=await fixture(t);seed(db);
  const people=members(db,2026),person=people[0];
  draftDraw(db,2026);
  const link=inviteLink(db,config,2026,person.id);
  const redeemed=await call('/redeem',{token:new URL(link).hash.slice(1)});
  const member={cookie:redeemed.cookie,csrf:redeemed.data.csrf};
  const before=await call('/member/profile',undefined,member);
  assert.equal(before.data.recipient,null);assert.equal(before.data.person.name,person.name);
  assert.equal(JSON.stringify(before.data).includes(people[1].email),false);
  assert.equal((await call('/admin/state',undefined,member)).status,403);
  assert.equal((await call('/member/profile',{wishlist:'A book',gifts:[{label:'Bad',url:'javascript:alert(1)'}]},member)).status,400);
  assert.equal((await call('/member/profile',{wishlist:'A book',gifts:[{label:'Book',url:'https://example.test/book'}]},member)).status,200);
  lockDraw(db,2026);
  const after=await call('/member/profile',undefined,member);
  assert.ok(after.data.recipient);assert.deepEqual(Object.keys(after.data.recipient).sort(),['gifts','name','wishlist']);
  await call('/admin/revoke',{year:2026,personId:person.id},admin);
  assert.equal((await call('/member/profile',undefined,member)).status,403);
  assert.equal((await call('/redeem',{token:new URL(link).hash.slice(1)})).status,401);
});
test('tentative history permits drafts but blocks finalizing; roster changes discard stale drafts',async t=>{
  const {db,call,admin}=await fixture(t);seed(db,'provisional');draftDraw(db,2026);
  assert.throws(()=>lockDraw(db,2026),/Confirm the previous two years/);
  await call('/admin/history/confirm',{year:2025},admin);
  assert.equal(db.prepare('SELECT state FROM exchanges WHERE year=2026').get().state,'open');
  draftDraw(db,2026);const first=members(db,2026)[0];savePerson(db,2026,{...first,active:false});
  assert.equal(db.prepare('SELECT count(*) AS n FROM assignments WHERE year=2026').get().n,0);
});
test('imports reconcile alternate names and reject partial history transactionally',async t=>{
  const {db}=await fixture(t);
  importHistory(db,history(2024,1,['Alex','Jamie','Christopher']));
  importHistory(db,{...history(2025,1,['Alex','Jamie','Chris']),aliases:{Christopher:['Chris']},status:'provisional'});
  assert.equal(db.prepare('SELECT count(*) AS n FROM people').get().n,3);
  const previous=db.prepare('SELECT * FROM assignments WHERE year=2025').all();
  assert.throws(()=>importHistory(db,{year:2025,assignments:[{giver:'Alex',recipient:'Jamie'},{giver:'Jamie',recipient:'Stranger'},{giver:'Chris',recipient:'Alex'}]}),/each person once/);
  assert.deepEqual(db.prepare('SELECT * FROM assignments WHERE year=2025').all(),previous);
  assert.equal(db.prepare("SELECT count(*) AS n FROM people WHERE name='Stranger'").get().n,0);
});
test('a finalized draw persists after reopening SQLite and cannot be regenerated',async t=>{
  const {db,dir}=await fixture(t);seed(db);draftDraw(db,2026);lockDraw(db,2026);
  const saved=db.prepare('SELECT * FROM assignments WHERE year=2026').all();
  const another=openDatabase(dir);try{assert.deepEqual(another.prepare('SELECT * FROM assignments WHERE year=2026').all(),saved);}finally{another.close();}
  assert.throws(()=>draftDraw(db,2026),/finalized/);
});
test('email previews are durable and real sends skip already successful messages',async t=>{
  const {db,config}=await fixture(t);seed(db);draftDraw(db,2026);lockDraw(db,2026);
  prepareMail(db,config,2026,'assignment');prepareMail(db,config,2026,'assignment');
  assert.equal(db.prepare('SELECT count(*) AS n FROM outbox').get().n,10);
  await createMailer(db,config).deliver(2026);
  assert.equal(db.prepare("SELECT count(*) AS n FROM outbox WHERE status='preview'").get().n,10);
  db.prepare("UPDATE outbox SET status='pending'").run();
  let count=0;
  const smtp=createMailer(db,{...config,emailMode:'smtp'}, {async sendMail(mail){count++;return {accepted:[mail.to],rejected:[]};}});
  await smtp.deliver(2026);await smtp.deliver(2026);assert.equal(count,10);
  assert.equal(db.prepare("SELECT count(*) AS n FROM outbox WHERE status='sent'").get().n,10);
});
test('SMTP ambiguity and process interruptions require review instead of automatic retries',async t=>{
  const {db,config,call,admin,dir}=await fixture(t);seed(db);prepareMail(db,config,2026,'invite');
  let count=0;
  const smtp=createMailer(db,{...config,emailMode:'smtp'},{async sendMail(){count++;throw Object.assign(new Error('Timeout'),{code:'ETIMEDOUT'});}});
  await smtp.deliver(2026);await smtp.deliver(2026);assert.equal(count,10);
  const mail=db.prepare('SELECT * FROM outbox LIMIT 1').get();
  assert.equal(mail.status,'uncertain');
  assert.equal((await call('/admin/mail/retry',{id:mail.id},admin)).status,400);
  assert.equal((await call('/admin/mail/retry',{id:mail.id,confirm:'CHECKED'},admin)).status,200);
  db.prepare("UPDATE outbox SET status='sending' WHERE id=?").run(mail.id);
  const reopened=openDatabase(dir);try{assert.equal(reopened.prepare('SELECT status FROM outbox WHERE id=?').get(mail.id).status,'uncertain');}finally{reopened.close();}
});
test('configuration requires strong password hashes and HTTPS for external hosting',()=>{
  assert.throws(()=>readConfig({}),/ADMIN_PASSWORD_HASH/);
  assert.throws(()=>readConfig({PUBLIC_URL:'http://santa.example.test',ADMIN_PASSWORD_HASH:passwordHash('a-valid-test-password')}),/HTTPS/);
  assert.throws(()=>readConfig({PUBLIC_URL:'https://santa.example.test/path',ADMIN_PASSWORD_HASH:passwordHash('a-valid-test-password')}),/origin/);
});

test('new families can explicitly confirm empty prior years without erasing existing history',async t=>{
  const {db,call,admin}=await fixture(t);
  createExchange(db,2026,null);
  for(let i=0;i<5;i++)savePerson(db,2026,{name:`Guest ${i}`,email:`guest-${i}@example.test`});
  for(const year of [2024,2025])assert.equal((await call('/admin/history/none',{year,confirm:'NO EXCHANGE'},admin)).status,200);
  draftDraw(db,2026);lockDraw(db,2026);
  assert.equal((await call('/admin/history/none',{year:2026,confirm:'NO EXCHANGE'},admin)).status,400);
  assert.equal((await call('/admin/history/none',{year:2023,confirm:'wrong'},admin)).status,400);
});

test('correcting an email after finalization preserves the draw and updates unsent messages',async t=>{
  const {db,config,call,admin}=await fixture(t);seed(db);draftDraw(db,2026);lockDraw(db,2026);
  prepareMail(db,config,2026,'assignment');
  const before=db.prepare('SELECT * FROM assignments WHERE year=2026').all();
  const person=members(db,2026)[0];
  assert.equal((await call('/admin/contact',{year:2026,id:person.id,email:'corrected@example.test'},admin)).status,200);
  assert.deepEqual(db.prepare('SELECT * FROM assignments WHERE year=2026').all(),before);
  assert.equal(db.prepare('SELECT recipient_email FROM outbox WHERE giver=?').get(person.id).recipient_email,'corrected@example.test');
});
