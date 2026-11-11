import React from 'react';

export function CustomerTable({ customers, loading, search, page, limit, onEdit, onDelete }) {
  if (loading) {
    return (
      <tr>
        <td colSpan="4" className="empty">Đang tải dữ liệu…</td>
      </tr>
    );
  }

  if (customers.length === 0) {
    return (
      <tr>
        <td colSpan="4" className="empty">
          {search ? `Không tìm thấy khách hàng nào với từ khóa "${search}"` : 'Chưa có dữ liệu khách hàng.'}
        </td>
      </tr>
    );
  }

  return customers.map((customer, idx) => (
    <tr key={customer.id} className="customer-row">
      <td className="td-name">
        <div className="customer-info">
          <span className="customer-number">{(page - 1) * limit + idx + 1}</span>
          <strong>{customer.name}</strong>
        </div>
      </td>
      <td className="td-phone">{customer.phone}</td>
      <td className="td-address">{customer.address}</td>
      <td className="td-actions">
        <div className="row-actions">
          <button className="edit" onClick={() => onEdit(customer)}>Sửa</button>
          <button className="delete" onClick={() => onDelete(customer)}>Xóa</button>
        </div>
      </td>
    </tr>
  ));
}
