import { createClient } from '@supabase/supabase-js';

export function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8').json(body);
}

export function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Thiếu cấu hình Supabase trên Vercel.');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function cleanText(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export function validCustomer(body) {
  const name = cleanText(body?.name, 120);
  const phone = cleanText(body?.phone, 30);
  const address = cleanText(body?.address, 500);
  if (!name || !phone || !address) return { error: 'Vui lòng nhập đầy đủ tên, số điện thoại và địa chỉ.' };
  if (!/^[0-9+().\-\s]{8,20}$/.test(phone)) return { error: 'Số điện thoại không hợp lệ.' };
  return { data: { name, phone, address, updated_at: new Date().toISOString() } };
}
