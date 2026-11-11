import { useState, useCallback, useEffect } from 'react';
import { api } from '../services/api';

export function useCustomers() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(() => {
    const saved = localStorage.getItem('customer_page_limit');
    return saved ? parseInt(saved, 10) : 20;
  });
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await api.getCustomers({
        q: search,
        page: String(page),
        limit: String(limit),
      });
      setCustomers(result.data || []);
      setCount(result.count || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const changeLimit = useCallback((newLimit) => {
    setLimit(newLimit);
    setPage(1);
    localStorage.setItem('customer_page_limit', String(newLimit));
  }, []);

  const createCustomer = useCallback(async (data) => {
    await api.createCustomer(data);
    if (page !== 1) {
      setPage(1);
    } else {
      await loadCustomers();
    }
  }, [page, loadCustomers]);

  const updateCustomer = useCallback(async (id, data) => {
    await api.updateCustomer(id, data);
    await loadCustomers();
  }, [loadCustomers]);

  const deleteCustomer = useCallback(async (id) => {
    await api.deleteCustomer(id);
    await loadCustomers();
  }, [loadCustomers]);

  const totalPages = Math.max(1, Math.ceil(count / limit));

  return {
    customers,
    search,
    setSearch,
    page,
    setPage,
    limit,
    changeLimit,
    count,
    loading,
    error,
    totalPages,
    createCustomer,
    updateCustomer,
    deleteCustomer,
    reload: loadCustomers,
  };
}
