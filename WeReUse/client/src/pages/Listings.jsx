import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Lock, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import Alert from '../components/Alert';
import ListingCard from '../components/ListingCard';
import { useAuth } from '../context/AuthContext';
import { categoryApi, listingApi } from '../api';
import { parseApiError } from '../api/client';
import { CONDITION_OPTIONS, MAX_PRICE, TYPE_OPTIONS } from '../utils/listings';

const PAGE_SIZE = 12;
const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
];

// Search, category, condition, type, price and sort all live in the address bar
// (/listings?category=...&condition=good,fair), so a filtered page can be shared and the Back button works.
export default function Listings() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const queryKey = params.toString();

  const [categories, setCategories] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const latestRequest = useRef(0);

  const [searchInput, setSearchInput] = useState(params.get('search') || '');
  const [minInput, setMinInput] = useState(params.get('minPrice') || '');
  const [maxInput, setMaxInput] = useState(params.get('maxPrice') || '');
  const [priceError, setPriceError] = useState('');

  const isStudent = user.role === 'student';
  const canPost = isStudent && user.verificationStatus === 'verified';
  const selectedConditions = (params.get('condition') || '').split(',').filter(Boolean);
  const activeFilters = ['search', 'category', 'condition', 'type', 'minPrice', 'maxPrice'].filter((k) => params.get(k)).length;

  const update = useCallback(
    (changes) => {
      const next = new URLSearchParams(queryKey);
      Object.entries(changes).forEach(([key, value]) => {
        if (value === '' || value == null) next.delete(key);
        else next.set(key, value);
      });
      if (!('page' in changes)) next.delete('page'); // any filter change starts again at page 1
      setParams(next, { replace: !('page' in changes) });
    },
    [queryKey, setParams]
  );

  // category list for the filter
  useEffect(() => {
    categoryApi
      .listActive()
      .then((res) => setCategories(res.data.data.categories))
      .catch(() => setCategories([]));
  }, []);

  // wait until the student stops typing before searching
  useEffect(() => {
    const timer = setTimeout(() => {
      const value = searchInput.trim();
      if ((params.get('search') || '') !== value) update({ search: value });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  // load the items whenever the address-bar filters change
  useEffect(() => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError('');
    const query = Object.fromEntries(new URLSearchParams(queryKey).entries());
    listingApi
      .list({ ...query, limit: PAGE_SIZE })
      .then((res) => {
        if (requestId === latestRequest.current) setData(res.data.data);
      })
      .catch((err) => {
        if (requestId === latestRequest.current) setError(parseApiError(err).message);
      })
      .finally(() => {
        if (requestId === latestRequest.current) setLoading(false);
      });
  }, [queryKey]);

  const toggleCondition = (value) => {
    const next = selectedConditions.includes(value)
      ? selectedConditions.filter((c) => c !== value)
      : [...selectedConditions, value];
    update({ condition: next.join(',') });
  };

  const applyPrice = (e) => {
    e.preventDefault();
    const min = minInput.trim();
    const max = maxInput.trim();
    if ((min && !/^\d+$/.test(min)) || (max && !/^\d+$/.test(max))) return setPriceError('Use whole numbers only');
    if ((min && Number(min) > MAX_PRICE) || (max && Number(max) > MAX_PRICE)) return setPriceError('That price is too high');
    if (min && max && Number(min) > Number(max)) return setPriceError('Maximum must be at least the minimum');
    setPriceError('');
    return update({ minPrice: min, maxPrice: max });
  };

  const clearAll = () => {
    setSearchInput('');
    setMinInput('');
    setMaxInput('');
    setPriceError('');
    setParams({}, { replace: true });
  };

  const listings = data?.listings || [];
  const pagination = data?.pagination;
  const firstLoad = loading && !data && !error;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Browse items</h1>
          <p className="mt-1 max-w-prose text-ink-soft">Things students are selling, swapping or giving away on campus.</p>
        </div>
        {canPost && (
          <Link to="/listings/new" className="btn btn-primary">
            <Plus className="h-5 w-5" aria-hidden="true" />
            Post an item
          </Link>
        )}
      </header>

      {isStudent && !canPost && (
        <Alert variant="info" className="mb-6">
          <span className="inline-flex items-center gap-2">
            <Lock className="h-4 w-4" aria-hidden="true" />
            Only verified students can post items.{' '}
            <Link to="/dashboard" className="font-semibold underline">
              Check your verification status
            </Link>
          </span>
        </Alert>
      )}

      <div className="mb-4 flex gap-2">
        <div className="relative flex-1">
          <label htmlFor="listing-search" className="sr-only">
            Search items
          </label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
          <input
            id="listing-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or description"
            className="input pl-10"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          aria-controls="listing-filters"
          className="btn btn-secondary lg:hidden"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filters{activeFilters ? ` (${activeFilters})` : ''}
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <aside id="listing-filters" aria-label="Filters" className={`${showFilters ? 'block' : 'hidden'} space-y-5 lg:block`}>
          <div className="rounded-xl border border-line bg-white p-4">
            <label htmlFor="filter-category" className="label">
              Category
            </label>
            <select id="filter-category" className="input" value={params.get('category') || ''} onChange={(e) => update({ category: e.target.value })}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <fieldset className="rounded-xl border border-line bg-white p-4">
            <legend className="label !mb-0 px-1">Condition</legend>
            <div className="mt-2 space-y-2">
              {CONDITION_OPTIONS.map((o) => (
                <label key={o.value} className="flex cursor-pointer items-center gap-2.5 text-[15px]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-line accent-blue-600"
                    checked={selectedConditions.includes(o.value)}
                    onChange={() => toggleCondition(o.value)}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="rounded-xl border border-line bg-white p-4">
            <label htmlFor="filter-type" className="label">
              Type
            </label>
            <select id="filter-type" className="input" value={params.get('type') || ''} onChange={(e) => update({ type: e.target.value })}>
              <option value="">Sell, exchange or donate</option>
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <form onSubmit={applyPrice} noValidate className="rounded-xl border border-line bg-white p-4">
            <p className="label">Price (৳)</p>
            <div className="flex items-center gap-2">
              <label htmlFor="filter-min" className="sr-only">
                Minimum price
              </label>
              <input id="filter-min" inputMode="numeric" placeholder="Min" className="input" value={minInput} onChange={(e) => setMinInput(e.target.value)} aria-invalid={priceError ? 'true' : 'false'} />
              <span aria-hidden="true">–</span>
              <label htmlFor="filter-max" className="sr-only">
                Maximum price
              </label>
              <input id="filter-max" inputMode="numeric" placeholder="Max" className="input" value={maxInput} onChange={(e) => setMaxInput(e.target.value)} aria-invalid={priceError ? 'true' : 'false'} />
            </div>
            {priceError && (
              <p role="alert" className="mt-1.5 text-[13px] font-medium text-coral-600">
                {priceError}
              </p>
            )}
            <p className="mt-1.5 text-[13px] text-ink-faint">Only items that have a price match.</p>
            <button type="submit" className="btn btn-secondary mt-3 w-full !py-2">
              Apply price
            </button>
          </form>

          {activeFilters > 0 && (
            <button type="button" onClick={clearAll} className="btn btn-ghost w-full">
              <X className="h-4 w-4" aria-hidden="true" />
              Clear all filters
            </button>
          )}
        </aside>

        <section aria-label="Items">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-ink-soft" aria-live="polite">
              {firstLoad ? 'Loading…' : pagination ? `${pagination.total} ${pagination.total === 1 ? 'item' : 'items'}` : ''}
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="listing-sort" className="text-sm text-ink-soft">
                Sort by
              </label>
              <select id="listing-sort" className="input !w-auto !py-2" value={params.get('sort') || 'newest'} onChange={(e) => update({ sort: e.target.value === 'newest' ? '' : e.target.value })}>
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <Alert variant="error" className="mb-4">
              <div className="flex flex-wrap items-center gap-3">
                <span>{error}</span>
                <button type="button" onClick={clearAll} className="font-semibold underline">
                  Clear filters
                </button>
              </div>
            </Alert>
          )}

          <ul className={`grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3 ${loading && !firstLoad ? 'opacity-60' : ''}`}>
            {firstLoad && [0, 1, 2, 3, 4, 5].map((i) => <li key={i} className="aspect-[4/5] animate-pulse rounded-xl bg-paper" aria-hidden="true" />)}
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </ul>

          {!loading && !error && listings.length === 0 && (
            <div className="rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center">
              <p className="text-lg font-semibold">{activeFilters ? 'No items match your filters' : 'No items have been posted yet'}</p>
              <p className="mt-1 text-ink-soft">{activeFilters ? 'Try a different search or remove a filter.' : 'Check back soon.'}</p>
              {activeFilters > 0 && (
                <button type="button" onClick={clearAll} className="btn btn-secondary mt-4">
                  Clear all filters
                </button>
              )}
            </div>
          )}

          {pagination && pagination.pages > 1 && (
            <nav className="mt-6 flex items-center justify-between" aria-label="Pages">
              <button type="button" className="btn btn-secondary" disabled={pagination.page <= 1} onClick={() => update({ page: String(pagination.page - 1) })}>
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                Previous
              </button>
              <p className="text-sm text-ink-soft">
                Page {pagination.page} of {pagination.pages}
              </p>
              <button type="button" className="btn btn-secondary" disabled={pagination.page >= pagination.pages} onClick={() => update({ page: String(pagination.page + 1) })}>
                Next
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </nav>
          )}
        </section>
      </div>
    </div>
  );
}