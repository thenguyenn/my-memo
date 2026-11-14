import * as XLSX from 'xlsx';

/**
 * Đọc file/bảng xuất từ hệ thống J&T (JMS) và chuyển thành danh sách đơn tồn.
 * Tự nhận diện cột theo tên tiêu đề; người dùng có thể chọn lại cột trong giao diện.
 */

const norm = (s) =>
  String(s ?? '')
    .replace(/đ/gi, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Thứ tự = độ ưu tiên. Khớp chính xác trước, khớp chứa sau.
const ALIASES = {
  waybill: ['ma van don', 'van don', 'waybill no', 'waybill number', 'waybill', 'bill code', 'billcode', 'ma don hang', 'ma don'],
  shipper: ['nhan vien giao hang', 'nhan vien giao', 'nhan vien phat', 'nv giao', 'nv phat', 'nguoi giao', 'shipper', 'delivery staff', 'courier', 'dispatcher'],
  shipperPhone: ['sdt nhan vien giao', 'sdt nv giao', 'sdt shipper', 'dien thoai nhan vien', 'sdt nhan vien'],
  stock: ['thoi gian den buu cuc', 'thoi gian quet den', 'thoi gian den', 'ngay den', 'thoi gian nhap kho', 'thoi gian quet cuoi', 'thoi gian quet', 'ngay quet', 'last scan', 'scan time', 'thoi gian cap nhat'],
  days: ['so ngay ton', 'ngay ton', 'ton kho', 'days'],
  receiver: ['ten nguoi nhan', 'nguoi nhan', 'receiver'],
  status: ['trang thai', 'status'],
  branch: ['buu cuc', 'chi nhanh', 'branch'],
};

function findCol(headers, aliases) {
  for (const a of aliases) {
    const i = headers.findIndex((h) => h === a);
    if (i >= 0) return i;
  }
  for (const a of aliases) {
    const i = headers.findIndex((h) => h && h.includes(a));
    if (i >= 0) return i;
  }
  return -1;
}

function detectMapping(headers) {
  const h = headers.map(norm);
  const m = {};
  for (const key of Object.keys(ALIASES)) m[key] = findCol(h, ALIASES[key]);
  return m;
}

function findHeaderRow(rows) {
  const limit = Math.min(rows.length, 15);
  for (let i = 0; i < limit; i++) {
    const cells = rows[i].map(norm);
    if (findCol(cells, ALIASES.waybill) >= 0) return i;
  }
  return 0;
}

function toIso(y, mo, d, H = 0, M = 0, S = 0) {
  // Dữ liệu J&T là giờ Việt Nam (UTC+7)
  const t = Date.UTC(y, mo - 1, d, H - 7, M, S);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function parseDateValue(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') {
    if (v < 20000 || v > 80000) return null;
    // Serial Excel (ngày kể từ 1899-12-30) -> các thành phần ngày giờ "như hiển thị trong ô"
    const d = new Date(Math.round((v - 25569) * 86400000));
    return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return toIso(+m[1], +m[2], +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (m) return toIso(+m[3], +m[2], +m[1], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  return null;
}

function makeTable(rows) {
  const clean = rows.filter((r) => r.some((c) => String(c ?? '').trim() !== ''));
  if (clean.length < 2) throw new Error('Không tìm thấy dữ liệu (cần dòng tiêu đề và ít nhất 1 dòng dữ liệu).');
  const headerIndex = findHeaderRow(clean);
  const headers = clean[headerIndex].map((c) => String(c ?? '').trim());
  const dataRows = clean.slice(headerIndex + 1);
  return { headers, dataRows, mapping: detectMapping(headers) };
}

export async function parseJtFile(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array', raw: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('File không có sheet dữ liệu.');
  return makeTable(XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }));
}

/** Dán trực tiếp từ bảng trên web J&T (copy → paste, các cột ngăn bằng Tab) */
export function parseJtText(text) {
  const rows = String(text || '').split(/\r?\n/).map((line) => line.split('\t'));
  return makeTable(rows);
}

/** Chuyển bảng + cách chọn cột thành danh sách đơn gửi lên server */
export function buildParcels({ dataRows }, mapping) {
  const get = (row, i) => (i >= 0 ? row[i] : '');
  const text = (row, i) => String(get(row, i) ?? '').trim();
  const now = Date.now();
  const rows = [];
  let skipped = 0;

  for (const row of dataRows) {
    const waybill = text(row, mapping.waybill);
    let since = parseDateValue(get(row, mapping.stock));
    if (!since && mapping.days >= 0) {
      const n = Number(get(row, mapping.days));
      if (Number.isFinite(n) && n >= 0) since = new Date(now - n * 86400000).toISOString();
    }
    if (!waybill || !since) {
      skipped++;
      continue;
    }
    rows.push({
      waybill,
      shipper_name: text(row, mapping.shipper),
      shipper_phone: text(row, mapping.shipperPhone),
      receiver_name: text(row, mapping.receiver),
      status: text(row, mapping.status),
      branch: text(row, mapping.branch),
      stock_since: since,
    });
  }
  return { rows, skipped };
}
