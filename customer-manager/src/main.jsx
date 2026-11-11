import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as XLSX from 'xlsx';
import './style.css';

const API = '/api/customers';

function App() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(() => {
    const saved = localStorage.getItem('customer_page_limit');
    return saved ? parseInt(saved, 10) : 20;
  });
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const [showImport, setShowImport] = useState(false);
  const [importData, setImportData] = useState([]);
  const [importing, setImporting] = useState(false);

  const request = useCallback(async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Có lỗi xảy ra.');
    return result;
  }, []);

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ q: search, page: String(page), limit: String(limit) });
      const result = await request(`${API}?${params}`);
      setCustomers(result.data || []);
      setCount(result.count || 0);
      setNotice('');
    } catch (error) {
      setNotice(error.message);
    } finally {
      setLoading(false);
    }
  }, [page, limit, request, search]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  function changeLimit(newLimit) {
    setLimit(newLimit);
    setPage(1);
    localStorage.setItem('customer_page_limit', String(newLimit));
  }

  function openAdd() { setEditing(null); setForm({ name: '', phone: '', address: '' }); setShowForm(true); setShowImport(false); setNotice(''); }
  function openImport() { setShowForm(false); setShowImport(true); setImportData([]); setNotice(''); }
  function openEdit(customer) {
    setEditing(customer.id);
    setShowForm(true);
    setForm({ name: customer.name, phone: customer.phone, address: customer.address });
    setNotice('');
  }

  async function saveCustomer(event) {
    event.preventDefault();
    
    // Popup confirm trước khi lưu
    const confirmMessage = editing 
      ? `Xác nhận cập nhật thông tin khách hàng "${form.name}"?`
      : `Xác nhận thêm khách hàng mới "${form.name}"?`;
    
    if (!window.confirm(confirmMessage)) return;
    
    setLoading(true);
    try {
      const result = await request(editing ? `${API}/${editing}` : API, {
        method: editing ? 'PUT' : 'POST', body: JSON.stringify(form),
      });
      setNotice(editing ? '✅ Đã cập nhật khách hàng.' : '✅ Đã thêm khách hàng.');
      
      // Nếu thêm mới: giữ form mở, chỉ clear text
      if (!editing) {
        setForm({ name: '', phone: '', address: '' });
        // Focus vào ô tên
        setTimeout(() => {
          const nameInput = document.querySelector('input[placeholder="Nguyễn Văn A"]');
          if (nameInput) nameInput.focus();
        }, 100);
      } else {
        // Nếu sửa: đóng form
        setEditing(null);
        setShowForm(false);
        setForm({ name: '', phone: '', address: '' });
      }
      
      if (!editing && page !== 1) setPage(1); else await loadCustomers();
    } catch (error) { setNotice(error.message); }
    finally { setLoading(false); }
  }

  async function deleteCustomer(customer) {
    // Popup confirm với thông tin rõ ràng
    const confirmMessage = `⚠️ XÁC NHẬN XÓA KHÁCH HÀNG\n\nTên: ${customer.name}\nSĐT: ${customer.phone}\n\nKhách hàng sẽ bị ẩn khỏi danh sách (có thể khôi phục sau).\n\nBạn có chắc chắn muốn xóa?`;
    
    if (!window.confirm(confirmMessage)) return;
    
    setLoading(true);
    try {
      await request(`${API}/${customer.id}`, { method: 'DELETE' });
      setNotice('🗑️ Đã xóa khách hàng (soft delete).');
      await loadCustomers();
    } catch (error) { setNotice(error.message); }
    finally { setLoading(false); }
  }

  // ========== IMPORT FUNCTIONS ==========
  
  // Chuẩn hóa số điện thoại: +84 -> 0
  function normalizePhone(phone) {
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

  // Parse TXT file (format danh bạ của bạn)
  function parseTxtFile(text) {
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
      
      // Dòng có SĐT: "SĐT: +84965371567" hoặc "Tel: xxx"
      const phoneMatch = line.match(/(?:SĐT|Tel|Phone):\s*(.+)$/i);
      if (phoneMatch && currentName) {
        const phone = normalizePhone(phoneMatch[1]);
        
        contacts.push({
          name: currentName,
          phone: phone,
          address: currentName // Tên cũng là địa chỉ theo yêu cầu
        });
        currentName = '';
      }
    }
    
    return contacts;
  }

  // Parse JSON file
  function parseJsonFile(text) {
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

  // Parse Excel file
  function parseExcelFile(data) {
    try {
      const workbook = XLSX.read(data, { type: 'binary' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
      
      if (rows.length < 2) return [];
      
      // Tìm cột name, phone, address (case-insensitive)
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

  // Handler chính cho file upload
  function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const fileName = file.name.toLowerCase();
    const fileType = fileName.split('.').pop();
    
    const reader = new FileReader();
    
    reader.onload = (e) => {
      let parsed = [];
      
      try {
        if (fileType === 'txt') {
          // TXT file
          const text = e.target.result;
          parsed = parseTxtFile(text);
        } else if (fileType === 'json') {
          // JSON file
          const text = e.target.result;
          parsed = parseJsonFile(text);
        } else if (fileType === 'xlsx' || fileType === 'xls') {
          // Excel file
          parsed = parseExcelFile(e.target.result);
        } else {
          setNotice('⚠️ Định dạng file không hỗ trợ. Vui lòng chọn .txt, .json, hoặc .xlsx');
          return;
        }
        
        if (parsed.length === 0) {
          setNotice('⚠️ Không tìm thấy dữ liệu hợp lệ trong file');
        } else {
          setImportData(parsed);
          setNotice(`✅ Đã phân tích ${parsed.length} liên hệ từ file ${file.name}`);
        }
      } catch (error) {
        console.error('Parse error:', error);
        setNotice('❌ Lỗi khi đọc file: ' + error.message);
      }
    };
    
    // Đọc file theo định dạng phù hợp
    if (fileType === 'xlsx' || fileType === 'xls') {
      reader.readAsBinaryString(file);
    } else {
      reader.readAsText(file, 'UTF-8');
    }
  }

  // Import tất cả contacts vào DB
  async function importAllContacts() {
    if (importData.length === 0) {
      setNotice('⚠️ Vui lòng chọn file trước');
      return;
    }
    
    const confirmMsg = `Xác nhận import ${importData.length} khách hàng vào hệ thống?\n\nLưu ý: Quá trình này có thể mất vài phút.`;
    if (!window.confirm(confirmMsg)) return;
    
    setImporting(true);
    let success = 0;
    let failed = 0;
    
    for (let i = 0; i < importData.length; i++) {
      const contact = importData[i];
      try {
        await request(API, {
          method: 'POST',
          body: JSON.stringify(contact)
        });
        success++;
        
        // Cập nhật thông báo tiến trình
        if ((i + 1) % 50 === 0) {
          setNotice(`⏳ Đang import: ${i + 1}/${importData.length}...`);
        }
      } catch (error) {
        console.error(`Lỗi import ${contact.name}:`, error);
        failed++;
      }
    }
    
    setImporting(false);
    setNotice(`✅ Import hoàn tất: ${success} thành công${failed > 0 ? `, ${failed} lỗi` : ''}`);
    setShowImport(false);
    setImportData([]);
    if (page !== 1) setPage(1); else await loadCustomers();
  }

  function parseContactFile(text) {
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
      const phoneMatch = line.match(/SĐT:\s*(.+)$/i);
      if (phoneMatch && currentName) {
        let phone = phoneMatch[1].trim();
        // Loại bỏ ký tự không phải số/dấu + ở cuối
        phone = phone.replace(/[^\d+]/g, '');
        
        contacts.push({
          name: currentName,
          phone: phone,
          address: 'Chưa cập nhật' // Địa chỉ mặc định
        });
        currentName = '';
      }
    }
    
    return contacts;
  }

  function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const parsed = parseContactFile(text);
      setImportData(parsed);
      setNotice(`📋 Đã phân tích ${parsed.length} liên hệ từ file`);
    };
    reader.readAsText(file, 'UTF-8');
  }

  async function importAllContacts() {
    if (importData.length === 0) {
      setNotice('Vui lòng chọn file trước');
      return;
    }
    
    const confirmMsg = `Xác nhận import ${importData.length} khách hàng vào hệ thống?`;
    if (!window.confirm(confirmMsg)) return;
    
    setImporting(true);
    let success = 0;
    let failed = 0;
    
    for (const contact of importData) {
      try {
        await request(API, {
          method: 'POST',
          body: JSON.stringify(contact)
        });
        success++;
      } catch (error) {
        console.error(`Lỗi import ${contact.name}:`, error);
        failed++;
      }
    }
    
    setImporting(false);
    setNotice(`✅ Import thành công ${success} khách hàng${failed > 0 ? `, ${failed} lỗi` : ''}`);
    setShowImport(false);
    setImportData([]);
    if (page !== 1) setPage(1); else await loadCustomers();
  }

  const totalPages = Math.max(1, Math.ceil(count / limit));

  return <main className="app-shell">
    <section className="page-heading">
      <div>
        <p className="eyebrow">TỔNG QUAN</p>
        <h1>Danh sách khách hàng</h1>
        <p className="muted">Quản lý thông tin khách hàng tập trung trên nền tảng trực tuyến.</p>
      </div>
      <div style={{ display: 'flex', gap: '12px' }}>
        <button className="ghost" onClick={openImport} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>📁</span> Import danh bạ
        </button>
        <button className="primary" onClick={openAdd}>＋ Thêm khách hàng</button>
      </div>
    </section>

    {notice && <div className={`notice ${notice.includes('lỗi') || notice.includes('không') ? 'error' : 'success'}`}>{notice}</div>}

    {showImport ? (
      <div className="panel import-panel">
        <div className="panel-title">
          <h2>📁 Import danh bạ hàng loạt</h2>
          <button type="button" className="icon-button" onClick={() => { setShowImport(false); setImportData([]); }}>✕</button>
        </div>
        
        <div className="import-instructions">
          <p><strong>Hỗ trợ định dạng:</strong></p>
          <ul>
            <li><strong>.txt</strong> - File danh bạ (format: số thứ tự + tên, SĐT: xxx)</li>
            <li><strong>.json</strong> - JSON array với keys: name/phone/address</li>
            <li><strong>.xlsx/.xls</strong> - Excel với cột Tên, SĐT, Địa chỉ</li>
          </ul>
          <p className="muted">📞 Số điện thoại +84 sẽ tự động chuyển về định dạng 0xxx</p>
        </div>

        <div className="file-upload-zone">
          <input 
            type="file" 
            accept=".txt,.json,.xlsx,.xls" 
            onChange={handleFileUpload}
            id="fileInput"
            style={{ display: 'none' }}
          />
          <label htmlFor="fileInput" className="upload-button">
            <span style={{ fontSize: '32px' }}>📤</span>
            <span>Chọn file để import</span>
            <small>.txt, .json, .xlsx, .xls</small>
          </label>
        </div>

        {importData.length > 0 && (
          <>
            <div className="import-preview">
              <h3>👀 Preview {importData.length} khách hàng:</h3>
              <div className="preview-table-scroll">
                <table className="preview-table">
                  <thead>
                    <tr>
                      <th style={{ width: '50px' }}>#</th>
                      <th>Tên khách hàng</th>
                      <th>Số điện thoại</th>
                      <th>Địa chỉ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importData.slice(0, 10).map((item, idx) => (
                      <tr key={idx}>
                        <td>{idx + 1}</td>
                        <td>{item.name}</td>
                        <td>{item.phone}</td>
                        <td>{item.address}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {importData.length > 10 && (
                <p className="muted" style={{ marginTop: '12px', textAlign: 'center' }}>
                  ... và {importData.length - 10} khách hàng khác
                </p>
              )}
            </div>

            <div className="form-actions">
              <button type="button" className="ghost" onClick={() => { setShowImport(false); setImportData([]); }}>Hủy</button>
              <button 
                type="button" 
                className="primary" 
                onClick={importAllContacts}
                disabled={importing}
              >
                {importing ? '⏳ Đang import...' : `✅ Import ${importData.length} khách hàng`}
              </button>
            </div>
          </>
        )}
      </div>
    ) : null}

    {showForm ? (
      <form className="panel form-panel" onSubmit={saveCustomer}>
        <div className="panel-title">
          <h2>{editing ? 'Cập nhật khách hàng' : 'Thêm khách hàng mới'}</h2>
          <button type="button" className="icon-button" onClick={() => { setEditing(null); setShowForm(false); setForm({ name: '', phone: '', address: '' }); }}>✕</button>
        </div>
        <div className="form-grid">
          <label>Họ và tên *<input required maxLength="120" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nguyễn Văn A" /></label>
          <label>Số điện thoại *<input required maxLength="20" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="09xxxxxxxx" /></label>
          <label className="wide">Địa chỉ *<input required maxLength="500" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Số nhà, đường, xã/phường, tỉnh/thành" /></label>
        </div>
        <div className="form-actions">
          <button type="button" className="ghost" onClick={() => { setEditing(null); setShowForm(false); setForm({ name: '', phone: '', address: '' }); }}>Hủy</button>
          <button className="primary" disabled={loading}>{loading ? 'Đang lưu…' : 'Lưu thông tin'}</button>
        </div>
      </form>
    ) : null}

    <section className="panel table-panel">
      <div className="table-toolbar">
        <div>
          <h2>Dữ liệu khách hàng</h2>
          <p className="muted">Tìm theo tên hoặc số điện thoại</p>
        </div>
        <div className="search">
          <span>⌕</span>
          <input 
            value={search} 
            onChange={e => { setSearch(e.target.value); setPage(1); }} 
            placeholder="Nhập tên hoặc số điện thoại…" 
          />
        </div>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th className="th-name">KHÁCH HÀNG</th>
              <th className="th-phone">SỐ ĐIỆN THOẠI</th>
              <th className="th-address">ĐỊA CHỈ</th>
              <th className="th-actions">THAO TÁC</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="4" className="empty">Đang tải dữ liệu…</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan="4" className="empty">
                {search ? `Không tìm thấy khách hàng nào với từ khóa "${search}"` : 'Chưa có dữ liệu khách hàng.'}
              </td></tr>
            ) : customers.map((c, idx) => (
              <tr key={c.id} className="customer-row">
                <td className="td-name">
                  <div className="customer-info">
                    <span className="customer-number">{(page - 1) * limit + idx + 1}</span>
                    <strong>{c.name}</strong>
                  </div>
                </td>
                <td className="td-phone">{c.phone}</td>
                <td className="td-address">{c.address}</td>
                <td className="td-actions">
                  <div className="row-actions">
                    <button className="edit" onClick={() => openEdit(c)}>Sửa</button>
                    <button className="delete" onClick={() => deleteCustomer(c)}>Xóa</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <div className="pagination-info">
          <span>Trang {page}/{totalPages} · {count.toLocaleString('vi-VN')} khách hàng</span>
          <select value={limit} onChange={e => changeLimit(parseInt(e.target.value, 10))} className="page-limit-select">
            <option value="20">20/trang</option>
            <option value="50">50/trang</option>
            <option value="100">100/trang</option>
          </select>
        </div>
        <div>
          <button className="ghost" disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>← Trước</button>
          <button className="ghost" disabled={page >= totalPages || loading} onClick={() => setPage(p => p + 1)}>Sau →</button>
        </div>
      </div>
    </section>

    <footer>Thông tin khách hàng được lưu trên cơ sở dữ liệu trực tuyến.</footer>
  </main>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
