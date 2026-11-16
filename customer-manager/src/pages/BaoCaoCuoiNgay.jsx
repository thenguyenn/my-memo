import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  computeBaoCao,
  fmtDateVN,
  fmtShortDate,
  parseBaoCaoFiles,
} from '../utils/baoCaoParser';

const fmtPct = (v) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return `${(v * 100).toFixed(2)}%`;
};

const fmtDiffPct = (v) => {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const pct = (v * 100).toFixed(2);
  if (v > 0) return `+${pct}%`;
  return `${pct}%`;
};

function SourceRow({ idx, title, tag, tagType, desc, file, onSelect }) {
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
      <div className={`sd-file-num ${tagType === 'req' ? 'sd-file-num--req' : 'sd-file-num--opt'}`}>
        {idx}
      </div>
      <div className="sd-file-info">
        <div className="sd-file-title">
          {title}{' '}
          <span className={tagType === 'req' ? 'sd-tag-req' : 'sd-tag-opt'}>
            {tag}
          </span>
        </div>
        <div className="sd-file-desc">
          {file ? <span className="sd-file-name">{file.name}</span> : desc}
        </div>
      </div>
      <input
        ref={ref}
        type="file"
        accept=".xlsx,.xlsm,.xls,.csv"
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files?.[0]) onSelect(e.target.files[0]);
        }}
      />
      <span className="bc-file-status">{file ? 'Đã chọn' : 'Chưa chọn'}</span>
      <button type="button" className="ghost sd-choose-btn" onClick={() => ref.current?.click()}>
        {file ? 'Đổi file' : 'Chọn file'}
      </button>
    </div>
  );
}

