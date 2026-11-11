import { useState, useCallback, useEffect } from 'react';

// Mã xác minh mặc định - có thể lấy từ ENV hoặc API
const VERIFICATION_CODE = import.meta.env.VITE_VERIFY_CODE || '123456';
const STORAGE_KEY = 'customer_manager_verified';
const EXPIRY_KEY = 'customer_manager_verified_expiry';

// Thời gian hết hạn: 8 giờ
const EXPIRY_HOURS = 8;

export function useVerification() {
  const [isVerified, setIsVerified] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  // Kiểm tra xác minh khi mount
  useEffect(() => {
    const verified = localStorage.getItem(STORAGE_KEY);
    const expiry = localStorage.getItem(EXPIRY_KEY);
    
    if (verified === 'true' && expiry) {
      const expiryTime = parseInt(expiry, 10);
      if (Date.now() < expiryTime) {
        setIsVerified(true);
      } else {
        // Hết hạn
        clearVerification();
      }
    }
  }, []);

  const clearVerification = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    setIsVerified(false);
  }, []);

  const verify = useCallback((code) => {
    if (code === VERIFICATION_CODE) {
      const expiryTime = Date.now() + (EXPIRY_HOURS * 60 * 60 * 1000);
      localStorage.setItem(STORAGE_KEY, 'true');
      localStorage.setItem(EXPIRY_KEY, String(expiryTime));
      setIsVerified(true);
      setShowVerifyModal(false);
      
      // Thực hiện action đang pending
      if (pendingAction) {
        pendingAction();
        setPendingAction(null);
      }
      
      return true;
    }
    return false;
  }, [pendingAction]);

  const requireVerification = useCallback((action) => {
    if (isVerified) {
      // Đã xác minh, thực hiện action ngay
      action();
    } else {
      // Chưa xác minh, lưu action và hiện modal
      setPendingAction(() => action);
      setShowVerifyModal(true);
    }
  }, [isVerified]);

  const cancelVerification = useCallback(() => {
    setShowVerifyModal(false);
    setPendingAction(null);
  }, []);

  return {
    isVerified,
    showVerifyModal,
    verify,
    requireVerification,
    cancelVerification,
    clearVerification,
  };
}
