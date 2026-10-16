import { test } from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';
import { emailHtml, emailSender } from '../src/email-format.js';

test('the default sender gets a clear name without changing the approved mailbox or custom identities',async()=>{
  const transport=nodemailer.createTransport({streamTransport:true,buffer:true});
  for(const from of ['sender@example.test','Ornament <sender@example.test>','"Ornament" <sender@example.test>']) {
    const result=await transport.sendMail({from:emailSender(from),to:'member@example.test',subject:'Winter exchange',text:'Your invitation.'});
    assert.equal(result.envelope.from,'sender@example.test');
    assert.deepEqual(result.envelope.to,['member@example.test']);
    assert.match(result.message.toString(),/^From: Ornament Secret Santa <sender@example\.test>\r?$/m);
  }
  const custom='"Winter Club, via Ornament" <sender@example.test>';
  assert.equal(emailSender(custom),custom);
});

test('email HTML escapes member content and preserves working action fragments and product query strings',()=>{
  const invitation='https://exchange.example.test/join#single_use-token';
  const product='https://shop.example.test/gift?size=M&color=green';
  const html=emailHtml('Winter <exchange>',`Hi <script>alert("x")</script>,\n\n${invitation}\n\nGift idea: ${product}\nSizes: M & L\n\njavascript:alert(1)\nhttps://user:secret@shop.example.test/gift`);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('<title>Winter &lt;exchange&gt;</title>'));
  assert.ok(html.includes('Hi &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;,'));
  assert.ok(html.includes(`href="${invitation}"`));
  assert.ok(html.includes('href="https://shop.example.test/gift?size=M&amp;color=green"'));
  assert.ok(html.includes('Sizes: M &amp; L'));
  assert.equal(/<script|<img|<iframe|<link|<style|display:\s*none|href="javascript:|href="https:\/\/user:/.test(html),false);
});
