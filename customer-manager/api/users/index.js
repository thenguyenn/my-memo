import {
  cleanText,
  db,
  getOwnerEmails,
  isOwnerEmail,
  requireOwner,
  saveAllowedUsers,
  send,
} from '../../lib/api-core.js';

const CONFIG_BUCKET = 'app-config';
const USERS_FILE = 'allowed-users.json';
const OWNER_EMAIL = 'nguyenbathe2711@gmail.com';

export function checkIsOwner(email) {
  if (!email) return false;
  return String(email).trim().toLowerCase() === OWNER_EMAIL;
}

export async function loadUsersWithLock() {
  const supabase = db();
  const owners = [OWNER_EMAIL];
  let list = [];
  try {
    const { data: blob, error } = await supabase.storage.from(CONFIG_BUCKET).download(USERS_FILE);
    if (!error && blob) {
      const txt = await blob.text();
      const parsed = JSON.parse(txt);
      if (Array.isArray(parsed)) list = parsed;
    }
  } catch {
    // Bỏ qua nếu chưa có file
  }

  const map = new Map();
  for (const ownerEmail of owners) {
    map.set(ownerEmail, {
      email: ownerEmail,
      name: 'Nguyễn Bá Thế (Chủ trang web)',
      role: 'owner',
      locked: false,
      created_at: '2026-11-16T00:00:00.000Z',
    });
  }
  for (const item of list) {
    const em = String(item?.email || '').trim().toLowerCase();
    if (!em || em === 'nguyenbathe@gmail.com') continue;
    const isOwner = owners.includes(em);
    map.set(em, {
      email: em,
      name: String(item.name || '').trim() || (isOwner ? 'Nguyễn Bá Thế' : em.split('@')[0]),
      role: isOwner ? 'owner' : 'member',
      locked: isOwner ? false : Boolean(item.locked),
      created_at: item.created_at || new Date().toISOString(),
    });
  }
  return Array.from(map.values());
}

/**
 * GET / POST / PUT / DELETE /api/users
 * Chỉ dành cho chủ trang web (nguyenbathe@gmail.com) để thêm, khóa/mở khóa, xóa Gmail.
 */
export default async function handler(req, res) {
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PUT, PATCH, DELETE');
    return send(res, 405, { error: 'Method not allowed' });
  }

  const owner = requireOwner(req, res);
  if (!owner) return;

  try {
    const currentList = await loadUsersWithLock();

    if (req.method === 'GET') {
      return send(res, 200, { data: currentList });
    }

    if (req.method === 'POST') {
      const email = cleanText(req.body?.email, 120).toLowerCase();
      const name = cleanText(req.body?.name, 120);

      if (!email || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) {
        return send(res, 400, { error: 'Vui lòng nhập địa chỉ Gmail hợp lệ.' });
      }

      if (currentList.some((u) => u.email.toLowerCase() === email)) {
        return send(res, 400, { error: `Email ${email} đã có trong danh sách được cấp quyền.` });
      }

      const newUser = {
        email,
        name: name || email.split('@')[0],
        role: checkIsOwner(email) ? 'owner' : 'member',
        locked: false,
        created_at: new Date().toISOString(),
      };

      const nextList = [...currentList, newUser];
      await saveAllowedUsers(nextList);
      return send(res, 201, { data: nextList, added: newUser });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const email = cleanText(req.body?.email, 120).toLowerCase();
      const locked = Boolean(req.body?.locked);

      if (!email) {
        return send(res, 400, { error: 'Thiếu địa chỉ email.' });
      }
      if (checkIsOwner(email)) {
        return send(res, 400, { error: 'Không thể khóa tài khoản chủ trang web.' });
      }

      const idx = currentList.findIndex((u) => u.email.toLowerCase() === email);
      if (idx === -1) {
        return send(res, 404, { error: 'Không tìm thấy người dùng này.' });
      }

      const nextList = currentList.map((u) =>
        u.email.toLowerCase() === email ? { ...u, locked } : u
      );
      await saveAllowedUsers(nextList);
      return send(res, 200, { data: nextList, updated: nextList[idx] });
    }

    if (req.method === 'DELETE') {
      const email = cleanText(req.query?.email || req.body?.email, 120).toLowerCase();
      if (!email) {
        return send(res, 400, { error: 'Thiếu email cần xóa.' });
      }
      if (checkIsOwner(email)) {
        return send(res, 400, { error: 'Không thể xóa tài khoản chủ trang web.' });
      }

      const nextList = currentList.filter((u) => u.email.toLowerCase() !== email);
      await saveAllowedUsers(nextList);
      return send(res, 200, { data: nextList });
    }
  } catch (error) {
    console.error('users API error:', error.message);
    return send(res, 500, { error: 'Không thể cập nhật danh sách người dùng.' });
  }
}
