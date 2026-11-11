/**
 * Chuẩn hóa số điện thoại: +84 -> 0
 */
export function normalizePhone(phone) {
  if (!phone) return '';
  
  // Loại bỏ tất cả ký tự không phải số và dấu +
  phone = String(phone).replace(/[^\d+]/g, '');
  
  // Convert +84 -> 0
  if (phone.startsWith('+84')) {
    phone = '0' + phone.slice(3);
  } else if (phone.startsWith('84') && phone.length >= 11) {
    phone = '0' + phone.slice(2);
  }
  
  return phone;
}
