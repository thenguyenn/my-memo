import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  computeAutoCareDetail,
  extractPlaceFromStatusText,
  isPureBranchCode,
  isSigned,
} from '../utils/careDonParser';
import {
  fmtTodayVN,
  isRowFromCurrentDay,
  parseChay24h,
} from '../utils/chay24hParser';
import { calcDaysFromNow } from '../utils/soatDonParser';
import { chay24hHistory, nextSixAM } from '../utils/careStore';
import { lookupCare, saveCare } from '../services/careService';
import { useVerification } from '../context/VerificationContext';
import { SoatHistoryModal } from '../components/SoatHistoryModal';
import { MultiSelect } from '../components/MultiSelect';

// ─── Hằng số ───────────────────────────────────────────────────────────────
const CARE_STATUS = {
  pending:    { label: 'Chưa xử lý', cls: 'sd-badge-yellow' },
  processing: { label: 'Đang xử lý', cls: 'sd-badge-blue' },
  done:       { label: 'Đã hoàn tất', cls: 'sd-badge-green' },
};

/** Chi tiết nhanh → trạng thái gợi ý + màu dòng */
const CARE_RESULTS = [
  { label: 'Đang Hoàn về', status: 'processing', tone: 'orange' },
  { label: 'Lên Phiếu', status: 'processing', tone: 'yellow' },
  { label: 'Đã tích phát lại', status: 'processing', tone: 'green' },
  { label: 'Không liên lạc được', status: 'processing', tone: 'green' },
  { label: 'Hẹn 1 ngày', status: 'processing', tone: 'green' },
  { label: 'Hẹn 2 ngày', status: 'processing', tone: 'green' },
  { label: 'Sai / đổi địa chỉ', status: 'processing', tone: 'yellow' },
  { label: 'Khách từ chối nhận', status: 'processing', tone: 'orange' },
  { label: 'Đã giao thành công', status: 'done', tone: 'green' },
];
const RESULT_BY_LABEL = new Map(CARE_RESULTS.map((r) => [r.label.toLowerCase(), r]));

const PAGE_SIZE = 50;

// ─── Biểu tượng sắp xếp ───────────────────────────────────────────────────
const SortIcon = ({ field, cur, dir }) => (
  <span className="sd-sort" aria-hidden="true">
    <i className={field === cur && dir === 'asc' ? 'on' : ''}>▲</i>
    <i className={field === cur && dir === 'desc' ? 'on' : ''}>▼</i>
  </span>
);

