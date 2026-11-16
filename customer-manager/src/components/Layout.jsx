import React, { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useVerification } from '../context/VerificationContext';
import { VerificationModal } from './VerificationModal';

const NAV_ITEMS = [
  { id: 'customers', to: '/', label: 'Khách hàng', end: true },
  { id: 'soat-hang', to: '/soat-hang', label: 'Soát hàng' },
  { id: 'bao-cao-cuoi-ngay', to: '/bao-cao-cuoi-ngay', label: 'Báo cáo cuối ngày' },
  { id: 'nguoi-dung', to: '/nguoi-dung', label: 'Người dùng', ownerOnly: true },
];
const ORDER_KEY = 'nav-order-v1';

function loadOrder() {
  try {
    const saved = JSON.parse(localStorage.getItem(ORDER_KEY) || '[]');
    const known = saved.filter((id) => NAV_ITEMS.some((n) => n.id === id));
    const missing = NAV_ITEMS.map((n) => n.id).filter((id) => !known.includes(id));
    return [...known, ...missing];
  } catch {
    return NAV_ITEMS.map((n) => n.id);
  }
}

export function Layout() {
  const {
    user,
    isVerified,
    showVerifyModal,
    verify,
    requireVerification,
    cancelVerification,
    clearVerification,
  } = useVerification();

  const [order, setOrder] = useState(loadOrder);
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);

  const items = order
    .map((id) => NAV_ITEMS.find((n) => n.id === id))
    .filter((n) => n && (!n.ownerOnly || user?.isOwner));

  const move = (fromId, toId) => {
    if (!fromId || fromId === toId) return;
    setOrder((prev) => {
      // Kéo sang phải -> chèn sau đích; kéo sang trái -> chèn trước đích
      const next = prev.filter((id) => id !== fromId);
      next.splice(prev.indexOf(toId), 0, fromId);
      localStorage.setItem(ORDER_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="topbar-left">
            <span className="topbar-brand">The Nguyen</span>
            {isVerified && (
              <nav className="topnav" aria-label="Menu chính">
                {items.map((n) => (
                  <NavLink
                    key={n.id}
                    to={n.to}
                    end={n.end}
                    draggable
                    title="Kéo để đổi vị trí"
                    className={({ isActive }) =>
                      [isActive && 'active', dragId === n.id && 'dragging', overId === n.id && dragId !== n.id && 'drag-over']
                        .filter(Boolean).join(' ')
                    }
                    onDragStart={(e) => { setDragId(n.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', n.id); }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (overId !== n.id) setOverId(n.id); }}
                    onDragLeave={() => setOverId((o) => (o === n.id ? null : o))}
                    onDrop={(e) => { e.preventDefault(); move(dragId || e.dataTransfer.getData('text/plain'), n.id); setDragId(null); setOverId(null); }}
                    onDragEnd={() => { setDragId(null); setOverId(null); }}
                  >
                    {n.label}
                  </NavLink>
                ))}
              </nav>
            )}
          </div>

          <div className="topbar-right">
            {isVerified && user && (
              <span className="topbar-user" title={user.email}>
                {user.name || user.email}
              </span>
            )}
            <button
              type="button"
              className={`verification-badge ${isVerified ? 'verified' : 'unverified'}`}
              onClick={() => (isVerified ? clearVerification() : requireVerification(() => {}))}
              title={isVerified ? 'Bấm để đăng xuất' : 'Bấm để đăng nhập bằng Google'}
            >
              {isVerified ? 'Đăng xuất' : 'Đăng nhập Google'}
            </button>
          </div>
        </div>
      </header>

      <Outlet />

      <VerificationModal isOpen={showVerifyModal} onVerify={verify} onCancel={cancelVerification} />
    </>
  );
}
