import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateDraw, validateDraw } from '../src/matching.js';

test('a draw satisfies two years of directed history, exclusions, and reciprocity rules',()=>{
  const people=Array.from({length:10},(_,i)=>`person-${i}`);
  const history=[2024,2025].flatMap((year,index)=>people.map((giver,i)=>({year,giver,recipient:people[(i+index+1)%10]})));
  const options={year:2026,history,noReciprocal:true,exclusions:[{giver:people[0],recipient:people[4]},{giver:people[4],recipient:people[0]}]};
  for(let i=0;i<30;i++)assert.deepEqual(validateDraw(generateDraw(people,options),people,options),[]);
});
test('an impossible draw reports failure without relaxing restrictions',()=>{
  const people=['a','b','c'];
  const exclusions=people.flatMap(giver=>people.filter(recipient=>recipient!==giver).map(recipient=>({giver,recipient})));
  assert.throws(()=>generateDraw(people,{year:2026,exclusions}),/No valid draw/);
});
test('old history outside the two-year window is allowed; repeats are directional',()=>{
  const people=['a','b','c','d'];
  const pairs=[{giver:'a',recipient:'b'},{giver:'b',recipient:'c'},{giver:'c',recipient:'d'},{giver:'d',recipient:'a'}];
  assert.deepEqual(validateDraw(pairs,people,{year:2026,history:[{year:2023,giver:'a',recipient:'b'},{year:2025,giver:'b',recipient:'a'}]}),[]);
  assert.ok(validateDraw(pairs,people,{year:2026,history:[{year:2025,giver:'a',recipient:'b'}]}).length);
});
test('draw validation detects duplicates, self matches, unknown people, and reciprocal matches',()=>{
  assert.ok(validateDraw([{giver:'a',recipient:'b'},{giver:'b',recipient:'a'}],['a','b'],{year:2026,noReciprocal:true}).length);
  assert.deepEqual(validateDraw([{giver:'a',recipient:'b'},{giver:'b',recipient:'a'}],['a','b'],{year:2026}),[]);
  assert.ok(validateDraw([{giver:'a',recipient:'a'},{giver:'a',recipient:'missing'}],['a','b'],{year:2026}).length);
});

test('the two-year history can force partner pairs and the default draw allows them in both directions',()=>{
  const people=['Alex','Jamie','Casey','Morgan'];
  const history=[2024,2025].flatMap((year,j)=>people.map((giver,i)=>({year,giver,recipient:people[(i+(j?3:1))%4]})));
  const options={year:2026,history},expected=people.map((giver,i)=>({giver,recipient:people[(i+2)%4]}));
  for(let i=0;i<30;i++) {
    const pairs=generateDraw(people,options);
    assert.deepEqual(people.map(giver=>pairs.find(pair=>pair.giver===giver)),expected);
    assert.deepEqual(validateDraw(pairs,people,options),[]);
  }
  assert.throws(()=>generateDraw(people,{...options,noReciprocal:true}),/No valid draw/);
});
