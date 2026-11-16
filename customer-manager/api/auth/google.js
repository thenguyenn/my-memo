import { createTokens, send, setRefreshCookie } from '../../lib/api-core.js';
import { loadUsersWithLock } from '../users/index.js';

const checkIsOwner = (email) =>
  String(email || '').trim().toLowerCase() === 'nguyenbathe2711@gmail.com';

/**
 * POST /api/auth/google
 * Body: { credential?: string, googleAccessToken?: string, userInfo?: object }
 * Xác thực tài khoản Google, kiểm tra email trong danh sách được cấp quyền (và chưa bị khóa),
 * cấp accessToken (1 ngày, lưu RAM) và refreshToken (1 tuần, lưu HttpOnly cookie).
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Method not allowed' });
  }

  try {
    const { credential, googleAccessToken, userInfo } = req.body || {};
    let googleUser = null;

    if (credential) {
      const verifyUrl = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
      const r = await fetch(verifyUrl);
      if (!r.ok) {
        return send(res, 400, { error: 'Token Google không hợp lệ hoặc đã hết hạn.' });
      }
      const info = await r.json();
      const expectedClientId = String(process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
      if (expectedClientId && info.aud && info.aud !== expectedClientId) {
        return send(res, 400, { error: 'Google Client ID không khớp cấu hình hệ thống.' });
      }
      googleUser = {
        sub: info.sub,
        email: info.email,
        name: info.name || info.email,
        picture: info.picture || '',
      };
    } else if (googleAccessToken) {
      let info = null;
      const r = await fetch(
        `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${encodeURIComponent(googleAccessToken)}`
      );
      if (r.ok) {
        info = await r.json();
      } else {
        const r2 = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(googleAccessToken)}`
        );
        if (r2.ok) info = await r2.json();
      }
      const email = info?.email || userInfo?.email;
      if (!info || !email) {
        return send(res, 400, { error: 'Access Token Google không hợp lệ hoặc đã hết hạn.' });
      }
      googleUser = {
        sub: info.sub || userInfo?.sub || email,
        email,
        name: info.name || userInfo?.name || email.split('@')[0],
        picture: info.picture || userInfo?.picture || '',
      };
    } else {
      return send(res, 400, { error: 'Thiếu thông tin xác thực từ Google.' });
    }

    const cleanEmail = String(googleUser.email || '').trim().toLowerCase();
    if (!checkIsOwner(cleanEmail)) {
      const list = await loadUsersWithLock();
      const found = list.find((u) => u.email.toLowerCase() === cleanEmail);
      if (!found) {
        return send(res, 403, {
          error: `Tài khoản ${googleUser.email} chưa được cấp quyền truy cập. Vui lòng liên hệ chủ trang web (nguyenbathe2711@gmail.com).`,
        });
      }
      if (found.locked) {
        return send(res, 403, {
          error: `Tài khoản ${googleUser.email} đã bị khóa quyền truy cập. Vui lòng liên hệ chủ trang web (nguyenbathe2711@gmail.com).`,
        });
      }
    }

    const { accessToken, refreshToken, user, expiresIn } = createTokens(googleUser);
    setRefreshCookie(res, refreshToken);

    return send(res, 200, {
      accessToken,
      expiresIn,
      user,
    });
  } catch (error) {
    console.error('auth/google error:', error.message);
    return send(res, 500, { error: 'Không thể đăng nhập bằng Google. Vui lòng thử lại.' });
  }
}
