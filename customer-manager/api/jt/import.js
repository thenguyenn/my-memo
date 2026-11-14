import { db, send } from '../../lib/api-utils.js';

/**
 * POST /api/jt/import
 * Body: { rows: [...], snapshot: boolean }
 * Import danh sách đơn tồn từ file J&T
 * - rows: mảng các đơn { waybill, shipper_name, shipper_phone, status, stock_since, ... }
 * - snapshot: true = đánh dấu các đơn không có trong file là đã resolve
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Method not allowed' });
  }

  try {
    const supabase = db();
    const { rows, snapshot } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return send(res, 400, { error: 'Dữ liệu không hợp lệ. Cần mảng rows.' });
    }

    // Validate rows
    const validRows = rows.filter((r) => r.waybill && r.stock_since);
    if (validRows.length === 0) {
      return send(res, 400, { error: 'Không có đơn hợp lệ nào (cần waybill và stock_since).' });
    }

    let imported = 0;
    let resolved = 0;
    const skipped = rows.length - validRows.length;

    // Upsert từng đơn (insert nếu chưa có, update nếu đã có)
    for (const row of validRows) {
      const data = {
        waybill: String(row.waybill).trim().slice(0, 50),
        shipper_name: String(row.shipper_name || '').trim().slice(0, 120),
        shipper_phone: String(row.shipper_phone || '').trim().slice(0, 30),
        receiver_name: String(row.receiver_name || '').trim().slice(0, 120),
        status: String(row.status || '').trim().slice(0, 100),
        branch: String(row.branch || '').trim().slice(0, 100),
        stock_since: row.stock_since,
        resolved_at: null, // Đơn đang tồn
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase.from('jt_parcels').upsert(data, {
        onConflict: 'waybill',
        ignoreDuplicates: false,
      });

      if (!error) imported++;
    }

    // Nếu snapshot = true, đánh dấu các đơn không có trong file là đã resolve
    if (snapshot) {
      const waybills = validRows.map((r) => String(r.waybill).trim());
      const { count: resolvedCount, error: resolveError } = await supabase
        .from('jt_parcels')
        .update({ resolved_at: new Date().toISOString() })
        .is('resolved_at', null)
        .not('waybill', 'in', `(${waybills.map((w) => `'${w}'`).join(',')})`);

      if (!resolveError && resolvedCount) resolved = resolvedCount;
    }

    return send(res, 200, {
      imported,
      resolved,
      skipped,
    });
  } catch (error) {
    console.error('jt/import API:', error.message);
    return send(res, 500, { error: 'Không thể import dữ liệu. Vui lòng thử lại.' });
  }
}
