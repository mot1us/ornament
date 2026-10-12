const app=document.querySelector('#app');
const dialog=document.querySelector('#dialog');
let session=null, state=null, tab='people', selectedYear=null, member=null, group=null, revealed=false, familyEditing=false, familyUpdated=false;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const personName=id=>state.people.find(p=>p.id===id)?.name||'Unknown person';
const badge=(label,style='')=>`<span class="badge ${style}">${esc(label)}</span>`;
const options=()=>state.people.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
let noticeTimer;
function notice(message,error=false) {
  const el=document.querySelector('#notice');el.textContent=message;el.className=error?'error':'';el.hidden=false;
  clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>el.hidden=true,7000);
}
async function api(path,body) {
  const response=await fetch(`/api${path}`,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(session?{'X-CSRF-Token':session.csrf}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await response.json();if(!response.ok) throw new Error(data.error||'Something went wrong.');return data;
}
function showDialog(html) {document.querySelector('#dialog-content').innerHTML=html;dialog.showModal();}
const reducedMotion=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const envelopeIcon='<svg viewBox="0 0 64 48" fill="none" aria-hidden="true"><rect x="3" y="3" width="58" height="42" rx="5" fill="currentColor" stroke="var(--ink)" stroke-width="2.5"/><path d="m4 5 28 22L60 5M4 43l20-19m36 19L40 24" stroke="var(--ink)" stroke-width="2.5" stroke-linejoin="round"/><path d="M32 25c-7-5-12 1 0 9 12-8 7-14 0-9Z" fill="var(--red)"/></svg>';
const treeIcon='<svg viewBox="0 0 32 40" fill="none" aria-hidden="true"><path d="M16 3v32M16 8 9 14m7-1 8 7m-8-1L5 26m11-1 12 6M9 36h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="24" cy="23" r="4" fill="var(--red)"/></svg>';
async function leaveCard(element) {
  if(reducedMotion()||!element?.isConnected)return;
  await element.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(8px)'}],{duration:140,easing:'ease-in',fill:'forwards'}).finished.catch(()=>{});
}
async function sendLetter(form,updated) {
  if(reducedMotion()||!form.isConnected)return;
  if(updated){await leaveCard(form);return;}
  const flight=document.createElement('div');flight.className='send-flight';flight.setAttribute('aria-hidden','true');flight.innerHTML=envelopeIcon;
  form.parentElement.append(flight);
  form.animate([{opacity:1,transform:'scale(1)'},{opacity:0,transform:'translateY(12px) scale(.96)'}],{duration:260,easing:'ease-in',fill:'forwards'});
  await flight.animate([{opacity:0,transform:'translate(-50%, 30px) scale(.5) rotate(-8deg)',offset:0},{opacity:1,transform:'translate(-50%, 0) scale(1.1) rotate(5deg)',offset:.35},{opacity:1,transform:'translate(-50%, -18px) scale(1) rotate(-5deg)',offset:.55},{opacity:0,transform:'translate(-30%, -180px) scale(.65) rotate(-18deg)',offset:1}],{duration:720,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'}).finished.catch(()=>{});
  flight.remove();
}
document.querySelector('#close-dialog').addEventListener('click',()=>dialog.close());
document.querySelector('#logout').addEventListener('click',async()=>{await api('/logout',{});session=null;location.href='/';});

function home() {
  if(session?.role==='member'){location.replace('/join');return;}
  app.innerHTML=`<section class="home-card"><div class="home-copy"><p class="eyebrow">A LITTLE SECRET SANTA TRADITION</p><h1>A little list.<br>A lot of joy.</h1><p>Gift ideas, happy surprises, and your favorite people. Christmas starts here.</p><div class="home-invitation">${envelopeIcon}<p>Open the group link your organizer shared to write your wish list.</p></div><p class="home-help"><a class="text-link" href="/join">Already taking part? Sign in <span aria-hidden="true">↗</span></a></p></div><div class="home-art"><span class="art-note">a little Christmas magic</span><img class="holiday-friends" src="/christmas-friends.png" alt="Charlie Brown, Snoopy, and Woodstock beside a little Christmas tree with a red ornament" width="1536" height="1024"><p class="home-caption">Big wishes. Little tree. Plenty of heart.</p></div></section>`;
}
function signInForm() {
  return '<form data-form="email-sign-in" class="sign-in-form"><label>Email<input name="email" type="email" autocomplete="email" inputmode="email" maxlength="254" placeholder="you@example.com" required></label><button class="primary">Send sign-in link</button><p class="sign-in-status" role="status" aria-live="polite" hidden></p></form>';
}
function login(message='') {
  app.innerHTML=`<section class="login-card"><h1>Organizer</h1>${message?`<p class="inline-error">${esc(message)}</p>`:''}<form data-form="login"><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="primary">Sign in</button></form></section>`;
}
async function loadAdmin() {
  state=await api(`/admin/state${selectedYear?`?year=${selectedYear}`:''}`);
  selectedYear=state.exchange?.year||null;
  renderAdmin();
}
function renderAdmin() {
  const e=state.exchange;
  if(!e){app.innerHTML=`<section class="login-card"><h1>New exchange</h1>${newYearForm()}</section>`;return;}
  const active=state.people.filter(p=>p.active),ready=active.filter(p=>p.wishlist||p.gifts.length).length;
  const pending=(state.submissions||[]).filter(p=>p.status==='pending').length;
  const status={open:'Not drawn',drafted:'Draft',locked:'Finalized',archived:'Archived',no_exchange:'No exchange'}[e.state];
  app.innerHTML=`<section class="dashboard"><div class="dash-heading"><h1>${esc(e.title)}</h1><div class="year-tools"><label class="sr-only" for="year-select">Year</label><select id="year-select">${state.exchanges.map(y=>`<option ${y.year===e.year?'selected':''}>${y.year}</option>`).join('')}</select><button data-action="new-year" class="secondary">+ Year</button></div></div><p class="dashboard-status">${active.length} people · ${ready}/${active.length} wish lists${pending?' · '+pending+' to review':''} · ${esc(status)}</p><nav class="tabs" aria-label="Organizer sections">${[['people','People'],['rules','Rules'],['draw','Draw'],['history','History'],['email','Email']].map(([key,label])=>`<button data-action="tab" data-tab="${key}" class="${tab===key?'selected':''}" aria-pressed="${tab===key}">${label}</button>`).join('')}</nav><div class="tab-content">${({people:peoplePanel,rules:rulesPanel,draw:drawPanel,history:historyPanel,email:emailPanel}[tab])()}</div></section>`;
}
const isMutable=()=>['open','drafted'].includes(state.exchange.state);
function peoplePanel() {
  const pending=(state.submissions||[]).filter(p=>p.status==='pending');
  return `<div class="section-heading"><div><h2>People</h2><p>Share one link. Review the wish lists as they arrive.</p></div><div class="row-actions">${isMutable()?'<button class="secondary" data-action="share">Group link</button><button class="quiet small" data-action="group-revoke">Revoke group link</button><button class="primary" data-action="add-person">+ Add person</button>':''}</div></div>${state.people.length?`<div class="table-wrap"><table><thead><tr><th>Person</th><th>Email</th><th>Wish list</th><th>Taking part</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${state.people.map(p=>`<tr><td><div class="person"><span class="avatar">${esc(p.name[0])}</span><strong>${esc(p.name)}</strong></div></td><td>${p.email?esc(p.email):'<span class="muted">Email needed</span>'}</td><td>${p.wishlist||p.gifts.length?badge('Ready','green'):badge('Not yet')}</td><td>${p.active?badge('Yes','green'):badge('Sitting out')}</td><td class="row-actions">${isMutable()?`<button class="quiet" data-action="edit-person" data-id="${p.id}">Edit</button>`:state.exchange.state==='locked'?`<button class="quiet" data-action="contact" data-id="${p.id}">Update email</button>`:''}${state.exchange.state!=='archived'?`<button class="quiet" data-action="link" data-id="${p.id}">Private link</button><button class="quiet small" data-action="revoke" data-id="${p.id}">Revoke links</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:`<div class="empty">${pending.length?'Approve the submitted wish lists below to add people to this year’s draw.':'Share the group link to collect wish lists.'}</div>`}${pending.length?`<section class="submission-review"><div class="section-heading"><h2>To review ${badge(pending.length,'amber')}</h2></div><ul class="submission-list">${pending.map(p=>`<li><div><strong>${esc(p.name)}</strong><small class="block muted">${esc(p.email)}</small></div><button class="secondary" data-action="review-submission" data-id="${esc(p.id)}" ${isMutable()?'':'disabled'}>Review</button></li>`).join('')}</ul></section>`:''}`;
}
function personForm(person={}) {
  return `<h2>${person.id?'Edit '+esc(person.name):'Add person'}</h2><form data-form="person"><input type="hidden" name="id" value="${esc(person.id||'')}"><label>Name<input name="name" required maxlength="80" value="${esc(person.name||'')}"></label><label>Email<input type="email" name="email" value="${esc(person.email||'')}" placeholder="You can add this later"></label><label>Other names, separated by commas<input name="aliases" value="${esc((person.aliases||[]).join(', '))}" placeholder="A nickname or previous name"></label><label class="checkbox"><input type="checkbox" name="active" ${person.active===0?'':'checked'}>Taking part this year</label><button class="primary">Save person</button></form>`;
}
function rulesPanel() {
  const e=state.exchange,disabled=isMutable()?'':'disabled';
  return `<div class="two-column"><section class="panel"><h2>Settings</h2><form data-form="settings"><fieldset ${disabled}><label>Exchange name<input name="title" value="${esc(e.title)}" required maxlength="100"></label><div class="form-row"><label>Gift budget<input name="budget" value="${esc(e.budget)}" placeholder="e.g. $50"></label><label>Exchange date<input name="event_date" value="${esc(e.event_date)}" placeholder="e.g. December 25"></label></div><label class="checkbox"><input type="checkbox" name="noReciprocal" ${e.no_reciprocal?'checked':''}>Prevent two people from drawing each other</label><p class="muted">Everyone gives once and receives once. Self-matches and giver → recipient repeats from the previous two years are always excluded.</p><button class="primary">Save details</button></fieldset></form></section><section class="panel"><h2>Exclusions</h2><p>Exclude partners or any specific pairing.</p><form data-form="exclusion"><fieldset ${disabled}><div class="form-row"><label>Giver<select name="giver">${options()}</select></label><label>Recipient<select name="recipient">${options()}</select></label></div><label class="checkbox"><input type="checkbox" name="bothDirections" checked>Exclude both directions</label><button class="secondary">Add exclusion</button></fieldset></form><ul class="exclusion-list">${state.exclusions.map(p=>`<li>${esc(personName(p.giver))} <span aria-hidden="true">→</span> ${esc(personName(p.recipient))}${isMutable()?`<button class="quiet" data-action="remove-exclusion" data-id="${p.giver}" data-recipient="${p.recipient}">Remove</button>`:''}</li>`).join('')||'<li class="muted">No extra exclusions yet.</li>'}</ul></section></div>`;
}
function drawPanel() {
  const e=state.exchange;
  const historyReady=state.history.every(h=>h.status==='verified');
  return `<div class="section-heading"><div><h2>Draw</h2><p>Review, then finalize.</p></div>${isMutable()?'<button class="primary" data-action="draft">'+(e.state==='drafted'?'Generate another draft':'Generate a draft')+'</button>':''}</div><div class="history-check">${state.history.map(h=>`<span>${h.year} history ${badge(h.status,h.status==='verified'?'green':'amber')}</span>`).join('')}</div>${!historyReady&&isMutable()?'<p class="callout">You can try a draft now. Confirm both previous years before finalizing to make the no-repeat rule reliable.</p>':''}${state.assignments.length?`<div class="match-list">${state.assignments.map(p=>`<div><span>${esc(personName(p.giver))}</span><span class="match-arrow" aria-hidden="true">→</span><strong>${esc(personName(p.recipient))}</strong></div>`).join('')}</div>`:'<div class="empty"><span class="empty-star" aria-hidden="true">✧</span><h3>No draw yet.</h3><p>Add people and exclusions, then draw.</p></div>'}${e.state==='drafted'?`<div class="finalize-bar"><div><strong>Happy with these matches?</strong><p>Finalizing locks this year's roster and draw. Emails are sent separately.</p></div><button class="primary" data-action="finalize" ${historyReady&&!(state.submissions||[]).some(s=>s.status==='pending')?'':'disabled'}>Finalize draw</button></div>`:''}${e.state==='locked'?'<p class="callout green-callout">This draw is saved and locked. Go to Emails to preview the messages before sending.</p>':''}`;
}
function historyPanel() {
  const history=state.exchanges.filter(e=>['locked','archived','no_exchange'].includes(e.state));
  const e=state.exchange;
  return `<div class="section-heading"><div><h2>History</h2><p>Past matches prevent repeats.</p></div><button class="secondary" data-action="import">Import or update a year</button></div><div class="history-cards">${history.map(h=>`<article class="panel"><h3>${h.year}</h3>${badge(h.state==='no_exchange'?'No exchange':h.history_status,h.history_status==='verified'?'green':'amber')}<button class="text-link" data-action="view-history" data-year="${h.year}">View year →</button></article>`).join('')||'<p class="muted">No past years imported yet.</p>'}</div>${e.state==='archived'?`<div class="section-heading"><h3>${e.year} pairings</h3>${e.history_status==='provisional'?'<button class="primary" data-action="confirm-history">Confirm this history</button>':''}</div><div class="match-list">${state.assignments.map(p=>`<div><span>${esc(personName(p.giver))}</span><span class="match-arrow">→</span><strong>${esc(personName(p.recipient))}</strong></div>`).join('')}</div><p class="section-note">Source: ${esc(e.source||'Manually entered')}</p>`:''}<p class="section-note">Starting a new tradition? Record years in which no exchange happened.</p><button class="secondary" data-action="no-exchange">Record a year with no exchange</button><p><a class="text-link" href="/api/admin/export" download>Download all people and match history →</a></p>`;
}
function historyForm() {
  const archived=state.exchange.state==='archived';
  return `<h2>Save a past year's matches</h2><p>The first name gave a gift to the second. One pairing per line.</p><form data-form="history"><label>Year<input name="year" type="number" min="2000" max="2200" required value="${archived?state.year:new Date().getFullYear()-1}"></label><label>Pairings<textarea name="pairs" rows="10" required placeholder="Alex → Jamie&#10;Jamie → Sam&#10;Sam → Alex">${archived?esc(state.assignments.map(p=>`${personName(p.giver)} → ${personName(p.recipient)}`).join('\n')):''}</textarea></label><label>Source or notes<input name="source" value="${archived?esc(state.exchange.source):''}" placeholder="e.g. Family recollection, waiting for confirmation"></label><label class="checkbox"><input type="checkbox" name="verified">The family has confirmed all these matches</label><button class="primary">Save history</button></form>`;
}
function emailPanel() {
  return `<div class="section-heading"><div><h2>Email</h2><p>Prepare. Preview. Send.</p></div>${badge(state.emailMode==='preview'?'Preview mode':'SMTP mode',state.emailMode==='preview'?'amber':'green')}</div>${state.emailMode==='preview'?'<p class="callout">Preview mode is on. Messages are stored here, and no emails leave the app.</p>':!state.smtpReady?'<p class="callout">SMTP is not configured. Add the server email settings before sending.</p>':''}<div class="email-actions"><button class="secondary" data-action="prepare-invites" ${state.exchange.state==='archived'?'disabled':''}>Prepare wish-list invitations</button><button class="secondary" data-action="prepare-matches" ${state.exchange.state==='locked'?'':'disabled'}>Prepare assignment emails</button><button class="primary" data-action="send" ${state.outbox.some(p=>p.status==='pending'&&!p.kind.startsWith('signin:'))?'':'disabled'}>${state.emailMode==='preview'?'Mark pending messages as previewed':'Send pending emails'}</button></div>${state.outbox.length?`<div class="table-wrap"><table><thead><tr><th>To</th><th>Message</th><th>Status</th><th>Actions</th></tr></thead><tbody>${state.outbox.map(mail=>`<tr><td><strong>${esc(personName(mail.giver))}</strong><small class="block muted">${esc(mail.recipient_email)}</small></td><td>${mail.kind.startsWith('signin:')?'Sign-in link':mail.kind==='invite'?'Wish-list invitation':'Assignment'}${mail.error?`<small class="block inline-error">${esc(mail.error)}</small>`:''}</td><td>${badge(mail.status,mail.status==='sent'?'green':['failed','uncertain'].includes(mail.status)?'amber':'')}</td><td><button class="quiet" data-action="preview-email" data-id="${mail.id}">Preview</button>${!mail.kind.startsWith('signin:')&&['failed','preview','uncertain'].includes(mail.status)?`<button class="quiet" data-action="retry-email" data-id="${mail.id}">${mail.status==='preview'?'Queue for sending':'Review & retry'}</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No messages prepared yet. Start with wish-list invitations.</div>'}<p class="section-note">“Sent” means your mail server accepted the message. It does not guarantee delivery to the inbox. An interrupted send is marked uncertain and requires review before retrying.</p>`;
}
function newYearForm() {return `<form data-form="new-year"><label>Year<input name="year" type="number" min="2000" max="2200" value="${state?.year?state.year+1:new Date().getFullYear()}" required></label>${state?.exchanges.length?`<label>Copy participants from<select name="copyFrom"><option value="">Start empty</option>${state.exchanges.map(e=>`<option value="${e.year}" ${e.year===state.year?'selected':''}>${e.year}</option>`).join('')}</select></label><p class="muted">Wish lists and exclusions start fresh each year.</p>`:''}<button class="primary">Create exchange</button></form>`;}

function giftRow(gift={},index=0) {
  return `<div class="gift-entry" data-gift-row><span class="gift-doodle" aria-hidden="true">✧</span><div class="gift-entry-fields"><label>Gift idea<input name="gift-label-${index}" maxlength="160" value="${esc(gift.label||'')}" placeholder="e.g. A cozy scarf"></label><label>Product link <span class="optional">optional</span><input name="gift-url-${index}" type="url" maxlength="2000" value="${esc(gift.url||'')}" placeholder="https://…"></label></div><button type="button" class="remove-gift" data-action="remove-gift" aria-label="Remove gift idea">×</button></div>`;
}
function giftFields(gifts=[]) {
  return `<div class="gift-editor" data-next-gift="${gifts.length}"><div class="gift-fields">${gifts.map((gift,i)=>giftRow(gift,i)).join('')}</div><button type="button" class="add-gift" data-action="add-gift" ${gifts.length>=5?'disabled':''}><span aria-hidden="true">+</span> Add a gift or product link</button><span class="gift-limit" ${gifts.length>=5?'':'hidden'}>Up to 5 gift ideas.</span></div>`;
}
function giftLinks(gifts=[]) {
  return gifts.length?`<ul class="gift-ideas">${gifts.map(g=>`<li>${g.url?`<a href="${esc(g.url)}" target="_blank" rel="noopener noreferrer"><span>${esc(g.label||'Gift idea')}</span><span aria-hidden="true">↗</span></a>`:esc(g.label)}</li>`).join('')}</ul>`:'';
}
function familyHeading(e,title,description,saved=false) {
  return `<header class="family-heading"><p class="exchange-tag">${treeIcon}<span>${esc(e.title)}</span></p>${saved?'<span class="saved-seal" aria-hidden="true">✓<span class="seal-sparkle">✧</span></span>':''}<h1 tabindex="-1">${title}</h1><p class="family-intro">${description}</p><div class="family-art"><img class="holiday-friends" src="/christmas-friends.png" alt="Charlie Brown, Snoopy, and Woodstock beside a little Christmas tree with a red ornament" width="1536" height="1024"><span class="art-note">made with a little heart</span></div>${e.budget||e.eventDate?`<div class="exchange-details">${e.budget?`<span><small>Gift budget</small>${esc(e.budget)}</span>`:''}${e.eventDate?`<span><small>Celebrating on</small>${esc(e.eventDate)}</span>`:''}</div>`:''}<ol class="family-steps" aria-label="How it works"><li class="${saved?'complete':'current'}"><span aria-hidden="true">1</span>Write your list</li><li class="${saved?'complete':''}"><span aria-hidden="true">2</span>Send to Santa</li><li><span aria-hidden="true">3</span>Get your match</li></ol></header>`;
}
const wishListSubmitted=(p,type)=>type==='group-wishlist'?!!p:!!(p?.wishlist||p?.gifts?.length);
function wishListForm(p,type,{identity=false,approved=false}={}) {
  const saved=wishListSubmitted(p,type);
  return `<form data-form="${type}" class="family-card wishlist-form"><div class="letter-heading"><div><p class="eyebrow">${saved?'A LITTLE WISH-LIST UPDATE':'SPECIAL DELIVERY · NORTH POLE'}</p><h2>Dear Santa,</h2><p>Here are a few things I’d love.</p></div><span class="postage-stamp" aria-hidden="true">${treeIcon}<small>WITH LOVE</small></span></div>${identity?`<fieldset class="form-section"><legend>Your details</legend><div class="form-row"><label>Name<input name="name" autocomplete="name" required maxlength="80" placeholder="Your name" value="${esc(p?.name||'')}" ${approved?'readonly':''}></label><label>Email<input name="email" type="email" autocomplete="email" inputmode="email" required maxlength="254" placeholder="you@example.com" value="${esc(p?.email||'')}" ${approved?'readonly':''}></label></div><p class="field-hint">Just for your Secret Santa emails. No account to create.</p></fieldset>`:''}<fieldset class="form-section"><legend>What would you love?</legend><label class="sr-only" for="wishlist">Wish list</label><textarea id="wishlist" name="wishlist" rows="4" maxlength="5000" placeholder="A cozy sweater, a good book, something for my hobby…\nFavorite colors, sizes, and little details help too.">${esc(p?.wishlist||'')}</textarea>${giftFields(p?.gifts)}</fieldset><details class="message-details" ${p?.message?'open':''}><summary><span class="note-heart" aria-hidden="true">♡</span> A note for your Secret Santa <span class="optional">optional</span></summary><label class="sr-only" for="gifter-message">Message to your gifter</label><textarea id="gifter-message" class="gifter-message" name="message" rows="3" maxlength="2000" placeholder="A little thank you, or something they should know…">${esc(p?.message||'')}</textarea></details><p class="form-error" data-form-error role="alert" tabindex="-1" hidden></p><div class="family-actions"><button type="submit" class="primary">${saved?'Save changes':'Send to Santa'} <span class="button-envelope">${envelopeIcon}</span></button>${saved?'<button type="button" class="quiet" data-action="cancel-wishlist">Cancel</button>':''}</div><p class="family-footnote">${saved?'A change of heart? You can always edit again.':'You can come back on this device and edit your list.'}</p></form>`;
}
function wishListSummary(p,{editable=true,identity=true}={}) {
  return `<section class="family-card saved-wishlist" aria-label="Your saved wish list"><div class="saved-card-heading"><div><p class="eyebrow">YOUR LITTLE CHRISTMAS LETTER</p>${identity?`<h2>${esc(p.name)}</h2>${p.email?`<p class="saved-email">${esc(p.email)}</p>`:''}`:'<h2>Sealed with a wish.</h2>'}</div><span class="postage-stamp" aria-hidden="true">${treeIcon}<small>WITH LOVE</small></span></div><div class="letter-receipt"><span aria-hidden="true">✓</span><p>Your list is tucked away safely.${editable?' You can still change your mind.':''}</p></div>${p.wishlist?`<div class="saved-section"><h3>On my wish list</h3><p class="wishlist-text">${esc(p.wishlist)}</p></div>`:''}${p.gifts?.length?`<div class="saved-section"><h3>Gifts &amp; links</h3>${giftLinks(p.gifts)}</div>`:''}${p.message?`<div class="saved-section saved-message"><h3>A note for your Secret Santa</h3><p class="wishlist-text">${esc(p.message)}</p></div>`:''}${editable?'<button class="secondary edit-letter" data-action="edit-wishlist"><span aria-hidden="true">✎</span> Edit wish list</button>':''}<p class="family-footnote">You can close this page.${editable?' Come back on this device to edit.':''}</p></section>`;
}
function focusFamilyHeading() {app.querySelector('.family-heading h1')?.focus({preventScroll:true});window.scrollTo({top:0,behavior:'instant'});}
function renderGroup() {
  const {exchange:e,submission:p}=group;
  const approved=['approved','accepted'].includes(p?.status);
  const declined=p?.status==='rejected';
  const closed=declined||e.state==='archived'||(!approved&&!['open','drafted'].includes(e.state));
  const editing=(!p||familyEditing)&&!closed;
  const title=declined?'Check with your organizer.':closed?'Wish lists are closed.':editing?'A little list.<br>A lot of joy.':familyUpdated?'Changes saved.':'Sent to Santa.';
  const description=declined?'Your list wasn’t approved. Ask your organizer about the details.':closed?'Contact your organizer if you need to make a change.':editing?'A few wishes, a little note, and a happy surprise. Let’s make someone’s Christmas.':approved?'You’re all set! We’ll email your match after the draw. Until then, dream a little.':'Your organizer will review your letter. We’ll email your match after the draw. The happy surprises come next!';
  app.innerHTML=`<section class="family-page">${familyHeading(e,title,description,!!p&&!editing&&!closed)}<div class="family-content">${editing?wishListForm(p,'group-wishlist',{identity:true,approved}):p?wishListSummary(p,{editable:!closed}):'<div class="family-card"><p>No wish list has been submitted.</p></div>'}</div></section>`;
}
function submissionReview(p) {
  return `<h2>Review ${esc(p.name)}</h2><p class="review-email">${esc(p.email)}</p><div class="submission-details">${p.wishlist?`<p class="wishlist-text">${esc(p.wishlist)}</p>`:''}${p.message?`<h3>Message to their gifter</h3><p class="wishlist-text">${esc(p.message)}</p>`:''}${giftLinks(p.gifts)}</div><form data-form="approve-submission"><input type="hidden" name="id" value="${esc(p.id)}"><label>Participant<select name="personId">${(state.identities||state.people).map(person=>`<option value="${esc(person.id)}" ${person.id===p.suggestedPersonId?'selected':''}>${esc(person.name)}</option>`).join('')}<option value="new" ${p.suggestedPersonId?'':'selected'}>Add as a new person</option></select></label><p class="section-note">Check the name and email. Choose their existing entry to preserve match history.</p><div class="review-actions"><button class="primary">Approve wish list</button><button type="button" class="quiet" data-action="reject-submission" data-id="${esc(p.id)}">Decline</button></div></form>`;
}
function recipientCard(r) {
  return r?`<section class="recipient-card" aria-label="Your Secret Santa match">${revealed?`<p class="eyebrow">You’re giving to</p><div class="recipient-heading"><h2 tabindex="-1">${esc(r.name)}</h2><button class="quiet" data-action="hide-match">Hide match</button></div>${r.wishlist?`<p class="wishlist-text">${esc(r.wishlist)}</p>`:'<p>No wish list yet.</p>'}${giftLinks(r.gifts)}${r.message?`<div class="saved-message"><h3>A note from ${esc(r.name)}</h3><p class="wishlist-text">${esc(r.message)}</p></div>`:''}`:'<p class="eyebrow">The names have been drawn</p><h2>Your Secret Santa is ready.</h2><button class="primary" data-action="reveal">View my match <span aria-hidden="true">→</span></button>'}</section>`:'';
}
function renderRecipient() {
  app.querySelector('.recipient-card').outerHTML=recipientCard(member.recipient);
  app.querySelector(revealed?'.recipient-heading h2':'[data-action="reveal"]')?.focus({preventScroll:true});
}
function renderMember() {
  const {exchange:e,person:p,recipient:r}=member;
  const editable=e.state!=='archived'&&p.active;
  const editing=editable&&(familyEditing||(!p.wishlist&&!p.gifts.length));

  app.innerHTML=`<section class="family-page">${familyHeading(e,editing?'A little list.<br>A lot of joy.':wishListSubmitted(p,'wishlist')?(familyUpdated?'Changes saved.':'Sent to Santa.'):'Your wish list.',!p.active?'You’re sitting out this year.':editing?'A few wishes, a little note, and a happy surprise. Let’s make someone’s Christmas.':r?'Your happy surprise is ready. Your own Christmas letter is below.':'Your letter is tucked away safely. We’ll email your match after the draw.',!editing&&!!(p.wishlist||p.gifts.length))}<div class="family-content">${recipientCard(r)}${editing?wishListForm(p,'wishlist'):wishListSummary(p,{editable})}</div></section>`;
}
function renderFamily() {if(session?.role==='member')renderMember();else renderGroup();}
function formGifts(form) {
  return [...form.querySelectorAll('[data-gift-row]')].map(row=>({label:row.querySelector('input[name^="gift-label-"]').value.trim(),url:row.querySelector('input[name^="gift-url-"]').value.trim()})).filter(g=>g.label||g.url);
}
app.addEventListener('input',event=>{
  if(!event.target.closest('.wishlist-form'))return;
  event.target.removeAttribute('aria-invalid');
  event.target.closest('form').querySelector('[data-form-error]').hidden=true;
});
app.addEventListener('change',async event=>{if(event.target.id==='year-select'){selectedYear=Number(event.target.value);try{await loadAdmin();}catch(error){notice(error.message,true);}}});
let working=false;
document.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');if(!button||working)return;
  const action=button.dataset.action,id=button.dataset.id;
  try {
    if(action==='edit-wishlist'||action==='cancel-wishlist'){
      working=true;await leaveCard(app.querySelector('.family-content'));familyEditing=action==='edit-wishlist';renderFamily();focusFamilyHeading();return;
    }
    if(action==='add-gift'){
      const editor=button.closest('.gift-editor');
      if(editor.querySelectorAll('[data-gift-row]').length>=5)return;
      const index=Number(editor.dataset.nextGift);editor.dataset.nextGift=index+1;
      editor.querySelector('.gift-fields').insertAdjacentHTML('beforeend',giftRow({},index));
      button.disabled=editor.querySelectorAll('[data-gift-row]').length>=5;
      editor.querySelector('.gift-limit').hidden=!button.disabled;
      editor.querySelector('[data-gift-row]:last-child input').focus();return;
    }
    if(action==='remove-gift'){
      const editor=button.closest('.gift-editor'),row=button.closest('[data-gift-row]');
      working=true;button.disabled=true;await leaveCard(row);row.remove();
      editor.querySelector('[data-action="add-gift"]').disabled=false;
      editor.querySelector('.gift-limit').hidden=true;
      editor.querySelector('[data-action="add-gift"]').focus();return;
    }
    if(action==='hide-match'){working=true;await leaveCard(app.querySelector('.recipient-card'));revealed=false;renderRecipient();return;}
    if(action==='copy-link'){
      const input=document.querySelector('#shared-link');
      try {await navigator.clipboard.writeText(input.value);notice('Link copied.');}
      catch {input.focus();input.select();notice('Link selected. Copy it to share.');}
      return;
    }
    if(action==='tab'){tab=button.dataset.tab;renderAdmin();return;}
    if(action==='new-year'){showDialog('<h2>New year</h2>'+newYearForm());return;}
    if(action==='add-person'||action==='edit-person'){showDialog(personForm(state.people.find(p=>p.id===id)));return;}
    if(action==='review-submission'){showDialog(submissionReview(state.submissions.find(p=>p.id===id)));return;}
    if(action==='group-revoke'){showDialog('<h2>Close the group link?</h2><p>The shared link will stop accepting new people. Saved wish lists stay available to their owners.</p><form data-form="group-revoke"><button class="primary">Revoke group link</button></form>');return;}
    if(action==='contact'){const p=state.people.find(p=>p.id===id);showDialog(`<h2>Update ${esc(p.name)}'s email</h2><p>The draw stays locked. Pending and failed messages use the corrected address. Already sent messages stay in the delivery record.</p><form data-form="contact"><input type="hidden" name="id" value="${p.id}"><label>Email<input name="email" type="email" required value="${esc(p.email)}"></label><button class="primary">Save email address</button></form>`);return;}
    if(action==='import'){showDialog(historyForm());return;}
    if(action==='no-exchange'){showDialog(`<h2>No exchange in a previous year?</h2><p>Use this only when your group did not hold a draw that year. Existing matches cannot be erased with this option.</p><form data-form="no-exchange"><label>Year<input name="year" type="number" min="2000" max="2200" value="${state.year-1}" required></label><label>Type NO EXCHANGE<input name="confirm" required autocomplete="off"></label><button class="primary">Record empty year</button></form>`);return;}
    if(action==='finalize'){showDialog('<h2>Finalize draw</h2><p>The roster and matches will be locked, and recipients will appear on family pages. Emails are a separate step.</p><form data-form="finalize"><label>Type FINALIZE<input name="confirm" required autocomplete="off"></label><button class="primary">Finalize draw</button></form>');return;}
    if(action==='preview-email'){const mail=state.outbox.find(m=>m.id===id);showDialog(`<h2>${esc(mail.subject)}</h2><p>To: ${esc(mail.recipient_email)}</p><pre class="email-preview">${esc(mail.body)}</pre>`);return;}
    if(action==='reveal'){working=true;await leaveCard(app.querySelector('.recipient-card'));revealed=true;renderRecipient();return;}
    if(action==='view-history'){selectedYear=Number(button.dataset.year);await loadAdmin();return;}
    if(action==='send'&&state.emailMode==='smtp'){showDialog('<h2>Send these emails to the family?</h2><p>Only pending messages will be sent. Review the recipients and message previews first.</p><form data-form="send"><label>Type SEND<input name="confirm" required autocomplete="off"></label><button class="primary">Send pending emails</button></form>');return;}
    if(action==='retry-email'){const mail=state.outbox.find(m=>m.id===id);showDialog(`<h2>Queue this message again?</h2><p>To: ${esc(mail.recipient_email)}</p><p>${mail.status==='uncertain'?'Check with the recipient first: the previous attempt may have delivered. Type CHECKED once you have verified they did not receive it.':'This will return the message to pending. Sending happens separately.'}</p><form data-form="retry"><input type="hidden" name="id" value="${id}">${mail.status==='uncertain'?'<label>Type CHECKED<input name="confirm" required></label>':''}<button class="primary">Queue for sending</button></form>`);return;}
    if(action==='revoke'){showDialog(`<h2>Revoke ${esc(personName(id))}'s access links?</h2><p>All their existing links and signed-in sessions for this year will stop working. Create and share a new link afterward.</p><form data-form="revoke"><input type="hidden" name="id" value="${id}"><button class="primary">Revoke links</button></form>`);return;}
    working=true;button.disabled=true;
    if(action==='share'){const data=await api('/admin/group-link',{year:state.year});showDialog(`<h2>One link for everyone</h2><p>Share this in your family chat. Everyone can fill out their own form.</p><label>Group link<input id="shared-link" readonly value="${esc(data.link)}"></label><button class="primary" data-action="copy-link">Copy link</button>`);return;}
    if(action==='link'){const data=await api('/admin/link',{year:state.year,personId:id});showDialog(`<h2>${esc(personName(id))}'s private link</h2><p>Share this only with ${esc(personName(id))}. It opens their personal page.</p><label>Personal link<input readonly value="${esc(data.link)}"></label>`);return;}
    if(action==='reject-submission'){await api('/admin/submissions/reject',{id});dialog.close();}
    if(action==='draft')await api('/admin/draft',{year:state.year});
    if(action==='remove-exclusion')await api('/admin/exclusions',{year:state.year,giver:id,recipient:button.dataset.recipient,remove:true});
    if(action==='confirm-history')await api('/admin/history/confirm',{year:state.year});
    if(action==='prepare-invites'||action==='prepare-matches')await api('/admin/mail/prepare',{year:state.year,kind:action==='prepare-invites'?'invite':'assignment'});
    if(action==='send')await api('/admin/mail/send',{year:state.year});
    await loadAdmin();notice('Saved.');
  }catch(error){notice(error.message,true);}finally{working=false;button.disabled=action==='add-gift'&&button.closest('.gift-editor')?.querySelectorAll('[data-gift-row]').length>=5;}
});

document.addEventListener('submit',async event=>{
  const form=event.target.closest('[data-form]');if(!form)return;event.preventDefault();if(working)return;
  const values=Object.fromEntries(new FormData(form));const type=form.dataset.form;
  const button=form.querySelector('button[type="submit"], button:not([type])');
  working=true;if(button)button.disabled=true;
  const familyForm=['group-wishlist','wishlist'].includes(type),buttonText=button?.innerHTML;
  const alreadySubmitted=familyForm&&wishListSubmitted(type==='group-wishlist'?group?.submission:member?.person,type);
  if(familyForm){form.setAttribute('aria-busy','true');if(button)button.innerHTML=`${alreadySubmitted?'Saving…':'Sending…'} <span class="button-envelope">${envelopeIcon}</span>`;}
  try {
    if(type==='email-sign-in'){
      const result=await api('/sign-in',{email:values.email});
      const status=form.querySelector('.sign-in-status');
      status.textContent=result.mode==='email'?"If that email is on the list, check your inbox for a sign-in link. It works once and expires in 15 minutes.":'Email is being set up. Ask the organizer for your sign-in link.';
      status.hidden=false;return;
    }
    if(type==='login'){session=await api('/login',{password:values.password});document.querySelector('#logout').hidden=false;await loadAdmin();return;}
    if(type==='person')await api('/admin/people',{...values,id:values.id||undefined,year:state.year,active:form.elements.active.checked,aliases:values.aliases.split(',').map(s=>s.trim()).filter(Boolean)});
    if(type==='contact')await api('/admin/contact',{...values,year:state.year});
    if(type==='settings')await api('/admin/settings',{...values,year:state.year,noReciprocal:form.elements.noReciprocal.checked});
    if(type==='exclusion')await api('/admin/exclusions',{...values,year:state.year,bothDirections:form.elements.bothDirections.checked});
    if(type==='new-year'){const data=await api('/admin/exchanges',{year:Number(values.year),copyFrom:Number(values.copyFrom)||null});selectedYear=data.year;tab='people';}
    if(type==='history'){
      const assignments=values.pairs.split('\n').filter(line=>line.trim()).map(line=>{
        const parts=line.split(/\s*(?:→|->| - |,)\s*/);if(parts.length!==2)throw new Error('Use one Giver → Recipient pairing per line.');return {giver:parts[0],recipient:parts[1]};
      });
      await api('/admin/history',{year:Number(values.year),assignments,source:values.source,status:form.elements.verified.checked?'verified':'provisional'});selectedYear=Number(values.year);tab='history';
    }
    if(type==='finalize')await api('/admin/finalize',{year:state.year,confirm:values.confirm});
    if(type==='no-exchange')await api('/admin/history/none',{year:Number(values.year),confirm:values.confirm});
    if(type==='send')await api('/admin/mail/send',{year:state.year,confirm:values.confirm});
    if(type==='retry')await api('/admin/mail/retry',values);
    if(type==='revoke')await api('/admin/revoke',{year:state.year,personId:values.id});
    if(type==='group-revoke')await api('/admin/group-revoke',{year:state.year});
    if(type==='approve-submission')await api('/admin/submissions/approve',{id:values.id,personId:values.personId});
    if(type==='group-wishlist'){
      const gifts=formGifts(form);
      if(!values.wishlist.trim()&&!gifts.length)throw new Error('Add a wish list or a gift idea.');
      session=await api('/group/profile',{name:values.name,email:values.email,wishlist:values.wishlist,message:values.message,gifts});
      document.querySelector('#logout').hidden=false;
      group=await api('/group/profile');await sendLetter(form,alreadySubmitted);familyUpdated=alreadySubmitted;familyEditing=false;renderGroup();focusFamilyHeading();return;
    }
    if(type==='wishlist'){
      const gifts=formGifts(form);
      if(!values.wishlist.trim()&&!gifts.length)throw new Error('Add a wish list or a gift idea.');
      await api('/member/profile',{wishlist:values.wishlist,message:values.message,gifts});member=await api('/member/profile');await sendLetter(form,alreadySubmitted);familyUpdated=alreadySubmitted;familyEditing=false;renderMember();focusFamilyHeading();return;
    }
    dialog.close();await loadAdmin();notice('Saved.');
  }catch(error){
    if(familyForm){
      const message=form.querySelector('[data-form-error]');message.textContent=error.message;message.hidden=false;message.focus();
      if(!values.wishlist.trim()&&!formGifts(form).length)form.elements.wishlist.setAttribute('aria-invalid','true');
    }else notice(error.message,true);
  }finally{working=false;if(familyForm)form.removeAttribute('aria-busy');if(button){button.disabled=false;if(familyForm)button.innerHTML=buttonText;}}

});

async function boot() {
  try {
    if(location.pathname==='/'&&location.hash.startsWith('#group-')){const token=location.hash.slice(7);history.replaceState(null,'','/');session=await api('/group/redeem',{token});}
    else if(location.pathname==='/join'&&location.hash.length>1){const token=location.hash.slice(1);history.replaceState(null,'','/join');session=await api('/redeem',{token});}
    else try{session=await api('/session');}catch{session=null;}
    document.querySelector('#logout').hidden=!session;
    if(location.pathname==='/join') {
      if(session?.role==='member'){member=await api('/member/profile');renderMember();}
      else app.innerHTML=`<section class="login-card"><h1>Your wish list</h1><p>Enter your email for a sign-in link.</p>${signInForm()}</section>`;
    } else if(location.pathname==='/admin') {if(session?.role==='admin')await loadAdmin();else login();}
    else if(['group','submission'].includes(session?.role)){group=await api('/group/profile');renderGroup();}
    else home();
  }catch(error){app.innerHTML=`<section class="login-card"><h1>Link unavailable</h1><p>${esc(error.message)}</p><a href="/" class="text-link">Back to Ornament</a></section>`;}
}
boot();
