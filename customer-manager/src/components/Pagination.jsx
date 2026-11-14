import React from 'react';

export function Pagination({ page, totalPages, count, limit, loading, onPageChange, onLimitChange, options = [5, 10, 20], unit = 'khách hàng' }) {
  return (
    <div className="pagination">
      <div className="pagination-info">
        <span>Trang {page}/{totalPages} · {count.toLocaleString('vi-VN')} {unit}</span>
        <select 
          value={limit} 
          onChange={e => onLimitChange(parseInt(e.target.value, 10))} 
          className="page-limit-select"
        >
          {options.map(n => <option key={n} value={n}>{n}/trang</option>)}
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
