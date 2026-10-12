import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

export const secret = () => randomBytes(32).toString('base64url');
export const hash = value => createHash('sha256').update(value).digest('hex');
export function passwordHash(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
export function passwordMatches(password, encoded) {
  if (typeof password !== 'string' || password.length > 1024) return false;
  const [kind, salt, digest] = (encoded || '').split(':');
  if (kind !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt || '') || !/^[a-f0-9]{128}$/.test(digest || '')) return false;
  return timingSafeEqual(scryptSync(password, salt, 64), Buffer.from(digest, 'hex'));
}
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function readConfig(env = process.env) {
  const publicUrl = new URL(env.PUBLIC_URL || 'http://localhost:3080');
  if (!['http:', 'https:'].includes(publicUrl.protocol) || publicUrl.pathname !== '/' || publicUrl.search || publicUrl.hash || publicUrl.username || publicUrl.password) {
    throw new Error('PUBLIC_URL must be an http(s) origin, without a path or credentials.');
  }
  const secure = env.COOKIE_SECURE === undefined ? publicUrl.protocol === 'https:' : env.COOKIE_SECURE === 'true';
  const local = ['localhost','127.0.0.1','[::1]'].includes(publicUrl.hostname);
  if (!local && (publicUrl.protocol !== 'https:' || !secure)) throw new Error('An externally hosted app requires HTTPS and secure cookies.');
  const password = env.ADMIN_PASSWORD_HASH || '';
  if (!/^scrypt:[a-f0-9]{32}:[a-f0-9]{128}$/.test(password)) throw new Error('Set ADMIN_PASSWORD_HASH first: node scripts/password.js');
  if (!['preview','smtp'].includes(env.EMAIL_MODE || 'preview')) throw new Error('EMAIL_MODE must be preview or smtp.');
  return { publicUrl: publicUrl.origin, password, secure, dataDir: env.DATA_DIR || './data',
    port: Number(env.PORT || 3080), host: env.HOST || '127.0.0.1', trustProxyHops: Number(env.TRUST_PROXY_HOPS || 0), emailMode: env.EMAIL_MODE || 'preview',
    smtp: {host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587), user: env.SMTP_USER,
      password: env.SMTP_PASSWORD, from: env.SMTP_FROM} };
}
