import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export function openDatabase(dataDir) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(dataDir, 'secret-santa.sqlite'));
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS people (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, aliases TEXT NOT NULL DEFAULT '[]', email TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS exchanges (
      year INTEGER PRIMARY KEY, title TEXT NOT NULL, budget TEXT NOT NULL DEFAULT '', event_date TEXT NOT NULL DEFAULT '',
      state TEXT NOT NULL DEFAULT 'open', history_status TEXT NOT NULL DEFAULT 'provisional',
      no_reciprocal INTEGER NOT NULL DEFAULT 1, source TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS enrollments (
      year INTEGER REFERENCES exchanges(year), person_id TEXT REFERENCES people(id), active INTEGER NOT NULL DEFAULT 1,
      wishlist TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '', gifts TEXT NOT NULL DEFAULT '[]', PRIMARY KEY (year, person_id)
    );
    CREATE TABLE IF NOT EXISTS exclusions (
      year INTEGER REFERENCES exchanges(year), giver TEXT REFERENCES people(id), recipient TEXT REFERENCES people(id),
      reason TEXT NOT NULL DEFAULT '', PRIMARY KEY (year, giver, recipient)
    );
    CREATE TABLE IF NOT EXISTS assignments (
      year INTEGER REFERENCES exchanges(year), giver TEXT REFERENCES people(id), recipient TEXT REFERENCES people(id),
      PRIMARY KEY(year, giver), UNIQUE(year, recipient)
    );
    CREATE TABLE IF NOT EXISTS invite_tokens (
      hash TEXT PRIMARY KEY, year INTEGER REFERENCES exchanges(year), person_id TEXT REFERENCES people(id), expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      hash TEXT PRIMARY KEY, role TEXT NOT NULL, csrf TEXT NOT NULL, year INTEGER, person_id TEXT, expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY, year INTEGER REFERENCES exchanges(year), giver TEXT REFERENCES people(id), kind TEXT NOT NULL,
      recipient_email TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      error TEXT NOT NULL DEFAULT '', attempts INTEGER NOT NULL DEFAULT 0, sent_at TEXT,
      UNIQUE(year, giver, kind)
    );
    CREATE TABLE IF NOT EXISTS sign_in_tokens (
      hash TEXT PRIMARY KEY, year INTEGER REFERENCES exchanges(year), person_id TEXT REFERENCES people(id),
      email TEXT NOT NULL, mail_id TEXT NOT NULL REFERENCES outbox(id), expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sign_in_requests (
      email_hash TEXT PRIMARY KEY, last_request INTEGER NOT NULL, window_start INTEGER NOT NULL, count INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS group_tokens (
      hash TEXT PRIMARY KEY, year INTEGER REFERENCES exchanges(year), expires INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY, year INTEGER REFERENCES exchanges(year), name TEXT NOT NULL, email TEXT NOT NULL,
      wishlist TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '', gifts TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending', person_id TEXT REFERENCES people(id),
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS approved_submission_person ON submissions(year,person_id) WHERE status='approved';
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, action TEXT NOT NULL, detail TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`);
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  if (!db.prepare('PRAGMA table_info(enrollments)').all().some(column=>column.name==='message')) {
    db.exec("ALTER TABLE enrollments ADD COLUMN message TEXT NOT NULL DEFAULT ''");
  }
  if (!db.prepare('PRAGMA table_info(enrollments)').all().some(column=>column.name==='changes_requested')) {
    db.exec("ALTER TABLE enrollments ADD COLUMN changes_requested TEXT NOT NULL DEFAULT ''");
  }
  if (!db.prepare('PRAGMA table_info(exchanges)').all().some(column=>column.name==='allow_group_join')) {
    db.exec('ALTER TABLE exchanges ADD COLUMN allow_group_join INTEGER NOT NULL DEFAULT 0');
    // Close anonymous entry, preserving saved submissions and their owner sessions.
    db.exec("DELETE FROM group_tokens; DELETE FROM sessions WHERE role='group'");
  }
  if (!db.prepare('PRAGMA table_info(invite_tokens)').all().some(column=>column.name==='email')) {
    transaction(db,()=>{
      db.exec("ALTER TABLE invite_tokens ADD COLUMN email TEXT NOT NULL DEFAULT ''");
      // Old reusable links cannot meet the new ownership and expiration policy.
      // Preserve wish lists, draws, signed-in owners, and successful email records.
      db.exec('DELETE FROM invite_tokens');
      audit(db,'upgrade-access-policy',{singleUseInvitations:true});
    });
  }
  db.exec('CREATE TABLE IF NOT EXISTS sign_in_events (created_at INTEGER NOT NULL)');
  // An interrupted SMTP transaction may have succeeded. Never automatically resend it.
  db.prepare("UPDATE outbox SET status='uncertain', error='Sending was interrupted. Check the recipient mailbox before retrying.' WHERE status='sending'").run();
  if(!db.prepare('SELECT name FROM schema_migrations WHERE name=?').get('automatic-roster-v1')) {
    transaction(db,()=>{
      db.prepare("UPDATE exchanges SET allow_group_join=0 WHERE state IN ('open','drafted')").run();
      db.exec("DELETE FROM group_tokens; DELETE FROM sessions WHERE role='group'");
      for(const exchange of db.prepare("SELECT year,state FROM exchanges WHERE state IN ('open','drafted') ORDER BY year").all()) {
        const result=carryRoster(db,exchange.year);
        if(result.count) {
          if(exchange.state==='drafted') {
            db.prepare('DELETE FROM assignments WHERE year=?').run(exchange.year);
            db.prepare("UPDATE exchanges SET state='open' WHERE year=?").run(exchange.year);
          }
          audit(db,'carry-roster',{year:exchange.year,...result});
        }
      }
      db.prepare('INSERT INTO schema_migrations(name) VALUES (?)').run('automatic-roster-v1');
    });
  }
  return db;
}

export function carryRoster(db,year,sourceYear) {
  sourceYear=sourceYear || db.prepare('SELECT max(year) AS year FROM enrollments WHERE year<?').get(year).year;
  if(!sourceYear)return {sourceYear:null,count:0};
  const result=db.prepare('INSERT OR IGNORE INTO enrollments(year,person_id,active) SELECT ?,person_id,active FROM enrollments WHERE year=?').run(year,sourceYear);
  return {sourceYear,count:result.changes};
}

export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

export const audit = (db, action, detail) => db.prepare('INSERT INTO audit(action,detail) VALUES (?,?)').run(action, JSON.stringify(detail));
export function getExchange(db, year) {
  const row = db.prepare('SELECT * FROM exchanges WHERE year=?').get(year);
  if (!row) throw new Error('Exchange not found.');
  return row;
}
export function members(db, year) {
  return db.prepare(`SELECT p.*, e.active, e.wishlist, e.message, e.gifts, e.changes_requested FROM people p JOIN enrollments e ON e.person_id=p.id
    WHERE e.year=? ORDER BY p.name COLLATE NOCASE`).all(year).map(row => ({...row, aliases: JSON.parse(row.aliases), gifts: JSON.parse(row.gifts)}));
}

export function ensureYear(db, year) {
  if (!Number.isInteger(year) || year < 2000 || year > 2200) throw new Error('Enter a year between 2000 and 2200.');
  db.prepare('INSERT OR IGNORE INTO exchanges(year,title) VALUES (?,?)').run(year, `Family Christmas ${year}`);
}

export function findPerson(db, name) {
  const key = String(name).trim().toLocaleLowerCase('en-US');
  return db.prepare('SELECT * FROM people').all().find(p => [p.name,...JSON.parse(p.aliases)]
    .some(alias => alias.trim().toLocaleLowerCase('en-US') === key));
}

export function importHistory(db, input) {
  const year = Number(input.year);
  if (!Number.isInteger(year) || year < 2000 || year > 2200 || !Array.isArray(input.assignments) || input.assignments.length < 3 || input.assignments.length > 50) {
    throw new Error('History needs a year and between 3 and 50 giver/recipient assignments.');
  }
  const pairs = input.assignments.map(p => ({ giver: String(p.giver || '').trim(), recipient: String(p.recipient || '').trim() }));
  if (pairs.some(p => !p.giver || !p.recipient || p.giver.length > 80 || p.recipient.length > 80)) throw new Error('Each history entry needs two names, at most 80 characters each.');
  return transaction(db, () => {
    const existing = db.prepare('SELECT state FROM exchanges WHERE year=?').get(year);
    if (existing && !['archived','no_exchange'].includes(existing.state)) throw new Error('History cannot overwrite an active exchange.');
    const resolve = name => {
      const found = findPerson(db, name);
      if (found) return found.id;
      const id = randomUUID();
      db.prepare('INSERT INTO people(id,name) VALUES (?,?)').run(id, name);
      return id;
    };
    for (const [canonical, variants] of Object.entries(input.aliases || {})) {
      if (!canonical.trim() || canonical.length > 80 || !Array.isArray(variants) || variants.length > 10) throw new Error('Invalid alternate names.');
      const id=resolve(canonical.trim());
      const person=db.prepare('SELECT * FROM people WHERE id=?').get(id);
      const aliases=new Set(JSON.parse(person.aliases));
      for (const alias of variants) {
        if (typeof alias!=='string' || !alias.trim() || alias.length>80) throw new Error('Invalid alternate name.');
        const other=findPerson(db,alias);
        if (other && other.id!==id) throw new Error('An alternate name belongs to another person.');
        aliases.add(alias.trim());
      }
      db.prepare('UPDATE people SET aliases=? WHERE id=?').run(JSON.stringify([...aliases]),id);
    }
    const resolved = pairs.map(p => ({giver: resolve(p.giver), recipient: resolve(p.recipient)}));
    const givers = new Set(resolved.map(p => p.giver));
    const recipients = new Set(resolved.map(p => p.recipient));
    if (givers.size !== resolved.length || recipients.size !== resolved.length || [...givers].some(id => !recipients.has(id)) || resolved.some(p => p.giver === p.recipient)) {
      throw new Error('History must list each person once as giver and once as recipient, with no self-matches.');
    }
    db.prepare(`INSERT INTO exchanges(year,title,state,history_status,source) VALUES (?,?,'archived',?,?)
      ON CONFLICT(year) DO UPDATE SET state='archived',title=excluded.title,history_status=excluded.history_status, source=excluded.source`).run(
      year, `Family Christmas ${year}`, input.status === 'verified' ? 'verified' : 'provisional', String(input.source || '').slice(0,2000));
    db.prepare('DELETE FROM assignments WHERE year=?').run(year);
    db.prepare('DELETE FROM enrollments WHERE year=?').run(year);
    for (const pair of resolved) {
      db.prepare('INSERT INTO enrollments(year,person_id) VALUES (?,?)').run(year,pair.giver);
      db.prepare('INSERT INTO assignments(year,giver,recipient) VALUES (?,?,?)').run(year,pair.giver,pair.recipient);
    }
    for (const draft of db.prepare("SELECT year FROM exchanges WHERE state='drafted' AND year IN (?,?)").all(year+1,year+2)) {
      db.prepare('DELETE FROM assignments WHERE year=?').run(draft.year);
      db.prepare("UPDATE exchanges SET state='open' WHERE year=?").run(draft.year);
    }
    audit(db, 'import-history', {year, count: resolved.length, status: input.status === 'verified' ? 'verified' : 'provisional'});
    return resolved;
  });
}
