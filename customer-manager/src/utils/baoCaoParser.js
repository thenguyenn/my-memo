import * as XLSX from 'xlsx';

/**
 * Parser & bộ tính toán cho trang Báo cáo cuối ngày.
 * Hỗ trợ:
 *  - Upload 3 file riêng biệt:
 *      File 1: Giám sát hàng phát Tổng hợp (Bắt buộc)
 *      File 2: Quản lý thu tiền (Nguồn QR)
 *      File 3: Ký nhận trong ngày (Nguồn thời hiệu)
 *  - Hoặc upload 1 file Excel/CSV tổng hợp chứa nhiều sheet hoặc nhiều bảng nối tiếp nhau.
 */

const nk = (s) =>
  String(s ?? '')
    .replace(/đ/gi, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const normName = (s) =>
  String(s ?? '')
    .replace(/đ/gi, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export function normDate(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (typeof v === 'number' && v > 20000 && v < 100000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) {
    let d = +m[1];
    let mo = +m[2];
    if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; }
    return `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return '';
}

export function fmtDateVN(iso) {
  if (!iso) return '—';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function fmtShortDate(iso) {
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}` : iso;
}

const toNum = (v) => {
  if (v === '' || v === null || v === undefined || v === '-') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v).trim().replace(/,/g, '');
  if (!s) return 0;
  if (s.endsWith('%')) {
    const n = parseFloat(s.slice(0, -1));
    return Number.isFinite(n) ? n / 100 : 0;
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

export function readAllSheets(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', raw: true });
        const sheets = wb.SheetNames.map((name) => {
          const ws = wb.Sheets[name];
          return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
        }).filter((rows) => rows && rows.length > 0);
        resolve(sheets);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Nhận diện loại bảng của một dòng tiêu đề:
 *  - 'giamSat': có "Số đơn hàng phát" + "Tổng đơn ký nhận" + ("Mã BC phát" hoặc "Chưa nhận hàng" hoặc "Số đơn hoàn phát")
 *  - 'thuTien': có "Tiền thu hộ COD" / "Số tiền phải thu" + ("Khách hàng thanh toán QR" hoặc "Shipper thanh toán QR")
 *  - 'kyNhan':  có "Lượng đơn nên ký nhận" + "Lượng ký nhận đúng giờ"
 */
function classifyHeaderRow(row) {
  const keys = (row || []).map(nk).filter(Boolean);
  if (!keys.length) return null;
  const has = (arr) => arr.some((k) => keys.includes(k) || keys.some((h) => h.includes(k)));

  if (has(['luongdonnenkynhan']) && has(['luongkynhandunggio'])) {
    return 'kyNhan';
  }
  if (has(['khachhangthanhtoanqr', 'shipperthanhtoanqr']) && has(['tienthuhocod', 'sotienphaithu'])) {
    return 'thuTien';
  }
  if (
    has(['sodonhangphat']) &&
    has(['tongdonkynhan']) &&
    has(['mabacphat', 'mabcphat', 'sodonhoanphat', 'chuanhanhang', 'tramphatkien'])
  ) {
    return 'giamSat';
  }
  return null;
}

/**
 * Tách một sheet (mảng 2 chiều) thành các bảng dữ liệu theo dòng tiêu đề.
 * Hỗ trợ trường hợp 1 sheet chứa cả 3 bảng nối tiếp nhau.
 */
function extractTablesFromSheet(rows) {
  const headersFound = [];
  for (let i = 0; i < rows.length; i++) {
    const type = classifyHeaderRow(rows[i]);
    if (type) headersFound.push({ index: i, type, headers: rows[i].map(nk) });
  }

  const out = { giamSat: [], thuTien: [], kyNhan: [] };
  for (let h = 0; h < headersFound.length; h++) {
    const { index: startIdx, type, headers } = headersFound[h];
    const endIdx = h + 1 < headersFound.length ? headersFound[h + 1].index : rows.length;

    for (let r = startIdx + 1; r < endIdx; r++) {
      const row = rows[r] || [];
      if (row.every((c) => String(c ?? '').trim() === '')) continue;
      const obj = {};
      headers.forEach((key, colIdx) => {
        if (key && (obj[key] === undefined || obj[key] === '')) {
          obj[key] = row[colIdx] ?? '';
        }
      });
      // Chỉ giữ dòng có ngày hợp lệ ở cột ngày
      const rawDate = obj.ngay ?? obj.ngaytaichinh ?? '';
      const isoDate = normDate(rawDate);
      if (!isoDate) continue;
      obj.__date = isoDate;
      out[type].push(obj);
    }
  }
  return out;
}

function pickVal(obj, aliases) {
  for (const a of aliases) {
    if (obj[a] !== undefined && String(obj[a]).trim() !== '') return obj[a];
  }
  for (const k of Object.keys(obj)) {
    if (k.startsWith('__')) continue;
    if (aliases.some((a) => k.includes(a)) && String(obj[k]).trim() !== '') return obj[k];
  }
  return '';
}

/**
 * Chuẩn hoá dữ liệu từ các mảng rows của 3 nguồn thành cấu trúc thống nhất.
 */
export function buildDatasetFromSheetGroups(sheetGroups) {
  const giamSatRows = [];
  const thuTienRows = [];
  const kyNhanRows = [];

  for (const rows of sheetGroups) {
    if (!rows || !rows.length) continue;
    const extracted = extractTablesFromSheet(rows);
    giamSatRows.push(...extracted.giamSat);
    thuTienRows.push(...extracted.thuTien);
    kyNhanRows.push(...extracted.kyNhan);
  }

  const giamSat = giamSatRows.map((r) => {
    const maNV = String(pickVal(r, ['manhanvienphat', 'manhanvien', 'mashipper'])).trim();
    const tenNV = String(pickVal(r, ['nhanvienphatkien', 'tennhanvienphathang', 'tenshipper'])).trim();
    const maBC = String(pickVal(r, ['mabcphat', 'mabuucuc', 'mabc'])).trim();
    const donPhatGoc = toNum(pickVal(r, ['sodonhangphat']));
    const donHoanPhat = toNum(pickVal(r, ['sodonhoanphat']));
    const tongKyNhan = toNum(pickVal(r, ['tongdonkynhan']));
    const rawTyLe = pickVal(r, ['tilekynhan', 'tylekynhan']);
    const tyLeKyNhan = rawTyLe !== '' ? toNum(rawTyLe) : (donPhatGoc > 0 ? tongKyNhan / donPhatGoc : 0);

    return {
      date: r.__date,
      maBC,
      maNV,
      tenNV,
      normTen: normName(tenNV),
      donPhatGoc,
      donHoanPhat,
      soDonPhat: donPhatGoc + donHoanPhat,
      tongKyNhan,
      tyLeKyNhan,
    };
  });

  const thuTien = thuTienRows.map((r) => {
    const maNV = String(pickVal(r, ['manhanvien', 'manhanvienphat', 'mashipper'])).trim();
    const tenNV = String(pickVal(r, ['tenshipper', 'nhanvienphatkien', 'tennhanvien'])).trim();
    const tienCOD = toNum(pickVal(r, ['tienthuhocod']));
    const phaiThu = toNum(pickVal(r, ['sotienphaithu']));
    const khachQR = toNum(pickVal(r, ['khachhangthanhtoanqr']));
    const shipperQR = toNum(pickVal(r, ['shipperthanhtoanqr']));
    return {
      date: r.__date,
      maNV,
      tenNV,
      normTen: normName(tenNV),
      tienCOD,
      phaiThu,
      khachQR,
      shipperQR,
      tongQR: khachQR + shipperQR,
    };
  });

  const kyNhan = kyNhanRows.map((r) => {
    const maBC = String(pickVal(r, ['mabuucuc', 'mabcphat', 'mabc'])).trim();
    const tenNV = String(pickVal(r, ['nhanvienphatkien', 'tennhanvienphathang', 'tenshipper'])).trim();
    const maNV = String(pickVal(r, ['manhanvienphat', 'manhanvien', 'mashipper'])).trim();
    const donNenKyNhan = toNum(pickVal(r, ['luongdonnenkynhan']));
    const kyNhanDungGio = toNum(pickVal(r, ['luongkynhandunggio']));
    return {
      date: r.__date,
      maBC,
      maNV,
      tenNV,
      normTen: normName(tenNV),
      donNenKyNhan,
      kyNhanDungGio,
    };
  });

  if (!giamSat.length && !kyNhan.length && !thuTien.length) {
    throw new Error('Không tìm thấy dữ liệu hợp lệ trong file đã chọn.');
  }

  const allDates = [...new Set([
    ...giamSat.map((r) => r.date),
    ...thuTien.map((r) => r.date),
    ...kyNhan.map((r) => r.date),
  ])].filter(Boolean).sort();

  const gsDates = [...new Set(giamSat.map((r) => r.date))].filter(Boolean).sort();
  const defaultDate = gsDates.length ? gsDates[gsDates.length - 1] : allDates[allDates.length - 1] || '';

  const branches = [...new Set([
    ...giamSat.map((r) => r.maBC),
    ...kyNhan.map((r) => r.maBC),
  ])].filter(Boolean).sort();

  return {
    giamSat,
    thuTien,
    kyNhan,
    dates: allDates,
    gsDates,
    defaultDate,
    branches,
  };
}

export async function parseBaoCaoFiles(f1, f2, f3) {
  const files = [f1, f2, f3].filter(Boolean);
  if (!files.length) throw new Error('Vui lòng chọn ít nhất 1 file Excel.');
  const sheetArrays = await Promise.all(files.map((f) => readAllSheets(f)));
  const flatSheets = sheetArrays.flat();
  return buildDatasetFromSheetGroups(flatSheets);
}

/**
 * Tính toán Bảng 1 (So sánh hai ngày) và Bảng 2 (QR và ký nhận)
 * theo Ngày báo cáo (reportDate) và Mã bưu cục (branch).
 */
export function computeBaoCao(dataset, { reportDate, branch = '' } = {}) {
  if (!dataset) return null;
  const targetDate = reportDate || dataset.defaultDate;
  if (!targetDate) return null;

  const ymPrefix = targetDate.slice(0, 7); // "YYYY-MM"

  // Lọc theo bưu cục nếu có chọn
  const gsFiltered = dataset.giamSat.filter(
    (r) => r.date === targetDate && (!branch || !r.maBC || r.maBC === branch)
  );
  const ttFiltered = dataset.thuTien.filter((r) => r.date === targetDate);
  const knMonth = dataset.kyNhan.filter(
    (r) => r.date <= targetDate && r.date.startsWith(ymPrefix) && (!branch || !r.maBC || r.maBC === branch)
  );

  // Tìm ngày trước (prevDate): ngày lớn nhất < targetDate trong dữ liệu Ký nhận hoặc Giám sát
  const prevCandidates = [...new Set([
    ...dataset.kyNhan.filter((r) => !branch || !r.maBC || r.maBC === branch).map((r) => r.date),
    ...dataset.giamSat.filter((r) => !branch || !r.maBC || r.maBC === branch).map((r) => r.date),
  ])].filter((d) => d && d < targetDate).sort();

  const prevDate = prevCandidates.length ? prevCandidates[prevCandidates.length - 1] : '';

  // Map nhân viên từ Giám sát (ưu tiên giữ thứ tự gốc của Giám sát cho Bảng 2)
  const staffList = [];
  const byCode = new Map();
  const byName = new Map();

  const registerStaff = (maNV, tenNV, fromGS = false) => {
    const code = String(maNV || '').trim();
    const name = String(tenNV || '').trim();
    const nName = normName(name);
    if (!code && !nName) return null;

    let item = (code && byCode.get(code)) || (nName && byName.get(nName));
    if (!item) {
      item = {
        maNV: code,
        tenNV: name,
        normTen: nName,
        inGS: fromGS,
        soDonPhat: 0,
        donPhatGoc: 0,
        tongKyNhan: 0,
        tyLeKyNhanGiamSat: null,
        hasQRRow: false,
        tienCOD: 0,
        tongQR: 0,
        lkDon: 0,
        lkKyNhan: 0,
        prevDon: 0,
        prevKyNhan: 0,
        curDon: 0,
        curKyNhan: 0,
      };
      staffList.push(item);
    } else {
      if (!item.maNV && code) item.maNV = code;
      if (!item.tenNV && name) { item.tenNV = name; item.normTen = nName; }
      if (fromGS) item.inGS = true;
    }
    if (item.maNV) byCode.set(item.maNV, item);
    if (item.normTen) byName.set(item.normTen, item);
    return item;
  };

  for (const r of gsFiltered) {
    const st = registerStaff(r.maNV, r.tenNV, true);
    if (!st) continue;
    st.soDonPhat += r.soDonPhat;
    st.donPhatGoc += r.donPhatGoc;
    st.tongKyNhan += r.tongKyNhan;
    st.tyLeKyNhanGiamSat = r.tyLeKyNhan;
  }

  for (const r of ttFiltered) {
    const st = (r.maNV && byCode.get(r.maNV)) || (r.normTen && byName.get(r.normTen)) || registerStaff(r.maNV, r.tenNV, false);
    if (!st) continue;
    st.hasQRRow = true;
    st.tienCOD += r.tienCOD;
    st.tongQR += r.tongQR;
  }

  for (const r of knMonth) {
    if (!r.tenNV && !r.maNV) continue;
    const st = (r.maNV && byCode.get(r.maNV)) || (r.normTen && byName.get(r.normTen)) || registerStaff(r.maNV, r.tenNV, false);
    if (!st) continue;
    st.lkDon += r.donNenKyNhan;
    st.lkKyNhan += r.kyNhanDungGio;
    if (prevDate && r.date === prevDate) {
      st.prevDon += r.donNenKyNhan;
      st.prevKyNhan += r.kyNhanDungGio;
    }
    if (r.date === targetDate) {
      st.curDon += r.donNenKyNhan;
      st.curKyNhan += r.kyNhanDungGio;
    }
  }

  // ── Bảng 1: So sánh tỷ lệ ký nhận hai ngày ──
  const table1 = staffList.map((st) => {
    const lkTyLe = st.lkDon > 0 ? st.lkKyNhan / st.lkDon : 0;
    const curTyLe = st.curDon > 0 ? st.curKyNhan / st.curDon : 0;
    // Công thức theo file mẫu: cột tỷ lệ ngày trước = (prevKyNhan + curKyNhan) / (prevDon + curDon) khi có đơn
    const twoDayDon = st.prevDon + st.curDon;
    const prevTyLe = twoDayDon > 0 ? (st.prevKyNhan + st.curKyNhan) / twoDayDon : 0;
    const diffTyLe = curTyLe - prevTyLe;

    return {
      tenNV: st.tenNV,
      maNV: st.maNV,
      lkKyNhan: st.lkKyNhan,
      lkDon: st.lkDon,
      lkTyLe,
      prevDon: st.prevDon,
      prevKyNhan: st.prevKyNhan,
      prevTyLe,
      curDon: st.curDon,
      curKyNhan: st.curKyNhan,
      curTyLe,
      diffTyLe,
    };
  }).sort((a, b) => {
    if (b.lkTyLe !== a.lkTyLe) return b.lkTyLe - a.lkTyLe;
    return b.lkKyNhan - a.lkKyNhan;
  });

  // ── Bảng 2: QR và ký nhận (theo danh sách Giám sát) ──
  const gsStaff = staffList.filter((s) => s.inGS);
  const baseForTable2 = gsStaff.length ? gsStaff : staffList;

  const table2 = baseForTable2.map((st, idx) => {
    const tyLeDonTon = st.soDonPhat > 0 ? (st.soDonPhat - st.tongKyNhan) / st.soDonPhat : 0;
    const tyLeQR = st.hasQRRow && st.tienCOD > 0 ? st.tongQR / st.tienCOD : null;
    const tyLeKyNhanTong =
      st.tyLeKyNhanGiamSat !== null
        ? st.tyLeKyNhanGiamSat
        : st.donPhatGoc > 0
          ? st.tongKyNhan / st.donPhatGoc
          : 0;
    const tyLeThoiHieuNgay = st.curDon > 0 ? st.curKyNhan / st.curDon : 0;
    const tyLeThoiHieuLuyKe = st.lkDon > 0 ? st.lkKyNhan / st.lkDon : 0;

    return {
      stt: idx + 1,
      maNV: st.maNV,
      tenNV: st.tenNV,
      soDonPhat: st.soDonPhat,
      tongKyNhan: st.tongKyNhan,
      tyLeDonTon,
      tyLeQR,
      tyLeKyNhanTong,
      tyLeThoiHieuNgay,
      tyLeThoiHieuLuyKe,
    };
  });

  // Dòng Tổng cộng của Bảng 2 (khớp chính xác công thức file mẫu)
  const sumDonPhat = table2.reduce((s, r) => s + r.soDonPhat, 0);
  const sumTongKyNhan = table2.reduce((s, r) => s + r.tongKyNhan, 0);
  const sumTyLeDonTon = sumDonPhat > 0 ? (sumDonPhat - sumTongKyNhan) / sumDonPhat : null;

  const validQRs = table2.filter((r) => r.tyLeQR !== null).map((r) => r.tyLeQR);
  const avgTyLeQR = validQRs.length ? validQRs.reduce((a, b) => a + b, 0) / validQRs.length : null;

  const sumTyLeKyNhanTong = sumDonPhat > 0 ? sumTongKyNhan / sumDonPhat : null;

  // Tổng thời hiệu ngày báo cáo & lũy kế (tính trên toàn bộ dòng Ký nhận trong ngày của bưu cục, kể cả dòng trống NV)
  const knOnDate = knMonth.filter((r) => r.date === targetDate);
  const totalCurDonAll = knOnDate.reduce((s, r) => s + r.donNenKyNhan, 0);
  const totalCurKyNhanAll = knOnDate.reduce((s, r) => s + r.kyNhanDungGio, 0);
  const sumTyLeThoiHieuNgay =
    totalCurDonAll > 0
      ? totalCurKyNhanAll / totalCurDonAll
      : null;

  const totalLkDonAll = knMonth.reduce((s, r) => s + r.donNenKyNhan, 0);
  const totalLkKyNhanAll = knMonth.reduce((s, r) => s + r.kyNhanDungGio, 0);
  const sumTyLeThoiHieuLuyKe =
    totalLkDonAll > 0
      ? totalLkKyNhanAll / totalLkDonAll
      : null;

  const activeBranch =
    branch ||
    gsFiltered.find((r) => r.maBC)?.maBC ||
    knMonth.find((r) => r.maBC)?.maBC ||
    dataset.branches[0] ||
    '';

  return {
    reportDate: targetDate,
    prevDate,
    branch: activeBranch,
    table1,
    table2,
    summary2: {
      soDonPhat: sumDonPhat,
      tongKyNhan: sumTongKyNhan,
      tyLeDonTon: sumTyLeDonTon,
      tyLeQR: avgTyLeQR,
      tyLeKyNhanTong: sumTyLeKyNhanTong,
      tyLeThoiHieuNgay: sumTyLeThoiHieuNgay,
      tyLeThoiHieuLuyKe: sumTyLeThoiHieuLuyKe,
    },
  };
}
