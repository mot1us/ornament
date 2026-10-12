const app=document.querySelector('#app');
const dialog=document.querySelector('#dialog');
let session=null, state=null, tab='people', selectedYear=null, member=null, revealed=false;
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
document.querySelector('#close-dialog').addEventListener('click',()=>dialog.close());
document.querySelector('#logout').addEventListener('click',async()=>{await api('/logout',{});session=null;location.href='/';});

function home() {
  if(session?.role==='member'){location.replace('/join');return;}
  app.innerHTML=`<section class="home-card"><div class="home-copy"><p class="eyebrow">SECRET SANTA FOR FAMILY &amp; FRIENDS</p><h1>Your Christmas<br>wish list.</h1><p>Enter your email. We'll send a link to your wish list.</p>${signInForm()}</div><img class="holiday-toys" src="/holiday-clay.png" alt="Santa, a little reindeer, and a silver tinsel tree" width="520" height="347"></section>`;
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
  const status={open:'Not drawn',drafted:'Draft',locked:'Finalized',archived:'Archived',no_exchange:'No exchange'}[e.state];
  app.innerHTML=`<section class="dashboard"><div class="dash-heading"><h1>${esc(e.title)}</h1><div class="year-tools"><label class="sr-only" for="year-select">Year</label><select id="year-select">${state.exchanges.map(y=>`<option ${y.year===e.year?'selected':''}>${y.year}</option>`).join('')}</select><button data-action="new-year" class="secondary">+ Year</button></div></div><p class="dashboard-status">${active.length} people · ${ready}/${active.length} wish lists · ${esc(status)}</p><nav class="tabs" aria-label="Organizer sections">${[['people','People'],['rules','Rules'],['draw','Draw'],['history','History'],['email','Email']].map(([key,label])=>`<button data-action="tab" data-tab="${key}" class="${tab===key?'selected':''}" aria-pressed="${tab===key}">${label}</button>`).join('')}</nav><div class="tab-content">${({people:peoplePanel,rules:rulesPanel,draw:drawPanel,history:historyPanel,email:emailPanel}[tab])()}</div></section>`;
}
const isMutable=()=>['open','drafted'].includes(state.exchange.state);
function peoplePanel() {
  return `<div class="section-heading"><div><h2>People</h2><p>Add emails, then share the group link.</p></div><div class="row-actions"><button class="secondary" data-action="share">Group link</button>${isMutable()?'<button class="primary" data-action="add-person">+ Add person</button>':''}</div></div>${state.people.length?`<div class="table-wrap"><table><thead><tr><th>Person</th><th>Email</th><th>Wish list</th><th>Taking part</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${state.people.map(p=>`<tr><td><div class="person"><span class="avatar">${esc(p.name[0])}</span><strong>${esc(p.name)}</strong></div></td><td>${p.email?esc(p.email):'<span class="muted">Email needed</span>'}</td><td>${p.wishlist||p.gifts.length?badge('Ready','green'):badge('Not yet')}</td><td>${p.active?badge('Yes','green'):badge('Sitting out')}</td><td class="row-actions">${isMutable()?`<button class="quiet" data-action="edit-person" data-id="${p.id}">Edit</button>`:state.exchange.state==='locked'?`<button class="quiet" data-action="contact" data-id="${p.id}">Update email</button>`:''}${state.exchange.state!=='archived'?`<button class="quiet" data-action="link" data-id="${p.id}">Private link</button><button class="quiet small" data-action="revoke" data-id="${p.id}">Revoke links</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Add a person to start.</div>'}`;
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
  return `<div class="section-heading"><div><h2>Draw</h2><p>Review, then finalize.</p></div>${isMutable()?'<button class="primary" data-action="draft">'+(e.state==='drafted'?'Generate another draft':'Generate a draft')+'</button>':''}</div><div class="history-check">${state.history.map(h=>`<span>${h.year} history ${badge(h.status,h.status==='verified'?'green':'amber')}</span>`).join('')}</div>${!historyReady&&isMutable()?'<p class="callout">You can try a draft now. Confirm both previous years before finalizing to make the no-repeat rule reliable.</p>':''}${state.assignments.length?`<div class="match-list">${state.assignments.map(p=>`<div><span>${esc(personName(p.giver))}</span><span class="match-arrow" aria-hidden="true">→</span><strong>${esc(personName(p.recipient))}</strong></div>`).join('')}</div>`:'<div class="empty"><span class="empty-star" aria-hidden="true">✧</span><h3>No draw yet.</h3><p>Add people and exclusions, then draw.</p></div>'}${e.state==='drafted'?`<div class="finalize-bar"><div><strong>Happy with these matches?</strong><p>Finalizing locks this year's roster and draw. Emails are sent separately.</p></div><button class="primary" data-action="finalize" ${historyReady?'':'disabled'}>Finalize draw</button></div>`:''}${e.state==='locked'?'<p class="callout green-callout">This draw is saved and locked. Go to Emails to preview the messages before sending.</p>':''}`;
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

function renderMember() {
  const {exchange:e,person:p,recipient:r}=member;
  app.innerHTML=`<section class="member-page"><header class="member-heading"><div class="member-title"><p class="eyebrow">${esc(p.name)} · ${esc(e.title)}</p><h1>Your wish list</h1><div class="member-details">${e.budget?badge('Budget: '+e.budget):''}${e.eventDate?badge(e.eventDate):''}${!p.active?badge('Sitting out','amber'):''}</div></div><img class="member-toys" src="/holiday-clay.png" alt="" width="160" height="120"></header><form data-form="wishlist" class="wishlist-form"><label><span class="wishlist-label">What would you like?</span><textarea name="wishlist" rows="6" maxlength="5000" placeholder="A few gift ideas, sizes, or things you love…">${esc(p.wishlist)}</textarea></label><details class="gift-details"><summary>Gift links (optional)${p.gifts.length?' · '+p.gifts.length:''}</summary><div class="gift-fields">${Array.from({length:5},(_,i)=>`<div class="form-row"><label>Gift ${i+1}<input name="gift-label-${i}" maxlength="160" value="${esc(p.gifts[i]?.label||'')}" placeholder="Gift idea"></label><label>Link<input name="gift-url-${i}" type="url" value="${esc(p.gifts[i]?.url||'')}" placeholder="https://…"></label></div>`).join('')}</div></details><button class="primary">Save wish list</button></form>${r?`<section class="recipient-card">${revealed?`<h2>Your match: ${esc(r.name)}</h2><p class="wishlist-text">${esc(r.wishlist||'No wish list yet.')}</p>${r.gifts.length?`<ul class="gift-ideas">${r.gifts.map(g=>`<li>${g.url?`<a href="${esc(g.url)}" target="_blank" rel="noopener noreferrer">${esc(g.label||'Gift idea')} ↗</a>`:esc(g.label)}</li>`).join('')}</ul>`:''}`:'<button class="secondary" data-action="reveal">View my match</button>'}</section>`:'<p class="section-note">Your match will appear after the draw.</p>'}</section>`;
}
app.addEventListener('change',async event=>{if(event.target.id==='year-select'){selectedYear=Number(event.target.value);try{await loadAdmin();}catch(error){notice(error.message,true);}}});
let working=false;
app.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]');if(!button||working)return;
  const action=button.dataset.action,id=button.dataset.id;
  try {
    if(action==='share'){showDialog(`<h2>One link for everyone</h2><p>Share this in your group chat. Each person enters the email you added for them.</p><label>Group link<input readonly value="${esc(location.origin+'/')}"></label>`);return;}
    if(action==='tab'){tab=button.dataset.tab;renderAdmin();return;}
    if(action==='new-year'){showDialog('<h2>New year</h2>'+newYearForm());return;}
    if(action==='add-person'||action==='edit-person'){showDialog(personForm(state.people.find(p=>p.id===id)));return;}
    if(action==='contact'){const p=state.people.find(p=>p.id===id);showDialog(`<h2>Update ${esc(p.name)}'s email</h2><p>The draw stays locked. Pending and failed messages use the corrected address. Already sent messages stay in the delivery record.</p><form data-form="contact"><input type="hidden" name="id" value="${p.id}"><label>Email<input name="email" type="email" required value="${esc(p.email)}"></label><button class="primary">Save email address</button></form>`);return;}
    if(action==='import'){showDialog(historyForm());return;}
    if(action==='no-exchange'){showDialog(`<h2>No exchange in a previous year?</h2><p>Use this only when your group did not hold a draw that year. Existing matches cannot be erased with this option.</p><form data-form="no-exchange"><label>Year<input name="year" type="number" min="2000" max="2200" value="${state.year-1}" required></label><label>Type NO EXCHANGE<input name="confirm" required autocomplete="off"></label><button class="primary">Record empty year</button></form>`);return;}
    if(action==='finalize'){showDialog('<h2>Finalize draw</h2><p>The roster and matches will be locked, and recipients will appear on family pages. Emails are a separate step.</p><form data-form="finalize"><label>Type FINALIZE<input name="confirm" required autocomplete="off"></label><button class="primary">Finalize draw</button></form>');return;}
    if(action==='preview-email'){const mail=state.outbox.find(m=>m.id===id);showDialog(`<h2>${esc(mail.subject)}</h2><p>To: ${esc(mail.recipient_email)}</p><pre class="email-preview">${esc(mail.body)}</pre>`);return;}
    if(action==='reveal'){revealed=true;renderMember();return;}
    if(action==='view-history'){selectedYear=Number(button.dataset.year);await loadAdmin();return;}
    if(action==='send'&&state.emailMode==='smtp'){showDialog('<h2>Send these emails to the family?</h2><p>Only pending messages will be sent. Review the recipients and message previews first.</p><form data-form="send"><label>Type SEND<input name="confirm" required autocomplete="off"></label><button class="primary">Send pending emails</button></form>');return;}
    if(action==='retry-email'){const mail=state.outbox.find(m=>m.id===id);showDialog(`<h2>Queue this message again?</h2><p>To: ${esc(mail.recipient_email)}</p><p>${mail.status==='uncertain'?'Check with the recipient first: the previous attempt may have delivered. Type CHECKED once you have verified they did not receive it.':'This will return the message to pending. Sending happens separately.'}</p><form data-form="retry"><input type="hidden" name="id" value="${id}">${mail.status==='uncertain'?'<label>Type CHECKED<input name="confirm" required></label>':''}<button class="primary">Queue for sending</button></form>`);return;}
    if(action==='revoke'){showDialog(`<h2>Revoke ${esc(personName(id))}'s access links?</h2><p>All their existing links and signed-in sessions for this year will stop working. Create and share a new link afterward.</p><form data-form="revoke"><input type="hidden" name="id" value="${id}"><button class="primary">Revoke links</button></form>`);return;}
    working=true;button.disabled=true;
    if(action==='link'){const data=await api('/admin/link',{year:state.year,personId:id});showDialog(`<h2>${esc(personName(id))}'s private link</h2><p>Share this only with ${esc(personName(id))}. It opens their personal page.</p><label>Personal link<input readonly value="${esc(data.link)}"></label>`);return;}
    if(action==='draft')await api('/admin/draft',{year:state.year});
    if(action==='remove-exclusion')await api('/admin/exclusions',{year:state.year,giver:id,recipient:button.dataset.recipient,remove:true});
    if(action==='confirm-history')await api('/admin/history/confirm',{year:state.year});
    if(action==='prepare-invites'||action==='prepare-matches')await api('/admin/mail/prepare',{year:state.year,kind:action==='prepare-invites'?'invite':'assignment'});
    if(action==='send')await api('/admin/mail/send',{year:state.year});
    await loadAdmin();notice('Saved.');
  }catch(error){notice(error.message,true);}finally{working=false;button.disabled=false;}
});

