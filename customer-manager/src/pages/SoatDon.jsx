import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calcDaysFromNow, parseSoatDon } from '../utils/soatDonParser';
import * as XLSX from 'xlsx';
import { MultiSelect } from '../components/MultiSelect';
import { SoatHistoryModal } from '../components/SoatHistoryModal';
import { clearRuns, deleteRun, getRun, listRuns, nextSixAM, purgeExpired, saveRun } from '../utils/soatHistory';

// ─── helpers ───────────────────────────────────────────────────────────────
const SortIcon = ({ field, cur, dir }) => (
  <span className="sd-sort" aria-hidden="true">
    <i className={field === cur && dir === 'asc' ? 'on' : ''}>▲</i>
    <i className={field === cur && dir === 'desc' ? 'on' : ''}>▼</i>
  </span>
);

const STATUS_META = {
  delivered:   { label: 'Đã ký nhận',       cls: 'sd-badge-green'  },
  refused:     { label: 'Từ chối',           cls: 'sd-badge-red'    },
  returning:   { label: 'Chuyển hoàn',       cls: 'sd-badge-blue'   },
  delivering:  { label: 'Đang phát',         cls: 'sd-badge-orange' },
  arrived:     { label: 'Hàng đến',          cls: 'sd-badge-teal'   },
  rescheduled: { label: 'Hẹn lại',           cls: 'sd-badge-purple' },
  nocontact:   { label: 'Không liên lạc',    cls: 'sd-badge-yellow' },
  other:       { label: '—',                 cls: ''                },
};

function StatusBadge({ code }) {
  const m = STATUS_META[code] || STATUS_META.other;
  if (!m.cls) return <span>—</span>;
  return <span className={`sd-badge ${m.cls}`}>{m.label}</span>;
}

