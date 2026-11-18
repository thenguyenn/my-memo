import { calcDaysFromNow, fmtExcelDate, parseExcelDate, readSheet } from './soatDonParser';
import {
  computeAutoCareDetail,
  extractPlaceFromStatusText,
  isPureBranchCode,
  isSigned,
} from './careDonParser';

/**
 * Parser riêng cho chức năng Chạy 24h (2 file):
 *
 *  File 1 - Giám sát tồn kho chi tiết:
 *    Mã vận đơn | Tên nhân viên phát hàng / Tên shipper | Tên người nhận | Tên sản phẩm / Tên hàng hóa |
 *    Số tiền COD | Thời gian hàng đến / Thời gian quét đến | Số ngày lưu trữ / lưu kho |
 *    Loại kiện vấn đề | Phân loại kiện vấn đề | Địa chỉ | SĐT ...
 *
 *  File 2 - Trạng thái MVĐ:
 *    Mã vận đơn | Trạng thái hiện tại | Loại quét kiện cuối cùng | Thời gian thao tác hiện tại |
 *    Người thao tác | Loại kiện vấn đề | Xác nhận ký nhận | Xác nhận chuyển hoàn |
 *    Tên người nhận | Tên hàng hóa / Tên sản phẩm | Số tiền COD ...
 *
 * Tự động xử lý:
 *  - Đối chiếu theo Mã vận đơn (MVĐ) giữa 2 file.
 *  - Tự động XÓA các dữ liệu của ngày hiện tại (các vận đơn có Thời gian hàng đến / Thời gian quét đến
 *    trùng với ngày hiện tại hoặc có Số ngày lưu trữ / lưu kho = 0).
 *  - Hiển thị 7 cột chuẩn: MVĐ | Tên shipper | Tên người nhận | Tên sản phẩm | COD | Trạng thái | Chi tiết.
 */

const nk = (s) =>
  String(s ?? '')
    .replace(/đ/gi, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const txt = (v) => String(v ?? '').trim();

const CODE_KEYS = [
  'mavandon',
  'mavd',
  'mvd',
  'sovandon',
  'vandon',
  'waybillno',
  'waybill',
  'madonhang',
  'madon',
];

function buildTable(rows) {
  if (!rows || rows.length < 2) return { list: [], map: new Map(), labels: [], headerKeys: [] };
  let hi = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    if ((rows[i] || []).some((c) => CODE_KEYS.includes(nk(c)))) {
      hi = i;
      break;
    }
  }
  const labels = (rows[hi] || []).map((h) => String(h ?? '').trim()).filter(Boolean);
  const headers = (rows[hi] || []).map(nk);
  const map = new Map();
  const list = [];
  for (let i = hi + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    const obj = {};
    headers.forEach((h, j) => {
      if (h && (obj[h] === undefined || obj[h] === '')) obj[h] = row[j] ?? '';
    });
    const ck = CODE_KEYS.find((k) => obj[k] !== undefined && String(obj[k]).trim() !== '');
    const code = String(ck ? obj[ck] : '').trim().toUpperCase();
    if (!code) continue;
    const prev = map.get(code);
    if (prev) {
      for (const [k, v] of Object.entries(obj)) {
        if (v !== '' && (prev[k] === '' || prev[k] === undefined)) prev[k] = v;
      }
    } else {
      map.set(code, obj);
      list.push(code);
    }
  }
  return { list, map, labels, headerKeys: headers.filter(Boolean) };
}

function pick(src, aliases, exclude = []) {
  if (!src) return '';
  for (const a of aliases) {
    const v = src[a];
    if (v !== undefined && String(v).trim() !== '') return v;
  }
  for (const key of Object.keys(src)) {
    if (exclude.some((x) => key.includes(x))) continue;
    if (aliases.some((a) => key.startsWith(a) || key.includes(a)) && String(src[key]).trim() !== '') {
      return src[key];
    }
  }
  return '';
}

