import { db, send, validCustomer } from '../../lib/api-utils.js';

export default async function handler(req, res) {
  if (!['PUT', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'PUT, DELETE');
    return send(res, 405, { error: 'Method not allowed' });
  }
  const id = String(req.query.id || '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return send(res, 400, { error: 'Mã khách hàng không hợp lệ.' });

  try {
    const supabase = db();
    if (req.method === 'DELETE') {
      // Soft delete: chỉ cập nhật deleted_at thay vì xóa thật
      const { error } = await supabase
        .from('customers')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .is('deleted_at', null); // Chỉ soft delete nếu chưa bị xóa
      
      if (error) throw error;
      return send(res, 200, { success: true, message: 'Soft deleted successfully' });
    }
    const parsed = validCustomer(req.body);
    if (parsed.error) return send(res, 400, { error: parsed.error });
    
    // Chỉ update khách hàng chưa bị xóa
    const { data, error } = await supabase
      .from('customers')
      .update(parsed.data)
      .eq('id', id)
      .is('deleted_at', null)
      .select()
      .single();
    
    if (error) throw error;
    return send(res, 200, { data });
  } catch (error) {
    console.error('customer API:', error.message);
    return send(res, 500, { error: 'Không thể xử lý yêu cầu. Vui lòng thử lại.' });
  }
}