// ─── Upload row component ───────────────────────────────────────────────────
function FileRow({ idx, label, desc, required, file, onSelect }) {
  const ref = useRef(null);
  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) onSelect(f);
  };
  return (
    <div
      className={`sd-file-row${file ? ' sd-file-row--done' : ''}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className={`sd-file-num ${required ? 'sd-file-num--req' : 'sd-file-num--opt'}`}>{idx}</div>
      <div className="sd-file-info">
        <div className="sd-file-title">
          {label}&nbsp;
          <span className={required ? 'sd-tag-req' : 'sd-tag-opt'}>
            {required ? 'Bắt buộc' : 'Chưa có logic'}
          </span>
        </div>
        <div className="sd-file-desc">{file ? <span className="sd-file-name">{file.name}</span> : desc}</div>
      </div>
      <input ref={ref} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files?.[0]) onSelect(e.target.files[0]); }} />
      <button className="ghost sd-choose-btn" onClick={() => ref.current?.click()}>
        {file ? 'Đổi file' : 'Chọn file'}
      </button>
    </div>
  );
}

// ─── Upload modal ───────────────────────────────────────────────────────────
function UploadModal({ onClose, onDone }) {
  const [files, setFiles] = useState({ f1: null, f2: null, f3: null, f4: null, f5: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setF = (key) => (file) => setFiles((prev) => ({ ...prev, [key]: file }));
  const chosenMain = [files.f1, files.f2, files.f3].filter(Boolean).length;
  const chosenAll  = Object.values(files).filter(Boolean).length;
  const canStart   = chosenAll >= 1;

  const start = async () => {
    setBusy(true); setError('');
    try {
      const result = await parseSoatDon(files.f1, files.f2, files.f3);
      onDone(result, Object.values(files).filter(Boolean).map((f) => f.name));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sd-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sd-modal">
        <div className="sd-modal-head">
          <div>
            <p className="sd-modal-eyebrow">DỮ LIỆU NGUỒN · SOÁT HÀNG</p>
            <h2 className="sd-modal-title">Up file nguồn</h2>
            <p className="muted">Chọn đủ 3 nguồn chính rồi nhấn bắt đầu soát hàng. Nguồn 4 và 5 để dự phòng.</p>
          </div>
          <button className="ghost" onClick={onClose}>Đóng</button>
        </div>

        <div className="sd-modal-body">
          <div className="sd-counter">
            <span className="sd-counter-val">{chosenAll}</span> / 5 file đã chọn ·{' '}
            <span className="sd-counter-val">{chosenMain}</span> / 3 nguồn chính
          </div>

          <FileRow idx="01" required file={files.f1} onSelect={setF('f1')}
            label="Xuất vận đơn phát hàng"
            desc="Mã vận đơn, Người nhận, Shipper, Địa chỉ, COD" />
          <FileRow idx="02" required file={files.f2} onSelect={setF('f2')}
            label="Trạng thái MVĐ"
            desc="Trạng thái, thời gian thao tác, loại quét kiện cuối, xác nhận ký nhận / chuyển hoàn" />
          <FileRow idx="03" required file={files.f3} onSelect={setF('f3')}
            label="Kỳ nhận trong ngày – Chi tiết"
            desc="42 cột: nhân viên phát, ngày lưu kho, kiện vấn đề, loại kiện, chuyển hoàn…" />
          <FileRow idx="04" required={false} file={files.f4} onSelect={setF('f4')}
            label="Nguồn bổ sung 4"
            desc="Chưa cấu hình logic – có thể chọn file, chưa tham gia đối chiếu." />
          <FileRow idx="05" required={false} file={files.f5} onSelect={setF('f5')}
            label="Nguồn bổ sung 5"
            desc="Chưa cấu hình logic – có thể chọn file, chưa tham gia đối chiếu." />

          {error && <div className="notice error" style={{ marginTop: 12 }}>{error}</div>}

          <div className="sd-modal-note">
            Excel được đọc và đối chiếu ngay trên trình duyệt, không gửi dữ liệu vận đơn lên máy chủ.
            Nguồn bổ sung 4 và 5 chưa có logic, không tham gia vào tính toán.
          </div>
        </div>

        <div className="sd-modal-foot">
          <button className="ghost" onClick={onClose}>Đóng</button>
          <button className="primary" disabled={!canStart || busy} onClick={start}>
            {busy ? 'Đang xử lý…' : 'Bắt đầu soát hàng'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stat card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, color, active, onClick }) {
  return (
    <div
      className={`sd-stat-card sd-stat-card-- sd-stat-card--clickable${active ? ' sd-stat-card--active' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={!!active}
      title="Bấm để lọc theo mục này (bấm lần nữa để bỏ lọc)"
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
    >
      <div>
        <div className={`sd-stat-val sd-stat-val--${color}`}>{value}</div>
        <div className="sd-stat-label">{label}</div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
const PAGE_SIZES = [25, 50, 100];
const EMPTY = '(Trống)';
const MAX_CODES = 500;

const dateOf = (s) => {
  const m = String(s || '').match(/^(\d{2}\/\d{2}\/\d{4})/);
  return m ? m[1] : String(s || '');
};
const toTs = (s) => {
  const m = String(s || '').match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  return m ? new Date(+m[3], +m[2] - 1, +m[1], +(m[4] || 0), +(m[5] || 0)).getTime() : null;
};
const DATE_FIELDS = new Set(['thoiGianKienVanDe', 'thoiGianThaoTac', 'thoiGianHangDen']);
const sortVal = (r, f) => {
  const v = r[f];
  if (DATE_FIELDS.has(f)) return toTs(v);
  if (f === 'soNgayLuuTru') { const n = parseFloat(v); return Number.isNaN(n) ? null : n; }
  const t = String(v ?? '').trim().toLowerCase();
  return t || null;
};

// 9 ô lọc nhiều lựa chọn (ô 1 là mã vận đơn)
const FILTERS = [
  { key: 'staff',       label: 'Nhân viên phát kiện',                       get: (r) => r.tenNhanVienPhatHang },
  { key: 'days',        label: 'Số ngày lưu kho',                           get: (r) => r.soNgayLuuTru, kind: 'num' },
  { key: 'kienDate',    label: 'Thời gian kiện vấn đề (chọn ngày)',         get: (r) => dateOf(r.thoiGianKienVanDe), kind: 'date' },
  { key: 'loaiKien',    label: 'Loại kiện vấn đề',                          get: (r) => r.loaiKienVanDe },
  { key: 'thaoTacDate', label: 'Thời gian thao tác cuối cùng (chọn ngày)',  get: (r) => dateOf(r.thoiGianThaoTac), kind: 'date' },
  { key: 'loaiQuet',    label: 'Loại quét kiện cuối cùng',                  get: (r) => r.loaiQuetKienCuoi },
  { key: 'giaTriCao',   label: 'Giá trị cao',                               get: (r) => r.giaTriCao },
  { key: 'kiemTon',     label: 'Kiểm tồn',                                  get: (r) => r.kiemTon },
  { key: 'phatLai',     label: 'Dấu tích phát lại',                         get: (r) => r.dauTichPhatLai },
];

const dash = (v) => (v === '' || v === null || v === undefined ? '—' : v);
const nowrap = { whiteSpace: 'nowrap' };

const COLS = [
  { key: 'maVanDon',            label: 'MÃ VẬN ĐƠN',                    render: (r) => <strong className="sd-code">{r.maVanDon}</strong> },
  { key: 'soNgayLuuTru',        label: 'SỐ NGÀY LƯU KHO',               center: true, render: (r) => dash(r.soNgayLuuTru) },
  { key: 'tenNhanVienPhatHang', label: 'NHÂN VIÊN PHÁT KIỆN',           render: (r) => dash(r.tenNhanVienPhatHang) },
  { key: 'nguoiNhan',           label: 'NGƯỜI NHẬN',                    render: (r) => dash(r.nguoiNhan) },
  { key: 'diaChi',              label: 'ĐỊA CHỈ',                       nosort: true,
    render: (r) => <span className="sd-addr" title={r.diaChi}>{dash(r.diaChi)}</span> },
  { key: 'thoiGianKienVanDe',   label: 'THỜI GIAN KIỆN VẤN ĐỀ',         render: (r) => <span style={nowrap}>{dash(r.thoiGianKienVanDe)}</span> },
  { key: 'loaiKienVanDe',       label: 'LOẠI KIỆN VẤN ĐỀ',              render: (r) => (r.loaiKienVanDe
      ? <span className="sd-badge sd-badge-orange" title={r.phanLoaiKienVanDe}>{r.loaiKienVanDe}</span> : '—') },
  { key: 'thoiGianThaoTac',     label: 'THỜI GIAN THAO TÁC CUỐI CÙNG',  render: (r) => <span style={nowrap}>{dash(r.thoiGianThaoTac)}</span> },
  { key: 'loaiQuetKienCuoi',    label: 'LOẠI QUÉT KIỆN CUỐI CÙNG',      render: (r) => dash(r.loaiQuetKienCuoi) },
];

export function SoatDon() {
  const [showUpload, setShowUpload]   = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [runs, setRuns]               = useState([]);
  const [rawRows, setRawRows]         = useState([]);
  const [stats, setStats]             = useState(null);
  const [warnings, setWarnings]       = useState([]);
  const [notice, setNotice]           = useState('');

  // filter state
  const [filterCode, setFilterCode]     = useState('');
  const [ms, setMs]                     = useState({});   // { staff: [...], days: [...], ... }
  const [filterStatus, setFilterStatus] = useState('');   // từ thẻ thống kê
  const [filterFlag, setFilterFlag]     = useState('');   // 'hasStaff' | 'hasIssue'

  // table state
  const [sortField, setSortField] = useState('maVanDon');
  const [sortDir, setSortDir]     = useState('asc');
  const [page, setPage]           = useState(1);
  const [pageSize, setPageSize]   = useState(25);

  const showNotice = useCallback((msg, duration = 4000) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), duration);
  }, []);

  // ── Lịch sử: dọn bản ghi quá 6:00 sáng, hẹn giờ dọn tiếp ──
  const refreshRuns = useCallback(async () => {
    try { await purgeExpired(); setRuns(await listRuns()); } catch { /* bỏ qua */ }
  }, []);

  useEffect(() => {
    refreshRuns();
    let timer;
    const schedule = () => {
      const wait = Math.max(1000, nextSixAM().getTime() - Date.now() + 1000);
      timer = setTimeout(async () => { await refreshRuns(); schedule(); }, wait);
    };
    schedule();
    const onVisible = () => { if (document.visibilityState === 'visible') refreshRuns(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [refreshRuns]);

  const resetFilters = () => {
    setFilterCode(''); setMs({}); setFilterStatus(''); setFilterFlag(''); setPage(1);
  };

  const loadResult = ({ rows, stats: s, warnings: w }) => {
    const now = new Date();
    const updatedRows = (rows || []).map((r) => {
      if (r.thoiGianHangDen) {
        const d = calcDaysFromNow(r.thoiGianHangDen, now);
        if (d !== null) return { ...r, soNgayLuuTru: String(d) };
      }
      return r;
    });
    setRawRows(updatedRows); setStats(s); setWarnings(w || []);
    resetFilters();
  };

  const handleDone = async (result, names = []) => {
    loadResult(result);
    setShowUpload(false);
    showNotice(`Đã xử lý ${result.rows.length} vận đơn từ dữ liệu upload`);
    try {
      await saveRun({ rows: result.rows, stats: result.stats, warnings: result.warnings, files: names });
      await refreshRuns();
    } catch (e) {
      showNotice(`Lỗi: Không lưu được lịch sử: ${e.message || e}`, 6000);
    }
  };

  const handleReset = () => {
    setRawRows([]); setStats(null); setWarnings([]);
    resetFilters();
    showNotice('Đã làm mới toàn bộ dữ liệu');
  };

  const openRun = async (id) => {
    try {
      const run = await getRun(id);
      if (!run) { showNotice('Lỗi: Bản ghi đã bị xóa'); await refreshRuns(); return; }
      loadResult(run);
      setShowHistory(false);
      showNotice(`Đã mở lại lần soát ${run.total} vận đơn`);
    } catch (e) {
      showNotice(`Lỗi: Không mở được: ${e.message || e}`);
    }
  };
  const removeRun = async (id) => { try { await deleteRun(id); } catch { /* */ } await refreshRuns(); };
  const removeAllRuns = async () => {
    if (!window.confirm('Xóa toàn bộ lịch sử soát?')) return;
    try { await clearRuns(); } catch { /* */ }
    await refreshRuns();
  };

  // ── Tùy chọn cho các ô lọc ──
  const options = useMemo(() => {
    const out = {};
    FILTERS.forEach((f) => {
      const set = new Set();
      rawRows.forEach((r) => { set.add(String(f.get(r) ?? '').trim() || EMPTY); });
      let arr = [...set];
      if (f.kind === 'num') arr.sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0));
      else if (f.kind === 'date') arr.sort((a, b) => (toTs(b) ?? -1) - (toTs(a) ?? -1));
      else arr.sort((a, b) => a.localeCompare(b, 'vi'));
      // "(Trống)" xuống cuối
      arr = [...arr.filter((x) => x !== EMPTY), ...arr.filter((x) => x === EMPTY)];
      out[f.key] = arr;
    });
    return out;
  }, [rawRows]);

  // ── Lọc ──
  const allCodes = filterCode.trim() ? filterCode.split(/[\s,;]+/).filter(Boolean) : [];
  const codes = allCodes.slice(0, MAX_CODES).map((c) => c.toUpperCase());
  const active = FILTERS.filter((f) => (ms[f.key] || []).length > 0);

  const filtered = rawRows.filter((r) => {
    if (codes.length && !codes.some((c) => r.maVanDon.toUpperCase().includes(c))) return false;
    if (filterStatus && r._statusCode !== filterStatus) return false;
    if (filterFlag === 'hasStaff' && !r.tenNhanVienPhatHang) return false;
    if (filterFlag === 'hasIssue' && !r.loaiKienVanDe) return false;
    for (const f of active) {
      const v = String(f.get(r) ?? '').trim() || EMPTY;
      if (!ms[f.key].includes(v)) return false;
    }
    return true;
  });

  // ── Sắp xếp (số / ngày giờ / chữ; ô trống luôn nằm cuối) ──
  const sorted = [...filtered].sort((a, b) => {
    const av = sortVal(a, sortField);
    const bv = sortVal(b, sortField);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    const c = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), 'vi');
    return sortDir === 'asc' ? c : -c;
  });

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const pageRows   = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleSort = (field) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
    setPage(1);
  };

  const exportExcel = () => {
    if (!filtered.length) { showNotice('Lỗi: Không có dữ liệu để xuất'); return; }
    const data = sorted.map((r) => ({
      'Mã vận đơn': r.maVanDon,
      'Số ngày lưu kho': r.soNgayLuuTru,
      'Nhân viên phát kiện': r.tenNhanVienPhatHang,
      'Người nhận': r.nguoiNhan,
      'Địa chỉ': r.diaChi,
      'Shipper': r.shipper,
      'Thời gian hàng đến': r.thoiGianHangDen,
      'Thời gian kiện vấn đề': r.thoiGianKienVanDe,
      'Loại kiện vấn đề': r.loaiKienVanDe,
      'Phân loại kiện vấn đề': r.phanLoaiKienVanDe,
      'Thời gian thao tác cuối cùng': r.thoiGianThaoTac,
      'Loại quét kiện cuối cùng': r.loaiQuetKienCuoi,
      'Giá trị cao': r.giaTriCao,
      'Kiểm tồn': r.kiemTon,
      'Dấu tích phát lại': r.dauTichPhatLai,
      'Trạng thái': r.trangThai,
      'Xác nhận ký nhận': r.xacNhanKyNhan,
      'Xác nhận chuyển hoàn': r.xacNhanChuyenHoan,
      'COD': r.cod,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Soát hàng');
    XLSX.writeFile(wb, `SoatHang_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showNotice('Đã xuất Excel thành công');
  };

  const hasData = rawRows.length > 0;

  // Bấm thẻ thống kê -> lọc bảng; bấm lại để bỏ lọc
  const clickStatus = (code) => { setFilterFlag(''); setFilterStatus((c) => (c === code ? '' : code)); setPage(1); };
  const clickFlag   = (flag) => { setFilterStatus(''); setFilterFlag((c) => (c === flag ? '' : flag)); setPage(1); };
  const clickTotal  = () => resetFilters();
  const noFilter = !filterStatus && !filterFlag && !codes.length && active.length === 0;

  return (
    <main className="app-shell app-shell--wide">
      {/* ── Header ── */}
      <section className="page-heading">
        <div>
          <p className="eyebrow">SOÁT HÀNG</p>
          <h1>Soát hàng</h1>
          {/* {hasData && (
            <p className="muted" style={{ marginTop: 4 }}>
              Tổng <strong>{rawRows.length}</strong> vận đơn ·{' '}
              {warnings.map((w, i) => <span key={i} style={{ color: '#d97706' }}>{w} </span>)}
            </p>
          )} */}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="ghost" onClick={() => { refreshRuns(); setShowHistory(true); }}>
            Lịch sử soát{runs.length ? ` (${runs.length})` : ''}
          </button>
          {hasData && (
            <>
              <button className="ghost" onClick={exportExcel}>Xuất Excel</button>
              <button className="ghost" onClick={handleReset}>Làm mới</button>
            </>
          )}
          <button className="primary" onClick={() => setShowUpload(true)}>Up file</button>
        </div>
      </section>

      {notice && (
        <div className={`notice ${notice.startsWith('Lỗi') ? 'error' : 'success'}`}>
          {notice}
        </div>
      )}

      {/* ── Stats Dashboard ── */}
      {hasData && stats && (
        <section className="sd-stats-grid">
          <StatCard label="Tổng vận đơn"         value={stats.total}       color="blue"   active={noFilter} onClick={clickTotal} />
          <StatCard label="Có thông tin NV phát" value={stats.hasStaff}    color="green"  active={filterFlag === 'hasStaff'} onClick={() => clickFlag('hasStaff')} />
          <StatCard label="Hàng đến"             value={stats.arrived}     color="teal"   active={filterStatus === 'arrived'} onClick={() => clickStatus('arrived')} />
          <StatCard label="Đang phát hàng"       value={stats.delivering}  color="orange" active={filterStatus === 'delivering'} onClick={() => clickStatus('delivering')} />
          <StatCard label="Từ chối nhận"          value={stats.refused}     color="red"    active={filterStatus === 'refused'} onClick={() => clickStatus('refused')} />
          <StatCard label="Chuyển hoàn"          value={stats.returning}   color="blue2"  active={filterStatus === 'returning'} onClick={() => clickStatus('returning')} />
          <StatCard label="Hẹn lại"              value={stats.rescheduled} color="purple" active={filterStatus === 'rescheduled'} onClick={() => clickStatus('rescheduled')} />
          <StatCard label="Không liên lạc"       value={stats.nocontact}   color="yellow" active={filterStatus === 'nocontact'} onClick={() => clickStatus('nocontact')} />
          <StatCard label="Có kiện vấn đề"       value={stats.hasIssue}    color="orange" active={filterFlag === 'hasIssue'} onClick={() => clickFlag('hasIssue')} />
          <StatCard label="Đã ký nhận"            value={stats.delivered}   color="green"  active={filterStatus === 'delivered'} onClick={() => clickStatus('delivered')} />
        </section>
      )}

      {/* ── Filters ── */}
      {hasData && (
        <section className="panel sd-filter-panel">
          <div className="sd-filter-grid sd-filter-grid--5">
            <div className="sd-filter-item">
              <span>1. Mã vận đơn (tối đa {MAX_CODES} mã)</span>
              <input
                className="sd-input"
                placeholder="Nhập hoặc dán nhiều mã…"
                value={filterCode}
                onChange={(e) => { setFilterCode(e.target.value); setPage(1); }}
              />
              {allCodes.length > MAX_CODES && (
                <small className="sd-hint-warn">Chỉ lọc {MAX_CODES} mã đầu tiên ({allCodes.length} mã đã nhập).</small>
              )}
            </div>
            {FILTERS.map((f, i) => (
              <div className="sd-filter-item" key={f.key}>
                <span>{i + 2}. {f.label}</span>
                <MultiSelect
                  options={options[f.key] || []}
                  value={ms[f.key] || []}
                  onChange={(vals) => { setMs((p) => ({ ...p, [f.key]: vals })); setPage(1); }}
                />
              </div>
            ))}
          </div>
          <div className="sd-filter-actions">
            <button className="ghost" onClick={resetFilters}>Xóa lọc</button>
          </div>
        </section>
      )}

      {/* ── Table ── */}
      <section className="panel table-panel">
        <div className="table-toolbar">
          <span className="sd-row-count">
            {hasData ? `${filtered.length} / ${rawRows.length} vận đơn` : '0 / 0 vận đơn'}
          </span>
          <select className="page-limit-select" value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} dòng/trang</option>)}
            <option value={9999}>Tất cả</option>
          </select>
        </div>

        <div className="sd-table-scroll">
          <table className="sd-table">
            <thead>
              <tr>
                {COLS.map((c) => (
                  <th
                    key={c.key}
                    className={`${c.nosort ? '' : 'sd-th-sort'}${c.center ? ' sd-center' : ''}`}
                    onClick={c.nosort ? undefined : () => handleSort(c.key)}
                  >
                    <span className="sd-th-inner">
                      {c.label}
                      {!c.nosort && <SortIcon field={c.key} cur={sortField} dir={sortDir} />}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => (
                <tr key={r.maVanDon + i} className="sd-row">
                  {COLS.map((c) => (
                    <td key={c.key} className={c.center ? 'sd-center' : ''}>{c.render(r)}</td>
                  ))}
                </tr>
              ))}
              {pageRows.length === 0 && (
                <tr className="sd-row">
                  <td colSpan={COLS.length} className="sd-none">
                    {!hasData
                      ? <>Chưa có dữ liệu. Nhấn <strong>Up file</strong> để bắt đầu soát hàng hoặc mở từ <strong>Lịch sử soát</strong>.</>
                      : 'Không có vận đơn nào khớp bộ lọc.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* pagination */}
        {hasData && totalPages > 1 && (
          <div className="sd-pagination">
            <span className="sd-page-info">
              {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} / {filtered.length}
            </span>
            <button className="sd-page-btn" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>‹</button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
              .reduce((acc, p, i, arr) => {
                if (i > 0 && p - arr[i - 1] > 1) acc.push('…');
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === '…'
                  ? <span key={`e${i}`} className="sd-page-btn" style={{ cursor: 'default' }}>…</span>
                  : <button key={p} className={`sd-page-btn${p === safePage ? ' sd-page-btn--active' : ''}`}
                      onClick={() => setPage(p)}>{p}</button>
              )}
            <button className="sd-page-btn" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>›</button>
          </div>
        )}
      </section>

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} onDone={handleDone} />}
      {showHistory && (
        <SoatHistoryModal
          runs={runs}
          onClose={() => setShowHistory(false)}
          onOpen={openRun}
          onDelete={removeRun}
          onClear={removeAllRuns}
        />
      )}
    </main>
  );
}
