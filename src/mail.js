import nodemailer from 'nodemailer';
import { escapeHtml } from './security.js';
import { audit } from './database.js';
import { validSignIn, expireSignIns } from './signin.js';
import { makeEmail } from './service.js';

export function createMailer(db,config,providedTransport) {
  let busy = false;
  const smtpReady = Boolean(config.smtp.host && config.smtp.from && config.smtp.user && config.smtp.password);
  const transport = providedTransport || (smtpReady ? nodemailer.createTransport({host:config.smtp.host,
    port:config.smtp.port,secure:config.smtp.port===465,requireTLS:config.smtp.port!==465,
    auth:{user:config.smtp.user,pass:config.smtp.password}, connectionTimeout:15000,greetingTimeout:15000,socketTimeout:30000}) : null);
  async function deliverRow(row) {
    if (config.emailMode === 'preview') {
      db.prepare("UPDATE outbox SET status='preview' WHERE id=? AND status='pending'").run(row.id);
      return;
    }
    if (!transport) throw new Error('Configure SMTP before sending real email.');
    if (row.kind==='invite') {
      // Start the invitation lifetime at dispatch, including reviewed retries.
      const current=makeEmail(db,config,row.year,row.giver,'invite');
      db.prepare('UPDATE outbox SET body=?,subject=?,recipient_email=? WHERE id=? AND status=\'pending\'').run(current.body,current.subject,current.email,row.id);
      row={...row,body:current.body,subject:current.subject,recipient_email:current.email};
    }
    const claimed = db.prepare("UPDATE outbox SET status='sending',attempts=attempts+1 WHERE id=? AND status='pending'").run(row.id);
    if (!claimed.changes) return;
    try {
      const result = await transport.sendMail({from:config.smtp.from,to:row.recipient_email,subject:row.subject,text:row.body,
        html:`<div style="font-family:system-ui;line-height:1.7;white-space:pre-wrap">${escapeHtml(row.body)}</div>`,
        messageId:`<${row.id}@${new URL(config.publicUrl).hostname}>`});
      if (Array.isArray(result.rejected) && result.rejected.length) {
        db.prepare("UPDATE outbox SET status='failed',error='The mail server rejected this address.' WHERE id=?").run(row.id);
      } else {
        db.prepare("UPDATE outbox SET status='sent',error='',sent_at=CURRENT_TIMESTAMP WHERE id=?").run(row.id);
      }
    } catch (error) {
      // A timeout during DATA can happen after delivery. Treat transport failures conservatively.
      const definite = ['EAUTH','EENVELOPE'].includes(error.code) || (Number(error.responseCode)>=400);
      db.prepare('UPDATE outbox SET status=?,error=? WHERE id=?').run(definite?'failed':'uncertain',
        definite ? 'The mail server rejected the request. Check the email address and SMTP configuration.' :
          'The connection failed during delivery. Check the recipient mailbox before retrying.',row.id);
    }
  }
  return {
    ready: config.emailMode === 'smtp' && Boolean(transport),
    async deliverSignIn(id) {
      expireSignIns(db);
      const token=db.prepare('SELECT hash FROM sign_in_tokens WHERE mail_id=?').get(id);
      if (!token || !validSignIn(db,token.hash)) return;
      const row=db.prepare("SELECT * FROM outbox WHERE id=? AND kind LIKE 'signin:%' AND status='pending'").get(id);
      if (row) await deliverRow(row);
    },
    async deliver(year) {
      if (busy) throw new Error('An email batch is already running.');
      if (config.emailMode === 'smtp' && !transport) throw new Error('Configure SMTP before sending real email.');
      busy = true;
      try {
        const rows = db.prepare("SELECT * FROM outbox WHERE year=? AND status='pending' AND (kind IN ('invite','assignment') OR kind LIKE 'revision:%') ORDER BY id").all(year);
        for (const row of rows) {
          await deliverRow(row);
        }
        audit(db,'email-batch',{year,mode:config.emailMode,count:rows.length});
      } finally { busy = false; }
    }
  };
}