function pickDate(src, aliases, exclude = []) {
  if (!src) return '';
  for (const a of aliases) {
    const v = src[a];
    if (v !== undefined && String(v).trim() !== '' && parseExcelDate(v)) return v;
  }
  for (const key of Object.keys(src)) {
    if (exclude.some((x) => key.includes(x))) continue;
    if (
      aliases.some((a) => key.startsWith(a) || key.includes(a)) &&
      String(src[key]).trim() !== '' &&
      parseExcelDate(src[key])
    ) {
      return src[key];
    }
  }
  return '';
}

const toNum = (v) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Kiểm tra một giá trị ngày giờ có trùng với ngày hiện tại (today) hay không */
export function isCurrentDayDate(v, now = new Date()) {
  const p = parseExcelDate(v);
  if (!p) return false;
  return (
    p.year === now.getFullYear() &&
    p.month === now.getMonth() + 1 &&
    p.day === now.getDate()
  );
}

export function fmtTodayVN(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
}

const ARRIVAL_DATE_ALIASES = [
  'thoigianhangden',
  'thoigianquetden',
  'thoigianquetkienden',
  'thoigiandenbuucuc',
  'thoigiannhapkho',
  'thoigianden',
  'tghangden',
  'tgquetden',
  'ngayhangden',
  'ngayquetden',
  'ngayden',
  'hangden',
  'quetden',
  'thoigiannhankien',
  'thoigiannhapkien',
  'thoigiannhap',
  'ngaytonkho',
  'ngay',
];

const ARRIVAL_DATE_EXCLUDE = [
  'kienvande',
  'kienvd',
  'chuyenhoan',
  'kynhan',
  'thaotac',
  'phathang',
  'songay',
];

const SHIPPER_ALIASES = [
  'tennhanvienphathang',
  'nhanvienphatkien',
  'nhanvienphathang',
  'tennhanvienphat',
  'nhanvienphat',
  'tenshipper',
  'shipper',
  'tennhanviengiaohang',
  'nhanviengiaohang',
  'nhanviengiao',
  'nguoiphathang',
  'nguoiphat',
  'nguoigiaohang',
  'nguoigiao',
];

const SHIPPER_EXCLUDE = [
  'sdt',
  'sodienthoai',
  'dienthoai',
  'manhanvien',
  'manv',
  'mashipper',
  'mabuucuc',
  'mabc',
  'tyle',
  'tile',
  'sodon',
  'luong',
];

const RECEIVER_ALIASES = [
  'tennguoinhan',
  'nguoinhan',
  'tenkhachnhan',
  'khachnhan',
  'tennguoimua',
  'nguoimua',
];

const RECEIVER_EXCLUDE = [
  'sdt',
  'sodienthoai',
  'dienthoai',
  'diachi',
  'ma',
  'buucuc',
  'tram',
  'tinh',
  'quan',
  'huyen',
  'xa',
  'phuong',
  'nguoigui',
  'phathang',
  'nhanvien',
];

const PRODUCT_ALIASES = [
  'tensanpham',
  'sanpham',
  'tenhanghoa',
  'tenhang',
  'noidunghanghoa',
  'hanghoa',
  'tenvatpham',
  'vatpham',
  'loaihanghoa',
  'loaihang',
  'tenmathang',
  'mathang',
];

const PRODUCT_EXCLUDE = [
  'loaikien',
  'phanloai',
  'kiemton',
  'giatri',
  'trongluong',
  'khoiluong',
  'sotien',
  'cod',
  'phi',
  'hangden',
  'nhanhang',
  'phathang',
  'guihang',
  'khachhang',
  'donhang',
  'kienhang',
];

const COD_ALIASES = [
  'sotiencod',
  'tienthuhocod',
  'codgoc',
  'cod',
  'sotienthuho',
  'tienthuho',
  'tongtiencod',
];

const COD_EXCLUDE = ['phi', 'cuoc'];

/**
 * Kiểm tra xem một dòng dữ liệu có thuộc ngày hiện tại hay không:
 *  1. Nếu có ngày hàng đến / quét đến (rawQuetDen): kiểm tra trùng ngày hiện tại (isCurrentDayDate)
 *  2. Nếu không có cột ngày hàng đến nhưng có cột Số ngày lưu trữ / lưu kho = 0 -> thuộc ngày hiện tại
 */
