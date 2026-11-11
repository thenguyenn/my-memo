import React from 'react';

export function SearchBar({ value, onChange }) {
  return (
    <div className="search">
      <span>⌕</span>
      <input 
        value={value} 
        onChange={e => onChange(e.target.value)} 
        placeholder="Nhập tên hoặc số điện thoại…" 
      />
    </div>
  );
}
