import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase,importHistory,members } from '../src/database.js';
import { createExchange,savePerson,setParticipation } from '../src/service.js';

function fixture(t) {
  const f={dir:mkdtempSync(join(tmpdir(),'ornament-roster-test-'))};f.db=openDatabase(f.dir);
  t.after(()=>{f.db.close();rmSync(f.dir,{recursive:true,force:true});});
  const names=['Alex','Jamie','Casey','Morgan','Taylor','Sam'];
  for(const [year,offset] of [[2024,1],[2025,2]])importHistory(f.db,{year,status:'verified',source:'Synthetic roster test',assignments:names.map((giver,i)=>({giver,recipient:names[(i+offset)%names.length]}))});
  return f;
}

test('new years carry identities and participation automatically, with fresh annual content',t=>{
  const {db}=fixture(t),prior=members(db,2025);
  db.prepare("UPDATE enrollments SET wishlist='Previous private list',message='Previous note',gifts='[]' WHERE year=2025").run();
  db.prepare('UPDATE enrollments SET active=0 WHERE year=2025 AND person_id=?').run(prior[0].id);
  const oldPairs=db.prepare('SELECT * FROM assignments ORDER BY year,giver').all();
  createExchange(db,2026);
  const next=members(db,2026);
  assert.deepEqual(next.map(p=>p.id),prior.map(p=>p.id));
  assert.equal(next.find(p=>p.id===prior[0].id).active,0);
  for(const p of next){assert.equal(p.wishlist,'');assert.equal(p.message,'');assert.deepEqual(p.gifts,[]);}
  assert.deepEqual(db.prepare('SELECT * FROM assignments ORDER BY year,giver').all(),oldPairs);
  assert.equal(db.prepare('SELECT count(*) AS n FROM people').get().n,6);
});

test('the one-time upgrade fills a partial open roster while keeping submissions and delivered records',t=>{
  const f=fixture(t),prior=members(f.db,2025);
  f.db.prepare("INSERT INTO exchanges(year,title) VALUES (2026,'Synthetic partial roster')").run();
  for(const p of prior.slice(0,2))f.db.prepare("INSERT INTO enrollments(year,person_id,wishlist,message,gifts) VALUES (2026,?,'Current private list','Current note','[]')").run(p.id);
  f.db.prepare("INSERT INTO outbox(id,year,giver,kind,recipient_email,subject,body,status) VALUES ('delivered-test',2026,?,'invite','alex@example.test','Test subject','Private test body','sent')").run(prior[0].id);
  const existing=f.db.prepare('SELECT * FROM enrollments WHERE year=2026 ORDER BY person_id').all();
  const oldPairs=f.db.prepare('SELECT * FROM assignments ORDER BY year,giver').all(),oldMail=f.db.prepare('SELECT * FROM outbox').all();
  f.db.prepare("DELETE FROM schema_migrations WHERE name='automatic-roster-v1'").run();f.db.close();f.db=openDatabase(f.dir);
  assert.equal(members(f.db,2026).length,6);
  for(const row of existing)assert.deepEqual(f.db.prepare('SELECT * FROM enrollments WHERE year=? AND person_id=?').get(2026,row.person_id),row);
  assert.deepEqual(f.db.prepare('SELECT * FROM assignments ORDER BY year,giver').all(),oldPairs);
  assert.deepEqual(f.db.prepare('SELECT * FROM outbox').all(),oldMail);
  setParticipation(f.db,2026,prior[2].id,false);f.db.close();f.db=openDatabase(f.dir);
  assert.equal(members(f.db,2026).find(p=>p.id===prior[2].id).active,0);
  assert.equal(members(f.db,2026).length,6);
});

test('rollover invalidates an incomplete draft but never changes a finalized roster or assignments',t=>{
  const f=fixture(t),prior=members(f.db,2025);
  for(const year of [2026,2027]) {
    f.db.prepare('INSERT INTO exchanges(year,title,state) VALUES (?,?,?)').run(year,'Synthetic migration',year===2026?'drafted':'locked');
    for(const [i,p] of prior.slice(0,3).entries()){
      f.db.prepare('INSERT INTO enrollments(year,person_id) VALUES (?,?)').run(year,p.id);
      f.db.prepare('INSERT INTO assignments(year,giver,recipient) VALUES (?,?,?)').run(year,p.id,prior[(i+1)%3].id);
    }
  }
  const locked={people:f.db.prepare('SELECT * FROM enrollments WHERE year=2027').all(),pairs:f.db.prepare('SELECT * FROM assignments WHERE year=2027').all()};
  f.db.prepare("DELETE FROM schema_migrations WHERE name='automatic-roster-v1'").run();f.db.close();f.db=openDatabase(f.dir);
  assert.equal(members(f.db,2026).length,6);assert.equal(f.db.prepare('SELECT state FROM exchanges WHERE year=2026').get().state,'open');
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM assignments WHERE year=2026').get().n,0);
  assert.deepEqual(f.db.prepare('SELECT * FROM enrollments WHERE year=2027').all(),locked.people);
  assert.deepEqual(f.db.prepare('SELECT * FROM assignments WHERE year=2027').all(),locked.pairs);
});

