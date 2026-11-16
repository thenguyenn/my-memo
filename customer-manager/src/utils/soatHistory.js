/**
 * Lịch sử soát hàng — lưu trong IndexedDB của trình duyệt (không gửi lên server).
 * Mọi bản ghi tạo TRƯỚC mốc 6:00 sáng gần nhất sẽ bị xóa tự động.
 */
const DB_NAME = 'soat-hang-history';
const STORE = 'runs';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('Trình duyệt không hỗ trợ lưu lịch sử.')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    let out;
    Promise.resolve(fn(store)).then((v) => { out = v; });
    t.oncomplete = () => { db.close(); resolve(out); };
    t.onerror = () => { db.close(); reject(t.error); };
    t.onabort = () => { db.close(); reject(t.error); };
  }));
}

const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

/** Mốc 6:00 sáng gần nhất trong quá khứ (hoặc đúng hiện tại) */
export function lastSixAM(now = new Date()) {
  const d = new Date(now);
  d.setHours(6, 0, 0, 0);
  if (now < d) d.setDate(d.getDate() - 1);
  return d;
}

/** Mốc 6:00 sáng kế tiếp sau thời điểm `from` — lúc bản ghi tạo ở `from` sẽ bị xóa */
export function nextSixAM(from = new Date()) {
  const d = new Date(from);
  d.setHours(6, 0, 0, 0);
  if (d <= from) d.setDate(d.getDate() + 1);
  return d;
}

export async function purgeExpired() {
  const cutoff = lastSixAM().getTime();
  return tx('readwrite', async (store) => {
    const all = await reqP(store.getAll());
    all.filter((r) => r.createdAt < cutoff).forEach((r) => store.delete(r.id));
  });
}

export async function saveRun({ rows, stats, warnings, files }) {
  const rec = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
    total: rows.length,
    files: files || [],
    stats,
    warnings: warnings || [],
    rows,
  };
  await tx('readwrite', (store) => { store.put(rec); });
  return rec.id;
}

/** Danh sách (không kèm rows để nhẹ), mới nhất trước */
export async function listRuns() {
  const all = await tx('readonly', (store) => reqP(store.getAll()));
  return (all || [])
    .map(({ rows, ...meta }) => meta)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export const getRun = (id) => tx('readonly', (store) => reqP(store.get(id)));
export const deleteRun = (id) => tx('readwrite', (store) => { store.delete(id); });
export const clearRuns = () => tx('readwrite', (store) => { store.clear(); });
