import * as XLSX from 'xlsx';
import { normalizePhone } from './phoneNormalizer';

/**
 * Parse TXT file (danh bạ format)
 */
export function parseTxtFile(text) {
  const lines = text.split('\n');
  const contacts = [];
  let currentName = '';
  
  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('DANH SÁCH') || line.startsWith('===')) continue;
    
    // Dòng có số thứ tự và tên: "1. Xe Ghép"
    const nameMatch = line.match(/^\d+\.\s+(.+)$/);
    if (nameMatch) {
      currentName = nameMatch[1].trim();
      continue;
    }
    
    // Dòng có SĐT: "SĐT: +84965371567"
    const phoneMatch = line.match(/(?:SĐT|Tel|Phone):\s*(.+)$/i);
    if (phoneMatch && currentName) {
      const phone = normalizePhone(phoneMatch[1]);
      
      contacts.push({
        name: currentName,
        phone: phone,
        address: currentName // Tên cũng là địa chỉ
      });
      currentName = '';
    }
  }
  
  return contacts;
}

/**
 * Parse JSON file
 */
export function parseJsonFile(text) {
  try {
    const data = JSON.parse(text);
    const array = Array.isArray(data) ? data : [data];
    
    return array.map(item => ({
      name: item.name || item.ten || item.ho_ten || item.customer || '',
      phone: normalizePhone(item.phone || item.sdt || item.dien_thoai || item.mobile || ''),
      address: item.address || item.dia_chi || item.name || item.ten || 'Chưa cập nhật'
    })).filter(c => c.name && c.phone);
  } catch (error) {
    console.error('JSON parse error:', error);
    return [];
  }
}

/**
 * Parse Excel file
 */
export function parseExcelFile(data) {
  try {
    const workbook = XLSX.read(data, { type: 'binary' });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
    
    if (rows.length < 2) return [];
    
    // Tìm cột name, phone, address
    const headers = rows[0].map(h => String(h || '').toLowerCase());
    const nameCol = headers.findIndex(h => h.includes('name') || h.includes('tên') || h.includes('ten') || h.includes('khách'));
    const phoneCol = headers.findIndex(h => h.includes('phone') || h.includes('sdt') || h.includes('sđt') || h.includes('điện thoại'));
    const addressCol = headers.findIndex(h => h.includes('address') || h.includes('địa chỉ') || h.includes('dia chi'));
    
    const contacts = [];
    
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const name = nameCol >= 0 ? String(row[nameCol] || '') : String(row[0] || '');
      const phone = phoneCol >= 0 ? String(row[phoneCol] || '') : String(row[1] || '');
      const address = addressCol >= 0 ? String(row[addressCol] || '') : (name || 'Chưa cập nhật');
      
      if (name.trim() && phone.trim()) {
        contacts.push({
          name: name.trim(),
          phone: normalizePhone(phone),
          address: address.trim()
        });
      }
    }
    
    return contacts;
  } catch (error) {
    console.error('Excel parse error:', error);
    return [];
  }
}

/**
 * Parse file dựa vào extension
 */
export function parseFile(file, content) {
  const fileName = file.name.toLowerCase();
  const fileType = fileName.split('.').pop();
  
  switch (fileType) {
    case 'txt':
      return parseTxtFile(content);
    case 'json':
      return parseJsonFile(content);
    case 'xlsx':
    case 'xls':
      return parseExcelFile(content);
    default:
      throw new Error('Định dạng file không hỗ trợ');
  }
}