// ─── Helpers ───────────────────────────────────────────────────────────────
const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fmtMoney = (n) => (Number(n) || 0).toLocaleString('vi-VN');
const nk = (s) =>
  String(s ?? '')
    .replace(/đ/gi, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const getSortVal = (r, field) => {
  if (field === 'cod') return Number(r.cod) || 0;
  if (field === 'tenShipper') {
    const t = String(r._shipper ?? r.tenShipper ?? '').trim().toLowerCase();
    return t || null;
  }
  if (field === 'tenSanPham') {
    const t = String(r.tenSanPham ?? r.tenHang ?? '').trim().toLowerCase();
    return t || null;
  }
  if (field === '_displayDetail') {
    const t = String(r._displayDetail ?? '').trim().toLowerCase();
    return t || null;
  }
  const t = String(r[field] ?? '').trim().toLowerCase();
  return t || null;
};

function resolveRowTone(detailText, autoTone, careStatus) {
  const txt = String(detailText || '').trim().toLowerCase();
  if (txt) {
    const preset = RESULT_BY_LABEL.get(txt);
    if (preset) return preset.tone;
    if (txt.includes('hoàn') || txt.includes('hoan') || txt.includes('từ chối') || txt.includes('tu choi')) return 'orange';
    if (txt.includes('lên phiếu') || txt.includes('len phieu') || txt.includes('địa chỉ') || txt.includes('dia chi')) return 'yellow';
    return 'green';
  }
  if (autoTone) return autoTone;
  if (careStatus === 'done') return 'green';
  if (careStatus === 'processing') return 'yellow';
  return '';
}

function Badge({ meta }) {
  if (!meta) return <span>—</span>;
  return <span className={`sd-badge ${meta.cls}`}>{meta.label}</span>;
}

// ─── Cấu hình 6 cột chuẩn của bảng Chạy 24h ────────────────────────────────
const CHAY24H_COLS = [
  { key: 'maVanDon',       label: 'Mã vận đơn' },
  { key: 'tenShipper',     label: 'Tên người thao tác' },
  { key: 'tenSanPham',     label: 'Tên sản phẩm' },
  { key: 'cod',            label: 'COD', right: true },
  { key: 'trangThai',      label: 'Trạng thái' },
  { key: '_displayDetail', label: 'Chi tiết' },
];

// ─── Upload modal (2 file) ────────────────────────────────────────────────
function FileRow({ idx, title, desc, file, onSelect }) {
  const ref = useRef(null);
  return (
    <div
      className={`sd-file-row${file ? ' sd-file-row--done' : ''}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) onSelect(f);
      }}
    >
      <div className="sd-file-num sd-file-num--req">{idx}</div>
      <div className="sd-file-info">
        <div className="sd-file-title">{title}</div>
        <div className="sd-file-desc">{file ? <span className="sd-file-name">{file.name}</span> : desc}</div>
      </div>
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.xlsm,.xls,.csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files?.[0]) onSelect(e.target.files[0]);
          e.target.value = '';
        }}
      />
      <span className="bc-file-status">{file ? 'Đã chọn' : 'Chưa chọn'}</span>
      <button type="button" className="ghost sd-choose-btn" onClick={() => ref.current?.click()}>
        {file ? 'Đổi file' : 'Chọn file'}
      </button>
    </div>
  );
}

function UploadModal({ onClose, onDone }) {
  const [files, setFiles] = useState({ tonKho: null, trangThai: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const setF = (k) => (f) => setFiles((p) => ({ ...p, [k]: f }));
  const chosen = Object.values(files).filter(Boolean).length;

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const parsed = await parseChay24h(files.tonKho, files.trangThai);
      onDone({
        rows: parsed.rows,
        warnings: parsed.warnings,
        removedTodayCount: parsed.removedTodayCount,
        totalBeforeFilter: parsed.totalBeforeFilter,
        todayLabel: parsed.todayLabel,
        files: Object.values(files).filter(Boolean).map((f) => f.name),
        importedAt: Date.now(),
      });
    } catch (e) {
      setError(e.message || 'Không đọc được file Excel.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sd-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="sd-modal">
        <div className="sd-modal-head">
          <div>
            <p className="sd-modal-eyebrow">CHẠY 24H · DỮ LIỆU NGUỒN</p>
            <h2 className="sd-modal-title">Nhập 2 file Chạy 24h</h2>
            <p className="muted">
              Chọn file Giám sát tồn kho chi tiết và file Trạng thái MVĐ. Sau khi phân tích, hệ thống sẽ tự động xóa các dữ liệu của ngày hiện tại.
            </p>
          </div>
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>Đóng</button>
        </div>
        <div className="sd-modal-body">
          <div className="care-progress"><span style={{ width: `${(chosen / 2) * 100}%` }} /></div>
          <div className="sd-counter"><span className="sd-counter-val">{chosen}</span> / 2 file đã chọn</div>
          <FileRow
            idx="1"
            title="1. Giám sát tồn kho chi tiết"
            desc="MVĐ, Tên shipper (Nhân viên phát hàng), Thời gian hàng đến, Số ngày lưu trữ, Loại kiện vấn đề…"
            file={files.tonKho}
            onSelect={setF('tonKho')}
          />
          <FileRow
            idx="2"
            title="2. Trạng thái MVĐ"
            desc="MVĐ, Trạng thái hiện tại, Loại quét kiện cuối cùng, Tên người nhận, Tên sản phẩm, COD…"
            file={files.trangThai}
            onSelect={setF('trangThai')}
          />
          {error && <div className="notice error" style={{ marginTop: 12 }}>Lỗi: {error}</div>}
          <div className="sd-modal-note">
            Hỗ trợ Excel .xlsx, .xlsm, .xls, .csv. Hệ thống tự động đối chiếu theo MVĐ, <strong>tự động xóa các dữ liệu của ngày hiện tại ({fmtTodayVN()})</strong> và hiển thị 7 cột lên bảng.
          </div>
        </div>
        <div className="sd-modal-foot">
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>Hủy bỏ</button>
          <button type="button" className="primary" disabled={!chosen || busy} onClick={start}>
            {busy ? 'Đang phân tích…' : `✓ Phân tích & Chạy 24h (${chosen}/2 file)`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Ô "Chi tiết" (tự động hiển thị kết quả tính toán + bấm để sửa nhanh) ───
function ChiTietCell({ row, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(false);

  const displayText = row._displayDetail;

  const begin = (e) => {
    e.stopPropagation();
    setVal(displayText);
    setEditing(true);
  };

  const commit = async () => {
    const v = val.trim();
    if (v === displayText) {
      setEditing(false);
      return;
    }
    const preset = RESULT_BY_LABEL.get(v.toLowerCase());
    const patch = { result: v };
    if (preset) patch.status = preset.status;
    else if (v) patch.status = 'processing';
    setBusy(true);
    try {
      await onSave([row.maVanDon], patch);
      setEditing(false);
    } catch {
      /* notice hiển thị ở trang */
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <input
        autoFocus
        className="sd-input care-inline-input"
        list="chay24h-result-list"
        value={val}
        disabled={busy}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }

  return (
    <button
      type="button"
      className="care-chitiet"
      onClick={begin}
      title={displayText ? `${displayText} (Bấm để chỉnh sửa)` : 'Bấm để nhập chi tiết'}
    >
      {displayText ? (
        <span className="care-chitiet-val">{displayText}</span>
      ) : (
        <span className="care-chitiet-ph">+ Ghi chú</span>
      )}
    </button>
  );
}

// ─── Detail modal (khi bấm vào dòng) ──────────────────────────────────────
function Chay24hModal({ rows, care, shipperList, onClose, onSave }) {
  const single = rows.length === 1 ? rows[0] : null;
  const cur = single ? care[single.maVanDon] : null;
  const [status, setStatus] = useState(cur?.status || (single ? single._careStatus : ''));
  const [assignee, setAssignee] = useState(single ? (cur?.assignee || single._shipper || '') : '');
  const [result, setResult] = useState(single ? (cur?.result || single._displayDetail || '') : '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const pickResult = (r) => {
    setResult(r.label);
    if (r.status) setStatus(r.status);
  };

  const submit = async () => {
    const patch = {};
    if (status) patch.status = status;
    if (single || assignee.trim()) patch.assignee = assignee.trim();
    if (single || result.trim()) patch.result = result.trim();
    if (note.trim()) patch.note = note.trim();
    if (!Object.keys(patch).length) {
      setError('Chưa có nội dung cập nhật.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave(rows.map((r) => r.maVanDon), patch);
      onClose();
    } catch (e) {
      setError(e.message || 'Không lưu được.');
    } finally {
      setBusy(false);
    }
  };

  const history = [...(cur?.history || [])].reverse();
  const Info = ({ label, children }) => <div><span>{label}</span>{children || <strong>—</strong>}</div>;

  const thaoTacLabel = single
    ? single.loaiQuetCuoi || single.trangThai || single.loaiKienVanDe || ''
    : '';
  const thaoTacTime = single
    ? single.thoiGianThaoTac || single.thoiGianQuetDen || ''
    : '';

  return (
    <div className="sd-overlay" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="sd-modal care-modal">
        <div className="sd-modal-head">
          <div>
            <p className="sd-modal-eyebrow">CHẠY 24H · CHI TIẾT VẬN ĐƠN</p>
            <h2 className="sd-modal-title">{single ? single.maVanDon : `Cập nhật ${rows.length} vận đơn`}</h2>
            {single && (
              <p className="muted">
                {single._shipper ? `Shipper: ${single._shipper}` : ''}
                {single.tenNguoiNhan ? ` · Người nhận: ${single.tenNguoiNhan}` : ''}
                {single.tenSanPham ? ` · ${single.tenSanPham}` : ''}
              </p>
            )}
          </div>
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>Đóng</button>
        </div>

        <div className="sd-modal-body">
          {single && (
            <div className="care-info-grid">
              <Info label="Tên shipper">
                {single._shipper ? <strong>{single._shipper}</strong> : null}
              </Info>
              {/* <Info label="Tên người nhận">
                {single.tenNguoiNhan ? (
                  <>
                    <strong>{single.tenNguoiNhan}</strong>
                    {single.sdtNguoiNhan && <small> · {single.sdtNguoiNhan}</small>}
                  </>
                ) : null}
              </Info> */}
              <Info label="Tên sản phẩm">
                {single.tenSanPham ? <strong>{single.tenSanPham}</strong> : null}
              </Info>
              <Info label="COD">
                <strong>{fmtMoney(single.cod)}</strong>
              </Info>
              <Info label="Trạng thái">
                {single.trangThai ? <strong>{single.trangThai}</strong> : null}
              </Info>
              <Info label="Thao tác / Hàng đến">
                {(thaoTacLabel || thaoTacTime) ? (
                  <>
                    <strong>{thaoTacLabel || 'Cập nhật'}</strong>
                    {thaoTacTime && <small> ({thaoTacTime})</small>}
                  </>
                ) : null}
              </Info>
              {single.soNgayLuuKho !== null && single.soNgayLuuKho !== undefined && (
                <Info label="Số ngày lưu kho">
                  <strong>{single.soNgayLuuKho} ngày</strong>
                  {single.thoiGianQuetDen && <small> (Đến: {single.thoiGianQuetDen})</small>}
                </Info>
              )}
              {single.diaChi && <div className="care-info-wide"><span>Địa chỉ nhận</span><strong>{single.diaChi}</strong></div>}
              {single.loaiKienVanDe && <div className="care-info-wide"><span>Loại kiện vấn đề</span><strong>{single.loaiKienVanDe}</strong></div>}
            </div>
          )}

          <div className="care-field">
            <span>Chi tiết (Chọn nhanh hoặc tự nhập)</span>
            <div className="care-chips">
              {CARE_RESULTS.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  className={`care-chip${result === r.label ? ' care-chip--on' : ''}`}
                  onClick={() => pickResult(r)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <input
              className="sd-input"
              list="chay24h-result-list"
              value={result}
              placeholder="VD: Đang Hoàn về, Lên Phiếu, Đã tích phát lại, Không liên lạc được, Hẹn 2 ngày…"
              maxLength={200}
              onChange={(e) => setResult(e.target.value)}
            />
          </div>

          <div className="care-form-row">
            <label className="sd-filter-item">
              <span>Trạng thái xử lý</span>
              <select className="sd-input" value={status} onChange={(e) => setStatus(e.target.value)}>
                {!single && <option value="">— Giữ nguyên —</option>}
                {Object.entries(CARE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <label className="sd-filter-item">
              <span>Tên shipper</span>
              <input
                className="sd-input"
                list="chay24h-shipper-list"
                value={assignee}
                placeholder={single ? 'Tên shipper phụ trách' : '— Giữ nguyên —'}
                onChange={(e) => setAssignee(e.target.value)}
              />
            </label>
          </div>
          <datalist id="chay24h-shipper-list">{shipperList.map((s) => <option key={s} value={s} />)}</datalist>

          <label className="sd-filter-item care-field">
            <span>Nội dung ghi chú</span>
            <textarea
              className="sd-input care-textarea"
              rows={3}
              value={note}
              maxLength={2000}
              placeholder={cur?.note ? `Ghi chú gần nhất: ${cur.note}` : 'VD: Đã báo shipper phát lại trong ca chiều…'}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          {error && <div className="notice error">Lỗi: {error}</div>}

          {single && (
            <div className="care-field">
              <span>Lịch sử cập nhật ({history.length})</span>
              {history.length === 0 ? (
                <p className="muted care-empty-hist">Chưa có lịch sử cập nhật thủ công.</p>
              ) : (
                <ul className="care-history">
                  {history.map((h, i) => (
                    <li key={i}>
                      <div className="care-history-meta">{fmtDateTime(h.at)} · {h.by || '—'}</div>
                      <div>
                        {h.status && <Badge meta={CARE_STATUS[h.status]} />}{' '}
                        {h.result && <strong>{h.result}</strong>}
                        {h.assignee !== undefined && <span className="muted"> · Shipper: {h.assignee || '—'}</span>}
                      </div>
                      {h.note && <div className="care-history-note">{h.note}</div>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="sd-modal-foot">
          <button type="button" className="ghost" onClick={onClose} disabled={busy}>Hủy bỏ</button>
          <button type="button" className="primary" onClick={submit} disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu cập nhật'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Trang chính Chạy 24h ─────────────────────────────────────────────────
export function Chay24h() {
  const { user } = useVerification();
  const userEmail = user?.email || '';
  const [dataset, setDataset] = useState(null);
  const [care, setCare] = useState({});
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [runs, setRuns] = useState([]);
  const [editRows, setEditRows] = useState(null);
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(1);

  // Sắp xếp ở thead
  const [sortField, setSortField] = useState('tenShipper');
  const [sortDir, setSortDir] = useState('asc');

  // Bộ lọc
  const [fCode, setFCode] = useState('');
  const [fShipper, setFShipper] = useState([]);
  const [fTrangThai, setFTrangThai] = useState([]);
  const [fSearch, setFSearch] = useState('');
  const [showSigned, setShowSigned] = useState(false);

  const showNotice = useCallback((msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 5000);
  }, []);

  const refreshCare = useCallback((rows) => {
    const codes = (rows || []).map((r) => r.maVanDon);
    if (!codes.length) {
      setCare({});
      return;
    }
    setCare(lookupCare(codes, userEmail));
  }, [userEmail]);

  // ── Lịch sử Chạy 24h: tự động dọn dữ liệu cũ lúc 6:00 sáng ──
  const refreshRuns = useCallback(async () => {
    try {
      await chay24hHistory.purgeExpired();
      const list = await chay24hHistory.listRuns();
      const myRuns = userEmail ? list.filter((r) => !r.ownerEmail || r.ownerEmail === userEmail) : list;
      setRuns(myRuns);
      return myRuns;
    } catch {
      return [];
    }
  }, [userEmail]);

  useEffect(() => {
    let alive = true;
    let timer;

    const init = async () => {
      const list = await refreshRuns();
      if (!alive) return;
      if (list.length > 0) {
        const latest = await chay24hHistory.getRun(list[0].id).catch(() => null);
        if (alive && latest?.rows?.length) {
          setDataset(latest);
          refreshCare(latest.rows);
        }
      }
      if (alive) setLoading(false);
    };

    init();

    const schedule = () => {
      const wait = Math.max(1000, nextSixAM().getTime() - Date.now() + 1000);
      timer = setTimeout(async () => {
        await refreshRuns();
        setDataset((cur) => {
          if (cur && cur.createdAt && cur.createdAt < chay24hHistory.lastSixAM().getTime()) {
            return null;
          }
          return cur;
        });
        setCare({});
        schedule();
      }, wait);
    };
    schedule();

    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshRuns();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshRuns, refreshCare]);

  const handleImported = async (ds) => {
    setShowUpload(false);
    setPage(1);
    const needCareCount = ds.rows.filter((r) => !r._signed).length;
    const removedMsg = ds.removedTodayCount
      ? `Đã tự động xóa ${ds.removedTodayCount} đơn ngày hiện tại (${ds.todayLabel})`
      : `0 đơn ngày hiện tại (${ds.todayLabel})`;

    const runPayload = {
      ...ds,
      ownerEmail: userEmail,
      total: ds.rows.length,
      summaryTitle: `${ds.rows.length} đơn chạy 24h (${needCareCount} đơn cần xử lý)`,
      summaryMeta: `${removedMsg} · Đã ký nhận: ${ds.rows.length - needCareCount} đơn`,
    };
    try {
      const id = await chay24hHistory.saveRun(runPayload);
      const saved = await chay24hHistory.getRun(id);
      setDataset(saved || runPayload);
      await refreshRuns();
    } catch {
      setDataset(runPayload);
    }
    refreshCare(ds.rows);
    showNotice(`Đã phân tích ${ds.rows.length} đơn chạy 24h · ${removedMsg}`);
  };

  const openRun = async (id) => {
    try {
      const run = await chay24hHistory.getRun(id);
      if (!run) {
        showNotice('Lỗi: Bản ghi đã tự xóa hoặc không tồn tại');
        await refreshRuns();
        return;
      }
      setDataset(run);
      setShowHistory(false);
      setPage(1);
      refreshCare(run.rows || []);
      showNotice(`Đã mở lại lịch sử (${run.summaryTitle || `${run.total} vận đơn`})`);
    } catch (e) {
      showNotice(`Lỗi: ${e.message || 'Không mở được lịch sử'}`);
    }
  };

  const removeRun = async (id) => {
    try { await chay24hHistory.deleteRun(id); } catch { /* */ }
    await refreshRuns();
  };

  const removeAllRuns = async () => {
    if (!window.confirm('Xóa toàn bộ lịch sử Chạy 24h trên trình duyệt này?')) return;
    try { await chay24hHistory.clearRuns(); } catch { /* */ }
    await refreshRuns();
  };

  const handleReset = () => {
    setDataset(null);
    setCare({});
    setFCode('');
    setFShipper([]);
    setFTrangThai([]);
    setFSearch('');
    setShowSigned(false);
    setPage(1);
    showNotice('Đã làm mới màn hình hiện tại (có thể mở lại trong Lịch sử).');
  };

  const handleSave = async (codes, patch) => {
    const updatedMap = saveCare(codes, patch, {
      userEmail,
      userName: user?.name || userEmail,
    });
    setCare((prev) => ({ ...prev, ...updatedMap }));
    showNotice(`Đã lưu cập nhật cho ${codes.length} vận đơn`);
  };

  // Chuẩn hóa dữ liệu + tự động loại bỏ mọi bản ghi có ngày hàng đến trùng ngày hiện tại
  const allRows = useMemo(() => {
    if (!dataset?.rows) return [];
    const now = new Date();
    return dataset.rows
      .filter((r) => !isRowFromCurrentDay(r.thoiGianQuetDen, null, now))
      .map((r) => {
        const c = care[r.maVanDon];

        const rawTrangThai = String(r.trangThai || '').trim();
        const rawLoaiQuet = String(r.loaiQuetCuoi || '').trim();
        const isLongDesc = rawTrangThai.length > 35 || rawTrangThai.includes('【');
        const moTaTrangThai = r.moTaTrangThai || (isLongDesc ? rawTrangThai : '');
        const cleanTrangThai =
          isLongDesc && rawLoaiQuet && !rawLoaiQuet.includes('【')
            ? rawLoaiQuet
            : rawTrangThai;

        let cleanDangO = String(r.dangO || '').trim();
        if (isPureBranchCode(cleanDangO) && moTaTrangThai) {
          const extractedPlace = extractPlaceFromStatusText(moTaTrangThai);
          if (extractedPlace) cleanDangO = extractedPlace;
        }

        let cleanLoaiKienVD = r.loaiKienVanDe || '';
        if (!cleanLoaiKienVD && moTaTrangThai) {
          const mReason = moTaTrangThai.match(/Nguyên nhân\s*kiện vấn đề[^【]*【([^】]+)】/i);
          if (mReason) cleanLoaiKienVD = mReason[1].trim();
        }

        const signed = isSigned(
          moTaTrangThai || cleanTrangThai,
          r.xnKyNhan,
          rawLoaiQuet || cleanTrangThai,
          r.xnChuyenHoan
        );

        let soNgayLuuKho = r.soNgayLuuKho;
        const rawArrival = r.thoiGianQuetDen || '';
        if (rawArrival) {
          const d = calcDaysFromNow(rawArrival, now);
          if (d !== null) soNgayLuuKho = d;
        }

        const tenSanPham = r.tenSanPham || r.tenHang || '';
        const tenShipper = r.tenShipper || r.nguoiThaoTac || '';

        const normalizedRow = {
          ...r,
          tenShipper,
          tenSanPham,
          tenHang: tenSanPham,
          trangThai: cleanTrangThai,
          moTaTrangThai,
          dangO: cleanDangO,
          loaiKienVanDe: cleanLoaiKienVD,
          thoiGianQuetDen: rawArrival,
          soNgayLuuKho,
          _signed: signed,
        };

        const recomputed = computeAutoCareDetail(normalizedRow);
        const cleanAutoDetail = recomputed.detail;
        const cleanAutoTone = recomputed.tone;
        const cleanAutoStatus = recomputed.autoStatus;

        const displayDetail = c?.result !== undefined && c?.result !== '' ? c.result : cleanAutoDetail;
        const careStatus = c?.status || cleanAutoStatus;
        const tone = resolveRowTone(displayDetail, cleanAutoTone, careStatus);

        return {
          ...normalizedRow,
          _shipper: c?.assignee || tenShipper,
          _careStatus: careStatus,
          _displayDetail: displayDetail,
          _careNote: c?.note || '',
          _updatedAt: c?.updatedAt || '',
          _updatedBy: c?.updatedBy || '',
          _tone: tone,
        };
      });
  }, [dataset, care]);

  const unsignedRows = useMemo(() => allRows.filter((r) => !r._signed), [allRows]);
  const signedRows = useMemo(() => allRows.filter((r) => r._signed), [allRows]);
  const signedCount = signedRows.length;

  const safeTrangThai = useMemo(() => (Array.isArray(fTrangThai) ? fTrangThai : []), [fTrangThai]);
  const safeShipper = useMemo(() => (Array.isArray(fShipper) ? fShipper : []), [fShipper]);

  const hasSignedStatusFilter = useMemo(
    () => safeTrangThai.some((st) => nk(st).includes('kynhan') || nk(st).includes('daduocky')),
    [safeTrangThai]
  );

  // Danh sách nguồn theo chế độ lọc
  const activeRows = useMemo(() => {
    if (showSigned) return signedRows;
    if (hasSignedStatusFilter) return allRows;
    return unsignedRows;
  }, [allRows, unsignedRows, signedRows, showSigned, hasSignedStatusFilter]);

  const shipperList = useMemo(
    () => [...new Set(allRows.map((r) => r._shipper).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')),
    [allRows]
  );

  const shipperOptions = useMemo(() => {
    const s = new Set();
    const base = showSigned ? signedRows : allRows;
    base.forEach((r) => {
      const v = String(r._shipper || '').trim() || '(Trống)';
      s.add(v);
    });
    const arr = [...s].filter((x) => x !== '(Trống)').sort((a, b) => a.localeCompare(b, 'vi'));
    if (s.has('(Trống)')) arr.push('(Trống)');
    return arr;
  }, [allRows, signedRows, showSigned]);

  const trangThaiOptions = useMemo(() => {
    const s = new Set();
    const base = showSigned ? signedRows : allRows;
    base.forEach((r) => {
      const k = String(r.trangThai || '').trim() || '(Trống)';
      s.add(k);
    });
    const arr = [...s].filter((x) => x !== '(Trống)').sort((a, b) => a.localeCompare(b, 'vi'));
    if (s.has('(Trống)')) arr.push('(Trống)');
    return arr;
  }, [allRows, signedRows, showSigned]);

  const filtered = useMemo(() => {
    const codes = fCode.split(/[\s,;]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
    const kw = nk(fSearch);
    return activeRows.filter((r) => {
      if (codes.length && !codes.some((c) => r.maVanDon.includes(c))) return false;
      if (safeTrangThai.length) {
        const st = String(r.trangThai || '').trim() || '(Trống)';
        if (!safeTrangThai.includes(st)) return false;
      }
      if (safeShipper.length) {
        const sh = String(r._shipper || '').trim() || '(Trống)';
        if (!safeShipper.includes(sh)) return false;
      }
      if (
        kw &&
        ![r.maVanDon, r._shipper, r.tenSanPham, r._displayDetail, r.trangThai]
          .some((v) => nk(v).includes(kw))
      ) {
        return false;
      }
      return true;
    });
  }, [activeRows, fCode, safeTrangThai, safeShipper, fSearch]);

  // Sắp xếp theo cột ở thead (ô trống luôn nằm cuối)
  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = getSortVal(a, sortField);
      const bv = getSortVal(b, sortField);
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv), 'vi');
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sortField, sortDir]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
    setPage(1);
  };

  useEffect(() => { setPage(1); }, [fCode, fShipper, fTrangThai, fSearch, showSigned]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const resetFilters = () => {
    setFCode('');
    setFShipper([]);
    setFTrangThai([]);
    setFSearch('');
    setShowSigned(false);
  };

  // Xuất đúng 6 cột chuẩn theo thứ tự đang lọc & sắp xếp
  const exportExcel = () => {
    if (!sorted.length) {
      showNotice('Lỗi: Không có dữ liệu để xuất');
      return;
    }
    const aoa = [
      [
        'MVĐ',
        'Tên shipper',
        'Tên sản phẩm',
        'COD',
        'Trạng thái',
        'Chi tiết',
      ],
      ...sorted.map((r) => [
        r.maVanDon,
        r._shipper,
        r.tenSanPham,
        r.cod,
        r.trangThai,
        r._displayDetail,
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [16, 20, 22, 14, 18, 24].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Chay 24h');
    const d = new Date();
    XLSX.writeFile(
      wb,
      `Chay24h_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.xlsx`
    );
    showNotice(`Đã xuất ${sorted.length} vận đơn Chạy 24h ra Excel`);
  };

  const hasData = !!dataset?.rows?.length;

  return (
    <main className="app-shell app-shell--wide">
      {/* Header */}
      <section className="page-heading">
        <div>
          <p className="eyebrow">CHẠY 24H</p>
          <h1>Giám sát chạy 24h</h1>
          <p className="muted">
            Đối chiếu Giám sát tồn kho chi tiết &amp; Trạng thái MVĐ — Tự động xóa dữ liệu của ngày hiện tại
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className={`bc-status-pill ${hasData ? 'bc-status-pill--ok' : ''}`}>
            {hasData
              ? `Đã kết nối · ${unsignedRows.length} đơn 24h cần xử lý${dataset?.removedTodayCount ? ` · Đã xóa ${dataset.removedTodayCount} đơn hôm nay` : ''}`
              : 'Chưa có dữ liệu module'}
          </span>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              refreshRuns();
              setShowHistory(true);
            }}
          >
            Lịch sử 24h{runs.length ? ` (${runs.length})` : ''}
          </button>
          <button type="button" className="ghost" onClick={exportExcel} disabled={!hasData}>
            Xuất file
          </button>
          <button type="button" className="primary" onClick={() => setShowUpload(true)}>
            + Up file
          </button>
          <button type="button" className="ghost" onClick={handleReset} disabled={!hasData}>
            Làm mới
          </button>
        </div>
      </section>

      {notice && <div className={`notice ${notice.startsWith('Lỗi') ? 'error' : 'success'}`}>{notice}</div>}
      {dataset?.warnings?.length > 0 && (
        <div className="sd-hint-warn" style={{ marginBottom: 12 }}>{dataset.warnings.join(' · ')}</div>
      )}

      {/* Bộ lọc và điều kiện */}
      <section className="panel sd-filter-panel">
        <div className="care-filter-head">
          <h2 className="panel-title" style={{ marginBottom: 0 }}>Bộ lọc và điều kiện</h2>
          <label className="care-toggle">
            <input
              type="checkbox"
              checked={showSigned}
              onChange={(e) => setShowSigned(e.target.checked)}
            />
            Chỉ hiện đơn đã ký nhận{hasData ? ` (${signedCount})` : ''}
          </label>
        </div>

        <div className="sd-filter-grid care-filter-grid chay24h-filter-grid">
          <div className="sd-filter-item">
            <span>MVĐ</span>
            <input
              className="sd-input"
              placeholder="Nhập hoặc dán mã vận đơn…"
              value={fCode}
              onChange={(e) => setFCode(e.target.value)}
            />
          </div>
          <div className="sd-filter-item">
            <span>Tên shipper</span>
            <MultiSelect
              options={shipperOptions}
              value={safeShipper}
              onChange={setFShipper}
              placeholder="Tất cả shipper"
            />
          </div>
          <div className="sd-filter-item">
            <span>Trạng thái vận đơn</span>
            <MultiSelect
              options={trangThaiOptions}
              value={safeTrangThai}
              onChange={setFTrangThai}
              placeholder="Tất cả trạng thái"
            />
          </div>
          <div className="sd-filter-item">
            <span>Tìm nhanh</span>
            <input
              className="sd-input"
              placeholder="Shipper, sản phẩm, trạng thái, chi tiết…"
              value={fSearch}
              onChange={(e) => setFSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="care-filter-foot">
          <button type="button" className="primary" onClick={() => setPage(1)}>
            Thực hiện
          </button>
          <button type="button" className="ghost" onClick={exportExcel} disabled={!hasData}>
            Xuất Excel
          </button>
          <button type="button" className="ghost" onClick={resetFilters}>
            Xóa lọc
          </button>
        </div>
      </section>

      {/* Bảng dữ liệu chính: 6 cột chuẩn + sắp xếp ở thead */}
      <section className="panel table-panel">
        <div className="table-toolbar">
          <h2>Danh sách vận đơn chạy 24h</h2>
          <span className="muted">
            {hasData ? `Hiển thị ${sorted.length} / ${activeRows.length} vận đơn` : 'Chưa có dữ liệu'}
          </span>
        </div>

        <datalist id="chay24h-result-list">{CARE_RESULTS.map((r) => <option key={r.label} value={r.label} />)}</datalist>

        <div className="sd-table-scroll">
          <table className="sd-table care-sheet-table chay24h-table">
            <thead>
              <tr>
                {CHAY24H_COLS.map((c) => (
                  <th
                    key={c.key}
                    className={`sd-th-sort${c.right ? ' care-th-num' : ''}${c.center ? ' sd-center' : ''}`}
                    onClick={() => handleSort(c.key)}
                  >
                    <span className="sd-th-inner">
                      {c.label}
                      <SortIcon field={c.key} cur={sortField} dir={sortDir} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr
                  key={r.maVanDon}
                  className={`sd-row care-sheet-row${r._tone ? ` care-tone-${r._tone}` : ''}`}
                  onClick={() => setEditRows([r])}
                  title="Bấm vào dòng để mở chi tiết vận đơn Chạy 24h"
                >
                  <td className="care-col-code">{r.maVanDon}</td>
                  <td className="care-col-cust" title={r._shipper}>{r._shipper || '—'}</td>
                  <td title={r.tenSanPham}>{r.tenSanPham || '—'}</td>
                  <td className="care-col-cod">{fmtMoney(r.cod)}</td>
                  <td
                    className="care-col-status"
                    title={[
                      r.moTaTrangThai,
                      r.thoiGianQuetDen ? `Hàng đến: ${r.thoiGianQuetDen}` : '',
                      r.thoiGianThaoTac ? `Thao tác: ${r.thoiGianThaoTac}` : '',
                    ].filter(Boolean).join(' · ')}
                  >
                    {r.trangThai || '—'}
                  </td>
                  <td className="care-col-detail" onClick={(e) => e.stopPropagation()}>
                    <ChiTietCell row={r} onSave={handleSave} />
                  </td>
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr className="sd-row">
                  <td colSpan={CHAY24H_COLS.length} className="sd-none">
                    {loading
                      ? 'Đang tải dữ liệu…'
                      : !hasData
                        ? <>Chưa có dữ liệu. Nhấn <strong>+ Up file</strong> để chọn 2 file (Giám sát tồn kho chi tiết &amp; Trạng thái MVĐ) hoặc mở từ <strong>Lịch sử 24h</strong>.</>
                        : activeRows.length === 0
                          ? 'Tất cả vận đơn 24h đã ký nhận — không còn đơn tồn cần xử lý.'
                          : 'Không có vận đơn nào khớp bộ lọc.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="sd-pagination">
            <span className="sd-page-info">
              {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, sorted.length)} / {sorted.length}
            </span>
            <button type="button" className="sd-page-btn" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
              .map((p) => (
                <button
                  type="button"
                  key={p}
                  className={`sd-page-btn${p === safePage ? ' sd-page-btn--active' : ''}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ))}
            <button type="button" className="sd-page-btn" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>›</button>
          </div>
        )}

        <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
          Hệ thống tự động đối chiếu MVĐ giữa file <strong>Giám sát tồn kho chi tiết</strong> và <strong>Trạng thái MVĐ</strong>, tự động xóa toàn bộ dữ liệu của ngày hiện tại ({fmtTodayVN()}) và tự suy luận cột <strong>Chi tiết</strong>.
          Bấm vào tiêu đề cột để sắp xếp; bấm vào ô <strong>Chi tiết</strong> để sửa nhanh hoặc bấm vào dòng bất kỳ để mở hộp thoại cập nhật.
        </p>
      </section>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onDone={handleImported} />}
      {showHistory && (
        <SoatHistoryModal
          runs={runs}
          eyebrow="LỊCH SỬ CHẠY 24H"
          title="Các lần phân tích Chạy 24h gần đây"
          emptyText="Chưa có lịch sử Chạy 24h. Mỗi lần tải và phân tích 2 file sẽ được lưu lại ở đây và tự xóa lúc 6:00 sáng."
          onClose={() => setShowHistory(false)}
          onOpen={openRun}
          onDelete={removeRun}
          onClear={removeAllRuns}
        />
      )}
      {editRows && (
        <Chay24hModal rows={editRows} care={care} shipperList={shipperList} onClose={() => setEditRows(null)} onSave={handleSave} />
      )}
    </main>
  );
}
