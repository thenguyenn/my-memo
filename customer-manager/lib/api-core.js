import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

export function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').json(body);
}

export function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Thiếu cấu hình Supabase trên Vercel.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function validCustomer(body) {
  const name = cleanText(body?.name, 120);
  const phone = cleanText(body?.phone, 30);
  const address = cleanText(body?.address, 500);
  if (!name || !phone || !address) return { error: 'Vui lòng nhập đầy đủ tên, số điện thoại và địa chỉ.' };
  if (!/^[0-9+().\-\s]{8,20}$/.test(phone)) return { error: 'Số điện thoại không hợp lệ.' };
  return { data: { name, phone, address, updated_at: new Date().toISOString() } };
}

// ─────────────────── Quản lý Chủ trang web (Owner) & Danh sách Gmail được phép ───────────────────

const DEFAULT_OWNERS = ['nguyenbathe2711@gmail.com'];
const CONFIG_BUCKET = 'app-config';
const USERS_FILE = 'allowed-users.json';

export function getOwnerEmails() {
  const fromEnv = (process.env.OWNER_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...DEFAULT_OWNERS, ...fromEnv])];
}

export function isOwnerEmail(email) {
  if (!email) return false;
  return getOwnerEmails().includes(String(email).trim().toLowerCase());
}

export async function getAllowedUsers() {
  const supabase = db();
  const owners = getOwnerEmails();
  let list = [];
  try {
    const { data: blob, error } = await supabase.storage.from(CONFIG_BUCKET).download(USERS_FILE);
    if (!error && blob) {
      const txt = await blob.text();
      const parsed = JSON.parse(txt);
      if (Array.isArray(parsed)) list = parsed;
    }
  } catch {
    // Nếu chưa có bucket/file thì khởi tạo mặc định
  }

  const map = new Map();
  for (const ownerEmail of owners) {
    map.set(ownerEmail, {
      email: ownerEmail,
      name: 'Nguyễn Bá Thế (Chủ trang web)',
      role: 'owner',
      created_at: '2026-11-16T00:00:00.000Z',
    });
  }
  for (const item of list) {
    const em = String(item?.email || '').trim().toLowerCase();
    if (!em) continue;
    const isOwner = owners.includes(em);
    map.set(em, {
      email: em,
      name: String(item.name || '').trim() || (isOwner ? 'Nguyễn Bá Thế' : em.split('@')[0]),
      role: isOwner ? 'owner' : 'member',
      locked: isOwner ? false : Boolean(item.locked),
      created_at: item.created_at || new Date().toISOString(),
    });
  }
  return Array.from(map.values());
}

export async function saveAllowedUsers(usersList) {
  const supabase = db();
  await supabase.storage.createBucket(CONFIG_BUCKET, { public: false }).catch(() => null);
  const { error } = await supabase.storage
    .from(CONFIG_BUCKET)
    .upload(USERS_FILE, JSON.stringify(usersList, null, 2), {
      contentType: 'application/json',
      upsert: true,
    });
  if (error) throw error;
  return usersList;
}

export async function isEmailAllowed(email) {
  const em = String(email || '').trim().toLowerCase();
  if (!em) return false;
  if (isOwnerEmail(em)) return true;
  const list = await getAllowedUsers();
  const found = list.find((u) => u.email.toLowerCase() === em);
  return Boolean(found && !found.locked);
}

// ─────────────────── JWT & Cookie Auth (Access + Refresh Token) ───────────────────

const ACCESS_TTL_SEC = Number(process.env.ACCESS_TOKEN_TTL) || 24 * 60 * 60; // 1 ngày (86400 giây)
const REFRESH_TTL_SEC = Number(process.env.REFRESH_TOKEN_TTL) || 7 * 24 * 60 * 60; // 1 tuần (604800 giây)
const REFRESH_COOKIE = 'cm_refresh_token';

