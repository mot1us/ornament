import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDraw } from '../src/matching.js';
import { testMatchmaking } from '../src/matching-test.js';

// An independent, exhaustive oracle for small rosters. It does not call the
// app's validator or forbidden-pair helper, so shared bugs cannot hide here.
function permutations(items) {
  if (!items.length) return [[]];
  return items.flatMap((item,i)=>permutations(items.filter((_,j)=>i!==j)).map(rest=>[item,...rest]));
}

for (const size of [3,4]) for (const noReciprocal of [true,false]) {
  test(`all exclusion combinations agree with an independent oracle: ${size} people, reciprocal prevention ${noReciprocal}`,()=>{
    const people=Array.from({length:size},(_,i)=>`test-person-${i}`);
    const edges=people.flatMap(giver=>people.filter(recipient=>recipient!==giver).map(recipient=>({giver,recipient})));
    const legal=permutations(people).filter(recipients=>
      recipients.every((recipient,i)=>recipient!==people[i]) &&
      (!noReciprocal || recipients.every((recipient,i)=>recipients[people.indexOf(recipient)]!==people[i]))
    ).map(recipients=>({
      signature:JSON.stringify(recipients),
      mask:recipients.reduce((mask,recipient,i)=>mask | 1<<edges.findIndex(e=>e.giver===people[i] && e.recipient===recipient),0)
    }));
    for (let blocked=0;blocked<2**edges.length;blocked++) {
      const expected=new Set(legal.filter(draw=>!(draw.mask & blocked)).map(draw=>draw.signature));
      const options={year:2026,noReciprocal,exclusions:edges.filter((_,i)=>blocked & 1<<i)};
      const context=`blocked mask ${blocked}, ${size} people, noReciprocal=${noReciprocal}`;
      if (!expected.size) {
        assert.throws(()=>generateDraw(people,options),/No valid draw exists/,context);
      } else {
        const pairs=generateDraw(people,options);
        assert.equal(pairs.length,size,context);
        assert.equal(new Set(pairs.map(p=>p.giver)).size,size,context);
        const recipients=people.map(giver=>pairs.find(pair=>pair.giver===giver)?.recipient);
        assert.ok(expected.has(JSON.stringify(recipients)),context);
      }
    }
  });
}

test('matching accepts the supported roster boundaries and rejects duplicate or unsupported rosters',()=>{
  for (const size of [3,50]) {
    const people=Array.from({length:size},(_,i)=>`test-person-${i}`);
    const pairs=generateDraw(people,{year:2026});
    assert.equal(pairs.length,size);
    assert.equal(new Set(pairs.map(p=>p.recipient)).size,size);
    assert.ok(pairs.every(p=>p.giver!==p.recipient));
  }
  for (const people of [[],['a'],['a','b'],['a','b','a'],Array.from({length:51},(_,i)=>`person-${i}`)]) {
    assert.throws(()=>generateDraw(people,{year:2026}),/between 3 and 50 distinct/);
  }
});

test('the diagnostic distinguishes impossible rules, invalid rosters, and unfinished searches',()=>{
  const people=['a','b','c','d'];
  const forced=new Map([['a','b'],['b','a'],['c','d'],['d','c']]);
  const exclusions=people.flatMap(giver=>people.filter(recipient=>recipient!==giver && recipient!==forced.get(giver)).map(recipient=>({giver,recipient})));
  const blocked=testMatchmaking(people,{year:2026,exclusions,noReciprocal:true});
  assert.equal(blocked.status,'impossible');assert.equal(blocked.checked,0);
  const allowed=testMatchmaking(people,{year:2026,exclusions,noReciprocal:false});
  assert.equal(allowed.status,'passed');assert.equal(allowed.checked,100);
  assert.equal(testMatchmaking(['a','b'],{year:2026}).status,'invalid');
  for(const limits of [{budgetMs:0},{maxVisits:0}]) {
    const limited=testMatchmaking(people,{year:2026},{...limits,includePairings:true});
    assert.equal(limited.status,'limited');assert.equal(limited.checked,0);
    assert.deepEqual(limited.testDraws,[]);
    assert.match(limited.issues[0],/search limit/);
  }
});

test('a forced cycle independently checks the two-calendar-year window and directed repeat rule',()=>{
  const people=['a','b','c','d'],recipients=['b','c','d','a'];
  const exclusions=people.flatMap((giver,i)=>people.filter(recipient=>recipient!==giver && recipient!==recipients[i]).map(recipient=>({giver,recipient})));
  for(const year of [2024,2025]) {
    assert.throws(()=>generateDraw(people,{year:2026,exclusions,history:[{year,giver:'a',recipient:'b'}]}),/No valid draw/);
  }
  for(const history of [
    [{year:2023,giver:'a',recipient:'b'}],
    [{year:2025,giver:'b',recipient:'a'}],
    [{year:2026,giver:'a',recipient:'b'}],
    [{year:2027,giver:'a',recipient:'b'}],
  ]) {
    const pairs=generateDraw(people,{year:2026,exclusions,history});
    assert.deepEqual(people.map(giver=>pairs.find(p=>p.giver===giver).recipient),recipients);
  }
});

test('repeated diagnostics check recent history and exclusions without returning pairings or changing inputs',()=>{
  const people=Array.from({length:10},(_,i)=>`private-test-id-${i}`);
  const options={year:2026,history:[2024,2025].flatMap((year,j)=>people.map((giver,i)=>({year,giver,recipient:people[(i+j+1)%people.length]}))),
    exclusions:[{giver:people[0],recipient:people[3]}]};
  const before=JSON.stringify({people,options});
  const result=testMatchmaking(people,options);
  assert.equal(result.status,'passed');assert.equal(result.checked,100);
  assert.deepEqual(result.issues,[]);
  assert.equal(JSON.stringify({people,options}),before);
  assert.equal(result.assignments,undefined);
  for(const id of people)assert.equal(JSON.stringify(result).includes(id),false);
});
