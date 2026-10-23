const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const badge=(text,style='')=>`<span class="badge ${style}">${esc(text)}</span>`;
export function responsiveTable(headers,rows,label) {
  return `<div class="table-wrap"><table class="responsive-table" role="table" aria-label="${esc(label)}"><thead role="rowgroup"><tr role="row">${headers.map(h=>`<th scope="col" role="columnheader">${esc(h)}</th>`).join('')}</tr></thead><tbody role="rowgroup">${rows.map(cells=>`<tr role="row">${cells.map((cell,i)=>`<td role="cell" ${i===cells.length-1?'class="row-actions"':''}><span class="mobile-field-label" aria-hidden="true">${esc(headers[i])}</span>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
export function checkSummary(p) {
  return p.changesRequested?badge('Changes requested','amber'):p.validation.passed?badge('Checks passed','green'):
    !p.validation.submitted?badge('Not submitted'):badge('Needs attention','amber');
}
export function validationDetails(validation) {
  return `<ul class="validation-checks">${validation.checks.map(c=>`<li><span aria-hidden="true">${c.passed?'✓':'!'}</span>${esc(c.label)} ${badge(c.passed?'Passed':'Needs attention',c.passed?'green':'amber')}</li>`).join('')}</ul><p class="section-note">Format checks only. Product availability and personal suitability are not checked.</p>`;
}
export function invitationCandidates(state) {
  return state.people.filter(p=>p.invitation.canSend);
}
export const canInvite=person=>Boolean(person.validation.checks.find(check=>check.key==='email')?.passed);
export const canTestInvite=(person,state)=>canInvite(person)&&!state.outbox.some(mail=>mail.giver===person.id&&
  (mail.kind==='invite'&&['sending','uncertain'].includes(mail.status)||(mail.kind.startsWith('test-invite:')||mail.kind.startsWith('invite-resend:'))&&['pending','sending','uncertain'].includes(mail.status)));
export function privatePeoplePanel(state) {
  const mutable=['open','drafted'].includes(state.exchange.state);
  const pending=state.submissions.filter(p=>p.status==='pending'),active=state.people.filter(p=>p.active),inactive=state.people.filter(p=>!p.active);
  const candidates=invitationCandidates(state),missingEmail=candidates.filter(p=>!canInvite(p)).length,hasRecipients=candidates.some(canInvite);
  const table=people=>responsiveTable(['Person','Email','Invitation','Wish list','Actions'],people.map(p=>{
    const mail=p.invitation;
    const invitation=mail.addressChanged?'Email changed · invite needed':p.validation.submitted?'List received':({sent:'Invited',preview:'Preview only',pending:'Waiting to send',failed:'Delivery failed',uncertain:'Check delivery',sending:'Sending',cancelled:'Not invited'}[mail.status]||'Not invited');
    const list=p.changesRequested?'Update requested':p.validation.passed?'Submitted':p.validation.submitted?'Needs attention':'Not submitted';
    return [`<strong>${esc(p.name)}</strong>`,p.email?esc(p.email):'<span class="muted">Email needed</span>',badge(invitation,mail.addressChanged?'amber':mail.status==='sent'?'green':['failed','uncertain'].includes(mail.status)?'amber':''),
      `<button class="quiet" data-action="wishlist-status" data-id="${esc(p.id)}">${esc(list)}</button>`,
      mutable?`<button class="secondary" data-action="edit-person" data-id="${esc(p.id)}">Edit</button>${mail.canResend?`<button class="secondary" data-action="resend-invitation" data-id="${esc(p.id)}">Resend invitation</button>`:''}<button class="quiet" data-action="${p.active?'remove-person':'include-person'}" data-id="${esc(p.id)}">${p.active?'Leave out':'Include'}</button>`:state.exchange.state==='locked'?`<button class="quiet" data-action="contact" data-id="${esc(p.id)}">Update email</button>`:''
    ];
  }),'Family members');
  return `<div class="section-heading"><div><h2>People for ${esc(state.year)}</h2><p>Add people, send invitations, then watch their lists arrive.</p></div>${mutable?'<div class="people-actions"><button class="primary" data-action="invite-people" '+(!hasRecipients?'disabled':'')+'>Send invitations</button><button class="secondary" data-action="add-person">+ Add person</button><button class="quiet" data-action="test-invitations" '+(!active.some(p=>canTestInvite(p,state))?'disabled':'')+'>Test invitations</button></div>':''}</div>
    ${mutable&&missingEmail?`<p class="callout">${missingEmail} ${missingEmail===1?'person still needs an email address':'people still need email addresses'}. ${hasRecipients?'You can invite other people now.':'Add an email address to enable invitations.'}</p>`:''}
    <p class="privacy-note"><span aria-hidden="true">✉</span> You can see who submitted. Wish lists and messages stay hidden until you choose to reveal them.</p>
    ${active.length?table(active):'<div class="empty">Add or include family members to get started.</div>'}
    ${inactive.length?`<details class="inactive-people"><summary>Not taking part in ${esc(state.year)} · ${inactive.length}</summary>${table(inactive)}</details>`:''}
    ${pending.length?`<section class="submission-review"><div class="section-heading"><div><h2>Earlier submissions ${badge(pending.length,'amber')}</h2><p>Review these saved submissions to add their lists to the roster.</p></div></div><ul class="submission-list">${pending.map(p=>`<li><div><strong>${esc(p.name)}</strong><small class="block muted">${esc(p.email)}</small>${checkSummary(p)}</div><button class="secondary" data-action="review-submission" data-id="${esc(p.id)}" ${mutable?'':'disabled'}>Review checks</button></li>`).join('')}</ul></section>`:''}`;
}

export function personChecks(p,state) {
  return `<h2>${esc(p.name)}’s wish-list checks</h2>${checkSummary(p)}${validationDetails(p.validation)}${p.changesRequested?`<p class="callout">Your request: ${esc(p.changesRequested)}</p>`:''}<div class="review-actions"><button class="secondary" data-action="confirm-wishlist-reveal" data-id="${esc(p.id)}">Reveal wish list</button>${p.active&&state.exchange.state!=='archived'?`<button class="secondary" data-action="request-changes" data-id="${esc(p.id)}">Request changes</button><button class="quiet" data-action="link" data-id="${esc(p.id)}">Create invitation link</button><button class="quiet" data-action="revoke" data-id="${esc(p.id)}">Revoke access</button>`:''}</div>`;
}
export function privateSubmissionReview(p,state) {
  return `<h2>Review ${esc(p.name)}</h2><p>${esc(p.email)}</p>${validationDetails(p.validation)}<button class="secondary" data-action="confirm-submission-reveal" data-id="${esc(p.id)}">Reveal submission</button><form data-form="approve-submission"><input type="hidden" name="id" value="${esc(p.id)}"><label>Participant<select name="personId">${state.identities.map(person=>`<option value="${esc(person.id)}" ${person.id===p.suggestedPersonId?'selected':''}>${esc(person.name)}</option>`).join('')}<option value="new" ${p.suggestedPersonId?'':'selected'}>Add as a new person</option></select></label><p class="section-note">Verify the name and email. Reuse their existing identity to keep match history.</p><div class="review-actions"><button class="primary" ${p.validation.passed?'':'disabled'}>Approve wish list</button><button type="button" class="quiet" data-action="reject-submission" data-id="${esc(p.id)}">Decline</button></div></form>`;
}
export function revealConfirmation(kind,id='') {
  const label={wishlist:'this wish list and message',submission:'this submission',email:'this email and any match details',draw:'all giver-to-recipient matches'}[kind];
  return `<h2>Reveal private content?</h2><p>This will show ${label}. You can continue organizing without opening it.</p><form data-form="reveal-private"><input type="hidden" name="kind" value="${kind}"><input type="hidden" name="id" value="${esc(id)}"><button class="primary">Reveal content</button></form>`;
}
