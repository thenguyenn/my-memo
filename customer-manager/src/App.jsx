import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { VerificationProvider, useVerification } from './context/VerificationContext';
import { Layout } from './components/Layout';
import { CustomerList } from './pages/CustomerList';
import { SoatDon } from './pages/SoatDon';
import { BaoCaoCuoiNgay } from './pages/BaoCaoCuoiNgay';
import { CareDon } from './pages/CareDon';
import { Chay24h } from './pages/Chay24h';
import { UserManagement } from './pages/UserManagement';

function RequireVerified({ children }) {
  const { isVerified, authLoading, requireVerification } = useVerification();
  if (authLoading) return null;
  if (isVerified) return children;
  return (
    <main className="app-shell">
      <section className="panel gate">
        <h2>Cần đăng nhập để sử dụng chức năng này</h2>
        <p className="muted">Vui lòng đăng nhập bằng tài khoản Google để truy cập toàn bộ chức năng.</p>
        <button className="primary" onClick={() => requireVerification(() => {})}>Đăng nhập bằng Google</button>
      </section>
    </main>
  );
}

function RequireOwner({ children }) {
  const { user, isVerified, authLoading, requireVerification } = useVerification();
  if (authLoading) return null;
  if (!isVerified) {
    return (
      <main className="app-shell">
        <section className="panel gate">
          <h2>Cần đăng nhập tài khoản Chủ trang web</h2>
          <p className="muted">Chỉ chủ trang web (nguyenbathe2711@gmail.com) mới có quyền quản lý người dùng.</p>
          <button className="primary" onClick={() => requireVerification(() => {})}>Đăng nhập bằng Google</button>
        </section>
      </main>
    );
  }
  if (!user?.isOwner) {
    return (
      <main className="app-shell">
        <section className="panel gate">
          <h2>Không có quyền truy cập</h2>
          <p className="muted">Trang này chỉ dành cho chủ trang web (nguyenbathe2711@gmail.com).</p>
        </section>
      </main>
    );
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <VerificationProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<CustomerList />} />
            <Route path="/soat-hang" element={<RequireVerified><SoatDon /></RequireVerified>} />
            <Route path="/bao-cao-cuoi-ngay" element={<RequireVerified><BaoCaoCuoiNgay /></RequireVerified>} />
            <Route path="/care-don" element={<RequireVerified><CareDon /></RequireVerified>} />
            <Route path="/chay-24h" element={<RequireVerified><Chay24h /></RequireVerified>} />
            <Route path="/nguoi-dung" element={<RequireOwner><UserManagement /></RequireOwner>} />
            <Route path="/soat-don" element={<Navigate to="/soat-hang" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </VerificationProvider>
    </BrowserRouter>
  );
}
