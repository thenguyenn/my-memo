import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CustomerList } from './pages/CustomerList';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CustomerList />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
