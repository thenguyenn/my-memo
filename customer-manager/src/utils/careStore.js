/**
 * Quản lý lịch sử các lần chạy của từng trang (Soát hàng, Báo cáo cuối ngày, Care đơn)
 * lưu trong IndexedDB của trình duyệt.
 * Mọi bản ghi tạo TRƯỚC mốc 6:00 sáng gần nhất sẽ bị xóa tự động.
 */

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

/**
 * Tạo kho lịch sử riêng theo tên DB (mỗi trang 1 DB độc lập, tự xóa lúc 6:00 sáng)
 */
export function createHistoryStore(dbName, storeName = 'runs') {
  function openDb() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('Trình duyệt không hỗ trợ lưu lịch sử.'));
        return;
      }
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(storeName)) {
          req.result.createObjectStore(storeName, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function tx(mode, fn) {
    return openDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const t = db.transaction(storeName, mode);
          const store = t.objectStore(storeName);
          let out;
          Promise.resolve(fn(store)).then((v) => {
            out = v;
          });
          t.oncomplete = () => {
            db.close();
            resolve(out);
          };
          t.onerror = () => {
            db.close();
            reject(t.error);
          };
          t.onabort = () => {
            db.close();
            reject(t.error);
          };
        })
    );
  }

  const reqP = (r) =>
    new Promise((res, rej) => {
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });

  async function purgeExpired() {
    const cutoff = lastSixAM().getTime();
    return tx('readwrite', async (store) => {
      const all = await reqP(store.getAll());
      all.filter((r) => r.createdAt < cutoff).forEach((r) => store.delete(r.id));
    });
  }

  async function saveRun(payload) {
    const rec = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: Date.now(),
      ...payload,
    };
    await tx('readwrite', (store) => {
      store.put(rec);
    });
    return rec.id;
  }

  async function listRuns() {
    const all = await tx('readonly', (store) => reqP(store.getAll()));
    return (all || [])
      .map(({ rows, dataset, ...meta }) => meta)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  const getRun = (id) => tx('readonly', (store) => reqP(store.get(id)));
  const deleteRun = (id) =>
    tx('readwrite', (store) => {
      store.delete(id);
    });
  const clearRuns = () =>
    tx('readwrite', (store) => {
      store.clear();
    });

  return {
    purgeExpired,
    saveRun,
    listRuns,
    getRun,
    deleteRun,
    clearRuns,
    lastSixAM,
    nextSixAM,
  };
}

// Kho lịch sử mặc định cho các trang
export const careHistory = createHistoryStore('care-don-history');
export const baoCaoHistory = createHistoryStore('bao-cao-cuoi-ngay-history');
export const chay24hHistory = createHistoryStore('chay-24h-history');
