import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
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

  function openAdd() { setEditing(null); setForm({ name: '', phone: '', address: '' }); setShowForm(true); setNotice(''); }
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

  const totalPages = Math.max(1, Math.ceil(count / limit));

  return <main className="app-shell">
    <section className="page-heading">
      <div>
        <p className="eyebrow">TỔNG QUAN</p>
        <h1>Danh sách khách hàng</h1>
        <p className="muted">Quản lý thông tin khách hàng tập trung trên nền tảng trực tuyến.</p>
      </div>
      <button className="primary" onClick={openAdd}>＋ Thêm khách hàng</button>
    </section>

    {notice && <div className={`notice ${notice.includes('lỗi') || notice.includes('không') ? 'error' : 'success'}`}>{notice}</div>}

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
