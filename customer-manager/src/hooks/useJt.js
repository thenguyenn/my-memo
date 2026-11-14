import { useState, useCallback, useEffect } from 'react';
import { api } from '../services/api';
import { useVerification } from './useVerification';

export function useJt() {
  const { clearVerification } = useVerification();
  const [minDays, setMinDays] = useState(2);
  const [view, setView] = useState('shippers'); // 'shippers' | 'parcels'
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [parcels, setParcels] = useState([]);
  const [count, setCount] = useState(0);
  const [parcelsLoading, setParcelsLoading] = useState(false);

  const fail = useCallback(
    (err) => {
      if (err.status === 401) clearVerification(); // phiên hết hạn
      setError(err.message);
    },
    [clearVerification]
  );

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    setError('');
    try {
      setSummary(await api.jtSummary({ minDays: String(minDays) }));
    } catch (err) {
      fail(err);
    } finally {
      setSummaryLoading(false);
    }
  }, [minDays, fail]);

  const loadParcels = useCallback(async () => {
    setParcelsLoading(true);
    setError('');
    try {
      const r = await api.jtParcels({ minDays: String(minDays), q: debouncedSearch, page: String(page), limit: String(limit) });
      setParcels(r.data || []);
      setCount(r.count || 0);
    } catch (err) {
      fail(err);
    } finally {
      setParcelsLoading(false);
    }
  }, [minDays, debouncedSearch, page, limit, fail]);

  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { if (view === 'parcels') loadParcels(); }, [view, loadParcels]);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const changeMinDays = useCallback((n) => { setMinDays(n); setPage(1); }, []);
  const changeLimit = useCallback((n) => { setLimit(n); setPage(1); }, []);
  const reload = useCallback(async () => {
    await loadSummary();
    if (view === 'parcels') await loadParcels();
  }, [loadSummary, loadParcels, view]);

  return {
    minDays, changeMinDays, view, setView,
    summary, summaryLoading, error,
    search, setSearch, page, setPage, limit, changeLimit,
    parcels, count, parcelsLoading,
    totalPages: Math.max(1, Math.ceil(count / limit)),
    reload,
  };
}
