import React, { useState, useEffect, useRef } from 'react';

export function VerificationModal({ isOpen, onVerify, onCancel }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setCode('');
      setError('');
      document.body.style.overflow = 'hidden';
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();
    
    if (!code.trim()) {
      setError('Vui lòng nhập mã xác minh');
      return;
    }
    
    onVerify(code);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      onCancel?.();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="verification-modal" onClick={e => e.stopPropagation()}>
        <div className="verification-content">
          <div className="verification-icon">🔐</div>
          
          <h2 className="verification-title">Xác minh quyền truy cập</h2>
          <p className="verification-description">
            Vui lòng nhập mã xác minh để sử dụng các chức năng quản lý
          </p>
          
          <form onSubmit={handleSubmit}>
            <div className="verification-input-group">
              <label htmlFor="verifyCode">Mã xác minh</label>
              <input
                ref={inputRef}
                id="verifyCode"
                type="password"
                className={`verification-input ${error ? 'error' : ''}`}
                value={code}
                onChange={e => {
                  setCode(e.target.value);
                  setError('');
                }}
                onKeyDown={handleKeyDown}
                placeholder="Nhập mã xác minh"
                autoComplete="off"
              />
              {error && <span className="verification-error">{error}</span>}
            </div>
            
            <div className="verification-actions">
              <button 
                type="button"
                className="verification-btn verification-btn-cancel" 
                onClick={onCancel}
              >
                Hủy
              </button>
              <button 
                type="submit"
                className="verification-btn verification-btn-verify"
              >
                Xác nhận
              </button>
            </div>
          </form>
          
          <p className="verification-hint">
            💡 Liên hệ quản trị viên để lấy mã xác minh
          </p>
        </div>
      </div>
    </div>
  );
}
