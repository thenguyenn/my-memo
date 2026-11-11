import { useState, useCallback } from 'react';

export function useConfirm() {
  const [dialogState, setDialogState] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: 'Xác nhận',
    cancelText: 'Hủy',
    type: 'confirm',
    onConfirm: null,
    onCancel: null,
  });

  const confirm = useCallback(({ title, message, confirmText, cancelText, type = 'confirm' }) => {
    return new Promise((resolve) => {
      setDialogState({
        isOpen: true,
        title,
        message,
        confirmText: confirmText || 'Xác nhận',
        cancelText: cancelText || 'Hủy',
        type,
        onConfirm: () => {
          setDialogState(prev => ({ ...prev, isOpen: false }));
          resolve(true);
        },
        onCancel: () => {
          setDialogState(prev => ({ ...prev, isOpen: false }));
          resolve(false);
        },
      });
    });
  }, []);

  const alert = useCallback(({ title, message, confirmText, type = 'alert' }) => {
    return new Promise((resolve) => {
      setDialogState({
        isOpen: true,
        title,
        message,
        confirmText: confirmText || 'OK',
        type,
        onConfirm: () => {
          setDialogState(prev => ({ ...prev, isOpen: false }));
          resolve(true);
        },
        onCancel: () => {
          setDialogState(prev => ({ ...prev, isOpen: false }));
          resolve(true);
        },
      });
    });
  }, []);

  return {
    dialogState,
    confirm,
    alert,
  };
}
