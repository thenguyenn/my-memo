import { clearRefreshCookie, send } from '../../lib/api-core.js';

/**
 * POST /api/auth/logout
 * Xóa HttpOnly refreshToken cookie.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { error: 'Method not allowed' });
  }

  clearRefreshCookie(res);
  return send(res, 200, { success: true });
}
