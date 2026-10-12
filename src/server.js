import express from 'express';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openDatabase, audit, getExchange, members, transaction, importHistory } from './database.js';
import { createExchange, savePerson, emailValid, matchingOptions, historyReadiness, mutable, invalidateDraft, draftDraw,
  lockDraw, inviteLink, giftList, prepareMail, normalizeEmail, checkEmailIdentity } from './service.js';
import { secret, hash, passwordMatches, readConfig } from './security.js';
import { createMailer } from './mail.js';
import { prepareSignIn, consumeSignIn, expireSignIns } from './signin.js';
import { groupLink, submissionProfile, saveSubmission, listSubmissions, approveSubmission, rejectSubmission } from './submissions.js';

export function createApp(config,db,providedTransport) {
  const app = express();
  const mailer = createMailer(db,config,providedTransport);
  const attempts = new Map();
  app.disable('x-powered-by');
  if(config.trustProxyHops)app.set('trust proxy',config.trustProxyHops);
  app.use((req,res,next)=>{
    res.set({'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
      'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
      'Permissions-Policy':'camera=(), microphone=(), geolocation=()','Cache-Control':'no-store'});
    if (config.secure) res.set('Strict-Transport-Security','max-age=31536000');
    if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
      if (req.get('origin') !== config.publicUrl) return res.status(403).json({error:'Request origin is not allowed.'});
      if (!req.is('application/json')) return res.status(415).json({error:'Send JSON requests.'});
    }
    next();
  });
  app.use(express.json({limit:'128kb'}));
  app.get('/health',(_req,res)=>{db.prepare('SELECT 1').get();res.json({ok:true});});
  app.use('/api',(req,res,next)=>{
    const value = (req.headers.cookie || '').split(';').map(p=>p.trim()).find(p=>p.startsWith('santa_session='))?.slice(14);
    req.session = value && db.prepare('SELECT * FROM sessions WHERE hash=? AND expires>?').get(hash(value),Date.now());
    if (req.session && ['POST','PUT','PATCH','DELETE'].includes(req.method) && !['/login','/redeem','/sign-in','/group/redeem'].includes(req.path.toLowerCase())) {
      if (req.get('x-csrf-token') !== req.session.csrf) return res.status(403).json({error:'Refresh the page and try again.'});
    }
    next();
  });
  const fail = (res,error,status=400)=>res.status(status).json({error:error.message});
  const sessionCookie = (res, token, maxAge)=>res.cookie('santa_session',token,{httpOnly:true,secure:config.secure,sameSite:'strict',path:'/',maxAge});
  const makeSession = (res,role,personId=null,year=null)=>{
    const token = secret(), csrf = secret(), duration = role==='admin' ? 8*3600000 : 30*86400000;
    db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    db.prepare('DELETE FROM invite_tokens WHERE expires<?').run(Date.now());
    db.prepare('INSERT INTO sessions(hash,role,csrf,person_id,year,expires) VALUES (?,?,?,?,?,?)').run(hash(token),role,csrf,personId,year,Date.now()+duration);
    sessionCookie(res,token,duration);
    return {role,csrf,year};
  };
  function limiter(req,res,next) {
    const now = Date.now(), key = `${req.route.path}:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    for (const [ip,entry] of attempts) if (entry.until < now) attempts.delete(ip);
    if (!attempts.has(key) && attempts.size >= 1000) return res.status(429).json({error:'Too many login requests. Try again later.'});
    const entry = attempts.get(key) || {count:0,until:now+15*60000};
    attempts.set(key,entry);
    if (++entry.count > 15) return res.status(429).json({error:'Too many login attempts. Try again in fifteen minutes.'});
    next();
  }
  app.post('/api/login',limiter,(req,res)=>{
    if (!passwordMatches(req.body.password,config.password)) return res.status(401).json({error:'Incorrect organizer password.'});
    if (req.session) db.prepare('DELETE FROM sessions WHERE hash=?').run(req.session.hash);
    res.json(makeSession(res,'admin'));
  });
  app.post('/api/sign-in',limiter,(req,res)=>{
    const mode=config.emailMode==='preview'?'preview':mailer.ready?'email':'unavailable';
    const id=mode==='unavailable'?null:prepareSignIn(db,config,req.body.email);
    // Respond before SMTP to keep timing and responses independent of roster membership.
    res.status(202).json({ok:true,mode});
    if (id) mailer.deliverSignIn(id).catch(()=>{
      // Do not log addresses, message bodies, links, or provider credentials.
      console.error('Could not deliver an Ornament sign-in email. Check the organizer email records.');
    });
  });
  app.post('/api/redeem',limiter,(req,res)=>{
    const token = typeof req.body.token==='string' ? req.body.token : '';
    if (token.length!==43) return res.status(401).json({error:'This link is invalid or expired. Request a new link from the homepage.'});
    const result=transaction(db,()=>{
      const tokenHash=hash(token);
      const invite=consumeSignIn(db,tokenHash) || db.prepare('SELECT * FROM invite_tokens WHERE hash=? AND expires>?').get(tokenHash,Date.now());
      if (!invite) return null;
      if (req.session) db.prepare('DELETE FROM sessions WHERE hash=?').run(req.session.hash);
      return makeSession(res,'member',invite.person_id,invite.year);
    });
    if (!result) return res.status(401).json({error:'This link is invalid or expired. Request a new link from the homepage.'});
    res.json(result);
  });
  app.post('/api/group/redeem',limiter,(req,res)=>{
    const token=typeof req.body.token==='string'?req.body.token:'';
    const invite=token.length===43 && db.prepare('SELECT year FROM group_tokens WHERE hash=? AND expires>?').get(hash(token),Date.now());
    if (!invite) return res.status(401).json({error:'This group link is invalid or expired. Ask your organizer for a new one.'});
    if (req.session?.role==='submission' && req.session.year===invite.year) {
      return res.json({role:'submission',csrf:req.session.csrf,year:invite.year});
    }
    mutable(db,invite.year);
    const result=transaction(db,()=>{
      if (req.session) db.prepare('DELETE FROM sessions WHERE hash=?').run(req.session.hash);
      return makeSession(res,'group',null,invite.year);
    });
    res.json(result);
  });
  app.get('/api/session',(req,res)=>{
    if (!req.session) return res.status(401).json({error:'Please sign in.'});
    res.json({role:req.session.role,csrf:req.session.csrf,year:req.session.year});
  });
  app.post('/api/logout',(req,res)=>{
    if (req.session) db.prepare('DELETE FROM sessions WHERE hash=?').run(req.session.hash);
    res.clearCookie('santa_session',{path:'/',secure:config.secure,httpOnly:true,sameSite:'strict'}).json({ok:true});
  });
  app.use('/api/admin',(req,res,next)=>{
    if (req.session?.role!=='admin') return res.status(403).json({error:'Organizer access required.'});
    next();
  });
  app.get('/api/admin/state',(req,res)=>{
    expireSignIns(db);
    const exchanges = db.prepare('SELECT * FROM exchanges ORDER BY year DESC').all();
    const year = Number(req.query.year || exchanges[0]?.year);
    const exchange = exchanges.find(e=>e.year===year) || null;
    const people = exchange ? members(db,year) : [];
    res.json({exchanges,year,exchange,people,identities:db.prepare('SELECT id,name FROM people ORDER BY name COLLATE NOCASE').all(),submissions:exchange?listSubmissions(db,year):[],
      exclusions:exchange ? matchingOptions(db,year).exclusions : [],
      assignments:exchange ? db.prepare('SELECT giver,recipient FROM assignments WHERE year=?').all(year) : [],
      history:exchange ? historyReadiness(db,year) : [],
      outbox:exchange ? db.prepare('SELECT id,giver,kind,recipient_email,subject,body,status,error,attempts,sent_at FROM outbox WHERE year=? ORDER BY kind,giver').all(year) : [],
      emailMode:config.emailMode,smtpReady:mailer.ready,
      audit:db.prepare('SELECT action,detail,created_at FROM audit ORDER BY id DESC LIMIT 20').all()});
  });
  app.get('/api/admin/export',(_req,res)=>{
    const exported = {schema:1,exportedAt:new Date().toISOString(),people:db.prepare('SELECT * FROM people').all(),
      exchanges:db.prepare('SELECT * FROM exchanges').all(),enrollments:db.prepare('SELECT * FROM enrollments').all(),
      assignments:db.prepare('SELECT * FROM assignments').all(),exclusions:db.prepare('SELECT * FROM exclusions').all()};
    res.set('Content-Disposition','attachment; filename="secret-santa-history.json"').json(exported);
  });
  app.post('/api/admin/exchanges',(req,res)=>{
    const result = createExchange(db,Number(req.body.year),Number(req.body.copyFrom)||null);
    res.json(result);
  });
  app.post('/api/admin/history',(req,res)=>{res.json({assignments:importHistory(db,req.body)});});
  app.post('/api/admin/history/none',(req,res)=>{
    const year=Number(req.body.year);
    if(!Number.isInteger(year)||year<2000||year>2200||req.body.confirm!=='NO EXCHANGE')throw new Error('Enter a valid year and type NO EXCHANGE to confirm that no draw happened.');
    const existing=db.prepare('SELECT state FROM exchanges WHERE year=?').get(year);
    if(existing && existing.state!=='no_exchange')throw new Error('An existing exchange cannot be replaced with an empty year.');
    transaction(db,()=>{
      db.prepare("INSERT OR REPLACE INTO exchanges(year,title,state,history_status,source) VALUES (?,?,'no_exchange','verified','Organizer confirmed that no exchange took place')").run(year,`No exchange — ${year}`);
      for(const row of db.prepare("SELECT year FROM exchanges WHERE state='drafted' AND year IN (?,?)").all(year+1,year+2))invalidateDraft(db,row.year);
      audit(db,'confirm-no-exchange',{year});
    });res.json({ok:true});
  });
  app.post('/api/admin/history/confirm',(req,res)=>{
    const year = Number(req.body.year);
    const exchange = getExchange(db,year);
    if (exchange.state!=='archived') throw new Error('Only imported historical exchanges need confirmation.');
    if (!db.prepare('SELECT giver FROM assignments WHERE year=?').get(year)) throw new Error('No history has been imported.');
    db.prepare("UPDATE exchanges SET history_status='verified' WHERE year=?").run(year);
    // A changed historical rule can invalidate any current draft.
    for (const row of db.prepare("SELECT year FROM exchanges WHERE state='drafted' AND year IN (?,?)").all(year+1,year+2)) invalidateDraft(db,row.year);
    audit(db,'confirm-history',{year});res.json({ok:true});
  });
  app.post('/api/admin/settings',(req,res)=>{
    const year = Number(req.body.year);mutable(db,year);
    transaction(db,()=>{
      db.prepare('UPDATE exchanges SET title=?,budget=?,event_date=?,no_reciprocal=? WHERE year=?').run(
        String(req.body.title||`Family Christmas ${year}`).slice(0,100),String(req.body.budget||'').slice(0,80),
        String(req.body.event_date||'').slice(0,30),req.body.noReciprocal===false?0:1,year);
      invalidateDraft(db,year);audit(db,'save-settings',{year});
    });res.json({ok:true});
  });
  app.post('/api/admin/people',(req,res)=>{res.json({id:savePerson(db,Number(req.body.year),req.body)});});
  app.post('/api/admin/contact',(req,res)=>{
    const year=Number(req.body.year),id=req.body.id,email=normalizeEmail(req.body.email);
    if(!emailValid(email)||!db.prepare('SELECT person_id FROM enrollments WHERE year=? AND person_id=?').get(year,id))throw new Error('Choose an existing person and enter a valid email address.');
    checkEmailIdentity(db,email,id);
    transaction(db,()=>{
      db.prepare('UPDATE people SET email=? WHERE id=?').run(email,id);
      db.prepare('DELETE FROM sign_in_tokens WHERE person_id=? AND email<>?').run(id,email);
      db.prepare("UPDATE outbox SET recipient_email=? WHERE year=? AND giver=? AND kind IN ('invite','assignment') AND status IN ('pending','failed','preview')").run(email,year,id);
      audit(db,'correct-contact',{year,id});
    });res.json({ok:true});
  });
  app.post('/api/admin/exclusions',(req,res)=>{
    const year = Number(req.body.year);mutable(db,year);
    const people = members(db,year).map(p=>p.id);
    if (req.body.giver===req.body.recipient || !people.includes(req.body.giver) || !people.includes(req.body.recipient)) throw new Error('Choose two distinct people in this exchange.');
    transaction(db,()=>{
      const pairs = [[req.body.giver,req.body.recipient]];
      if (req.body.bothDirections) pairs.push([req.body.recipient,req.body.giver]);
      for (const [giver,recipient] of pairs) {
        if (req.body.remove) db.prepare('DELETE FROM exclusions WHERE year=? AND giver=? AND recipient=?').run(year,giver,recipient);
        else db.prepare('INSERT OR REPLACE INTO exclusions(year,giver,recipient,reason) VALUES (?,?,?,?)').run(year,giver,recipient,String(req.body.reason||'').slice(0,200));
      }
      invalidateDraft(db,year);audit(db,'save-exclusions',{year});
    });res.json({ok:true});
  });
  app.post('/api/admin/draft',(req,res)=>res.json({assignments:draftDraw(db,Number(req.body.year))}));
  app.post('/api/admin/finalize',(req,res)=>{
    if (req.body.confirm !== 'FINALIZE') throw new Error('Type FINALIZE to confirm.');
    lockDraw(db,Number(req.body.year));res.json({ok:true});
  });
  app.post('/api/admin/link',(req,res)=>res.json({link:inviteLink(db,config,Number(req.body.year),req.body.personId)}));
  app.post('/api/admin/group-link',(req,res)=>res.json({link:groupLink(db,config,Number(req.body.year))}));
  app.post('/api/admin/group-revoke',(req,res)=>{
    const year=Number(req.body.year);getExchange(db,year);
    transaction(db,()=>{
      db.prepare('DELETE FROM group_tokens WHERE year=?').run(year);
      db.prepare("DELETE FROM sessions WHERE role='group' AND year=?").run(year);
      audit(db,'revoke-group-links',{year});
    });res.json({ok:true});
  });
  app.post('/api/admin/submissions/approve',(req,res)=>res.json({ok:true,personId:approveSubmission(db,req.body.id,req.body.personId)}));
  app.post('/api/admin/submissions/reject',(req,res)=>{rejectSubmission(db,req.body.id);res.json({ok:true});});
  app.post('/api/admin/revoke',(req,res)=>{
    const year = Number(req.body.year);
    transaction(db,()=>{
      db.prepare('DELETE FROM invite_tokens WHERE year=? AND person_id=?').run(year,req.body.personId);
      db.prepare('DELETE FROM sign_in_tokens WHERE year=? AND person_id=?').run(year,req.body.personId);
      db.prepare("DELETE FROM sessions WHERE role='member' AND year=? AND person_id=?").run(year,req.body.personId);
      db.prepare("DELETE FROM sessions WHERE role='submission' AND year=? AND person_id IN (SELECT id FROM submissions WHERE year=? AND person_id=?)").run(year,year,req.body.personId);
      audit(db,'revoke-links',{year,personId:req.body.personId});
    });res.json({ok:true});
  });
  app.post('/api/admin/mail/prepare',(req,res)=>{
    prepareMail(db,config,Number(req.body.year),req.body.kind,Array.isArray(req.body.ids)?req.body.ids:null);res.json({ok:true});
  });
  app.post('/api/admin/mail/send',async(req,res)=>{
    if (config.emailMode==='smtp' && req.body.confirm!=='SEND') throw new Error('Type SEND to confirm sending real emails.');
    await mailer.deliver(Number(req.body.year));res.json({ok:true});
  });
  app.post('/api/admin/mail/retry',(req,res)=>{
    const row = db.prepare('SELECT * FROM outbox WHERE id=?').get(req.body.id);
    if (row?.kind.startsWith('signin:')) throw new Error('Request a new sign-in link from the homepage.');
    if (!row || !['failed','preview','uncertain'].includes(row.status)) throw new Error('Only failed, previewed, or reviewed uncertain messages can be retried.');
    if (row.status==='uncertain' && req.body.confirm!=='CHECKED') throw new Error('Confirm you checked the mailbox before retrying this uncertain email.');
    const person=db.prepare('SELECT email FROM people WHERE id=?').get(row.giver);
    if(!emailValid(person?.email))throw new Error('Correct this person’s email address first.');
    db.prepare("UPDATE outbox SET status='pending',error='',recipient_email=? WHERE id=?").run(person.email,row.id);
    audit(db,'queue-retry',{id:row.id,previous:row.status});res.json({ok:true});
  });
  app.use('/api/group',(req,res,next)=>{
    if (!['group','submission'].includes(req.session?.role)) return res.status(403).json({error:'Open the group link your organizer shared.'});
    next();
  });
  app.get('/api/group/profile',(req,res)=>{
    const {year,role,person_id:id}=req.session;
    const exchange=getExchange(db,year);
    res.json({exchange:{year:exchange.year,title:exchange.title,budget:exchange.budget,eventDate:exchange.event_date,state:exchange.state},
      submission:role==='submission'?submissionProfile(db,year,id):null});
  });
  app.post('/api/group/profile',(req,res)=>{
    const {year,role,person_id:id}=req.session;
    const submissionId=saveSubmission(db,year,role==='submission'?id:null,req.body);
    if (role==='submission') return res.json({role,csrf:req.session.csrf,year});
    const result=transaction(db,()=>{
      db.prepare('DELETE FROM sessions WHERE hash=?').run(req.session.hash);
      return makeSession(res,'submission',submissionId,year);
    });res.json(result);
  });
  app.use('/api/member',(req,res,next)=>{
    if (req.session?.role!=='member') return res.status(403).json({error:'Sign in from the homepage.'});
    next();
  });
  app.get('/api/member/profile',(req,res)=>{
    const {year,person_id:id}=req.session;
    const exchange = getExchange(db,year);
    const all = members(db,year);
    const person = all.find(p=>p.id===id);
    if (!person) return res.status(404).json({error:'You are no longer in this exchange.'});
    let recipient = null;
    if (exchange.state==='locked') {
      const pair = db.prepare('SELECT recipient FROM assignments WHERE year=? AND giver=?').get(year,id);
      const target = pair && all.find(p=>p.id===pair.recipient);
      if (target) recipient={name:target.name,wishlist:target.wishlist,message:target.message,gifts:target.gifts};
    }
    res.json({exchange:{year:exchange.year,title:exchange.title,budget:exchange.budget,eventDate:exchange.event_date,state:exchange.state},
      person:{name:person.name,active:Boolean(person.active),wishlist:person.wishlist,message:person.message,gifts:person.gifts},recipient});
  });
  app.post('/api/member/profile',(req,res)=>{
    const {year,person_id:id}=req.session;
    if (!db.prepare('SELECT person_id FROM enrollments WHERE year=? AND person_id=?').get(year,id)) throw new Error('Participant not found.');
    const current=getExchange(db,year);
    if (current.state==='archived') throw new Error('This exchange is archived.');
    const wishlist=String(req.body.wishlist||'').slice(0,5000),message=String(req.body.message||'').slice(0,2000),gifts=JSON.stringify(giftList(req.body.gifts||[]));
    transaction(db,()=>{
      db.prepare('UPDATE enrollments SET wishlist=?,message=?,gifts=? WHERE year=? AND person_id=?').run(wishlist,message,gifts,year,id);
      db.prepare("UPDATE submissions SET wishlist=?,message=?,gifts=?,updated_at=CURRENT_TIMESTAMP WHERE year=? AND person_id=? AND status='approved'").run(wishlist,message,gifts,year,id);
      audit(db,'save-wishlist',{year,id});
    });res.json({ok:true});
  });
  app.use('/api',(_req,res)=>res.status(404).json({error:'Endpoint not found.'}));
  const publicDir=fileURLToPath(new URL('../public/',import.meta.url));
  app.use(express.static(publicDir,{maxAge:0}));
  for (const route of ['/','/admin','/join']) app.get(route,(_req,res)=>res.sendFile(resolve(publicDir,'index.html')));
  app.use((error,_req,res,_next)=>{
    if (error.type==='entity.parse.failed') return res.status(400).json({error:'Invalid JSON.'});
    if (error.type==='entity.too.large') return res.status(413).json({error:'The request is too large.'});
    if (error.code?.startsWith('ERR_SQLITE')) return res.status(500).json({error:'The database could not complete the request.'});
    fail(res,error);
  });
  return app;
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  const config=readConfig();
  const db=openDatabase(config.dataDir);
  const server=createApp(config,db).listen(config.port,config.host,()=>console.log(`Ornament: ${config.publicUrl} · email mode: ${config.emailMode}`));
  const stop=()=>{server.close(()=>{db.close();process.exit(0);});};
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