function getSecret(kind = 'access') {
  const base =
    process.env.JWT_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    'my-memo-default-jwt-secret-change-in-prod';
  return kind === 'refresh'
    ? process.env.JWT_REFRESH_SECRET || `${base}_refresh`
    : base;
}

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64UrlDecode(str) {
  const pad = 4 - (str.length % 4 || 4);
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + (pad < 4 ? '='.repeat(pad) : '');
  return Buffer.from(b64, 'base64').toString('utf8');
}

function signJwt(payload, secret, expiresInSec) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const body = { ...payload, iat: now, exp: now + expiresInSec };
  const h = base64UrlEncode(JSON.stringify(header));
  const b = base64UrlEncode(JSON.stringify(body));
  const data = `${h}.${b}`;
  const sig = base64UrlEncode(crypto.createHmac('sha256', secret).update(data).digest());
  return `${data}.${sig}`;
}

function verifyJwt(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, b, sig] = parts;
  const data = `${h}.${b}`;
  const expectedSig = base64UrlEncode(crypto.createHmac('sha256', secret).update(data).digest());
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const payload = JSON.parse(base64UrlDecode(b));
    const now = Math.floor(Date.now() / 1000);
    if (!payload.exp || payload.exp <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createTokens(user) {
  const email = String(user.email || '').trim().toLowerCase();
  const isOwner = isOwnerEmail(email);
  const cleanUser = {
    sub: String(user.sub || email),
    email,
    name: String(user.name || email),
    picture: String(user.picture || ''),
    role: isOwner ? 'owner' : 'member',
    isOwner,
  };
  const accessToken = signJwt({ ...cleanUser, tokenType: 'access' }, getSecret('access'), ACCESS_TTL_SEC);
  const refreshToken = signJwt({ ...cleanUser, tokenType: 'refresh' }, getSecret('refresh'), REFRESH_TTL_SEC);
  return { accessToken, refreshToken, user: cleanUser, expiresIn: ACCESS_TTL_SEC };
}

export function verifyAccessToken(token) {
  const payload = verifyJwt(token, getSecret('access'));
  if (!payload || payload.tokenType !== 'access') return null;
  return payload;
}

export function verifyRefreshToken(token) {
  const payload = verifyJwt(token, getSecret('refresh'));
  if (!payload || payload.tokenType !== 'refresh') return null;
  return payload;
}

export function parseCookies(req) {
  const header = req.headers?.cookie || '';
  const out = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  });
  return out;
}

export function setRefreshCookie(res, refreshToken) {
  const isProd = process.env.NODE_ENV === 'production';
  const cookie = [
    `${REFRESH_COOKIE}=${encodeURIComponent(refreshToken)}`,
    'HttpOnly',
    'Path=/api/auth',
    `Max-Age=${REFRESH_TTL_SEC}`,
    'SameSite=Lax',
    ...(isProd ? ['Secure'] : []),
  ].join('; ');
  res.setHeader('Set-Cookie', cookie);
}

export function clearRefreshCookie(res) {
  const isProd = process.env.NODE_ENV === 'production';
  const cookie = [
    `${REFRESH_COOKIE}=`,
    'HttpOnly',
    'Path=/api/auth',
    'Max-Age=0',
    'SameSite=Lax',
    ...(isProd ? ['Secure'] : []),
  ].join('; ');
  res.setHeader('Set-Cookie', cookie);
}

export function getRefreshTokenFromReq(req) {
  const cookies = parseCookies(req);
  return cookies[REFRESH_COOKIE] || '';
}

export function requireAuth(req, res) {
  const authHeader = req.headers?.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match ? match[1].trim() : '';
  const user = verifyAccessToken(token);
  if (!user) {
    send(res, 401, { error: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập bằng Google.' });
    return null;
  }
  return user;
}

export function requireOwner(req, res) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (!isOwnerEmail(user.email)) {
    send(res, 403, { error: 'Chỉ chủ trang web mới có quyền thực hiện thao tác này.' });
    return null;
  }
  return user;
}
