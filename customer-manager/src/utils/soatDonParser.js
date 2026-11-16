import * as XLSX from 'xlsx';

/**
 * Parser cho tính năng Soát Đơn (upload 3 file, không lưu DB).
 *
 * File 1 - Xuất vận đơn phát hàng:
 *   Mã vận đơn | Người nhận | Tên hàng hóa | Shipper | COD gốc | Tiền thu hộ COD | Địa chỉ chi tiết nơi nhận hàng
 *
 * File 2 - Trạng thái MVĐ:
 *   Mã vận đơn | Trạng thái hiện tại | Thời gian thao tác hiện tại | Bưu cục đang thao tác |
 *   Người thao tác | Loại quét kiện cuối cùng | Xác nhận chuyển hoàn | Xác nhận ký nhận |
 *   Dấu kết thúc | Mã khách hàng | Số tiền COD | ...
 *
 * File 3 - Kỳ nhận trong ngày – Chi tiết (42 cột):
 *   Mã vận đơn | TTKT cuối | ... | Thời gian hàng đến | ... | Tên nhân viên phát hàng |
 *   Số ngày lưu trữ | Thời gian kiện vấn đề | Loại kiện vấn đề | Phân loại kiện vấn đề |
 *   Thời gian đăng ký chuyển hoàn | Có phải đơn CH | Loại quét mới nhất | ...
 */

// ─────────────────── helpers ───────────────────
export function readSheet(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', raw: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) throw new Error('File không có sheet dữ liệu.');
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
        resolve(rows);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/** Phân tích giá trị ngày giờ từ Excel (serial number, Date, hoặc string nhiều định dạng) */
export function parseExcelDate(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return {
      year: v.getFullYear(),
      month: v.getMonth() + 1,
      day: v.getDate(),
      hours: v.getHours(),
      minutes: v.getMinutes(),
      hasTime: true,
    };
  }
  const s = String(v).trim();
  if (!s) return null;

  const num = typeof v === 'number' ? v : (/^\d{5}(?:\.\d+)?$/.test(s) ? Number(s) : NaN);
  if (!Number.isNaN(num) && num > 20000 && num < 100000) {
    // Excel serial (UTC base 1899-12-30)
    const d = new Date(Math.round((num - 25569) * 86400000));
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hours: d.getUTCHours(),
      minutes: d.getUTCMinutes(),
      hasTime: Math.abs(num - Math.floor(num)) > 1e-6,
    };
  }

  // YYYY-MM-DD hoặc YYYY/MM/DD [HH:mm[:ss]]
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m) {
    return {
      year: +m[1],
      month: +m[2],
      day: +m[3],
      hours: m[4] !== undefined ? +m[4] : 0,
      minutes: m[5] !== undefined ? +m[5] : 0,
      hasTime: m[4] !== undefined,
    };
  }

  // DD/MM/YYYY hoặc DD-MM-YYYY [HH:mm[:ss]]
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[\sT]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m) {
    let day = +m[1];
    let month = +m[2];
    if (month > 12 && day <= 12) {
      const tmp = day;
      day = month;
      month = tmp;
    }
    return {
      year: +m[3],
      month,
      day,
      hours: m[4] !== undefined ? +m[4] : 0,
      minutes: m[5] !== undefined ? +m[5] : 0,
      hasTime: m[4] !== undefined,
    };
  }

  return null;
}

/** Chuyển Excel serial number hoặc string thành Date string "DD/MM/YYYY HH:mm" */
export function fmtExcelDate(v) {
  if (v === '' || v === null || v === undefined) return '';
  const p = parseExcelDate(v);
  if (!p) return String(v).trim();
  const pad = (n) => String(n).padStart(2, '0');
  const datePart = `${pad(p.day)}/${pad(p.month)}/${p.year}`;
  return p.hasTime ? `${datePart} ${pad(p.hours)}:${pad(p.minutes)}` : datePart;
}

/** Tính số ngày tồn từ thời gian quét đến tới ngày hiện tại */
export function calcDaysFromNow(v, now = new Date()) {
  const p = parseExcelDate(v);
  if (!p) return null;
  const todayStart = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const scanStart = Date.UTC(p.year, p.month - 1, p.day);
  if (Number.isNaN(scanStart)) return null;
  return Math.max(0, Math.floor((todayStart - scanStart) / 86400000));
}

