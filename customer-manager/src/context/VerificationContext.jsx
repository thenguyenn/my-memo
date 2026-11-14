import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, TOKEN_KEY } from '../services/api';

const STORAGE_KEY = 'customer_manager_verified';
const EXPIRY_KEY = 'customer_manager_verified_expiry';

const VerificationContext = createContext(null);

export function VerificationProvider({ children }) {
  const [isVerified, setIsVerified] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const pendingRef = useRef(null);

  const clearVerification = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    localStorage.removeItem(TOKEN_KEY);
    setIsVerified(false);
  }, []);

  // Khôi phục phiên đã xác minh (cần cả cờ, hạn dùng và token do server cấp)
  useEffect(() => {
    const expiry = parseInt(localStorage.getItem(EXPIRY_KEY) || '0', 10);
    const ok =
      localStorage.getItem(STORAGE_KEY) === 'true' &&
      localStorage.getItem(TOKEN_KEY) &&
      Date.now() < expiry;
    if (ok) setIsVerified(true);
    else clearVerification();
  }, [clearVerification]);

  // Mã được kiểm tra trên client-side với biến env
  const verify = useCallback(async (code) => {
    try {
      // Lấy mã xác minh từ environment variable
      const correctCode = import.meta.env.VITE_VERIFY_CODE || '271104';
      
      if (code === correctCode) {
        // Tạo token và thời gian hết hạn
        const token = `verified_${Date.now()}`;
        const expiresAt = Date.now() + (8 * 60 * 60 * 1000); // 8 giờ
        
        localStorage.setItem(STORAGE_KEY, 'true');
        localStorage.setItem(EXPIRY_KEY, String(expiresAt));
        localStorage.setItem(TOKEN_KEY, token);
        setIsVerified(true);
        setShowVerifyModal(false);
        const action = pendingRef.current;
        pendingRef.current = null;
        if (action) action();
        return true;
      } else {
        return false;
      }
    } catch (error) {
      console.error('Verification error:', error);
      return false;
    }
  }, []);

  const requireVerification = useCallback(
    (action) => {
      if (isVerified) {
        action();
      } else {
        pendingRef.current = action;
        setShowVerifyModal(true);
      }
    },
    [isVerified]
  );

  const cancelVerification = useCallback(() => {
    setShowVerifyModal(false);
    pendingRef.current = null;
  }, []);

  const value = {
    isVerified,
    showVerifyModal,
    verify,
    requireVerification,
    cancelVerification,
    clearVerification,
  };

  return <VerificationContext.Provider value={value}>{children}</VerificationContext.Provider>;
}

export function useVerification() {
  const ctx = useContext(VerificationContext);
  if (!ctx) throw new Error('useVerification phải nằm trong <VerificationProvider>');
  return ctx;
}
