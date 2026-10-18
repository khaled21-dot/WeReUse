import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Search, Tag } from 'lucide-react';
import Alert from '../components/Alert';
import { categoryApi } from '../api';
import { parseApiError } from '../api/client';

// What students see: only the categories an admin has left ACTIVE (the server filters them).
export default function Categories() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError('');
    try {
      const res = await categoryApi.listActive();
      if (requestId !== latestRequest.current) return;
      setCategories(res.data.data.categories);
    } catch (err) {
      if (requestId !== latestRequest.current) return;
      setError(parseApiError(err).message);
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // pick up new categories when the student comes back to this tab
  useEffect(() => {
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? categories.filter((c) => c.name.toLowerCase().includes(q)) : categories;
  }, [categories, query]);

  const firstLoad = loading && categories.length === 0 && !error;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold sm:text-4xl">Categories</h1>
        <p className="mt-1 max-w-prose text-ink-soft">
          Browse the kinds of items students trade on WeReUse. New categories appear here as soon as an admin adds them.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink-soft" aria-live="polite">
          {firstLoad ? 'Loading…' : `${visible.length} ${visible.length === 1 ? 'category' : 'categories'}`}
        </p>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative w-full sm:w-72">
            <label htmlFor="category-filter" className="sr-only">
              Search categories
            </label>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
            <input
              id="category-filter"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search categories"
              className="input pl-10"
            />
          </div>
          <button type="button" onClick={load} disabled={loading} className="btn btn-secondary !px-3 !py-2" aria-label="Refresh categories">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {error && (
        <Alert variant="error" className="mt-5">
          <div className="flex flex-wrap items-center gap-3">
            <span>{error}</span>
            <button type="button" onClick={load} className="font-semibold underline">
              Try again
            </button>
          </div>
        </Alert>
      )}

      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {firstLoad && [0, 1, 2, 3, 4, 5].map((i) => <li key={i} className="h-16 animate-pulse rounded-xl bg-paper" aria-hidden="true" />)}

        {visible.map((category) => (
          <li key={category.id} className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <Tag className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 break-words font-semibold">{category.name}</span>
          </li>
        ))}
      </ul>

      {!loading && !error && visible.length === 0 && (
        <p className="mt-8 text-center text-ink-soft">
          {categories.length === 0 ? 'No categories yet. Check back soon.' : `No categories match "${query.trim()}".`}
        </p>
      )}
    </div>
  );
}