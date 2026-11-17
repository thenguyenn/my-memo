import { calcDaysFromNow, fmtExcelDate, parseExcelDate, readSheet } from './soatDonParser';

/**
 * Parser riêng cho Care đơn (2 file):
 *
 *  File 1 - Quản lý vận đơn gửi (nguồn danh sách đơn):
 *    Mã vận đơn | Tên người gửi | Tên người nhận | Thời gian quét đến / Thời gian nhập |
 *    Tên hàng | Số tiền COD | Trạng thái | Đang ở | Chi tiết | SĐT | Địa chỉ ...
 *
 *  File 2 - Trạng thái mã vận đơn (nguồn trạng thái & hành trình mới nhất):
 *    Mã vận đơn | Trạng thái hiện tại | Thời gian thao tác hiện tại | Bưu cục đang thao tác |
 *    Tên bưu cục thao tác | Người thao tác | Loại quét kiện cuối cùng | Loại kiện vấn đề |
 *    Xác nhận ký nhận | Xác nhận chuyển hoàn | Dấu tích phát lại ...
 *
 * Tự động tính toán:
 *  - Ngày lưu kho: tính từ Ngày quét đến tới ngày hiện tại
 *  - Đang ở: hiển thị tên nơi/bưu cục đang ở (không hiển thị mã số bưu cục thuần túy)
 *  - Trạng thái hiện tại & Thao tác cuối mới nhất
 *  - Tự động suy luận cột "Chi tiết" và tô màu dòng.
 */