document.addEventListener('submit',async event=>{
  const form=event.target.closest('[data-form]');if(!form)return;event.preventDefault();if(working)return;
  const values=Object.fromEntries(new FormData(form));const type=form.dataset.form;
  const button=form.querySelector('button[type="submit"], button:not([type])');
  working=true;if(button)button.disabled=true;
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
    if(type==='wishlist'){
      const gifts=Array.from({length:5},(_,i)=>({label:values[`gift-label-${i}`],url:values[`gift-url-${i}`]})).filter(g=>g.label||g.url);
      await api('/member/profile',{wishlist:values.wishlist,gifts});member=await api('/member/profile');renderMember();notice('Saved.');return;
    }
    dialog.close();await loadAdmin();notice('Saved.');
  }catch(error){notice(error.message,true);}finally{working=false;if(button)button.disabled=false;}
});

async function boot() {
  try {
    if(location.pathname==='/join'&&location.hash.length>1){const token=location.hash.slice(1);history.replaceState(null,'','/join');session=await api('/redeem',{token});}
    else try{session=await api('/session');}catch{session=null;}
    document.querySelector('#logout').hidden=!session;
    if(location.pathname==='/join') {
      if(session?.role==='member'){member=await api('/member/profile');renderMember();}
      else app.innerHTML=`<section class="login-card"><h1>Your wish list</h1><p>Enter your email for a sign-in link.</p>${signInForm()}</section>`;
    } else if(location.pathname==='/admin') {if(session?.role==='admin')await loadAdmin();else login();}
    else home();
  }catch(error){app.innerHTML=`<section class="login-card"><h1>Link unavailable</h1><p>${esc(error.message)}</p><a href="/" class="text-link">Get a new sign-in link</a></section>`;}
}
boot();
