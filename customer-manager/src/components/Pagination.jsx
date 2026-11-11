import React from 'react';

export function Pagination({ page, totalPages, count, limit, loading, onPageChange, onLimitChange }) {
  return (
    <div className="pagination">
      <div className="pagination-info">
        <span>Trang {page}/{totalPages} · {count.toLocaleString('vi-VN')} khách hàng</span>
        <select 
          value={limit} 
          onChange={e => onLimitChange(parseInt(e.target.value, 10))} 
          className="page-limit-select"
        >
          <option value="20">20/trang</option>
          <option value="50">50/trang</option>
          <option value="100">100/trang</option>
        </select>
      </div>
      <div>
        <button 
          className="ghost" 
          disabled={page <= 1 || loading} 
          onClick={() => onPageChange(page - 1)}
        >
          ← Trước
        </button>
        <button 
          className="ghost" 
          disabled={page >= totalPages || loading} 
          onClick={() => onPageChange(page + 1)}
        >
          Sau →
        </button>
      </div>
    </div>
  );
}
