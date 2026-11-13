import React, { useState, useEffect } from 'react';

export function CustomerForm({ customer, onSave, onCancel, loading }) {
  const [form, setForm] = useState({ name: '', phone: '', address: '' });

  useEffect(() => {
    if (customer) {
      // Đang edit - load dữ liệu khách hàng
      setForm({
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
      });
    } else {
      // Thêm mới hoặc sau khi thêm thành công - reset form
      setForm({ name: '', phone: '', address: '' });
    }
  }, [customer]);

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
    // Form sẽ tự động clear qua useEffect khi customer = null
  };

  return (
    <form className="panel form-panel" onSubmit={handleSubmit}>
      <div className="panel-title">
        <h2>{customer ? 'Cập nhật khách hàng' : 'Thêm khách hàng mới'}</h2>
        <button type="button" className="icon-button" onClick={onCancel}>✕</button>
      </div>
      
      <div className="form-grid">
        <label>
          Họ và tên *
          <input 
            required 
            maxLength="120" 
            value={form.name} 
            onChange={e => setForm({ ...form, name: e.target.value })} 
            placeholder="Nguyễn Văn A" 
          />
        </label>
        
        <label>
          Số điện thoại *
          <input 
            required 
            maxLength="20" 
            value={form.phone} 
            onChange={e => setForm({ ...form, phone: e.target.value })} 
            placeholder="09xxxxxxxx" 
          />
        </label>
        
        <label className="wide">
          Địa chỉ *
          <input 
            required 
            maxLength="500" 
            value={form.address} 
            onChange={e => setForm({ ...form, address: e.target.value })} 
            placeholder="Số nhà, đường, xã/phường, tỉnh/thành" 
          />
        </label>
      </div>
      
      <div className="form-actions">
        <button type="button" className="ghost" onClick={onCancel}>Hủy</button>
        <button type="submit" className="primary" disabled={loading}>
          {loading ? 'Đang lưu…' : 'Lưu thông tin'}
        </button>
      </div>
    </form>
  );
}