function UploadBaoCaoModal({ onClose, onDone }) {
  const [files, setFiles] = useState({ f1: null, f2: null, f3: null });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setF = (key) => (file) => setFiles((prev) => ({ ...prev, [key]: file }));
  const chosenAll = Object.values(files).filter(Boolean).length;
  const chosenReq = files.f1 ? 1 : 0;
  const canStart = chosenAll >= 1;

  const handleStart = async () => {
    setBusy(true);
    setError('');
    try {
      const dataset = await parseBaoCaoFiles(files.f1, files.f2, files.f3);
      onDone(dataset);
    } catch (e) {
      setError(e.message || 'Không đọc được file Excel.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sd-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sd-modal">
        <div className="sd-modal-head">
          <div>
            <p className="sd-modal-eyebrow">DỮ LIỆU NGUỒN · BÁO CÁO CUỐI NGÀY</p>
            <h2 className="sd-modal-title">Up file nguồn</h2>
            <p className="muted">
              Chọn Giám sát hàng phát, Quản lý thu tiền, Ký nhận trong ngày. Giám sát có lịch sử ngày trước.
            </p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>Đóng</button>
        </div>

        <div className="sd-modal-body">
          <div className="sd-counter">
            <span className="sd-counter-val">{chosenAll}</span> / 3 file đã chọn ·{' '}
            <span className="sd-counter-val">{chosenReq}</span> / 1 nguồn bắt buộc
          </div>

          <SourceRow
            idx="01"
            title="01. Giám sát hàng phát Tổng hợp"
            tag="Bắt buộc"
            tagType="req"
            desc="Nguồn ngày báo cáo · số đơn phát, ký nhận và nhân viên"
            file={files.f1}
            onSelect={setF('f1')}
          />
          <SourceRow
            idx="02"
            title="02. Quản lý thu tiền"
            tag="Nguồn QR"
            tagType="opt"
            desc="Nguồn thanh toán QR theo ngày"
            file={files.f2}
            onSelect={setF('f2')}
          />
          <SourceRow
            idx="03"
            title="03. Ký nhận trong ngày"
            tag="Nguồn thời hiệu"
            tagType="opt"
            desc="Nguồn ký nhận thời hiệu"
            file={files.f3}
            onSelect={setF('f3')}
          />

          {error && <div className="notice error" style={{ marginTop: 12 }}>Lỗi: {error}</div>}

          <div className="sd-modal-note">
            Excel .xlsx/.xlsm/.csv tối đa 75 MB mỗi file; dữ liệu được xử lý ngay trên trình duyệt, không gửi lên máy chủ. File Thu tiền và Ký nhận bổ sung chỉ tiêu QR và đúng giờ. Hỗ trợ cả file tổng hợp nhiều bảng.
          </div>
        </div>

        <div className="sd-modal-foot">
          <button type="button" className="ghost" onClick={onClose}>Đóng</button>
          <button type="button" className="primary" disabled={!canStart || busy} onClick={handleStart}>
            {busy ? 'Đang xử lý…' : 'Bắt đầu báo cáo'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function BaoCaoCuoiNgay() {
  const [showUpload, setShowUpload] = useState(false);
  const [dataset, setDataset] = useState(null);
  const [reportDate, setReportDate] = useState('');
  const [branch, setBranch] = useState('');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('tab1');
  const [notice, setNotice] = useState('');

  const showNotice = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const handleDoneUpload = (ds) => {
    setDataset(ds);
    setReportDate(ds.defaultDate || '');
    setBranch(ds.branches.length === 1 ? ds.branches[0] : '');
    setSearch('');
    setShowUpload(false);
    showNotice('Đã tải và tính toán dữ liệu báo cáo cuối ngày');
  };

  const handleReset = () => {
    setDataset(null);
    setReportDate('');
    setBranch('');
    setSearch('');
    showNotice('Đã làm mới dữ liệu báo cáo');
  };

  const resetFilters = () => {
    setSearch('');
    if (dataset) {
      setReportDate(dataset.defaultDate || '');
      setBranch(dataset.branches.length === 1 ? dataset.branches[0] : '');
    }
  };

  const computed = useMemo(
    () => computeBaoCao(dataset, { reportDate, branch }),
    [dataset, reportDate, branch]
  );

  const kw = search.trim().toLowerCase();

  const filteredTable1 = useMemo(() => {
    if (!computed) return [];
    if (!kw) return computed.table1;
    return computed.table1.filter(
      (r) =>
        r.tenNV.toLowerCase().includes(kw) ||
        r.maNV.toLowerCase().includes(kw)
    );
  }, [computed, kw]);

  const filteredTable2 = useMemo(() => {
    if (!computed) return [];
    if (!kw) return computed.table2;
    return computed.table2.filter(
      (r) =>
        r.tenNV.toLowerCase().includes(kw) ||
        r.maNV.toLowerCase().includes(kw)
    );
  }, [computed, kw]);

  const exportFile = () => {
    if (!computed) {
      showNotice('Lỗi: Chưa có dữ liệu để xuất');
      return;
    }
    const wb = XLSX.utils.book_new();
    const shortCur = fmtShortDate(computed.reportDate);
    const shortPrev = fmtShortDate(computed.prevDate);

    // Sheet 1: So sánh 2 ngày
    const s1Rows = [
      [
        computed.reportDate,
        '',
        '',
        '',
        `Lũy kế tháng ${computed.reportDate.slice(5, 7)}`,
        computed.prevDate || 'Ngày trước',
        '',
        '',
        computed.reportDate,
        '',
        '',
        `So sánh tỷ lệ ${shortPrev} & ${shortCur}`,
      ],
      [
        'Tên nhân viên phát hàng',
        'Mã Shipper',
        'Tổng lượng ký nhận đúng giờ',
        'Tổng lượng đơn nên ký nhận',
        'Tỷ lệ lũy kế',
        'Lượng đơn nên ký nhận',
        'Lượng ký nhận đúng giờ',
        'Tỉ lệ ký nhận đúng giờ',
        'Lượng đơn nên ký nhận',
        'Lượng ký nhận đúng giờ',
        'Tỉ lệ ký nhận đúng giờ',
        'So sánh tỷ lệ',
      ],
      ...filteredTable1.map((r) => [
        r.tenNV,
        r.maNV,
        r.lkKyNhan,
        r.lkDon,
        fmtPct(r.lkTyLe),
        r.prevDon,
        r.prevKyNhan,
        fmtPct(r.prevTyLe),
        r.curDon,
        r.curKyNhan,
        fmtPct(r.curTyLe),
        fmtDiffPct(r.diffTyLe),
      ]),
    ];
    const ws1 = XLSX.utils.aoa_to_sheet(s1Rows);
    XLSX.utils.book_append_sheet(wb, ws1, 'So sanh hai ngay');

    // Sheet 2: Báo cáo cuối ngày
    const s2Rows = [
      [`BÁO CÁO CUỐI NGÀY ${computed.branch} ${fmtDateVN(computed.reportDate)}`],
      [
        'STT',
        'Mã nhân viên phát',
        'Nhân viên phát kiện',
        'Số đơn hàng phát',
        'Tổng đơn ký nhận',
        '% Đơn Tồn',
        '% Quét mã QR',
        `% Ký nhận Tổng ${shortCur}`,
        `% Ký nhận Thời hiệu ${shortCur}`,
        'Thời hiệu luỹ kế',
      ],
      ...filteredTable2.map((r, i) => [
        i + 1,
        r.maNV,
        r.tenNV,
        r.soDonPhat,
        r.tongKyNhan,
        fmtPct(r.tyLeDonTon),
        r.tyLeQR !== null ? fmtPct(r.tyLeQR) : '-',
        fmtPct(r.tyLeKyNhanTong),
        fmtPct(r.tyLeThoiHieuNgay),
        fmtPct(r.tyLeThoiHieuLuyKe),
      ]),
      [
        'Tổng cộng',
        '',
        '',
        computed.summary2.soDonPhat,
        computed.summary2.tongKyNhan,
        fmtPct(computed.summary2.tyLeDonTon),
        fmtPct(computed.summary2.tyLeQR),
        fmtPct(computed.summary2.tyLeKyNhanTong),
        fmtPct(computed.summary2.tyLeThoiHieuNgay),
        fmtPct(computed.summary2.tyLeThoiHieuLuyKe),
      ],
    ];
    const ws2 = XLSX.utils.aoa_to_sheet(s2Rows);
    XLSX.utils.book_append_sheet(wb, ws2, 'Bao cao cuoi ngay');

    XLSX.writeFile(wb, `BaoCaoCuoiNgay_${computed.branch || 'BC'}_${computed.reportDate}.xlsx`);
    showNotice('Đã xuất file báo cáo thành công');
  };

  const hasData = !!computed;
  const monthLabel = computed?.reportDate
    ? `Lũy kế tháng ${Number(computed.reportDate.slice(5, 7))}`
    : 'Lũy kế tháng';
  const prevLabel = computed?.prevDate ? computed.prevDate : 'Ngày trước';
  const curLabel = computed?.reportDate ? computed.reportDate : '—';
  const shortCur = computed?.reportDate ? fmtShortDate(computed.reportDate) : '';

  return (
    <main className="app-shell app-shell--wide">
      {/* Header */}
      <section className="page-heading">
        <div>
          <p className="eyebrow">BÁO CÁO</p>
          <h1>Báo cáo cuối ngày</h1>
          <p className="muted">Tự động đối chiếu 3 nguồn Excel theo ngày và mã nhân viên</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className={`bc-status-pill ${hasData ? 'bc-status-pill--ok' : ''}`}>
            {hasData
              ? `${computed.branch ? `${computed.branch} · ` : ''}${fmtDateVN(computed.reportDate)}`
              : 'Chưa tải dữ liệu'}
          </span>
          <button type="button" className="ghost" onClick={exportFile}>
            Xuất Excel
          </button>
          <button type="button" className="ghost" onClick={handleReset}>
            Làm mới
          </button>
          <button type="button" className="primary" onClick={() => setShowUpload(true)}>
            Up file Excel
          </button>
        </div>
      </section>

      {notice && (
        <div className={`notice ${notice.startsWith('Lỗi') ? 'error' : 'success'}`}>
          {notice}
        </div>
      )}

      {/* Filter Bar */}
      <section className="panel bc-filter-panel">
        <div className="bc-filter-row">
          <div className="sd-filter-item">
            <span>Tìm nhân viên / Mã Shipper</span>
            <input
              className="sd-input"
              placeholder="Tên hoặc mã nhân viên"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="sd-filter-item">
            <span>Ngày báo cáo</span>
            <select
              className="sd-input"
              value={reportDate}
              disabled={!dataset}
              onChange={(e) => setReportDate(e.target.value)}
            >
              {!dataset ? (
                <option value="">Chưa có dữ liệu</option>
              ) : (
                dataset.dates.map((d) => (
                  <option key={d} value={d}>
                    {fmtDateVN(d)} ({d})
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="sd-filter-item">
            <span>Mã bưu cục</span>
            <select
              className="sd-input"
              value={branch}
              disabled={!dataset}
              onChange={(e) => setBranch(e.target.value)}
            >
              <option value="">Tất cả bưu cục</option>
              {dataset?.branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className="bc-filter-btn-wrap">
            <button type="button" className="ghost" onClick={resetFilters}>
              Xóa lọc
            </button>
          </div>
        </div>
      </section>

      {!hasData && (
        <p className="muted" style={{ marginBottom: 12 }}>
          Chưa tải dữ liệu Excel. Nhấn <strong>Up file Excel</strong> để tạo báo cáo; không hiển thị dữ liệu minh họa.
        </p>
      )}

      {/* Tabs */}
      <div className="bc-tabs">
        <button
          type="button"
          className={activeTab === 'tab1' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('tab1')}
        >
          Bảng 1 - So sánh hai ngày
        </button>
        <button
          type="button"
          className={activeTab === 'tab2' ? 'primary' : 'ghost'}
          onClick={() => setActiveTab('tab2')}
        >
          Bảng 2 - QR và ký nhận
        </button>
      </div>

      {/* Bảng 1: So sánh tỷ lệ ký nhận hai ngày */}
      {activeTab === 'tab1' && (
        <section className="panel table-panel">
          <div className="table-toolbar">
            <h2>So sánh tỷ lệ ký nhận hai ngày</h2>
            <span className="muted">
              {hasData ? `${filteredTable1.length} nhân viên` : 'Chưa có dữ liệu'}
            </span>
          </div>

          <div className="sd-table-scroll">
            <table className="sd-table bc-table">
              <thead>
                <tr>
                  <th colSpan={2} className="bc-th-group bc-th-group--blue">
                    Tổng hợp nhân viên theo bưu cục {computed?.branch ? `(${computed.branch})` : ''}
                  </th>
                  <th colSpan={3} className="bc-th-group bc-th-group--yellow">
                    {monthLabel}
                  </th>
                  <th colSpan={3} className="bc-th-group bc-th-group--yellow">
                    {prevLabel}
                  </th>
                  <th colSpan={3} className="bc-th-group bc-th-group--yellow">
                    {curLabel}
                  </th>
                  <th rowSpan={2} className="bc-th-group bc-th-group--blue sd-center">
                    So sánh tỷ lệ
                  </th>
                </tr>
                <tr>
                  <th className="bc-th-sub">Tên nhân viên phát hàng</th>
                  <th className="bc-th-sub sd-center">Mã Shipper</th>
                  <th className="bc-th-sub sd-center">Lượng ký nhận đúng giờ lũy kế</th>
                  <th className="bc-th-sub sd-center">Lượng đơn nên ký nhận lũy kế</th>
                  <th className="bc-th-sub sd-center">Tỷ lệ lũy kế</th>
                  <th className="bc-th-sub sd-center">Đơn phát ngày trước</th>
                  <th className="bc-th-sub sd-center">Ký nhận ngày trước</th>
                  <th className="bc-th-sub sd-center">Tỷ lệ ngày trước</th>
                  <th className="bc-th-sub sd-center">Đơn phát ngày báo cáo</th>
                  <th className="bc-th-sub sd-center">Ký nhận ngày báo cáo</th>
                  <th className="bc-th-sub sd-center">Tỷ lệ ngày báo cáo</th>
                </tr>
              </thead>
              <tbody>
                {filteredTable1.map((r, idx) => (
                  <tr key={r.maNV + r.tenNV + idx} className="sd-row">
                    <td><strong>{r.tenNV || '—'}</strong></td>
                    <td className="sd-center"><span className="sd-code">{r.maNV || '—'}</span></td>
                    <td className="sd-center">{r.lkKyNhan}</td>
                    <td className="sd-center">{r.lkDon}</td>
                    <td className="sd-center"><strong>{fmtPct(r.lkTyLe)}</strong></td>
                    <td className="sd-center">{r.prevDon}</td>
                    <td className="sd-center">{r.prevKyNhan}</td>
                    <td className="sd-center">{fmtPct(r.prevTyLe)}</td>
                    <td className="sd-center">{r.curDon}</td>
                    <td className="sd-center">{r.curKyNhan}</td>
                    <td className="sd-center"><strong>{fmtPct(r.curTyLe)}</strong></td>
                    <td className={`sd-center ${r.diffTyLe > 0 ? 'bc-diff-up' : r.diffTyLe < 0 ? 'bc-diff-down' : ''}`}>
                      {fmtDiffPct(r.diffTyLe)}
                    </td>
                  </tr>
                ))}
                {filteredTable1.length === 0 && (
                  <tr className="sd-row">
                    <td colSpan={12} className="sd-none">
                      {!hasData
                        ? <>Chưa có dữ liệu. Nhấn <strong>Up file Excel</strong> để tải 3 nguồn báo cáo cuối ngày.</>
                        : 'Không có nhân viên nào khớp bộ lọc.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>
            Lũy kế tháng = Tổng Lượng ký nhận đúng giờ / Tổng Lượng đơn nên ký nhận × 100%, lấy từ file Ký nhận trong ngày, từ đầu tháng đến hết ngày báo cáo. Đối chiếu theo nhân viên và bưu cục; thiếu dữ liệu hoặc mẫu số bằng 0 hiển thị "—".
          </p>
        </section>
      )}

      {/* Bảng 2: QR và ký nhận */}
      {activeTab === 'tab2' && (
        <section className="panel table-panel">
          <div className="table-toolbar">
            <h2>
              BÁO CÁO CUỐI NGÀY {computed?.branch ? `${computed.branch} ` : ''}
              {computed?.reportDate ? fmtDateVN(computed.reportDate) : ''}
            </h2>
            <span className="muted">
              {hasData ? `${filteredTable2.length} nhân viên` : 'Chưa có dữ liệu'}
            </span>
          </div>

          <div className="sd-table-scroll">
            <table className="sd-table bc-table">
              <thead>
                <tr>
                  <th className="sd-center">STT</th>
                  <th className="sd-center">Mã nhân viên phát</th>
                  <th>Nhân viên phát kiện</th>
                  <th className="sd-center">Số đơn hàng phát</th>
                  <th className="sd-center">Tổng đơn ký nhận</th>
                  <th className="sd-center">% Đơn Tồn</th>
                  <th className="sd-center">% Quét mã QR</th>
                  <th className="sd-center">% Ký nhận Tổng {shortCur}</th>
                  <th className="sd-center">% Ký nhận Thời hiệu {shortCur}</th>
                  <th className="sd-center">Thời hiệu luỹ kế</th>
                </tr>
              </thead>
              <tbody>
                {filteredTable2.map((r, i) => (
                  <tr key={r.maNV + r.tenNV + i} className="sd-row">
                    <td className="sd-center">{i + 1}</td>
                    <td className="sd-center"><span className="sd-code">{r.maNV || '—'}</span></td>
                    <td><strong>{r.tenNV || '—'}</strong></td>
                    <td className="sd-center">{r.soDonPhat}</td>
                    <td className="sd-center">{r.tongKyNhan}</td>
                    <td className="sd-center">{fmtPct(r.tyLeDonTon)}</td>
                    <td className="sd-center">{r.tyLeQR !== null ? fmtPct(r.tyLeQR) : '—'}</td>
                    <td className="sd-center">{fmtPct(r.tyLeKyNhanTong)}</td>
                    <td className="sd-center">{fmtPct(r.tyLeThoiHieuNgay)}</td>
                    <td className="sd-center"><strong>{fmtPct(r.tyLeThoiHieuLuyKe)}</strong></td>
                  </tr>
                ))}
                {filteredTable2.length === 0 && (
                  <tr className="sd-row">
                    <td colSpan={10} className="sd-none">
                      {!hasData
                        ? <>Chưa có dữ liệu. Nhấn <strong>Up file Excel</strong> để tải 3 nguồn báo cáo cuối ngày.</>
                        : 'Không có nhân viên nào khớp bộ lọc.'}
                    </td>
                  </tr>
                )}
              </tbody>
              {hasData && filteredTable2.length > 0 && (
                <tfoot>
                  <tr className="bc-tfoot-row">
                    <td colSpan={3}><strong>Tổng cộng</strong></td>
                    <td className="sd-center"><strong>{computed.summary2.soDonPhat}</strong></td>
                    <td className="sd-center"><strong>{computed.summary2.tongKyNhan}</strong></td>
                    <td className="sd-center"><strong>{fmtPct(computed.summary2.tyLeDonTon)}</strong></td>
                    <td className="sd-center"><strong>{fmtPct(computed.summary2.tyLeQR)}</strong></td>
                    <td className="sd-center"><strong>{fmtPct(computed.summary2.tyLeKyNhanTong)}</strong></td>
                    <td className="sd-center"><strong>{fmtPct(computed.summary2.tyLeThoiHieuNgay)}</strong></td>
                    <td className="sd-center"><strong>{fmtPct(computed.summary2.tyLeThoiHieuLuyKe)}</strong></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      )}

      {showUpload && (
        <UploadBaoCaoModal
          onClose={() => setShowUpload(false)}
          onDone={handleDoneUpload}
        />
      )}
    </main>
  );
}
