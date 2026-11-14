import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useJt } from '../hooks/useJt';
import { Pagination } from '../components/Pagination';
import { JtImport } from '../components/JtImport';

const SHIPPER_PAGE_SIZE = 10;
const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false }) : '—';

function DaysBadge({ days, thresholds }) {
  const level = days >= thresholds.danger ? 'danger' : days >= thresholds.warn ? 'warn' : 'ok';
  return <span className={`days-badge ${level}`}>{days} ngày</span>;
}

function buildMessage(shipper, parcels) {
  const lines = parcels.map((p) => `• ${p.waybill} (${p.days_in_stock} ngày)`);
  return (
    `Chào ${shipper}, các đơn đang tồn cần xử lý:\n${lines.join('\n')}\n\n` +
    'Vui lòng giao hoặc mang hàng về kho trong hôm nay để tránh vào backlog SLA. Cảm ơn!'
  );
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

function ShipperRow({ s, minDays, thresholds, onCopied }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchParcels = async () => {
    const r = await api.jtParcels({ shipper: s.shipper_name, minDays: String(minDays), limit: '500' });
    return r.data || [];
  };

  const toggle = async () => {
    if (open) return setOpen(false);
    setOpen(true);
    setLoading(true);
    try { setItems(await fetchParcels()); } catch { setItems([]); } finally { setLoading(false); }
  };

  const copy = async () => {
    try {
      const list = items ?? (await fetchParcels());
      await copyText(buildMessage(s.shipper_name, list));
      onCopied(`✅ Đã copy tin nhắn cho ${s.shipper_name} (${list.length} đơn)`);
    } catch (e) {
      onCopied('❌ ' + e.message);
    }
  };

  return (
    <>
      <tr className="customer-row">
        <td><strong>{s.shipper_name}</strong></td>
        <td>{s.shipper_phone || '—'}</td>
        <td><strong>{s.total}</strong></td>
        <td><DaysBadge days={s.max_days} thresholds={thresholds} /></td>
        <td className="td-actions">
          <div className="row-actions">
            <button className="edit" onClick={toggle}>{open ? 'Ẩn đơn' : 'Xem đơn'}</button>
            <button className="edit" onClick={copy}>📋 Copy tin nhắn</button>
          </div>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan="5" className="jt-expand">
            {loading ? 'Đang tải…' : (
              <div className="jt-chips">
                {items.map((p) => (
                  <span key={p.waybill} className="jt-chip">
                    {p.waybill} <DaysBadge days={p.days_in_stock} thresholds={thresholds} />
                  </span>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export function JtCheck() {
  const jt = useJt();
  const [showImport, setShowImport] = useState(false);
  const [notice, setNotice] = useState('');
  const [shipperPage, setShipperPage] = useState(1);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(''), 4000);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => setShipperPage(1), [jt.minDays]);

  const thresholds = jt.summary?.thresholds || { warn: 2, danger: 3 };
  const stats = jt.summary?.stats;
  const shippers = jt.summary?.shippers || [];
  const shipperPages = Math.max(1, Math.ceil(shippers.length / SHIPPER_PAGE_SIZE));
  const shipperSlice = shippers.slice((shipperPage - 1) * SHIPPER_PAGE_SIZE, shipperPage * SHIPPER_PAGE_SIZE);

  const handleImported = async (r) => {
    setShowImport(false);
    setNotice(`✅ Đã import ${r.imported} đơn${r.resolved ? `, đóng ${r.resolved} đơn đã hết tồn` : ''}${r.skipped ? `, bỏ qua ${r.skipped}` : ''}`);
    await jt.reload();
  };

  return (
    <main className="app-shell">
      <section className="page-heading">
        <div>
          <p className="eyebrow">SOÁT TỒN KHO</p>
          <h1>Soát hàng J&amp;T</h1>
          {/* <p className="muted">
            Đơn tồn theo shipper để báo mang hàng về kho trước khi vào backlog SLA.
            {jt.summary?.lastImportedAt && ` Cập nhật lần cuối: ${fmtDate(jt.summary.lastImportedAt)}.`}
          </p> */}
        </div>
        <div>
          <button className="ghost" onClick={jt.reload} disabled={jt.summaryLoading}>↻ Tải lại</button>
          <button className="primary" onClick={() => setShowImport(true)}>📥 Cập nhật dữ liệu J&amp;T</button>
        </div>
      </section>

      {notice && <div className={`notice ${notice.includes('❌') ? 'error' : 'success'}`}>{notice}</div>}
      {jt.error && <div className="notice error">❌ {jt.error}</div>}

      {showImport && <JtImport onDone={handleImported} onClose={() => setShowImport(false)} />}

      <section className="jt-stats">
        <div className="jt-stat"><span>Đơn đang tồn</span><strong>{stats?.total ?? '—'}</strong></div>
        <div className="jt-stat warn"><span>Từ {thresholds.warn} ngày</span><strong>{stats?.warn ?? '—'}</strong></div>
        <div className="jt-stat danger"><span>Từ {thresholds.danger} ngày (cần báo ngay)</span><strong>{stats?.danger ?? '—'}</strong></div>
      </section>

      <section className="panel table-panel">
        <div className="table-toolbar">
          <div className="jt-tabs">
            <button className={jt.view === 'shippers' ? 'active' : ''} onClick={() => jt.setView('shippers')}>Theo shipper</button>
            <button className={jt.view === 'parcels' ? 'active' : ''} onClick={() => jt.setView('parcels')}>Theo vận đơn</button>
          </div>
          <div className="jt-filters">
            <select className="page-limit-select" value={jt.minDays} onChange={(e) => jt.changeMinDays(Number(e.target.value))}>
              <option value={0}>Tất cả đơn tồn</option>
              <option value={1}>Tồn từ 1 ngày</option>
              <option value={2}>Tồn từ 2 ngày</option>
              <option value={3}>Tồn từ 3 ngày</option>
              <option value={5}>Tồn từ 5 ngày</option>
            </select>
            {jt.view === 'parcels' && (
              <div className="search">
                <span>⌕</span>
                <input value={jt.search} onChange={(e) => jt.setSearch(e.target.value)} placeholder="Mã vận đơn hoặc tên shipper…" />
              </div>
            )}
          </div>
        </div>

        {jt.view === 'shippers' ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>SHIPPER</th><th>SĐT</th><th>SỐ ĐƠN TỒN</th><th>TỒN LÂU NHẤT</th><th className="th-actions">THAO TÁC</th>
                  </tr>
                </thead>
                <tbody>
                  {jt.summaryLoading && !jt.summary ? (
                    <tr><td colSpan="5" className="empty">Đang tải dữ liệu…</td></tr>
                  ) : shipperSlice.length === 0 ? (
                    <tr><td colSpan="5" className="empty">Không có đơn tồn nào theo bộ lọc này.</td></tr>
                  ) : (
                    shipperSlice.map((s) => (
                      <ShipperRow key={s.shipper_name + jt.minDays} s={s} minDays={jt.minDays} thresholds={thresholds} onCopied={setNotice} />
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              page={shipperPage} totalPages={shipperPages} count={shippers.length} limit={SHIPPER_PAGE_SIZE}
              loading={jt.summaryLoading} onPageChange={setShipperPage} unit="shipper" options={[SHIPPER_PAGE_SIZE]} onLimitChange={() => {}}
            />
          </>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>MÃ VẬN ĐƠN</th><th>SỐ NGÀY TỒN</th><th>SHIPPER</th><th>TRẠNG THÁI</th><th>BẮT ĐẦU TỒN</th>
                  </tr>
                </thead>
                <tbody>
                  {jt.parcelsLoading ? (
                    <tr><td colSpan="5" className="empty">Đang tải dữ liệu…</td></tr>
                  ) : jt.parcels.length === 0 ? (
                    <tr><td colSpan="5" className="empty">Không có đơn nào phù hợp.</td></tr>
                  ) : (
                    jt.parcels.map((p) => (
                      <tr key={p.waybill} className="customer-row">
                        <td><strong>{p.waybill}</strong></td>
                        <td><DaysBadge days={p.days_in_stock} thresholds={thresholds} /></td>
                        <td>{p.shipper_name}</td>
                        <td>{p.status || '—'}</td>
                        <td>{fmtDate(p.stock_since)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              page={jt.page} totalPages={jt.totalPages} count={jt.count} limit={jt.limit}
              loading={jt.parcelsLoading} onPageChange={jt.setPage} onLimitChange={jt.changeLimit}
              unit="đơn" options={[10, 20, 50]}
            />
          </>
        )}
      </section>
    </main>
  );
}
