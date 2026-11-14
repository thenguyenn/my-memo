import { db, send } from '../../lib/api-utils.js';

/**
 * GET /api/jt/parcels?minDays=2&q=search&shipper=name&page=1&limit=10
 * Trả về danh sách đơn tồn với phân trang
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { error: 'Method not allowed' });
  }

  try {
    const supabase = db();
    const minDays = Math.max(0, Number.parseInt(req.query.minDays || '0', 10) || 0);
    const q = String(req.query.q || '').trim().slice(0, 100);
    const shipper = String(req.query.shipper || '').trim().slice(0, 100);
    const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
    const limit = Math.min(500, Math.max(1, Number.parseInt(req.query.limit || '10', 10) || 10));
    const from = (page - 1) * limit;

    // Query cơ bản: đơn chưa resolve
    let query = supabase
      .from('jt_parcels')
      .select('*', { count: 'exact' })
      .is('resolved_at', null)
      .order('stock_since', { ascending: true });

    // Lọc theo shipper
    if (shipper) {
      query = query.eq('shipper_name', shipper);
    }

    // Tìm kiếm theo waybill hoặc shipper name
    if (q) {
      const searchPattern = `%${q}%`;
      query = query.or(`waybill.ilike.${searchPattern},shipper_name.ilike.${searchPattern}`);
    }

    const { data: allParcels, count, error } = await query;
    if (error) throw error;

    // Lọc theo minDays (sau khi lấy từ DB vì không thể dùng computed column)
    const now = Date.now();
    const filtered = allParcels.filter((p) => {
      const days = Math.floor((now - new Date(p.stock_since).getTime()) / 86400000);
      return days >= minDays;
    });

    // Phân trang
    const paginated = filtered.slice(from, from + limit);

    // Thêm days_in_stock vào mỗi đơn
    const data = paginated.map((p) => ({
      ...p,
      days_in_stock: Math.floor((now - new Date(p.stock_since).getTime()) / 86400000),
    }));

    return send(res, 200, {
      data,
      count: filtered.length,
      page,
      limit,
    });
  } catch (error) {
    console.error('jt/parcels API:', error.message);
    return send(res, 500, { error: 'Không thể tải dữ liệu. Vui lòng thử lại.' });
  }
}
