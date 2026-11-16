import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../services/api';
import { useConfirm } from '../hooks/useConfirm';
import { ConfirmDialog } from '../components/ConfirmDialog';

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const { dialogState, confirm } = useConfirm();

  const showNotice = useCallback((msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getUsers();
      setUsers(res.data || []);
    } catch (err) {
      showNotice('Lỗi: ' + (err.message || 'Không tải được danh sách người dùng.'));
    } finally {
      setLoading(false);
    }
  }, [showNotice]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleAdd = async (e) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) return;

    setSaving(true);
    try {
      const res = await api.addUser({ email: cleanEmail, name: name.trim() });
      setUsers(res.data || []);
      setEmail('');
      setName('');
      showNotice(`Đã cấp quyền truy cập cho ${cleanEmail}`);
    } catch (err) {
      showNotice('Lỗi: ' + (err.message || 'Không thể thêm người dùng.'));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleLock = async (targetUser) => {
    if (targetUser.role === 'owner') return;
    const nextLocked = !targetUser.locked;
    const ok = await confirm({
      title: nextLocked ? 'Xác nhận khóa tài khoản' : 'Xác nhận mở khóa tài khoản',
      message: nextLocked
        ? `Khóa tài khoản "${targetUser.email}"? Người dùng này sẽ không thể đăng nhập và truy cập các chức năng của trang web.`
        : `Mở khóa để cho phép "${targetUser.email}" truy cập lại trang web?`,
      confirmText: nextLocked ? 'Khóa tài khoản' : 'Mở khóa',
      cancelText: 'Hủy',
      type: nextLocked ? 'warning' : 'confirm',
    });
    if (!ok) return;

    try {
      const res = await api.toggleLockUser(targetUser.email, nextLocked);
      setUsers(res.data || []);
      showNotice(
        nextLocked
          ? `Đã khóa tài khoản ${targetUser.email}`
          : `Đã mở khóa tài khoản ${targetUser.email}`
      );
    } catch (err) {
      showNotice('Lỗi: ' + (err.message || 'Không thể cập nhật trạng thái tài khoản.'));
    }
  };

  const handleDelete = async (targetUser) => {
    if (targetUser.role === 'owner') return;
    const ok = await confirm({
      title: 'Xác nhận xóa người dùng',
      message: `Bạn có chắc muốn xóa hẳn tài khoản "${targetUser.email}" khỏi danh sách?`,
      confirmText: 'Xóa',
      cancelText: 'Hủy',
      type: 'warning',
    });
    if (!ok) return;

    try {
      const res = await api.deleteUser(targetUser.email);
      setUsers(res.data || []);
      showNotice(`Đã xóa tài khoản ${targetUser.email}`);
    } catch (err) {
      showNotice('Lỗi: ' + (err.message || 'Không thể xóa người dùng.'));
    }
  };

  const kw = search.trim().toLowerCase();
  const filtered = kw
    ? users.filter(
        (u) =>
          u.email.toLowerCase().includes(kw) ||
          (u.name || '').toLowerCase().includes(kw)
      )
    : users;

  return (
    <main className="app-shell">
      <section className="page-heading">
        <div>
          <p className="eyebrow">QUẢN TRỊ HỆ THỐNG</p>
        </div>
      </section>

      {notice && (
        <div className={`notice ${notice.startsWith('Lỗi') ? 'error' : 'success'}`}>
          {notice}
        </div>
      )}

      {/* Form thêm mới người dùng */}
      <form className="panel form-panel" onSubmit={handleAdd}>
        <div className="panel-title">
          <h2>Thêm mới người dùng (Gmail)</h2>
        </div>

        <div className="form-grid">
          <label>
            Địa chỉ Gmail hợp lệ *
            <input
              type="email"
              required
              maxLength="120"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tennguoidung@gmail.com"
            />
          </label>

          <label>
            Tên người dùng (tùy chọn)
            <input
              type="text"
              maxLength="120"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nguyễn Văn A"
            />
          </label>
        </div>

        <div className="form-actions">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'Đang thêm…' : 'Thêm người dùng'}
          </button>
        </div>
      </form>

      {/* Danh sách người dùng được phép */}
      <section className="panel table-panel">
        <div className="table-toolbar">
          <div>
            <h2>Danh sách Gmail được cấp quyền ({filtered.length})</h2>
            <p className="muted">Tài khoản bị khóa sẽ không thể đăng nhập và sử dụng chức năng</p>
          </div>
          <div className="search">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm theo Gmail hoặc tên…"
            />
          </div>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ width: '30%' }}>ĐỊA CHỈ GMAIL</th>
                <th style={{ width: '20%' }}>TÊN NGƯỜI DÙNG</th>
                <th style={{ width: '13%' }}>VAI TRÒ</th>
                <th style={{ width: '13%' }}>TRẠNG THÁI</th>
                <th style={{ width: '10%' }}>NGÀY THÊM</th>
                <th style={{ width: '14%', textAlign: 'center' }}>THAO TÁC</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="empty">Đang tải danh sách người dùng…</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">Không tìm thấy tài khoản nào khớp từ khóa.</td>
                </tr>
              ) : (
                filtered.map((u, idx) => (
                  <tr key={u.email} className="customer-row">
                    <td className="td-name">
                      <div className="customer-info">
                        <span className="customer-number">{idx + 1}</span>
                        <strong>{u.email}</strong>
                      </div>
                    </td>
                    <td>{u.name || '—'}</td>
                    <td>
                      {u.role === 'owner' ? (
                        <span className="sd-badge sd-badge-green">Chủ trang web</span>
                      ) : (
                        <span className="sd-badge sd-badge-blue">Người dùng</span>
                      )}
                    </td>
                    <td>
                      {u.locked ? (
                        <span className="sd-badge sd-badge-red">Đã khóa</span>
                      ) : (
                        <span className="sd-badge sd-badge-teal">Hoạt động</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(u.created_at)}</td>
                    <td className="td-actions">
                      {u.role === 'owner' ? (
                        <span className="muted" style={{ fontSize: 12 }}>Mặc định</span>
                      ) : (
                        <div className="row-actions">
                          <button
                            type="button"
                            className="edit"
                            onClick={() => handleToggleLock(u)}
                          >
                            {u.locked ? 'Mở khóa' : 'Khóa'}
                          </button>
                          <button
                            type="button"
                            className="delete"
                            onClick={() => handleDelete(u)}
                          >
                            Xóa
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <ConfirmDialog {...dialogState} />
    </main>
  );
}