const nk = (s) =>
  String(s ?? '')
    .replace(/đ/gi, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');

const normText = (s) =>
  String(s ?? '')
    .replace(/đ/gi, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const CODE_KEYS = ['mavandon', 'mavd', 'mvd', 'sovandon', 'vandon', 'waybillno', 'waybill'];

function buildTable(rows) {
  if (!rows || rows.length < 2) return { list: [], map: new Map(), labels: [] };
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
  return { list, map, labels };
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

const txt = (v) => String(v ?? '').trim();

function pickDate(src, aliases, exclude = []) {
  if (!src) return '';
  for (const a of aliases) {
    const v = src[a];
    if (v !== undefined && String(v).trim() !== '' && parseExcelDate(v)) return v;
  }
  for (const key of Object.keys(src)) {
    if (exclude.some((x) => key.includes(x))) continue;
    if (aliases.some((a) => key.startsWith(a) || key.includes(a)) && String(src[key]).trim() !== '' && parseExcelDate(src[key])) {
      return src[key];
    }
  }
  return '';
}

const toNum = (v) => {
  if (typeof v === 'number') return v;
  const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Kiểm tra một giá trị có phải chỉ là mã bưu cục (ví dụ "028001", "028F05", "225H11", "210GW1", "212HMC02") hay không
 */
export function isPureBranchCode(val) {
  const s = String(val ?? '').trim();
  if (!s) return true;
  if (/^\d{4,12}$/.test(s)) return true;
  // Mã bưu cục J&T dạng chữ + số liền nhau không khoảng trắng (VD: 028F05, 210GW1, 024GW0, 212HMC02)
  if (/^[0-9a-z_-]{4,14}$/i.test(s) && /\d/.test(s)) return true;
  return false;
}

/**
 * Rút tên bưu cục/trạm từ câu mô tả trạng thái hiện tại nếu cần
 */
export function extractPlaceFromStatusText(text) {
  const s = String(text ?? '').trim();
  if (!s) return '';
  // Ưu tiên "Bưu cục ký nhận【...】" hoặc "Chuyển phát nhanh đến【...】" hoặc "【(...) ...】" ở đầu câu
  const mSign = s.match(/Bưu cục ký nhận\s*【\s*([^】]+?)\s*】/i);
  if (mSign && !isPureBranchCode(mSign[1]) && !mSign[1].includes('scanNetwork')) return cleanPlaceName(mSign[1]);
  const mArr = s.match(/Chuyển phát nhanh đến\s*【\s*([^】]+?)\s*】/i);
  if (mArr && !isPureBranchCode(mArr[1]) && !mArr[1].includes('scanNetwork')) return cleanPlaceName(mArr[1]);
  const mFirst = s.match(/^\s*【\s*([^】]+?)\s*】/);
  if (mFirst && !isPureBranchCode(mFirst[1]) && !mFirst[1].includes('scanNetwork')) return cleanPlaceName(mFirst[1]);
  const mTo = s.match(/gửi đến\s*【\s*([^】]+?)\s*】/i);
  if (mTo && !isPureBranchCode(mTo[1]) && !mTo[1].includes('scanNetwork')) return cleanPlaceName(mTo[1]);
  return '';
}

/**
 * Làm sạch tên nơi "Đang ở":
 *  - Nếu có dạng "028001 - (HNI) Mỹ Đình 2" hoặc "028F05_(HNI) Mỹ Đình 2" thì bỏ phần mã số đầu.
 *  - Giữ nguyên tên trạm/nơi chốn như "(HNI) Mỹ Đình 2", "TTKT HÀ NỘI", "TTTC Cao Bằng".
 */
function cleanPlaceName(val) {
  const s = String(val ?? '').trim();
  if (!s) return '';
  const stripped = s.replace(/^[0-9a-z]{4,12}\s*[-_:]\s*/i, '').trim();
  return stripped || s;
}

/**
 * Tìm tên nơi "Đang ở" (ưu tiên tên trạm/bưu cục thực tế cuối cùng, bỏ qua cột chỉ chứa mã số bưu cục)
 */
function resolvePlaceName(s, a, statusDesc = '') {
  const PLACE_ALIASES = [
    'tenbcthaotacthuctecuoicung',
    'tenbuucucthaotacthuctecuoicung',
    'dango',
    'tenbuucucdangthaotac',
    'tenbuucucthaotac',
    'tenbuucuchientai',
    'tentramhientai',
    'tentramthaotac',
    'tramhientai',
    'tramthaotac',
    'donvithaotac',
    'vitrihientai',
    'tenbuucucphat',
    'buucucphat',
    'tramphat',
    'tramden',
    'buucucden',
    'ttktcuoi',
    'buucucdangthaotac',
    'buucucthaotac',
    'buucuchientai',
  ];

  const candidates = [];
  for (const src of [s, a]) {
    if (!src) continue;
    for (const alias of PLACE_ALIASES) {
      if (src[alias] !== undefined && String(src[alias]).trim() !== '') {
        candidates.push(String(src[alias]).trim());
      }
    }
    for (const key of Object.keys(src)) {
      if (key.startsWith('ma') || key.includes('mabuucuc') || key.includes('matram') || key.includes('mabc')) continue;
      if (
        (key.includes('tenbc') ||
          key.includes('dango') ||
          key.includes('buucuc') ||
          key.includes('tram') ||
          key.includes('ttkt') ||
          key.includes('tttc') ||
          key.includes('vitri')) &&
        String(src[key]).trim() !== ''
      ) {
        candidates.push(String(src[key]).trim());
      }
    }
  }

  // Ưu tiên giá trị có tên chữ (không phải mã bưu cục thuần túy)
  for (const c of candidates) {
    if (!isPureBranchCode(c)) {
      return cleanPlaceName(c);
    }
  }
  const fromDesc = extractPlaceFromStatusText(statusDesc);
  if (fromDesc) return fromDesc;
  return candidates.length ? cleanPlaceName(candidates[0]) : '';
}

/** Đơn đã ký nhận thành công -> không cần care */
export function isSigned(trangThai, xnKyNhan, loaiQuetCuoi, xnChuyenHoan = '') {
  const s = nk(trangThai);
  const q = nk(loaiQuetCuoi);
  const k = nk(xnKyNhan);
  const h = nk(xnChuyenHoan);

  // Đơn chuyển hoàn không tính là đơn đã ký nhận thành công của khách
  if (
    h === 'co' ||
    h === 'y' ||
    h.includes('chuyenhoan') ||
    s.includes('chuyenhoan') ||
    q.includes('chuyenhoan')
  ) {
    return false;
  }

  // Nếu có cột Xác nhận ký nhận rõ ràng
  if (k) {
    if (k === 'co' || k === 'y' || k.includes('thanhcong') || k.includes('dakynhan')) {
      return true;
    }
    if (k === 'khong' || k === 'n' || k === 'no' || k.includes('chuakynhan') || k.includes('khongkynhan')) {
      return false;
    }
  }

  // Kiểm tra theo Loại quét cuối hoặc Trạng thái (tránh nhầm "chưa ký nhận" / "không ký nhận")
  const checkStatus = (val) => {
    if (!val) return false;
    if (val.includes('chuakynhan') || val.includes('khongkynhan')) return false;
    return val.includes('kynhan') || val.includes('daduocky') || val.includes('giaothanhcong');
  };

  return checkStatus(q) || checkStatus(s);
}

/**
 * Tự động phân tích & tính toán "Chi tiết", màu sắc dòng (tone) và trạng thái chăm sóc gợi ý
 * từ dữ liệu 2 file Excel.
 */
export function computeAutoCareDetail(row) {
  const chiTietGoc = txt(row.chiTietFile);
  const trangThai = txt(row.trangThai);
  const moTaTrangThai = txt(row.moTaTrangThai);
  const loaiQuet = txt(row.loaiQuetCuoi);
  const loaiKienVD = txt(row.loaiKienVanDe);
  const phanLoaiVD = txt(row.phanLoaiKienVanDe);
  const xnHoan = nk(row.xnChuyenHoan);
  const phatLai = nk(row.dauTichPhatLai);

  // 0. Nếu đơn đã ký nhận thành công -> trạng thái Đã hoàn tất
  if (row._signed) {
    return {
      detail: chiTietGoc || 'Đã giao thành công',
      tone: 'green',
      autoStatus: 'done',
    };
  }

  const combined = normText(`${chiTietGoc} ${trangThai} ${moTaTrangThai} ${loaiQuet} ${loaiKienVD} ${phanLoaiVD}`);

  // 1. Nếu file gốc đã có sẵn ghi chú Chi tiết rõ ràng -> giữ nguyên và phân loại màu
  if (chiTietGoc) {
    const n = normText(chiTietGoc);
    if (n.includes('hoan') || n.includes('tu choi')) {
      return { detail: chiTietGoc, tone: 'orange', autoStatus: 'processing' };
    }
    if (n.includes('len phieu') || n.includes('khieu nai') || n.includes(' giuc ') || n.startsWith('giuc')) {
      return { detail: chiTietGoc, tone: 'yellow', autoStatus: 'processing' };
    }
    return { detail: chiTietGoc, tone: 'green', autoStatus: 'processing' };
  }

  // 2. Kiểm tra chuyển hoàn / đang hoàn về
  if (
    xnHoan === 'co' ||
    xnHoan === 'y' ||
    xnHoan.includes('chuyenhoan') ||
    combined.includes('chuyen hoan') ||
    combined.includes('hoan ve') ||
    combined.includes('dang hoan')
  ) {
    return { detail: 'Đang Hoàn về', tone: 'orange', autoStatus: 'processing' };
  }

  // 3. Kiểm tra giao lại / tích phát lại
  if (
    phatLai === 'co' ||
    phatLai === 'y' ||
    combined.includes('giao lai') ||
    combined.includes('phat lai') ||
    combined.includes('tich phat lai')
  ) {
    return { detail: 'Đã tích phát lại', tone: 'green', autoStatus: 'processing' };
  }

  // 4. Kiểm tra các loại kiện vấn đề cụ thể
  if (combined.includes('khong lien lac') || combined.includes('khong nghe may') || combined.includes('thue bao')) {
    return { detail: 'Không liên lạc được', tone: 'green', autoStatus: 'processing' };
  }
  if (combined.includes('tu choi')) {
    return { detail: 'Khách từ chối nhận', tone: 'orange', autoStatus: 'processing' };
  }
  if (combined.includes('sai dia chi') || combined.includes('doi dia chi') || combined.includes('thieu dia chi')) {
    return { detail: 'Sai / đổi địa chỉ', tone: 'yellow', autoStatus: 'processing' };
  }
  if (combined.includes('hen 2 ngay')) {
    return { detail: 'Hẹn 2 ngày', tone: 'green', autoStatus: 'processing' };
  }
  if (combined.includes('hen 1 ngay')) {
    return { detail: 'Hẹn 1 ngày', tone: 'green', autoStatus: 'processing' };
  }
  if (combined.includes('hen lai') || combined.includes('khach hen') || combined.includes('hua nhan')) {
    return { detail: loaiKienVD || phanLoaiVD || 'Khách hẹn lại ngày nhận', tone: 'green', autoStatus: 'processing' };
  }
  if (loaiKienVD || phanLoaiVD || combined.includes('kien van de')) {
    return { detail: loaiKienVD || phanLoaiVD || 'Kiện vấn đề cần xử lý', tone: 'green', autoStatus: 'processing' };
  }

  return { detail: '', tone: '', autoStatus: 'pending' };
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
  'phathang',
];

export async function parseCareDon(fileQuanLy, fileTrangThai) {
  if (!fileQuanLy && !fileTrangThai) throw new Error('Vui lòng chọn ít nhất 1 file Excel.');
  const warnings = [];
  const now = new Date();
  const [rows1, rows2] = await Promise.all([
    fileQuanLy ? readSheet(fileQuanLy) : null,
    fileTrangThai ? readSheet(fileTrangThai) : null,
  ]);
  const t1 = buildTable(rows1);
  const t2 = buildTable(rows2);

  if (fileQuanLy && !t1.list.length) {
    throw new Error('File "Quản lý vận đơn gửi" không có cột Mã vận đơn hoặc không có dữ liệu.');
  }
  if (fileTrangThai && !t2.list.length) {
    throw new Error('File "Trạng thái mã vận đơn" không có cột Mã vận đơn hoặc không có dữ liệu.');
  }

  const baseCodes = t1.list.length ? t1.list : t2.list;
  if (!t1.list.length) {
    warnings.push('Không có file Quản lý vận đơn gửi — thiếu thông tin người gửi, hàng hóa.');
  }
  if (!t2.list.length) {
    warnings.push('Không có file Trạng thái mã vận đơn — trạng thái lấy theo file Quản lý vận đơn gửi.');
  }

  let missingInT2 = 0;
  const rows = baseCodes.map((code) => {
    const a = t1.map.get(code) || {};
    const b = t2.map.get(code);
    if (t2.list.length && t1.list.length && !b) missingInT2++;
    const s = b || {};

    // Trạng thái & Loại quét cuối
    const trangThaiFile1 = txt(pick(a, ['trangthai', 'trangthaihientai', 'loaiquethientai'], ['kynhan', 'hoan']));
    const moTaTrangThai = txt(pick(s, ['trangthaihientai', 'trangthai'], ['kynhan', 'hoan']) || trangThaiFile1);
    const loaiQuetCuoi = txt(
      pick(s, ['loaiquetkiencuoicung', 'loaiquetmoinhat', 'loaiquetkiencuoi', 'loaiquet', 'thaotaccuoi']) ||
      pick(a, ['loaiquetkiencuoicung', 'loaiquetmoinhat', 'trangthai'])
    );

    // Ưu tiên tên trạng thái ngắn gọn (Loại quét kiện cuối cùng: Ký nhận CPN, Gửi hàng, Quét phát hàng, Quét kiện vấn đề...)
    const trangThai = loaiQuetCuoi || moTaTrangThai || trangThaiFile1;

    // Đang ở: lấy tên nơi/bưu cục, không hiển thị mã số bưu cục
    const dangO = resolvePlaceName(s, a, moTaTrangThai);

    // Thời gian quét đến -> tính Ngày lưu kho (từ ngày quét đến tới ngày hiện tại)
    const rawQuetDen =
      pickDate(s, ARRIVAL_DATE_ALIASES, ARRIVAL_DATE_EXCLUDE) ||
      pickDate(a, ARRIVAL_DATE_ALIASES, ARRIVAL_DATE_EXCLUDE) ||
      pickDate(a, [
        'thoigiannhap',
        'thoigiannhapkien',
        'thoigiannhanhang',
        'thoigiannhan',
        'thoigiantaodon',
        'thoigiangui',
        'ngaygui',
      ]) ||
      pickDate(s, ['thoigiantaodon', 'thoigiannhap', 'thoigiangui']);

    let soNgayLuuKho = calcDaysFromNow(rawQuetDen, now);

    // Fallback nếu file có sẵn cột Số ngày lưu kho / lưu trữ
    if (soNgayLuuKho === null) {
      const rawLuuKho =
        pick(s, ['songayluukho', 'songayluutru', 'songayton', 'ngayluukho', 'ngayton']) ||
        pick(a, ['songayluukho', 'songayluutru', 'songayton', 'ngayluukho', 'ngayton']);
      if (rawLuuKho !== '' && rawLuuKho !== null && rawLuuKho !== undefined) {
        const dFromDate = calcDaysFromNow(rawLuuKho, now);
        if (dFromDate !== null) {
          soNgayLuuKho = dFromDate;
        } else {
          const n = parseFloat(String(rawLuuKho).trim());
          if (!Number.isNaN(n) && n >= 0) soNgayLuuKho = Math.floor(n);
        }
      }
    }

    const thoiGianQuetDen = fmtExcelDate(rawQuetDen);

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
      pickDate(a, ['thoigianthaotac', 'thoigiancapnhat']) ||
      rawQuetDen;
    const thoiGianThaoTac = fmtExcelDate(rawThaoTac);

    const xnKyNhan = txt(pick(s, ['xacnhankynhan', 'daukynhan']) || pick(a, ['xacnhankynhan']));
    const xnChuyenHoan = txt(pick(s, ['xacnhanchuyenhoan', 'cophaidonch']) || pick(a, ['xacnhanchuyenhoan']));
    let loaiKienVanDe = txt(pick(s, ['loaikienvande', 'loaikienvd'], ['phanloai']) || pick(a, ['loaikienvande'], ['phanloai']));
    if (!loaiKienVanDe && moTaTrangThai) {
      const mReason = moTaTrangThai.match(/Nguyên nhân[^【]*【([^】]+)】/i);
      if (mReason) loaiKienVanDe = mReason[1].trim();
    }
    const phanLoaiKienVanDe = txt(pick(s, ['phanloaikienvande', 'phanloaikienvd']) || pick(a, ['phanloaikienvande']));
    const dauTichPhatLai = txt(pick(s, ['dautichphatlai', 'phatlai']) || pick(a, ['dautichphatlai']));
    const chiTietFile = txt(pick(a, ['chitiet', 'ghichu', 'noidungchamsoc']) || pick(s, ['chitiet', 'lydokienvande']));

    const tenNguoiGui = txt(
      pick(a, ['tennguoigui', 'nguoigui', 'tenkhachhang', 'khachhang'], ['sdt', 'dienthoai', 'diachi', 'ma']) ||
      pick(s, ['tennguoigui', 'nguoigui', 'tenkhachhang'], ['sdt', 'dienthoai', 'diachi', 'ma'])
    );
    const tenHang = txt(pick(a, ['tenhanghoa', 'tenhang', 'noidunghanghoa', 'hanghoa']) || pick(s, ['tenhanghoa', 'tenhang', 'noidunghanghoa']));
    const cod = toNum(pick(a, ['sotiencod', 'tienthuhocod', 'codgoc', 'cod', 'sotienthuho']) || pick(s, ['sotiencod', 'tienthuhocod', 'cod']));
    const tenNguoiNhan = txt(
      pick(a, ['tennguoinhan', 'nguoinhan', 'tennguoiphathang'], ['sdt', 'dienthoai', 'diachi']) ||
      pick(s, ['tennguoinhan', 'nguoinhan'], ['sdt', 'dienthoai', 'diachi'])
    );
    const sdtNguoiNhan = txt(pick(a, ['sodienthoainguoinhan', 'sdtnguoinhan', 'dienthoainguoinhan', 'sdtnhan']) || pick(s, ['sodienthoainguoinhan', 'sdtnguoinhan']));
    const diaChi = txt(pick(a, ['diachinguoinhan', 'diachinhan', 'diachichitiet', 'diachi']) || pick(s, ['diachinguoinhan', 'diachichitiet']));
    const nguoiThaoTac = txt(pick(s, ['nguoithaotac', 'nhanvienphat', 'tennhanvienphathang']) || pick(a, ['nhanvienphat', 'nguoiphutrach']));

    const baseRow = {
      maVanDon: code,
      tenNguoiGui,
      tenNguoiNhan,
      sdtNguoiNhan,
      diaChi,
      thoiGianQuetDen,
      soNgayLuuKho,
      tenHang,
      cod,
      trangThai,
      moTaTrangThai,
      trangThaiFile1,
      dangO,
      chiTietFile,
      thoiGianThaoTac,
      nguoiThaoTac,
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
    return {
      ...baseRow,
      autoDetail: computed.detail,
      autoTone: computed.tone,
      autoStatus: computed.autoStatus,
    };
  });

  if (missingInT2) {
    warnings.push(`${missingInT2} mã không có trong file Trạng thái — dùng trạng thái của file Quản lý vận đơn gửi.`);
  }
  if (t1.list.length && t2.list.length) {
    const extra = t2.list.filter((c) => !t1.map.has(c)).length;
    if (extra) {
      warnings.push(`${extra} mã chỉ có trong file Trạng thái (không có trong Quản lý vận đơn gửi) — đã bỏ qua.`);
    }
  }
  if (rows.length && rows.every((r) => !r.trangThai)) {
    warnings.push(`Không tìm thấy cột Trạng thái. Các cột: ${[...new Set([...t1.labels, ...t2.labels])].join(' | ')}`);
  }

  return { rows, warnings };
}
