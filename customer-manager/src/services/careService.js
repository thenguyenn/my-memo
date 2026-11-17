import { lastSixAM } from '../utils/careStore';

/**
 * Lưu trạng thái Care đơn trực tiếp trên trình duyệt của người dùng (localStorage),
 * tách biệt theo tài khoản (email) và tự động xóa các ghi chú trước 6:00 sáng hằng ngày.
 */
const KEY_PREFIX = 'care-orders-user-v1';
const MAX_HISTORY = 50;

function storageKey(userEmail) {
  const clean = String(userEmail || 'guest').trim().toLowerCase();
  return `${KEY_PREFIX}:${clean}`;
}

function loadStore(userEmail) {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey(userEmail)) || '{}') || {};
    const cutoff = lastSixAM().getTime();
    let changed = false;
    const out = {};
    for (const [code, rec] of Object.entries(raw)) {
      const ts = rec?.updatedAt ? new Date(rec.updatedAt).getTime() : 0;
      if (ts >= cutoff) {
        out[code] = rec;
      } else {
        changed = true;
      }
    }
    if (changed) {
      localStorage.setItem(storageKey(userEmail), JSON.stringify(out));
    }
    return out;
  } catch {
    return {};
  }
}

function writeStore(userEmail, map) {
  try {
    localStorage.setItem(storageKey(userEmail), JSON.stringify(map));
  } catch {
    // Bỏ qua nếu trình duyệt chặn storage
  }
}

export function lookupCare(codes, userEmail) {
  const store = loadStore(userEmail);
  const map = {};
  for (const c of codes || []) {
    if (store[c]) map[c] = store[c];
  }
  return map;
}

export function saveCare(codes, patch, { userEmail, userName } = {}) {
  const store = loadStore(userEmail);
  const now = new Date().toISOString();
  const entry = { at: now, by: userName || userEmail || '', ...patch };
  const out = {};

  for (const code of codes || []) {
    const cur = store[code] || {
      maVanDon: code,
      status: 'pending',
      assignee: '',
      result: '',
      note: '',
      history: [],
    };
    const next = {
      ...cur,
      ...patch,
      history: [...(cur.history || []), entry].slice(-MAX_HISTORY),
      updatedBy: userName || userEmail || '',
      updatedAt: now,
    };
    store[code] = next;
    out[code] = next;
  }

  writeStore(userEmail, store);
  return out;
}

export function purgeExpiredCareNotes(userEmail) {
  loadStore(userEmail);
}
