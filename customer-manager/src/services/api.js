const API_BASE = '/api/customers';
export const TOKEN_KEY = 'customer_manager_token';

export const api = {
  async request(url, options = {}) {
    const token = localStorage.getItem(TOKEN_KEY);
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(result.error || 'Có lỗi xảy ra.');
      err.status = response.status;
      throw err;
    }
    return result;
  },

  // ---- Xác minh (kiểm tra mã ở server) ----
  async verify(code) {
    return this.request('/api/verify', { method: 'POST', body: JSON.stringify({ code }) });
  },

  // ---- Soát hàng J&T ----
  async jtSummary(params) {
    return this.request(`/api/jt/summary?${new URLSearchParams(params)}`);
  },

  async jtParcels(params) {
    return this.request(`/api/jt/parcels?${new URLSearchParams(params)}`);
  },

  async jtImport(rows, snapshot) {
    return this.request('/api/jt/import', { method: 'POST', body: JSON.stringify({ rows, snapshot }) });
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
};
