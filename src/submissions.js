import { randomUUID } from 'node:crypto';
import { audit, findPerson, getExchange, transaction } from './database.js';
import { checkEmailIdentity, emailValid, giftList, invalidateDraft, mutable, normalizeEmail } from './service.js';
import { hash, secret } from './security.js';

export function groupLink(db,config,year) {
  mutable(db,year);
  const token=secret();
  db.prepare('DELETE FROM group_tokens WHERE expires<=?').run(Date.now());
  db.prepare('INSERT INTO group_tokens(hash,year,expires) VALUES (?,?,?)').run(hash(token),year,Date.now()+450*86400000);
  return `${config.publicUrl}/#group-${token}`;
}

function fields(input) {
  const name=typeof input.name==='string'?input.name.trim():'';
  const email=normalizeEmail(input.email);
  if (!name || name.length>80 || !emailValid(email)) throw new Error('Enter your name and a valid email address.');
  const wishlist=typeof input.wishlist==='string'?input.wishlist.trim():'';
  const message=typeof input.message==='string'?input.message.trim():'';
  if (wishlist.length>5000 || message.length>2000) throw new Error('Keep your wish list under 5,000 characters and your message under 2,000.');
  const gifts=giftList(input.gifts || []);
  if (!wishlist && !gifts.length) throw new Error('Add a wish list or at least one gift idea.');
  return {name,email,wishlist,message,gifts};
}

export function submissionProfile(db,year,id) {
  const row=db.prepare('SELECT * FROM submissions WHERE id=? AND year=?').get(id,year);
  if (!row) throw new Error('Your saved wish list could not be found.');
  return {name:row.name,email:row.email,wishlist:row.wishlist,message:row.message,gifts:JSON.parse(row.gifts),status:row.status};
}

export function saveSubmission(db,year,id,input) {
  const values=fields(input);
  const existing=id?db.prepare('SELECT * FROM submissions WHERE id=? AND year=?').get(id,year):null;
  if (id && !existing) throw new Error('Your saved wish list could not be found.');
  if (existing?.status==='rejected') throw new Error('Ask the organizer about this submission before editing it.');
  if (existing?.status==='approved') {
    if (!['open','drafted','locked'].includes(getExchange(db,year).state)) throw new Error('This exchange is archived.');
    if (values.name!==existing.name || values.email!==existing.email) throw new Error('Ask the organizer to change your name or email after review.');
    if (!db.prepare('SELECT person_id FROM enrollments WHERE year=? AND person_id=? AND active=1').get(year,existing.person_id)) {
      throw new Error('You are no longer taking part in this exchange.');
    }
  } else mutable(db,year);
  const submissionId=existing?.id || randomUUID();
  return transaction(db,()=>{
    db.prepare(`INSERT INTO submissions(id,year,name,email,wishlist,message,gifts) VALUES (?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,wishlist=excluded.wishlist,
      message=excluded.message,gifts=excluded.gifts,updated_at=CURRENT_TIMESTAMP`).run(
      submissionId,year,values.name,values.email,values.wishlist,values.message,JSON.stringify(values.gifts));
    if (existing?.status==='approved') {
      db.prepare('UPDATE enrollments SET wishlist=?,message=?,gifts=? WHERE year=? AND person_id=?').run(
        values.wishlist,values.message,JSON.stringify(values.gifts),year,existing.person_id);
    }
    audit(db,'submit-wishlist',{year,id:submissionId});
    return submissionId;
  });
}

export function listSubmissions(db,year) {
  return db.prepare('SELECT * FROM submissions WHERE year=? ORDER BY updated_at,id').all(year).map(row=>({
    id:row.id,name:row.name,email:row.email,wishlist:row.wishlist,message:row.message,gifts:JSON.parse(row.gifts),
    status:row.status,personId:row.person_id,suggestedPersonId:findPerson(db,row.name)?.id || null
  }));
}

export function approveSubmission(db,id,requestedPersonId) {
  const submission=db.prepare('SELECT * FROM submissions WHERE id=?').get(id);
  if (!submission || submission.status!=='pending') throw new Error('Choose a pending wish list to review.');
  const year=submission.year;mutable(db,year);
  const newPerson=!requestedPersonId || requestedPersonId==='new';
  const person=newPerson?null:db.prepare('SELECT * FROM people WHERE id=?').get(requestedPersonId);
  if (!newPerson && !person) throw new Error('Choose an existing person or create a new person.');
  if (newPerson && findPerson(db,submission.name)) throw new Error('That name belongs to an existing person. Select their entry to preserve history.');
  const personId=person?.id || randomUUID();
  checkEmailIdentity(db,submission.email,personId);
  if (db.prepare("SELECT id FROM submissions WHERE year=? AND person_id=? AND status='approved'").get(year,personId)) {
    throw new Error('This person already has a reviewed wish list. They can edit their saved entry.');
  }
  return transaction(db,()=>{
    if (person) {
      db.prepare('UPDATE people SET email=? WHERE id=?').run(submission.email,personId);
      db.prepare('DELETE FROM sign_in_tokens WHERE person_id=? AND email<>?').run(personId,submission.email);
      db.prepare("UPDATE outbox SET recipient_email=? WHERE year=? AND giver=? AND kind IN ('invite','assignment') AND status IN ('pending','failed','preview')").run(submission.email,year,personId);
    } else db.prepare('INSERT INTO people(id,name,email) VALUES (?,?,?)').run(personId,submission.name,submission.email);
    db.prepare(`INSERT INTO enrollments(year,person_id,active,wishlist,message,gifts) VALUES (?,?,1,?,?,?)
      ON CONFLICT(year,person_id) DO UPDATE SET active=1,wishlist=excluded.wishlist,message=excluded.message,gifts=excluded.gifts`).run(
      year,personId,submission.wishlist,submission.message,submission.gifts);
    db.prepare("UPDATE submissions SET status='approved',person_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(personId,id);
    invalidateDraft(db,year);audit(db,'approve-wishlist',{year,id,personId});
    return personId;
  });
}

export function rejectSubmission(db,id) {
  const row=db.prepare('SELECT year,status FROM submissions WHERE id=?').get(id);
  if (!row || row.status!=='pending') throw new Error('Choose a pending wish list to decline.');
  mutable(db,row.year);
  db.prepare("UPDATE submissions SET status='rejected',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(id);
  audit(db,'decline-wishlist',{year:row.year,id});
}