/** Chuẩn hoá tên cột: bỏ dấu, hạ chữ thường, bỏ ký tự không phải chữ/số */
const nk = (s) =>
  String(s ?? '')
    .replace(/đ/gi, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const CODE_KEYS = ['mavandon', 'mavd', 'mvd', 'sovandon', 'vandon', 'waybillno', 'waybill'];

/** Tìm dòng tiêu đề (có thể không phải dòng 1 nếu file có dòng tiêu đề phụ phía trên) */
function findHeaderRow(rows) {
  const limit = Math.min(rows.length, 20);
  for (let i = 0; i < limit; i++) {
    if ((rows[i] || []).some((c) => CODE_KEYS.includes(nk(c)))) return i;
  }
  return 0;
}

/**
 * Chuyển rows thành mảng object với key = tên cột đã chuẩn hoá.
 * Trả về { list, map } (map theo mã vận đơn).
 */
function buildTable(rows) {
  if (!rows || rows.length < 2) return { list: [], map: {}, labels: [] };
  const hi = findHeaderRow(rows);
  const labels = (rows[hi] || []).map((h) => String(h ?? '').trim()).filter(Boolean);
  const headers = (rows[hi] || []).map(nk);
  const list = [];
  const map = {};
  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const obj = {};
    headers.forEach((h, j) => {
      if (h && (obj[h] === undefined || obj[h] === '')) obj[h] = row[j] ?? '';
    });
    const codeKey = CODE_KEYS.find((k) => obj[k] !== undefined && String(obj[k]).trim() !== '');
    const code = String(codeKey ? obj[codeKey] : '').trim().toUpperCase();
    if (!code) continue;
    obj.__code = code;
    list.push(obj);
    if (map[code]) {
      for (const [k, v] of Object.entries(obj)) {
        if (v !== '' && v !== undefined && (map[code][k] === '' || map[code][k] === undefined)) {
          map[code][k] = v;
        }
      }
    } else {
      map[code] = { ...obj };
    }
  }
  return { list, map, labels };
}

/**
 * Lấy giá trị theo danh sách tên cột (đã chuẩn hoá) từ nhiều nguồn.
 * Khớp chính xác trước, sau đó khớp "chứa" (trừ các key bị exclude).
 */
function pick(sources, aliases, exclude = []) {
  for (const src of sources) {
    if (!src) continue;
    for (const a of aliases) {
      const v = src[a];
      if (v !== undefined && String(v).trim() !== '') return v;
    }
  }
  for (const src of sources) {
    if (!src) continue;
    for (const key of Object.keys(src)) {
      if (key.startsWith('__') || exclude.some((x) => key.startsWith(x))) continue;
      if (aliases.some((a) => key.includes(a)) && String(src[key]).trim() !== '') return src[key];
    }
  }
  return '';
}

/**
 * Lấy giá trị ngày giờ hợp lệ theo danh sách tên cột từ nhiều nguồn.
 */
function pickDate(sources, aliases, exclude = []) {
  for (const src of sources) {
    if (!src) continue;
    for (const a of aliases) {
      const v = src[a];
      if (v !== undefined && String(v).trim() !== '' && parseExcelDate(v)) return v;
    }
  }
  for (const src of sources) {
    if (!src) continue;
    for (const key of Object.keys(src)) {
      if (key.startsWith('__') || exclude.some((x) => key.includes(x))) continue;
      if (aliases.some((a) => key.includes(a)) && String(src[key]).trim() !== '' && parseExcelDate(src[key])) {
        return src[key];
      }
    }
  }
  return '';
}

const ARRIVAL_DATE_ALIASES = [
  'thoigianquetden',
  'thoigianquetkienden',
  'thoigianhangden',
  'thoigiandenbuucuc',
  'thoigiannhapkho',
  'thoigianden',
  'tgquetden',
  'tghangden',
  'ngayquetden',
  'ngayhangden',
  'ngayden',
  'quetden',
  'hangden',
];

const ARRIVAL_DATE_EXCLUDE = [
  'kienvande',
  'kienvd',
  'chuyenhoan',
  'kynhan',
  'thaotac',
  'phathang',
];

// ─────────────────── main parser ───────────────────
/**
 * Merge 3 file thành danh sách đơn.
 * @param {File} file1 - Xuất vận đơn phát hàng
 * @param {File} file2 - Trạng thái MVĐ
 * @param {File} file3 - Kỳ nhận trong ngày – Chi tiết
 * @returns {Promise<{rows: SoatDonRow[], stats: object, warnings: string[]}>}
 */
