import { randomUUID } from 'node:crypto';
import { audit, ensureYear, getExchange, members, findPerson, transaction } from './database.js';
import { generateDraw, validateDraw } from './matching.js';
import { hash, secret } from './security.js';

export const emailValid = email => typeof email === 'string' && email.length <= 254 && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(email);
export const normalizeEmail = email => typeof email === 'string' ? email.trim().toLowerCase() : '';
export function checkEmailIdentity(db,email,id) {
  if (email && (!emailValid(email) || db.prepare('SELECT id FROM people WHERE lower(trim(email))=? AND id<>?').get(email,id || ''))) {
    throw new Error('Use a valid, separate email address for each person.');
  }
}
const short = (value, limit) => String(value ?? '').trim().slice(0, limit);
export function giftList(input) {
  if (!Array.isArray(input) || input.length > 5) throw new Error('Add up to five gift ideas.');
  return input.map(gift => {
    const label = short(gift.label, 160);
    const url = short(gift.url, 2000);
    if (url) {
      let parsed;
      try { parsed = new URL(url); } catch { throw new Error('Gift links must be valid http(s) URLs.'); }
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('Gift links must be http(s) URLs without credentials.');
    }
    return {label,url};
  }).filter(gift => gift.label || gift.url);
}

export function mutable(db, year) {
  const exchange = getExchange(db, year);
  if (!['open','drafted'].includes(exchange.state)) throw new Error('This draw is finalized. Its roster and rules are locked.');
  return exchange;
}

export function invalidateDraft(db, year) {
  if (getExchange(db, year).state === 'drafted') {
    db.prepare('DELETE FROM assignments WHERE year=?').run(year);
    db.prepare("UPDATE exchanges SET state='open' WHERE year=?").run(year);
  }
}

export function createExchange(db, year, copyFrom) {
  if (db.prepare('SELECT year FROM exchanges WHERE year=?').get(year)) throw new Error('That year already exists.');
  return transaction(db, () => {
    ensureYear(db, year);
    if (copyFrom) {
      getExchange(db, copyFrom);
      // Keep identities, but start with fresh wish lists and no exclusions.
      for (const person of members(db,copyFrom)) {
        db.prepare('INSERT INTO enrollments(year,person_id,active) VALUES (?,?,?)').run(year,person.id,person.active);
      }
    }
    audit(db,'create-exchange',{year,copyFrom});
    return getExchange(db,year);
  });
}

export function savePerson(db, year, input) {
  mutable(db, year);
  const name = short(input.name,80);
  const email = normalizeEmail(input.email);
  if (!name || (email && !emailValid(email))) throw new Error('Enter a name and a valid email address, or leave email blank for now.');
  const aliases = Array.isArray(input.aliases) ? input.aliases.map(n => short(n,80)).filter(Boolean) : [];
  if (aliases.length > 10) throw new Error('Use at most ten alternate names.');
  const id = input.id || randomUUID();
  const existing = db.prepare('SELECT * FROM people WHERE id=?').get(id);
  if (input.id && !existing) throw new Error('Person not found.');
  checkEmailIdentity(db,email,id);
  if(existing && existing.name!==name && !aliases.includes(existing.name))aliases.push(existing.name);
  for (const candidate of [name,...aliases]) {
    const other = findPerson(db,candidate);
    if (other && other.id !== id) throw new Error('That name belongs to an existing person. Use their existing entry.');
  }
  return transaction(db, () => {
    db.prepare(`INSERT INTO people(id,name,email,aliases) VALUES (?,?,?,?) ON CONFLICT(id)
      DO UPDATE SET name=excluded.name,email=excluded.email,aliases=excluded.aliases`).run(id,name,email,JSON.stringify(aliases));
    db.prepare('DELETE FROM sign_in_tokens WHERE person_id=? AND email<>?').run(id,email);
    db.prepare('INSERT OR IGNORE INTO enrollments(year,person_id) VALUES (?,?)').run(year,id);
    db.prepare('UPDATE enrollments SET active=? WHERE year=? AND person_id=?').run(input.active === false ? 0 : 1,year,id);
    invalidateDraft(db,year);
    audit(db,'save-person',{year,id});
    return id;
  });
}

export function matchingOptions(db, year) {
  return {year, noReciprocal: Boolean(getExchange(db,year).no_reciprocal),
    history: db.prepare('SELECT year,giver,recipient FROM assignments WHERE year IN (?,?)').all(year-1,year-2),
    exclusions: db.prepare('SELECT giver,recipient FROM exclusions WHERE year=?').all(year)};
}

export function historyReadiness(db, year) {
  return [year-1,year-2].map(prior => {
    const exchange = db.prepare('SELECT state,history_status FROM exchanges WHERE year=?').get(prior);
    return {year:prior, status: ['archived','locked','no_exchange'].includes(exchange?.state) ? exchange.history_status : 'missing',noExchange:exchange?.state==='no_exchange'};
  });
}

