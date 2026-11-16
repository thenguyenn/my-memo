import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { VerificationProvider, useVerification } from './context/VerificationContext';
import { Layout } from './components/Layout';
import { CustomerList } from './pages/CustomerList';
import { SoatDon } from './pages/SoatDon';
import { BaoCaoCuoiNgay } from './pages/BaoCaoCuoiNgay';

function RequireVerified({ children }) {
  const { isVerified, requireVerification } = useVerification();
  if (isVerified) return children;
  return (
    <main className="app-shell">
      <section className="panel gate">
        <h2>Cần xác minh để xem trang này</h2>
        <p className="muted">Nhập mã xác minh để mở chức năng soát hàng.</p>
        <button className="primary" onClick={() => requireVerification(() => {})}>Nhập mã xác minh</button>
      </section>
    </main>
  );
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
            <Route path="/soat-don" element={<Navigate to="/soat-hang" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </VerificationProvider>
    </BrowserRouter>
  );
}