export async function parseSoatDon(file1, file2, file3) {
  const warnings = [];
  const now = new Date();

  // Đọc các file (file2 và file3 bắt buộc, file1 tùy chọn)
  const [rows1, rows2, rows3] = await Promise.all([
    file1 ? readSheet(file1) : Promise.resolve(null),
    file2 ? readSheet(file2) : Promise.resolve(null),
    file3 ? readSheet(file3) : Promise.resolve(null),
  ]);

  // Dùng file3 (Kỳ nhận) làm base vì nó có nhiều thông tin nhất (42 cột)
  // Nếu không có file3 thì dùng file2, nếu không có file2 thì dùng file1
  let baseRows, baseLabel;
  if (rows3 && rows3.length > 1) { baseRows = rows3; baseLabel = 'File 3'; }
  else if (rows2 && rows2.length > 1) { baseRows = rows2; baseLabel = 'File 2'; warnings.push('Không có File 3, dùng File 2 làm nguồn chính.'); }
  else if (rows1 && rows1.length > 1) { baseRows = rows1; baseLabel = 'File 1'; warnings.push('Chỉ có File 1 — dữ liệu sẽ thiếu nhiều cột.'); }
  else throw new Error('Cần ít nhất 1 file có dữ liệu.');

  const t1 = buildTable(rows1);
  const t2 = buildTable(rows2);
  const t3 = buildTable(baseRows);
  const map1 = t1.map; // vận đơn phát hàng
  const map2 = t2.map; // trạng thái MVĐ
  const map3 = t3.map;
  const result = [];

  for (const b of t3.list) {
    const code = b.__code;
    const rowBase = map3[code] || b;
    const f1 = map1[code] || {};
    const f2 = map2[code] || {};
    const S = (...srcs) => (aliases, ex) => String(pick(srcs, aliases, ex) ?? '').trim();

    const tenNV = S(rowBase, f2)(['tennhanvienphathang', 'nhanvienphathang', 'nhanvienphat', 'nguoithaotac']);
    const nguoiNhan = S(f1, rowBase, f2)(['nguoinhan', 'tennguoinhan']);
    const diaChi = S(f1, rowBase, f2)(['diachichitietnoinhanhang', 'diachichitiet', 'diachinguoinhan', 'diachi']);
    const shipper = S(f1, rowBase, f2)(['shipper']);

    // Thời gian quét đến / Thời gian hàng đến
    const rawQuetDen = pickDate([rowBase, f2, f1], ARRIVAL_DATE_ALIASES, ARRIVAL_DATE_EXCLUDE);
    const tgHangDen = fmtExcelDate(rawQuetDen);

    // Số ngày tồn / lưu kho: tính từ thời gian quét đến tới ngày hiện tại
    let daysVal = calcDaysFromNow(rawQuetDen, now);
    let soNgay = daysVal !== null ? String(daysVal) : '';

    // Fallback nếu không có thời gian quét đến thì lấy từ cột số ngày tồn/lưu kho trong file
    if (soNgay === '') {
      const rawLuuKho = pick([rowBase, f2, f1], [
        'songayton', 'ngayton', 'songayluukho', 'ngayluukho', 'songayluutru', 'ngayluutru',
        'thoigianluukho', 'thoigianluutru', 'luukho', 'luutru',
      ]);
      if (rawLuuKho !== '' && rawLuuKho !== null && rawLuuKho !== undefined) {
        const dFromLuuKho = calcDaysFromNow(rawLuuKho, now);
        if (dFromLuuKho !== null) {
          soNgay = String(dFromLuuKho);
        } else {
          const numDays = parseFloat(String(rawLuuKho).trim());
          if (!Number.isNaN(numDays) && numDays >= 0) soNgay = String(Math.floor(numDays));
        }
      }
    }

    // Thời gian kiện vấn đề
    const tgKien = fmtExcelDate(pick([rowBase, f2, f1], [
      'thoigiankienvande', 'thoigiankienvd', 'tgkienvande', 'tgkienvd',
      'thoigianghinhankienvande', 'thoigiandangkykienvande',
    ]));

    // Loại kiện vấn đề (không lấy nhầm "Phân loại kiện vấn đề")
    const loaiKien = S(rowBase, f2, f1)(['loaikienvande', 'loaikienvd', 'loaikienvande'], ['phanloai']);
    const phanLoaiKien = S(rowBase, f2, f1)(['phanloaikienvande', 'phanloaikienvd']);

    const trangThai = S(f2, rowBase)(['trangthaihientai', 'trangthai']);
    const tgThaoTac = fmtExcelDate(pick([f2, rowBase], ['thoigianthaotaccuoicung', 'thoigianthaotachientai', 'thoigianthaotac']));
    const loaiQuetKien = S(f2, rowBase)(['loaiquetkiencuoicung', 'loaiquetmoinhat', 'loaiquetkiencuoi']);
    const xnKyNhan = S(f2, rowBase)(['xacnhankynhan']);
    const xnChuyenHoan = S(f2, rowBase)(['xacnhanchuyenhoan', 'cophaidonch']);
    const buuCucPhat = S(rowBase, f2)(['buucucphat', 'mabuucucphat']);
    const tgChuyenHoan = fmtExcelDate(pick([rowBase, f2], ['thoigiandangkychuyenhoan']));
    const cod = S(f1, f2, rowBase)(['tienthuhocod', 'sotiencod', 'codgoc']);
    const giaTriCao = S(rowBase, f2, f1)(['giatricao', 'kiengiatricao', 'hanggiatricao']);
    const kiemTon = S(rowBase, f2, f1)(['kiemton', 'kiemtonkho']);
    const dauTichPhatLai = S(rowBase, f2, f1)(['dautichphatlai', 'phatlai', 'dautichphat']);

    result.push({
      maVanDon: code,
      tenNhanVienPhatHang: tenNV,
      nguoiNhan,
      diaChi,
      shipper,
      soNgayLuuTru: soNgay,
      thoiGianHangDen: tgHangDen,
      trangThai,
      thoiGianThaoTac: tgThaoTac,
      loaiQuetKienCuoi: loaiQuetKien,
      thoiGianKienVanDe: tgKien,
      loaiKienVanDe: loaiKien,
      phanLoaiKienVanDe: phanLoaiKien,
      xacNhanKyNhan: xnKyNhan,
      xacNhanChuyenHoan: xnChuyenHoan,
      thoiGianChuyenHoan: tgChuyenHoan,
      buuCucPhat,
      cod,
      giaTriCao,
      kiemTon,
      dauTichPhatLai,
      // derived
      _statusCode: deriveStatus(loaiKien, trangThai, xnKyNhan, xnChuyenHoan),
    });
  }

  // Cảnh báo nếu các cột quan trọng hoàn toàn trống để dễ biết là lệch tên cột
  if (result.length) {
    const none = (k) => result.every((r) => r[k] === '' || r[k] === null || r[k] === undefined);
    if (none('soNgayLuuTru')) {
      const allLabels = [...new Set([...t3.labels, ...t2.labels, ...t1.labels])];
      warnings.push(`Không tìm thấy cột "Thời gian quét đến" để tính số ngày tồn. Các cột trong file: ${allLabels.join(' | ')}`);
    }
    if (none('thoiGianKienVanDe')) warnings.push('Không tìm thấy cột "Thời gian kiện vấn đề".');
    if (none('loaiKienVanDe')) warnings.push('Không tìm thấy cột "Loại kiện vấn đề".');
  }

  const stats = computeStats(result);
  return { rows: result, stats, warnings, baseLabel };
}

