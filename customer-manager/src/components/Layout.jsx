import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useVerification } from '../context/VerificationContext';
import { VerificationModal } from './VerificationModal';

export function Layout() {
  const { isVerified, showVerifyModal, verify, requireVerification, cancelVerification, clearVerification } =
    useVerification();

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          {isVerified ? (
            <nav className="topnav" aria-label="Menu chính">
              <NavLink to="/" end>👥 Khách hàng</NavLink>
              <NavLink to="/soat-hang">📦 Soát hàng J&amp;T</NavLink>
            </nav>
          ) : (
            <span className="topbar-brand">Quản lý khách hàng</span>
          )}

          <div
            className={`verification-badge ${isVerified ? 'verified' : 'unverified'}`}
            onClick={() => (isVerified ? clearVerification() : requireVerification(() => {}))}
            title={isVerified ? 'Click để đăng xuất' : 'Chưa xác minh'}
          >
            {isVerified ? (
              <>
                <span>✓</span>
                <span>Đã xác minh</span>
              </>
            ) : (
              <>
                <span>🔒</span>
                <span>Chưa xác minh</span>
              </>
            )}
          </div>
        </div>
      </header>

      <Outlet />

      <VerificationModal isOpen={showVerifyModal} onVerify={verify} onCancel={cancelVerification} />
    </>
  );
}
