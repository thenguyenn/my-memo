import React, { useEffect, useMemo, useRef, useState } from 'react';

const norm = (s) =>
  String(s ?? '').replace(/đ/gi, 'd').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Ô lọc nhiều lựa chọn: tìm trong danh sách, Chọn tất cả / Bỏ chọn / Áp dụng.
 * value = mảng giá trị đã áp dụng ([] = Tất cả).
 */
export function MultiSelect({ options = [], value = [], onChange, placeholder = 'Tất cả' }) {
  const safeValue = useMemo(() => (Array.isArray(value) ? value : []), [value]);
  const safeOptions = useMemo(() => {
    if (!Array.isArray(options)) return [];
    const seen = new Set();
    const out = [];
    for (const item of options) {
      const s = Array.isArray(item) ? String(item[0] ?? '') : String(item ?? '');
      if (s && !seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
    return out;
  }, [options]);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(safeValue);
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
    return k ? safeOptions.filter((o) => norm(o).includes(k)) : safeOptions;
  }, [safeOptions, q]);

  const toggleOpen = () => {
    if (!open) { setDraft(safeValue); setQ(''); }
    setOpen((o) => !o);
  };
  const toggleItem = (o) =>
    setDraft((d) => {
      const arr = Array.isArray(d) ? d : [];
      return arr.includes(o) ? arr.filter((x) => x !== o) : [...arr, o];
    });

  const text = safeValue.length === 0 ? placeholder : safeValue.length === 1 ? safeValue[0] : `${safeValue.length} mục đã chọn`;

  return (
    <div className="ms-wrap" ref={ref}>
      <button type="button" className={`ms-btn${safeValue.length ? ' ms-btn--on' : ''}${open ? ' ms-btn--open' : ''}`} onClick={toggleOpen}>
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
              <label key={o} className={`ms-opt${Array.isArray(draft) && draft.includes(o) ? ' ms-opt--on' : ''}`}>
                <input type="checkbox" checked={Array.isArray(draft) && draft.includes(o)} onChange={() => toggleItem(o)} />
                <span>{o}</span>
              </label>
            ))}
          </div>
          <div className="ms-foot">
            <button type="button" className="ms-link" onClick={() => setDraft([...new Set([...(Array.isArray(draft) ? draft : []), ...visible])])}>Chọn tất cả</button>
            <button type="button" className="ms-link" onClick={() => setDraft([])}>Bỏ chọn</button>
            <button type="button" className="ms-apply" onClick={() => { onChange(draft); setOpen(false); }}>Áp dụng</button>
          </div>
        </div>
      )}
    </div>
  );
}
