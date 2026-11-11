const API_BASE = '/api/customers';

export const api = {
  async request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Có lỗi xảy ra.');
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
};
