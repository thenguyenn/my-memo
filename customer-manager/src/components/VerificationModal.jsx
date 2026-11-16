import React, { useEffect, useRef, useState } from 'react';
import { useVerification } from '../context/VerificationContext';

const GSI_SRC = 'https://accounts.google.com/gsi/client';

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts) {
      resolve(window.google);
      return;
    }
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(window.google));
      existing.addEventListener('error', () => reject(new Error('Không tải được thư viện Google Sign-In.')));
      return;
    }
    const s = document.createElement('script');
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(window.google);
    s.onerror = () => reject(new Error('Không tải được thư viện Google Sign-In.'));
    document.head.appendChild(s);
  });
}

export function VerificationModal({ isOpen, onCancel }) {
  const { loginWithGoogle, googleClientId } = useVerification();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const tokenClientRef = useRef(null);

  const envClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim();
  const clientId =
    googleClientId && !googleClientId.startsWith('GOCSPX-')
      ? googleClientId
      : !envClientId.startsWith('GOCSPX-')
        ? envClientId
        : '';

  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = 'unset';
      return undefined;
    }
    setError('');
    setBusy(false);
    document.body.style.overflow = 'hidden';

    const onKey = (e) => {
      if (e.key === 'Escape') onCancel?.();
    };
    document.addEventListener('keydown', onKey);

    let cancelled = false;
    if (clientId) {
      loadGoogleScript()
        .then((google) => {
          if (cancelled || !google?.accounts?.oauth2) return;
          tokenClientRef.current = google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: 'openid email profile',
            callback: async (tokenResponse) => {
              if (tokenResponse?.error) {
                setError(`Lỗi từ Google: ${tokenResponse.error}`);
                return;
              }
              if (!tokenResponse?.access_token) return;
              setBusy(true);
              setError('');
              try {
                let userInfo = null;
                try {
                  const uRes = await fetch(
                    `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${encodeURIComponent(tokenResponse.access_token)}`
                  );
                  if (uRes.ok) userInfo = await uRes.json();
                } catch {
                  // Bỏ qua nếu trình duyệt không gọi trực tiếp được
                }
                await loginWithGoogle({
                  googleAccessToken: tokenResponse.access_token,
                  userInfo,
                });
              } catch (err) {
                setError(err.message || 'Đăng nhập bằng Google thất bại.');
              } finally {
                setBusy(false);
              }
            },
          });
        })
        .catch((err) => {
          if (!cancelled) setError(err.message);
        });
    }

    return () => {
      cancelled = true;
      document.body.style.overflow = 'unset';
      document.removeEventListener('keydown', onKey);
    };
  }, [isOpen, clientId, loginWithGoogle, onCancel]);

  if (!isOpen) return null;

  const handlePopupLogin = () => {
    if (!clientId) {
      setError('Chưa cấu hình VITE_GOOGLE_CLIENT_ID trong file .env.');
      return;
    }
    if (tokenClientRef.current) {
      tokenClientRef.current.requestAccessToken({ prompt: 'select_account' });
    } else {
      setError('Đang tải dịch vụ Google, vui lòng thử lại sau giây lát.');
    }
  };

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="verification-modal" onClick={(e) => e.stopPropagation()}>
        <div className="verification-content">
          <h2 className="verification-title">Đăng nhập bằng Google</h2>
          <div className="google-auth-box">
            {!clientId && (
              <div className="notice error" style={{ marginBottom: 12 }}>
                Cần cấu hình biến môi trường <strong>VITE_GOOGLE_CLIENT_ID</strong> và <strong>GOOGLE_CLIENT_ID</strong> để kích hoạt đăng nhập Google.
              </div>
            )}

            <button
              type="button"
              className="primary google-login-btn"
              onClick={handlePopupLogin}
              disabled={busy}
            >
              {busy ? 'Đang xác thực…' : 'Đăng nhập với tài khoản Google'}
            </button>
          </div>

          {error && <span className="verification-error" style={{ marginBottom: 12 }}>{error}</span>}

          <div className="verification-actions" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="verification-btn verification-btn-cancel"
              onClick={onCancel}
              disabled={busy}
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
