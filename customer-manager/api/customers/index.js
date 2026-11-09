import { db, send, validCustomer } from '../../lib/api-utils.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return send(res, 405, { error: 'Method not allowed' });
  }

  try {
    const supabase = db();
    if (req.method === 'GET') {
      const q = String(req.query.q || '').trim().slice(0, 100);
      const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
      const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit || '20', 10) || 20));
      const from = (page - 1) * limit;
      let query = supabase.from('customers').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(from, from + limit - 1);
      if (q) query = query.or(`name.ilike.%${q.replace(/[(),]/g, ' ')}%,phone.ilike.%${q.replace(/[(),]/g, ' ')}%`);
      const { data, count, error } = await query;
      if (error) throw error;
      return send(res, 200, { data, count, page, limit });
    }

    const parsed = validCustomer(req.body);
    if (parsed.error) return send(res, 400, { error: parsed.error });
    const { data, error } = await supabase.from('customers').insert(parsed.data).select().single();
    if (error) throw error;
    return send(res, 201, { data });
  } catch (error) {
    console.error('customers API:', error.message);
    return send(res, 500, { error: 'Không thể xử lý yêu cầu. Vui lòng thử lại.' });
  }
}
