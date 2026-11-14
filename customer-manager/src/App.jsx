import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { VerificationProvider, useVerification } from './context/VerificationContext';
import { Layout } from './components/Layout';
import { CustomerList } from './pages/CustomerList';
import { JtCheck } from './pages/JtCheck';

function RequireVerified({ children }) {
  const { isVerified, requireVerification } = useVerification();
  if (isVerified) return children;
  return (
    <main className="app-shell">
      <section className="panel gate">
        <div className="gate-icon">🔐</div>
        <h2>Cần xác minh để xem trang này</h2>
        <p className="muted">Nhập mã xác minh để mở chức năng soát hàng J&amp;T.</p>
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
            <Route path="/soat-hang" element={<RequireVerified><JtCheck /></RequireVerified>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </VerificationProvider>
    </BrowserRouter>
  );
}
