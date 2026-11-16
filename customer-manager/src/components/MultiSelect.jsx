import React, { useEffect, useMemo, useRef, useState } from 'react';

const norm = (s) =>
  String(s ?? '').replace(/đ/gi, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Ô lọc nhiều lựa chọn: tìm trong danh sách, Chọn tất cả / Bỏ chọn / Áp dụng.
 * value = mảng giá trị đã áp dụng ([] = Tất cả).
 */
export function MultiSelect({ options, value, onChange, placeholder = 'Tất cả' }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [q, setQ] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const visible = useMemo(() => {
    const k = norm(q.trim());
    return k ? options.filter((o) => norm(o).includes(k)) : options;
  }, [options, q]);

  const toggleOpen = () => {
    if (!open) { setDraft(value); setQ(''); }
    setOpen((o) => !o);
  };
  const toggleItem = (o) =>
    setDraft((d) => (d.includes(o) ? d.filter((x) => x !== o) : [...d, o]));

  const text = value.length === 0 ? placeholder : value.length === 1 ? value[0] : `${value.length} mục đã chọn`;

  return (
    <div className="ms-wrap" ref={ref}>
      <button type="button" className={`ms-btn${value.length ? ' ms-btn--on' : ''}${open ? ' ms-btn--open' : ''}`} onClick={toggleOpen}>
        <span className="ms-btn-text">{text}</span>
        <span className="ms-caret">⌄</span>
      </button>

      {open && (
        <div className="ms-pop">
          <input
            className="ms-search"
            autoFocus
            placeholder="Tìm trong danh sách…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="ms-list">
            {visible.length === 0 && <div className="ms-empty">Không có kết quả</div>}
            {visible.map((o) => (
              <label key={o} className={`ms-opt${draft.includes(o) ? ' ms-opt--on' : ''}`}>
                <input type="checkbox" checked={draft.includes(o)} onChange={() => toggleItem(o)} />
                <span>{o}</span>
              </label>
            ))}
          </div>
          <div className="ms-foot">
            <button type="button" className="ms-link" onClick={() => setDraft([...new Set([...draft, ...visible])])}>Chọn tất cả</button>
            <button type="button" className="ms-link" onClick={() => setDraft([])}>Bỏ chọn</button>
            <button type="button" className="ms-apply" onClick={() => { onChange(draft); setOpen(false); }}>Áp dụng</button>
          </div>
        </div>
      )}
    </div>
  );
}
