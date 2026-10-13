import { randomUUID } from 'node:crypto';
import { transaction } from './database.js';
import { hash, secret } from './security.js';
import { emailValid, normalizeEmail } from './service.js';

export function expireSignIns(db,now=Date.now()) {
  db.prepare('DELETE FROM sign_in_tokens WHERE expires<=?').run(now);
  db.prepare(`UPDATE outbox SET status='expired',body='This sign-in link is no longer available.',error='Request a new sign-in link.'
    WHERE kind LIKE 'signin:%' AND status IN ('pending','preview','failed','uncertain')
    AND NOT EXISTS (SELECT 1 FROM sign_in_tokens WHERE mail_id=outbox.id)`).run();
  db.prepare('DELETE FROM sign_in_requests WHERE window_start<=?').run(now-3600000);
  db.prepare('DELETE FROM sign_in_events WHERE created_at<=?').run(now-86400000);
}

export function prepareSignIn(db,config,input,now=Date.now()) {
  expireSignIns(db,now);
  const email=normalizeEmail(input);
  if (!emailValid(email)) return null;
  const exchange=db.prepare("SELECT year,title FROM exchanges WHERE state IN ('open','drafted','locked') ORDER BY year DESC LIMIT 1").get();
  if (!exchange) return null;
  const people=db.prepare(`SELECT p.id,p.name,p.email FROM people p JOIN enrollments e ON e.person_id=p.id
    WHERE e.year=? AND e.active=1 AND lower(trim(p.email))=?`).all(exchange.year,email);
  // Old databases may contain duplicate addresses. Never choose someone arbitrarily.
  if (people.length!==1) return null;
  const person=people[0],emailHash=hash(email);
  const previous=db.prepare('SELECT * FROM sign_in_requests WHERE email_hash=?').get(emailHash);
  if (previous && (now-previous.last_request<60000 || previous.count>=5)) return null;
  if (db.prepare('SELECT count(*) AS count FROM sign_in_events').get().count>=100 ||
      db.prepare('SELECT count(*) AS count FROM sign_in_events WHERE created_at>?').get(now-15*60000).count>=20) return null;
  return transaction(db,()=>{
    db.prepare('INSERT INTO sign_in_events(created_at) VALUES (?)').run(now);
    db.prepare(`INSERT INTO sign_in_requests(email_hash,last_request,window_start,count) VALUES (?,?,?,1)
      ON CONFLICT(email_hash) DO UPDATE SET last_request=excluded.last_request,count=count+1`).run(emailHash,now,now);
    const token=secret(),id=randomUUID();
    const link=`${config.publicUrl}/join#${token}`;
    db.prepare('INSERT INTO outbox(id,year,giver,kind,recipient_email,subject,body) VALUES (?,?,?,?,?,?,?)').run(
      id,exchange.year,person.id,`signin:${id}`,person.email,`Sign in to Ornament · ${exchange.title}`,
      `Hi ${person.name},\n\nOpen your wish list and Secret Santa match:\n\n${link}\n\nThis link expires in 15 minutes and works once. Keep it private.\n\nIf you didn't request it, you can ignore this email.`);
    db.prepare('INSERT INTO sign_in_tokens(hash,year,person_id,email,mail_id,expires) VALUES (?,?,?,?,?,?)').run(
      hash(token),exchange.year,person.id,email,id,now+15*60000);
    return id;
  });
}

export function validSignIn(db,tokenHash,now=Date.now()) {
  return db.prepare(`SELECT t.* FROM sign_in_tokens t JOIN people p ON p.id=t.person_id
    JOIN enrollments e ON e.person_id=t.person_id AND e.year=t.year JOIN exchanges x ON x.year=t.year
    WHERE t.hash=? AND t.expires>? AND t.email=lower(trim(p.email)) AND e.active=1
    AND x.state IN ('open','drafted','locked')`).get(tokenHash,now);
}

export function consumeSignIn(db,tokenHash) {
  const signin=validSignIn(db,tokenHash);
  if (!signin) return null;
  db.prepare('DELETE FROM sign_in_tokens WHERE hash=?').run(tokenHash);
  db.prepare("UPDATE outbox SET body='This sign-in link has been used.' WHERE id=?").run(signin.mail_id);
  return signin;
}
