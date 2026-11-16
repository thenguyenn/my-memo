import {
  clearRefreshCookie,
  createTokens,
  getRefreshTokenFromReq,
  send,
  setRefreshCookie,
  verifyRefreshToken,
} from '../../lib/api-core.js';
import { loadUsersWithLock } from '../users/index.js';

const checkIsOwner = (email) =>
  String(email || '').trim().toLowerCase() === 'nguyenbathe2711@gmail.com';

/**
 * POST /api/auth/refresh
 * Đọc refreshToken từ HttpOnly cookie, kiểm tra tài khoản còn quyền và chưa bị khóa, cấp lại accessToken mới.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Method not allowed' });
  }

  try {
    const googleClientId = String(process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
    const token = getRefreshTokenFromReq(req);
    if (!token) {
      return send(res, 200, { authenticated: false, accessToken: null, user: null, googleClientId });
    }

    const payload = verifyRefreshToken(token);
    if (!payload) {
      clearRefreshCookie(res);
      return send(res, 200, { authenticated: false, accessToken: null, user: null, googleClientId });
    }

    const cleanEmail = String(payload.email || '').trim().toLowerCase();
    if (!checkIsOwner(cleanEmail)) {
      const list = await loadUsersWithLock();
      const found = list.find((u) => u.email.toLowerCase() === cleanEmail);
      if (!found || found.locked) {
        clearRefreshCookie(res);
        return send(res, 200, { authenticated: false, accessToken: null, user: null, googleClientId });
      }
    }

    const { accessToken, refreshToken, user, expiresIn } = createTokens(payload);
    setRefreshCookie(res, refreshToken);

    return send(res, 200, {
      authenticated: true,
      accessToken,
      expiresIn,
      user,
      googleClientId,
    });
  } catch (error) {
    console.error('auth/refresh error:', error.message);
    return send(res, 500, { error: 'Không thể làm mới phiên đăng nhập.' });
  }
}
