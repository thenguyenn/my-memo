import React from 'react';
import { nextSixAM } from '../utils/soatHistory';

const pad = (n) => String(n).padStart(2, '0');
const fmt = (ts) => {
  const d = new Date(ts);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function SoatHistoryModal({
  runs,
  onClose,
  onOpen,
  onDelete,
  onClear,
  eyebrow = 'LỊCH SỬ SOÁT HÀNG',
  title = 'Các lần soát gần đây',
  emptyText = 'Chưa có lịch sử. Mỗi lần tải và xử lý file sẽ được lưu lại ở đây.',
  renderSummary,
}) {
  return (
    <div className="sd-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sd-modal">
        <div className="sd-modal-head">
          <div>
            <p className="sd-modal-eyebrow">{eyebrow}</p>
            <h2 className="sd-modal-title">{title}</h2>
            <p className="muted">Lịch sử lưu ngay trên trình duyệt này và tự động xóa vào <strong>6:00 sáng</strong> hằng ngày.</p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>Đóng</button>
        </div>

        <div className="sd-modal-body">
          {runs.length === 0 ? (
            <div className="sd-hist-empty">{emptyText}</div>
          ) : (
            runs.map((r) => (
              <div className="sd-hist-item" key={r.id}>
                <div className="sd-hist-main">
                  <div className="sd-hist-title">
                    {fmt(r.createdAt)} · <strong>{r.summaryTitle || `${r.total ?? 0} vận đơn`}</strong>
                  </div>
                  <div className="sd-hist-meta">
                    {renderSummary
                      ? renderSummary(r)
                      : r.stats
                        ? `Đang phát ${r.stats.delivering} · Từ chối ${r.stats.refused} · Chuyển hoàn ${r.stats.returning} · Có kiện vấn đề ${r.stats.hasIssue}`
                        : r.summaryMeta || ''}
                  </div>
                  {r.files?.length > 0 && (
                    <div className="sd-hist-meta">
                      File: {r.files.join(', ')}
                    </div>
                  )}
                  <div className="sd-hist-exp">Tự xóa lúc {fmt(nextSixAM(new Date(r.createdAt)))}</div>
                </div>
                <div className="sd-hist-actions">
                  <button type="button" className="primary sd-choose-btn" onClick={() => onOpen(r.id)}>Mở lại</button>
                  <button type="button" className="ghost sd-choose-btn" onClick={() => onDelete(r.id)}>Xóa</button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="sd-modal-foot">
          {runs.length > 0 && <button type="button" className="ghost" onClick={onClear}>Xóa tất cả</button>}
          <button type="button" className="ghost" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
