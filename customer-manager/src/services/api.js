const API_BASE = '/api/customers';

// Access token chỉ lưu trong bộ nhớ RAM (memory), tuyệt đối không lưu localStorage / sessionStorage.
// Refresh token được lưu trong HttpOnly cookie do server quản lý.
let memoryAccessToken = null;
let refreshPromise = null;

// Dọn dẹp các key cũ từng lưu ở localStorage trước đây (nếu có)
try {
  localStorage.removeItem('customer_manager_token');
  localStorage.removeItem('customer_manager_verified');
  localStorage.removeItem('customer_manager_verified_expiry');
} catch {
  // Bỏ qua nếu trình duyệt chặn storage
}

export function setAccessToken(token) {
  memoryAccessToken = token || null;
}

export function getAccessToken() {
  return memoryAccessToken;
}

export function clearAccessToken() {
  memoryAccessToken = null;
}

export const api = {
  async refreshSession() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) {
          clearAccessToken();
          return null;
        }
        const data = await res.json().catch(() => null);
        if (data?.accessToken) {
          setAccessToken(data.accessToken);
          return data;
        }
        clearAccessToken();
        return null;
      } catch {
        clearAccessToken();
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  },

  async loginWithGoogle(payload) {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Đăng nhập Google thất bại.');
    }
    if (data.accessToken) {
      setAccessToken(data.accessToken);
    }
    return data;
  },

  async logout() {
    clearAccessToken();
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Bỏ qua lỗi mạng khi đăng xuất
    }
  },

  async request(url, options = {}, retried = false) {
    const token = getAccessToken();
    const response = await fetch(url, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });

    // Tự động dùng refreshToken (HttpOnly cookie) để lấy accessToken mới nếu hết hạn
    if (response.status === 401 && !retried && !url.startsWith('/api/auth/')) {
      const refreshed = await this.refreshSession();
      if (refreshed?.accessToken) {
        return this.request(url, options, true);
      }
    }

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(result.error || 'Có lỗi xảy ra.');
      err.status = response.status;
      throw err;
    }
    return result;
  },

  async getCustomers(params) {
    const query = new URLSearchParams(params);
    return this.request(`${API_BASE}?${query}`);
  },

  async createCustomer(data) {
    return this.request(API_BASE, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateCustomer(id, data) {
    return this.request(`${API_BASE}/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteCustomer(id) {
    return this.request(`${API_BASE}/${id}`, {
      method: 'DELETE',
    });
  },

  async getUsers() {
    return this.request('/api/users');
  },

  async addUser(data) {
    return this.request('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async toggleLockUser(email, locked) {
    return this.request('/api/users', {
      method: 'PUT',
      body: JSON.stringify({ email, locked }),
    });
  },

  async deleteUser(email) {
    const query = new URLSearchParams({ email });
    return this.request(`/api/users?${query}`, {
      method: 'DELETE',
    });
  },
};
