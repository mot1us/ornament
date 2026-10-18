const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const historyLabel=h=>h.noExchange?'No exchange':({verified:'Confirmed',provisional:'Needs confirmation',missing:'Missing history',incomplete:'Incomplete pairings'}[h.status]||h.status);

export function historyChecks(history) {
  return `<div class="history-check">${history.map(h=>`<div><span>${h.year} history <span class="badge ${h.status==='verified'?'green':'amber'}">${esc(historyLabel(h))}</span></span><button class="text-link" data-action="view-history" data-year="${h.year}">Review ${h.year} history</button></div>`).join('')}</div>`;
}

export function historyReview(record,currentPeople=[]) {
  const absent=currentPeople.filter(p=>p.active&&!record.participantIds.includes(p.id));
  return `<h2>${record.year} history</h2><p>${record.state==='no_exchange'?'Confirmed: no exchange took place this year.':!record.exists?'No matches have been recorded for this year.':`${record.pairs.length} recorded pairings · ${esc(historyLabel({status:record.status}))}`}</p>
    ${record.status==='incomplete'?'<p class="callout">The pairings do not cover this year’s recorded participants correctly. Update the history before confirming it.</p>':''}
    ${record.pairs.length?`<div class="match-list history-pairings">${record.pairs.map(p=>`<div><span>${esc(p.giver)}</span><span class="match-arrow" aria-hidden="true">→</span><strong>${esc(p.recipient)}</strong></div>`).join('')}</div>`:''}
    ${record.exists&&record.state!=='no_exchange'&&absent.length?`<p class="callout">Not listed in ${record.year}: ${absent.map(p=>esc(p.name)).join(', ')}. If they took part that year, add their actual matches before confirming.</p>`:''}
    ${record.source?`<p class="section-note">Source: ${esc(record.source)}</p>`:''}
    ${record.canConfirm?`<form data-form="confirm-history"><input type="hidden" name="year" value="${record.year}"><label class="checkbox"><input type="checkbox" required>I have checked that the ${record.year} participants and every pairing are complete and correct.</label><button class="primary">Confirm ${record.year} history</button></form>`:''}
    ${record.canEdit?`<button class="secondary" data-action="edit-history" data-year="${record.year}">${record.exists?'Edit':'Enter'} ${record.year} pairings</button>`:`<p class="section-note">${record.state==='locked'?'Finalized exchanges are preserved and cannot be overwritten.':'This exchange is preserved as a history record.'}</p>`}
    ${!record.exists?`<button class="secondary" data-action="no-exchange" data-year="${record.year}">Record no exchange in ${record.year}</button>`:''}`;
}
