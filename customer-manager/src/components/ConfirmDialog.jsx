import React, { useEffect } from 'react';

export function ConfirmDialog({ 
  isOpen, 
  title, 
  message, 
  confirmText = 'Xác nhận', 
  cancelText = 'Hủy',
  onConfirm, 
  onCancel,
  type = 'confirm' // 'confirm', 'alert', 'warning', 'success'
}) {
  useEffect(() => {
    if (isOpen) {
      // Prevent body scroll when dialog is open
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onCancel?.();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'warning':
        return '⚠️';
      case 'success':
        return '✅';
      case 'alert':
        return 'ℹ️';
      default:
        return '❓';
    }
  };

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog-container" onClick={e => e.stopPropagation()}>
        <div className={`dialog-content dialog-${type}`}>
          <div className="dialog-icon">{getIcon()}</div>
          
          {title && <h3 className="dialog-title">{title}</h3>}
          
          <div className="dialog-message">
            {message.split('\n').map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
          
          <div className="dialog-actions">
            {type !== 'alert' && (
              <button 
                type="button"
                className="dialog-btn dialog-btn-cancel" 
                onClick={onCancel}
              >
                {cancelText}
              </button>
            )}
            <button 
              type="button"
              className={`dialog-btn dialog-btn-confirm dialog-btn-${type}`}
              onClick={onConfirm}
              autoFocus
            >
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
