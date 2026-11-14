import React, { useMemo, useRef, useState } from 'react';
import { api } from '../services/api';
import { parseJtFile, parseJtText, buildParcels } from '../utils/jtParser';

const FIELDS = [
  { key: 'waybill', label: 'Mã vận đơn', required: true },
  { key: 'stock', label: 'Thời gian bắt đầu tồn (ngày đến / quét cuối)', required: true },
  { key: 'shipper', label: 'Tên shipper (nhân viên giao)' },
  { key: 'shipperPhone', label: 'SĐT shipper' },
  { key: 'days', label: 'Số ngày tồn (dùng khi file không có cột ngày)' },
  { key: 'status', label: 'Trạng thái' },
];

export function JtImport({ onDone, onClose }) {
  const [table, setTable] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [pasteText, setPasteText] = useState('');
  const [snapshot, setSnapshot] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const built = useMemo(() => (table && mapping ? buildParcels(table, mapping) : null), [table, mapping]);

  const load = (t) => {
    setTable(t);
    setMapping(t.mapping);
    setError('');
  };

  const onFile = async (file) => {
    if (!file) return;
    try {
      load(await parseJtFile(file));
    } catch (e) {
      setTable(null);
      setError(e.message);
    }
  };

  const onPaste = () => {
    try {
      load(parseJtText(pasteText));
    } catch (e) {
      setTable(null);
      setError(e.message);
    }
  };

  const submit = async () => {
    if (!built?.rows.length) return;
    const msg = snapshot
      ? `Import ${built.rows.length} đơn.\n\nCác đơn đang tồn trong hệ thống mà KHÔNG có trong file này sẽ được đánh dấu là đã hết tồn. Tiếp tục?`
      : `Import ${built.rows.length} đơn (chỉ thêm/cập nhật, không đóng đơn nào). Tiếp tục?`;
    if (!window.confirm(msg)) return;
    setBusy(true);
    setError('');
    try {
      const r = await api.jtImport(built.rows, snapshot);
      onDone(r);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const setCol = (key, value) => setMapping((m) => ({ ...m, [key]: Number(value) }));

  const ready = built && built.rows.length > 0;

  return (
    <section className="panel form-panel">
      <div className="panel-title">
        <h2>Cập nhật dữ liệu tồn từ J&amp;T</h2>
        <button className="ghost" onClick={onClose}>Đóng</button>
      </div>
      <p className="muted">
        Xuất danh sách <strong>đơn tồn / chưa giao</strong> từ hệ thống J&amp;T (file Excel hoặc CSV), rồi tải lên đây.
        Hoặc copy bảng trên web J&amp;T và dán vào ô bên dưới.
      </p>
      <div className="jt-import-grid">
        <div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <button className="ghost" onClick={() => fileRef.current?.click()}>📁 Chọn file Excel / CSV</button>
        </div>
        <div className="jt-paste">
          <textarea
            rows={3}
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="…hoặc dán bảng đã copy từ web J&T (gồm cả dòng tiêu đề)"
          />
          <button className="ghost" onClick={onPaste} disabled={!pasteText.trim()}>Phân tích dữ liệu dán</button>
        </div>
      </div>
      {error && <div className="notice error" style={{ marginTop: 16 }}>❌ {error}</div>}
      {table && mapping && (
        <div className="jt-mapping">
          <h3>Kiểm tra cột dữ liệu</h3>
          <div className="jt-mapping-grid">
            {FIELDS.map((f) => (
              <label key={f.key}>
                <span>{f.label}{f.required && ' *'}</span>
                <select value={mapping[f.key]} onChange={(e) => setCol(f.key, e.target.value)}>
                  <option value={-1}>— Không dùng —</option>
                  {table.headers.map((h, i) => (
                    <option key={i} value={i}>{h || `(Cột ${i + 1})`}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className={ready ? 'jt-ok' : 'jt-bad'}>
            {ready
              ? `✅ Đọc được ${built.rows.length} đơn hợp lệ${built.skipped ? `, bỏ qua ${built.skipped} dòng thiếu mã vận đơn hoặc ngày` : ''}.`
              : '⚠ Chưa đọc được đơn nào. Hãy chọn đúng cột Mã vận đơn và cột Thời gian (hoặc Số ngày tồn).'}
          </p>
          {ready && (
            <div className="table-scroll">
              <table style={{ minWidth: 520 }}>
                <thead>
                  <tr><th>Mã vận đơn</th><th>Shipper</th><th>Bắt đầu tồn</th></tr>
                </thead>
                <tbody>
                  {built.rows.slice(0, 3).map((r) => (
                    <tr key={r.waybill}>
                      <td>{r.waybill}</td>
                      <td>{r.shipper_name || '—'}</td>
                      <td>{new Date(r.stock_since).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <label className="jt-check">
            <input type="checkbox" checked={snapshot} onChange={(e) => setSnapshot(e.target.checked)} />
            <span>File này là <strong>toàn bộ</strong> danh sách tồn hiện tại (tự đóng các đơn không còn trong file)</span>
          </label>
          <div className="form-actions">
            <button className="primary" disabled={!ready || busy} onClick={submit}>
              {busy ? 'Đang import…' : `Import ${ready ? built.rows.length : ''} đơn`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
