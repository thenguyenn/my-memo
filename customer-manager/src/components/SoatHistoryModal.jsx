import React from 'react';
import { nextSixAM } from '../utils/soatHistory';

const pad = (n) => String(n).padStart(2, '0');
const fmt = (ts) => {
  const d = new Date(ts);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function SoatHistoryModal({ runs, onClose, onOpen, onDelete, onClear }) {
  return (
    <div className="sd-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sd-modal">
        <div className="sd-modal-head">
          <div>
            <p className="sd-modal-eyebrow">LỊCH SỬ SOÁT HÀNG</p>
            <h2 className="sd-modal-title">Các lần soát gần đây</h2>
            <p className="muted">Lịch sử lưu ngay trên trình duyệt này và tự động xóa vào <strong>6:00 sáng</strong> hằng ngày.</p>
          </div>
          <button className="ghost" onClick={onClose}>Đóng</button>
        </div>

        <div className="sd-modal-body">
          {runs.length === 0 ? (
            <div className="sd-hist-empty">Chưa có lịch sử. Mỗi lần bấm “Bắt đầu soát hàng” sẽ được lưu lại ở đây.</div>
          ) : (
            runs.map((r) => (
              <div className="sd-hist-item" key={r.id}>
                <div className="sd-hist-main">
                  <div className="sd-hist-title">
                    {fmt(r.createdAt)} · <strong>{r.total}</strong> vận đơn
                  </div>
                  <div className="sd-hist-meta">
                    {r.stats
                      ? `Đang phát ${r.stats.delivering} · Từ chối ${r.stats.refused} · Chuyển hoàn ${r.stats.returning} · Có kiện vấn đề ${r.stats.hasIssue}`
                      : ''}
                  </div>
                  <div className="sd-hist-meta">
                    {r.files?.length ? `File: ${r.files.join(', ')}` : ''}
                  </div>
                  <div className="sd-hist-exp">Tự xóa lúc {fmt(nextSixAM(new Date(r.createdAt)))}</div>
                </div>
                <div className="sd-hist-actions">
                  <button className="primary sd-choose-btn" onClick={() => onOpen(r.id)}>Mở lại</button>
                  <button className="ghost sd-choose-btn" onClick={() => onDelete(r.id)}>Xóa</button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="sd-modal-foot">
          {runs.length > 0 && <button className="ghost" onClick={onClear}>Xóa tất cả</button>}
          <button className="ghost" onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