export function isRowFromCurrentDay(rawQuetDen, rawLuuKho, now = new Date()) {
  if (rawQuetDen && parseExcelDate(rawQuetDen)) {
    return isCurrentDayDate(rawQuetDen, now);
  }
  if (rawLuuKho !== '' && rawLuuKho !== null && rawLuuKho !== undefined) {
    if (parseExcelDate(rawLuuKho)) {
      return isCurrentDayDate(rawLuuKho, now);
    }
    const n = parseFloat(String(rawLuuKho).trim());
    if (!Number.isNaN(n) && Math.floor(n) === 0) {
      return true;
    }
  }
  return false;
}

export async function parseChay24h(fileTonKho, fileTrangThai) {
  if (!fileTonKho && !fileTrangThai) {
    throw new Error('Vui lòng chọn ít nhất 1 file Excel.');
  }

  const warnings = [];
  const now = new Date();
  const todayLabel = fmtTodayVN(now);

  const [rows1, rows2] = await Promise.all([
    fileTonKho ? readSheet(fileTonKho) : null,
    fileTrangThai ? readSheet(fileTrangThai) : null,
  ]);

  let t1 = buildTable(rows1);
  let t2 = buildTable(rows2);

  if (fileTonKho && !t1.list.length) {
    throw new Error('File "Giám sát tồn kho chi tiết" không có cột Mã vận đơn hoặc không có dữ liệu.');
  }
  if (fileTrangThai && !t2.list.length) {
    throw new Error('File "Trạng thái MVĐ" không có cột Mã vận đơn hoặc không có dữ liệu.');
  }

  // Nếu người dùng chọn nhầm vị trí 2 file (đặt Trạng thái MVĐ ở ô 1 và Giám sát tồn kho ở ô 2), tự động hoán đổi
  if (t1.list.length && t2.list.length) {
    const hasInvCols = (t) =>
      t.headerKeys.some((k) =>
        ['thoigianhangden', 'songayluutru', 'songayluukho', 'kiemton', 'tennhanvienphathang'].some((a) =>
          k.includes(a)
        )
      );
    const isT1Inv = hasInvCols(t1);
    const isT2Inv = hasInvCols(t2);
    if (!isT1Inv && isT2Inv) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
  }

  const baseCodes = t1.list.length ? t1.list : t2.list;
  if (!t1.list.length) {
    warnings.push('Không có file Giám sát tồn kho chi tiết — thiếu thông tin tồn kho & shipper.');
  }
  if (!t2.list.length) {
    warnings.push('Không có file Trạng thái MVĐ — trạng thái lấy theo file Giám sát tồn kho chi tiết.');
  }

  let missingInT2 = 0;
  let removedTodayCount = 0;
  const rows = [];

  for (const code of baseCodes) {
    const a = t1.map.get(code) || {};
    const b = t2.map.get(code);
    const s = b || {};

    // Thời gian hàng đến / quét đến (ưu tiên từ file Giám sát tồn kho chi tiết)
    const rawQuetDen =
      pickDate(a, ARRIVAL_DATE_ALIASES, ARRIVAL_DATE_EXCLUDE) ||
      pickDate(s, ARRIVAL_DATE_ALIASES, ARRIVAL_DATE_EXCLUDE) ||
      pickDate(a, ['thoigiannhanhang', 'thoigiannhan', 'thoigiantaodon', 'thoigiangui', 'ngaygui']) ||
      pickDate(s, ['thoigiantaodon', 'thoigiannhap', 'thoigiangui']);

    const rawLuuKho =
      pick(a, ['songayluutru', 'songayluukho', 'songayton', 'ngayluutru', 'ngayluukho', 'ngayton']) ||
      pick(s, ['songayluutru', 'songayluukho', 'songayton', 'ngayluutru', 'ngayluukho', 'ngayton']);

    // Tự động xóa các dữ liệu của ngày hiện tại
    if (isRowFromCurrentDay(rawQuetDen, rawLuuKho, now)) {
      removedTodayCount++;
      continue;
    }

    if (t2.list.length && t1.list.length && !b) missingInT2++;

    let soNgayLuuKho = calcDaysFromNow(rawQuetDen, now);
    if (soNgayLuuKho === null && rawLuuKho !== '' && rawLuuKho !== null && rawLuuKho !== undefined) {
      const dFromDate = calcDaysFromNow(rawLuuKho, now);
      if (dFromDate !== null) {
        soNgayLuuKho = dFromDate;
      } else {
        const n = parseFloat(String(rawLuuKho).trim());
        if (!Number.isNaN(n) && n >= 0) soNgayLuuKho = Math.floor(n);
      }
    }

    const thoiGianQuetDen = fmtExcelDate(rawQuetDen);

    // Tên shipper (ưu tiên Nhân viên phát hàng / Shipper trong file Giám sát tồn kho chi tiết)
    const tenShipper = txt(
      pick(a, SHIPPER_ALIASES, SHIPPER_EXCLUDE) ||
        pick(s, SHIPPER_ALIASES, SHIPPER_EXCLUDE) ||
        pick(a, ['nguoithaotac', 'nguoiphutrach'], SHIPPER_EXCLUDE) ||
        pick(s, ['nguoithaotac', 'nguoiphutrach'], SHIPPER_EXCLUDE)
    );

    // Tên người nhận
    const tenNguoiNhan = txt(
      pick(a, RECEIVER_ALIASES, RECEIVER_EXCLUDE) ||
        pick(s, RECEIVER_ALIASES, RECEIVER_EXCLUDE)
    );

    // Tên sản phẩm
    const tenSanPham = txt(
      pick(a, PRODUCT_ALIASES, PRODUCT_EXCLUDE) ||
        pick(s, PRODUCT_ALIASES, PRODUCT_EXCLUDE)
    );

    // Số tiền COD
    const cod = toNum(
      pick(a, COD_ALIASES, COD_EXCLUDE) ||
        pick(s, COD_ALIASES, COD_EXCLUDE)
    );

    // Trạng thái & Loại quét cuối
    const trangThaiFile1 = txt(pick(a, ['trangthaihientai', 'trangthai', 'loaiquethientai'], ['kynhan', 'hoan']));
    const moTaTrangThai = txt(pick(s, ['trangthaihientai', 'trangthai'], ['kynhan', 'hoan']) || trangThaiFile1);
    const loaiQuetCuoi = txt(
      pick(s, ['loaiquetkiencuoicung', 'loaiquetmoinhat', 'loaiquetkiencuoi', 'loaiquet', 'thaotaccuoi']) ||
        pick(a, ['loaiquetmoinhat', 'loaiquetkiencuoicung', 'loaiquetkiencuoi', 'loaiquet', 'trangthai'])
    );

    const isLongDesc = moTaTrangThai.length > 35 || moTaTrangThai.includes('【');
    const trangThai =
      isLongDesc && loaiQuetCuoi && !loaiQuetCuoi.includes('【')
        ? loaiQuetCuoi
        : loaiQuetCuoi || moTaTrangThai || trangThaiFile1;

    // Thời gian thao tác cuối
    const rawThaoTac =
      pickDate(s, [
        'thoigianthaotachientai',
        'thoigianthaotaccuoicung',
        'thoigianthaotac',
        'thoigianquetcuoi',
        'thoigianquetmoinhat',
        'thoigiancapnhat',
      ]) ||
      pickDate(a, ['thoigianthaotaccuoicung', 'thoigianthaotac', 'thoigiancapnhat']) ||
      rawQuetDen;
    const thoiGianThaoTac = fmtExcelDate(rawThaoTac);

    // Thông tin bổ sung phục vụ suy luận cột Chi tiết và mở modal xem chi tiết đơn
    const xnKyNhan = txt(pick(s, ['xacnhankynhan', 'daukynhan']) || pick(a, ['xacnhankynhan', 'daukynhan']));
    const xnChuyenHoan = txt(
      pick(s, ['xacnhanchuyenhoan', 'cophaidonch']) || pick(a, ['cophaidonch', 'xacnhanchuyenhoan'])
    );
    let loaiKienVanDe = txt(
      pick(a, ['loaikienvande', 'loaikienvd'], ['phanloai', 'thoigian', 'ngay']) ||
        pick(s, ['loaikienvande', 'loaikienvd'], ['phanloai', 'thoigian', 'ngay'])
    );
    if (!loaiKienVanDe && moTaTrangThai) {
      const mReason = moTaTrangThai.match(/Nguyên nhân\s*kiện vấn đề[^【]*【([^】]+)】/i);
      if (mReason) loaiKienVanDe = mReason[1].trim();
    }
    const phanLoaiKienVanDe = txt(
      pick(a, ['phanloaikienvande', 'phanloaikienvd'], ['thoigian', 'ngay']) ||
        pick(s, ['phanloaikienvande', 'phanloaikienvd'], ['thoigian', 'ngay'])
    );
    const dauTichPhatLai = txt(
      pick(a, ['dautichphatlai', 'phatlai', 'dautichphat']) || pick(s, ['dautichphatlai', 'phatlai'])
    );
    const chiTietFile = txt(
      pick(a, ['chitiet', 'ghichu', 'noidungchamsoc', 'lydokienvande']) ||
        pick(s, ['chitiet', 'ghichu', 'lydokienvande'])
    );
    const sdtNguoiNhan = txt(
      pick(a, ['sodienthoainguoinhan', 'sdtnguoinhan', 'dienthoainguoinhan', 'sdtnhan']) ||
        pick(s, ['sodienthoainguoinhan', 'sdtnguoinhan', 'dienthoainguoinhan', 'sdtnhan'])
    );
    const ADDR_EXCLUDE = ['diachilay', 'layhang', 'nguoigui', 'guihang', 'xuatphat', 'buucucgui', 'khachhang'];
    const diaChi = txt(
      pick(
        a,
        ['diachichitietnoinhanhang', 'diachinguoinhan', 'diachinoinhan', 'diachinhan', 'diachigiao', 'diachiphat', 'diachichitiet', 'diachi'],
        ADDR_EXCLUDE
      ) ||
        pick(
          s,
          ['diachichitietnoinhanhang', 'diachinguoinhan', 'diachinoinhan', 'diachinhan', 'diachigiao', 'diachiphat', 'diachichitiet', 'diachi'],
          ADDR_EXCLUDE
        )
    );
    let dangO = txt(
      pick(s, ['tenbcthaotacthuctecuoicung', 'tenbuucucthaotacthuctecuoicung', 'tenbuucucdangthaotac', 'tenbuucucthaotac', 'dango']) ||
        pick(a, ['tenbuucucphat', 'buucucphat', 'ttktcuoi', 'dango'])
    );
    if (isPureBranchCode(dangO) && moTaTrangThai) {
      const extracted = extractPlaceFromStatusText(moTaTrangThai);
      if (extracted) dangO = extracted;
    }

    const baseRow = {
      maVanDon: code,
      tenShipper,
      tenNguoiNhan,
      tenSanPham,
      tenHang: tenSanPham,
      cod,
      trangThai,
      moTaTrangThai,
      trangThaiFile1,
      dangO,
      sdtNguoiNhan,
      diaChi,
      thoiGianQuetDen,
      soNgayLuuKho,
      chiTietFile,
      thoiGianThaoTac,
      nguoiThaoTac: tenShipper,
      loaiQuetCuoi: loaiQuetCuoi || trangThai,
      loaiKienVanDe,
      phanLoaiKienVanDe,
      dauTichPhatLai,
      xnKyNhan,
      xnChuyenHoan,
      hasStatusFile: !!b,
      _signed: isSigned(moTaTrangThai || trangThai, xnKyNhan, loaiQuetCuoi, xnChuyenHoan),
    };

    const computed = computeAutoCareDetail(baseRow);
    rows.push({
      ...baseRow,
      autoDetail: computed.detail,
      autoTone: computed.tone,
      autoStatus: computed.autoStatus,
    });
  }

  if (removedTodayCount > 0) {
    warnings.push(`Đã tự động xóa ${removedTodayCount} dữ liệu của ngày hiện tại (${todayLabel}).`);
  }
  if (missingInT2) {
    warnings.push(`${missingInT2} mã không có trong file Trạng thái MVĐ — dùng thông tin từ file Giám sát tồn kho chi tiết.`);
  }

  return {
    rows,
    warnings,
    removedTodayCount,
    totalBeforeFilter: baseCodes.length,
    todayLabel,
  };
}