export function draftDraw(db, year) {
  mutable(db,year);
  const people = members(db,year).filter(p=>p.active).map(p=>p.id);
  const pairs = generateDraw(people,matchingOptions(db,year));
  return transaction(db, () => {
    db.prepare('DELETE FROM assignments WHERE year=?').run(year);
    for (const pair of pairs) db.prepare('INSERT INTO assignments(year,giver,recipient) VALUES (?,?,?)').run(year,pair.giver,pair.recipient);
    db.prepare("UPDATE exchanges SET state='drafted' WHERE year=?").run(year);
    audit(db,'draft-draw',{year,count:pairs.length});
    return pairs;
  });
}

export function lockDraw(db,year) {
  if (getExchange(db,year).state !== 'drafted') throw new Error('Generate a draft first.');
  if (db.prepare("SELECT id FROM submissions WHERE year=? AND status='pending'").get(year)) throw new Error('Review submitted wish lists before finalizing.');
  if (historyReadiness(db,year).some(h=>h.status !== 'verified')) throw new Error('Confirm the previous two years of history before finalizing. You can keep editing or generating drafts.');
  const people = members(db,year).filter(p=>p.active);
  if (people.some(p=>!emailValid(p.email))) throw new Error('Every participating person needs a valid email address before finalizing.');
  const pairs = db.prepare('SELECT giver,recipient FROM assignments WHERE year=?').all(year);
  const errors = validateDraw(pairs,people.map(p=>p.id),matchingOptions(db,year));
  if (errors.length) throw new Error(errors.join(' '));
  return transaction(db, () => {
    db.prepare("UPDATE exchanges SET state='locked',history_status='verified' WHERE year=?").run(year);
    audit(db,'finalize-draw',{year});
  });
}

export function inviteLink(db,config,year,personId) {
  if (!db.prepare('SELECT person_id FROM enrollments WHERE year=? AND person_id=?').get(year,personId)) throw new Error('Person not in this exchange.');
  if (getExchange(db,year).state === 'archived') throw new Error('Historical exchanges do not issue access links.');
  const token = secret();
  db.prepare('INSERT INTO invite_tokens(hash,year,person_id,expires) VALUES (?,?,?,?)').run(hash(token),year,personId,Date.now()+450*86400000);
  return `${config.publicUrl}/join#${token}`;
}

export function makeEmail(db,config,year,personId,kind) {
  const exchange = getExchange(db,year);
  const person = members(db,year).find(p=>p.id===personId);
  if (!person?.active || !emailValid(person.email)) throw new Error('An active participant needs a valid email address.');
  if (kind === 'assignment' && exchange.state !== 'locked') throw new Error('Finalize the draw before preparing assignment emails.');
  const link = inviteLink(db,config,year,personId);
  const details = [exchange.budget && `Gift budget: ${exchange.budget}`, exchange.event_date && `Exchange date: ${exchange.event_date}`].filter(Boolean).join('\n');
  if (kind === 'invite') return {email:person.email,subject:`Your invitation · ${exchange.title}`,
    body:`Hi ${person.name},\n\nOur Secret Santa is getting started. Use your personal link to add your wish list and gift ideas:\n\n${link}\n\n${details}\n\nKeep this link private: it opens your personal page.\n\nHappy gifting!`};
  const pair = db.prepare('SELECT recipient FROM assignments WHERE year=? AND giver=?').get(year,personId);
  const recipient = members(db,year).find(p=>p.id===pair.recipient);
  const gifts = recipient.gifts.map(g=>[g.label,g.url].filter(Boolean).join(': ')).join('\n');
  const message=recipient.message?`Message to you:\n${recipient.message}\n\n`:'';
  return {email:person.email,subject:`Your Secret Santa match · ${exchange.title}`,
    body:`Hi ${person.name},\n\nYou are ${recipient.name}'s Secret Santa!\n\n${details}\n\nTheir wish list:\n${recipient.wishlist || 'They have not added a wish list yet.'}\n\n${message}${gifts}\n\nYour private page (with the latest wish list):\n${link}\n\nKeep your match and this link secret.\n\nHappy gifting!`};
}

export function prepareMail(db,config,year,kind,ids) {
  if (!['invite','assignment'].includes(kind)) throw new Error('Invalid email type.');
  return transaction(db,()=>{
    const people = members(db,year).filter(p=>p.active && (!ids || ids.includes(p.id)));
    if (!people.length) throw new Error('No active participants were selected.');
    // Validate the whole batch before writing any message.
    if (people.some(p=>!emailValid(p.email))) throw new Error('Add valid email addresses for every selected participant.');
    for (const person of people) {
      if (db.prepare('SELECT id FROM outbox WHERE year=? AND giver=? AND kind=?').get(year,person.id,kind)) continue;
      const email = makeEmail(db,config,year,person.id,kind);
      db.prepare('INSERT INTO outbox(id,year,giver,kind,recipient_email,subject,body) VALUES (?,?,?,?,?,?,?)').run(randomUUID(),year,person.id,kind,email.email,email.subject,email.body);
    }
    audit(db,'prepare-email',{year,kind,count:people.length});
  });
}