test('leaving out and including a member keeps their identity, annual content, and history',t=>{
  const {db}=fixture(t);createExchange(db,2026);
  const p=members(db,2026)[0];savePerson(db,2026,{...p,email:'member@example.test'});
  db.prepare("UPDATE enrollments SET wishlist='Current private list',message='Current note' WHERE year=2026 AND person_id=?").run(p.id);
  db.prepare("INSERT INTO outbox(id,year,giver,kind,recipient_email,subject,body,status) VALUES ('waiting-test',2026,?,'invite','member@example.test','Test','Private','pending')").run(p.id);
  const history=db.prepare('SELECT * FROM assignments ORDER BY year,giver').all();
  setParticipation(db,2026,p.id,false);
  assert.equal(db.prepare("SELECT status FROM outbox WHERE id='waiting-test'").get().status,'cancelled');
  setParticipation(db,2026,p.id,true);
  const current=members(db,2026).find(person=>person.id===p.id);
  assert.equal(current.active,1);assert.equal(current.wishlist,'Current private list');assert.equal(current.message,'Current note');
  assert.equal(db.prepare('SELECT count(*) AS n FROM people').get().n,6);
  assert.deepEqual(db.prepare('SELECT * FROM assignments ORDER BY year,giver').all(),history);
  assert.throws(()=>setParticipation(db,2025,p.id,false),/finalized/);
});

test('editing participation cancels only unsent invitations and preserves sent or uncertain delivery records',t=>{
  const {db}=fixture(t);createExchange(db,2026);
  const roster=members(db,2026),statuses=['pending','preview','failed','sent','uncertain'];
  for(const [i,status] of statuses.entries()) {
    const p=roster[i],id=`edit-invitation-${i}`;
    db.prepare("INSERT INTO outbox(id,year,giver,kind,recipient_email,subject,body,status) VALUES (?,2026,?,'invite','member@example.test','Test','Private',?)").run(id,p.id,status);
    const before=db.prepare('SELECT * FROM outbox WHERE id=?').get(id);
    savePerson(db,2026,{...p,active:false});
    const after=db.prepare('SELECT * FROM outbox WHERE id=?').get(id);
    assert.equal(members(db,2026).find(person=>person.id===p.id).active,0);
    if(['sent','uncertain'].includes(status))assert.deepEqual(after,before);
    else assert.deepEqual({...after},{...before,status:'cancelled',error:'This person is not taking part this year.'});
  }
});

test('the invitation workflow upgrade closes group entry but preserves submitted lists and owner sessions',t=>{
  const f=fixture(t);createExchange(f.db,2026);
  f.db.prepare('UPDATE exchanges SET allow_group_join=1 WHERE year=2026').run();
  f.db.prepare("INSERT INTO group_tokens(hash,year,expires) VALUES ('group-entry',2026,?)").run(Date.now()+3600000);
  f.db.prepare("INSERT INTO submissions(id,year,name,email,wishlist) VALUES ('saved-submission',2026,'Earlier Guest','guest@example.test','Private saved list')").run();
  for(const [role,personId] of [['group',null],['submission','saved-submission']]) {
    f.db.prepare('INSERT INTO sessions(hash,role,csrf,year,person_id,expires) VALUES (?,?,?,2026,?,?)').run(`${role}-session`,role,'test-csrf',personId,Date.now()+3600000);
  }
  const saved=f.db.prepare('SELECT * FROM submissions').all(),owner=f.db.prepare("SELECT * FROM sessions WHERE role='submission'").all();
  f.db.prepare("DELETE FROM schema_migrations WHERE name='automatic-roster-v1'").run();f.db.close();f.db=openDatabase(f.dir);
  assert.equal(f.db.prepare('SELECT allow_group_join FROM exchanges WHERE year=2026').get().allow_group_join,0);
  assert.equal(f.db.prepare('SELECT count(*) AS n FROM group_tokens').get().n,0);
  assert.equal(f.db.prepare("SELECT count(*) AS n FROM sessions WHERE role='group'").get().n,0);
  assert.deepEqual(f.db.prepare('SELECT * FROM submissions').all(),saved);
  assert.deepEqual(f.db.prepare("SELECT * FROM sessions WHERE role='submission'").all(),owner);
});
