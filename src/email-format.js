import { escapeHtml } from './security.js';

export function emailSender(from) {
  if (typeof from !== 'string') return from;
  const value=from.trim();
  const bare=/^[^\s<>@,]+@[^\s<>@,]+$/.test(value)?value:null;
  const branded=/^(?:"Ornament"|Ornament)\s*<([^\s<>@,]+@[^\s<>@,]+)>$/i.exec(value);
  const address=bare||branded?.[1];
  // Keep the approved mailbox and any deliberately configured custom name.
  return address?`"Ornament Secret Santa" <${address}>`:from;
}

function emailLine(line) {
  // Generated action links occupy their own line; gift links may follow a label.
  // Keep the exact URL, including single-use fragments, visible in both versions.
  const match=/^(.*?\s)?(https?:\/\/[^\s]+)$/.exec(line);
  if (match) {
    try {
      const url=new URL(match[2]);
      if (!url.username && !url.password) {
        return `${escapeHtml(match[1]||'')}<a href="${escapeHtml(match[2])}" style="color:#285c49;text-decoration:underline;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(match[2])}</a>`;
      }
    } catch { /* Invalid URLs stay escaped text. */ }
  }
  return escapeHtml(line);
}

export function emailHtml(subject,text) {
  const paragraphs=text.replace(/\r\n?/g,'\n').split(/\n{2,}/).filter(Boolean)
    .map(paragraph=>`<p style="margin:0 0 20px">${paragraph.split('\n').map(emailLine).join('<br>')}</p>`).join('\n');
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;background:#ffffff;color:#263d36;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6">
<main style="max-width:600px;margin:0 auto;padding:24px;overflow-wrap:anywhere">
<p style="margin:0 0 16px;font-weight:bold">Ornament · Secret Santa</p>
<h1 style="margin:0 0 24px;font-size:24px;line-height:1.3">${escapeHtml(subject)}</h1>
${paragraphs}
</main>
</body>
</html>`;
}