function deriveStatus(loaiKien, trangThai, xnKy, xnHoan) {
  const nk2 = (s) => String(s).replace(/đ/gi, 'd').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const k = nk2(loaiKien + ' ' + trangThai);
  if (k.includes('tu choi') || k.includes('khong nhan')) return 'refused';
  if (nk2(xnKy).includes('thanh cong') || k.includes('ky nhan')) return 'delivered';
  if (nk2(xnHoan) === 'co' || nk2(xnHoan) === 'y' || k.includes('chuyen hoan')) return 'returning';
  if (k.includes('phat hang') || k.includes('dang phat')) return 'delivering';
  if (k.includes('hang den') || k.includes('den buu cuc')) return 'arrived';
  if (k.includes('hen lai') || k.includes('hua nhan')) return 'rescheduled';
  if (k.includes('khong lien lac') || k.includes('khong lien he')) return 'nocontact';
  return 'other';
}

function computeStats(rows) {
  return {
    total: rows.length,
    delivered: rows.filter((r) => r._statusCode === 'delivered').length,
    refused: rows.filter((r) => r._statusCode === 'refused').length,
    returning: rows.filter((r) => r._statusCode === 'returning').length,
    delivering: rows.filter((r) => r._statusCode === 'delivering').length,
    arrived: rows.filter((r) => r._statusCode === 'arrived').length,
    rescheduled: rows.filter((r) => r._statusCode === 'rescheduled').length,
    nocontact: rows.filter((r) => r._statusCode === 'nocontact').length,
    hasStaff: rows.filter((r) => r.tenNhanVienPhatHang).length,
    hasIssue: rows.filter((r) => r.loaiKienVanDe).length,
    isReturning: rows.filter((r) => r.xacNhanChuyenHoan === 'Có' || r.xacNhanChuyenHoan === 'Y').length,
  };
}
