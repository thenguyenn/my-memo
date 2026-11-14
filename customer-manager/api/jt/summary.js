import { db, send } from '../../lib/api-utils.js';

/**
 * GET /api/jt/summary?minDays=2
 * Trả về thống kê đơn tồn và danh sách theo shipper
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { error: 'Method not allowed' });
  }

  try {
    const supabase = db();
    const minDays = Math.max(0, Number.parseInt(req.query.minDays || '0', 10) || 0);
    const thresholds = { warn: 5, danger: 6 }; // warn = 5 ngày, danger = 6-7 ngày

    // Lấy tất cả đơn đang tồn (resolved_at = null)
    const { data: parcels, error } = await supabase
      .from('jt_parcels')
      .select('*')
      .is('resolved_at', null)
      .order('stock_since', { ascending: true });

    if (error) throw error;

    const now = Date.now();
    const filtered = parcels.filter((p) => {
      const days = Math.floor((now - new Date(p.stock_since).getTime()) / 86400000);
      return days >= minDays;
    });

    // Tính thống kê
    const stats = {
      total: filtered.length,
      warn: filtered.filter((p) => {
        const days = Math.floor((now - new Date(p.stock_since).getTime()) / 86400000);
        return days === 5; // Chỉ đếm đơn tồn đúng 5 ngày
      }).length,
      danger: filtered.filter((p) => {
        const days = Math.floor((now - new Date(p.stock_since).getTime()) / 86400000);
        return days >= 6 && days <= 7; // Đếm đơn tồn 6-7 ngày
      }).length,
    };

    // Nhóm theo shipper
    const shipperMap = new Map();
    filtered.forEach((p) => {
      const name = p.shipper_name || 'Chưa phân công';
      if (!shipperMap.has(name)) {
        shipperMap.set(name, {
          shipper_name: name,
          shipper_phone: p.shipper_phone || '',
          total: 0,
          max_days: 0,
        });
      }
      const s = shipperMap.get(name);
      s.total++;
      const days = Math.floor((now - new Date(p.stock_since).getTime()) / 86400000);
      if (days > s.max_days) s.max_days = days;
    });

    const shippers = Array.from(shipperMap.values()).sort((a, b) => b.max_days - a.max_days);

    // Lấy thời gian import gần nhất
    const { data: lastImport } = await supabase
      .from('jt_parcels')
      .select('created_at')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return send(res, 200, {
      thresholds,
      stats,
      shippers,
      lastImportedAt: lastImport?.created_at || null,
    });
  } catch (error) {
    console.error('jt/summary API:', error.message);
    return send(res, 500, { error: 'Không thể tải dữ liệu. Vui lòng thử lại.' });
  }
}
