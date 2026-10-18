import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import Alert from '../components/Alert';
import { useToast } from '../context/ToastContext';
import { categoryApi } from '../api';
import { parseApiError } from '../api/client';
import { formatDate } from '../utils/format';

// Same rule as the server (server/src/utils/validators.js). The server always checks again.
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N}\s&,.'()/+-]*$/u;
const tidy = (value) => value.trim().replace(/\s+/g, ' ');

function validateCategoryName(value) {
  const v = tidy(value);
  if (!v) return 'Category name is required';
  if (v.length < 2) return 'Category name must be at least 2 characters';
  if (v.length > 50) return 'Category name is too long (50 characters maximum)';
  if (!NAME_RE.test(v)) return "Use letters, numbers, spaces and & , . ' ( ) / + - only";
  return '';
}

const TABS = [
  { key: 'all', label: 'All', count: 'total' },
  { key: 'active', label: 'Active', count: 'active' },
  { key: 'disabled', label: 'Disabled', count: 'disabled' },
];

export default function AdminCategories() {
  const toast = useToast();

  // list
  const [status, setStatus] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState([]);
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const latestRequest = useRef(0);

  // add form
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);

  // row actions
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [toDelete, setToDelete] = useState(null);

  // wait until the admin stops typing before searching
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError('');
    try {
      const res = await categoryApi.list({ status, search });
      if (requestId !== latestRequest.current) return; // a newer request replaced this one
      setCategories(res.data.data.categories);
      setCounts(res.data.data.counts);
    } catch (err) {
      if (requestId !== latestRequest.current) return;
      setError(parseApiError(err).message);
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    load();
  }, [load]);

  // ---- CREATE ----
  const addCategory = async (e) => {
    e.preventDefault();
    if (adding) return;
    const message = validateCategoryName(newName);
    if (message) {
      setAddError(message);
      return;
    }
    setAdding(true);
    try {
      await categoryApi.create({ name: newName });
      toast.success(`Category "${tidy(newName)}" was added.`);
      setNewName('');
      setAddError('');
      load();
    } catch (err) {
      const parsed = parseApiError(err);
      setAddError(parsed.fieldErrors.name || parsed.message);
    } finally {
      setAdding(false);
    }
  };

  // ---- UPDATE: rename ----
  const startEdit = (category) => {
    setEditingId(category.id);
    setEditName(category.name);
    setEditError('');
  };

  const saveEdit = async (category) => {
    const message = validateCategoryName(editName);
    if (message) {
      setEditError(message);
      return;
    }
    if (tidy(editName) === category.name) {
      setEditingId(null); // nothing changed
      return;
    }
    setBusyId(category.id);
    try {
      await categoryApi.update(category.id, { name: editName });
      toast.success('Category renamed.');
      setEditingId(null);
      load();
    } catch (err) {
      const parsed = parseApiError(err);
      setEditError(parsed.fieldErrors.name || parsed.message);
      if (parsed.status === 404) {
        setEditingId(null);
        load();
      }
    } finally {
      setBusyId(null);
    }
  };

  // ---- UPDATE: enable / disable ----
  const toggleActive = async (category) => {
    setBusyId(category.id);
    try {
      await categoryApi.update(category.id, { isActive: !category.isActive });
      toast.success(category.isActive ? `"${category.name}" is now disabled.` : `"${category.name}" is now active.`);
      load();
    } catch (err) {
      const parsed = parseApiError(err);
      toast.error(parsed.message);
      if (parsed.status === 404) load();
    } finally {
      setBusyId(null);
    }
  };

  // ---- DELETE ----
  const confirmDelete = async () => {
    const category = toDelete;
    setBusyId(category.id);
    try {
      await categoryApi.remove(category.id);
      toast.success(`Category "${category.name}" was deleted.`);
      setToDelete(null);
      load();
    } catch (err) {
      const parsed = parseApiError(err);
      toast.error(parsed.message);
      setToDelete(null);
      if (parsed.status === 404) load();
    } finally {
      setBusyId(null);
    }
  };

  const firstLoad = loading && categories.length === 0 && !error;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold sm:text-4xl">Categories</h1>
        <p className="mt-1 max-w-prose text-ink-soft">
          The categories students pick when they list an item. Disable a category to hide it without deleting it.
        </p>
      </header>

      {/* CREATE */}
      <form onSubmit={addCategory} noValidate className="rounded-xl border border-line bg-white p-4 sm:p-5">
        <label htmlFor="new-category" className="label">
          Add a category
        </label>
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            id="new-category"
            type="text"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              if (addError) setAddError('');
            }}
            maxLength={60}
            placeholder="For example: Lab Equipment"
            className="input flex-1"
            aria-invalid={addError ? 'true' : 'false'}
            aria-describedby={addError ? 'new-category-error' : undefined}
            autoComplete="off"
          />
          <button type="submit" disabled={adding} className="btn btn-primary">
            {adding ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Plus className="h-5 w-5" aria-hidden="true" />}
            Add category
          </button>
        </div>
        {addError && (
          <p id="new-category-error" className="mt-1.5 text-[13px] font-medium text-coral-600">
            {addError}
          </p>
        )}
      </form>

      {/* filter tabs + search */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Filter categories" className="flex overflow-hidden rounded-lg border border-line bg-white">
          {TABS.map((tab) => {
            const active = status === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setStatus(tab.key)}
                className={`px-4 py-2 text-sm font-semibold transition-colors ${active ? 'bg-blue-50 text-blue-700' : 'text-ink-soft hover:bg-paper'}`}
              >
                {tab.label} {counts ? <span className="tabular-nums">({counts[tab.count]})</span> : null}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-72">
          <label htmlFor="category-search" className="sr-only">
            Search categories
          </label>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
          <input
            id="category-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search categories"
            className="input pl-10"
            autoComplete="off"
          />
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

      {/* READ */}
      <ul className={`mt-5 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white ${loading && !firstLoad ? 'opacity-60' : ''}`}>
        {firstLoad && [0, 1, 2].map((i) => <li key={i} className="h-16 animate-pulse bg-paper" aria-hidden="true" />)}

        {categories.map((category) =>
          editingId === category.id ? (
            <li key={category.id} className="px-4 py-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <div className="flex-1">
                  <label htmlFor={`edit-${category.id}`} className="sr-only">
                    Category name
                  </label>
                  <input
                    id={`edit-${category.id}`}
                    type="text"
                    value={editName}
                    onChange={(e) => {
                      setEditName(e.target.value);
                      if (editError) setEditError('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit(category);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    maxLength={60}
                    className="input"
                    aria-invalid={editError ? 'true' : 'false'}
                    autoFocus
                    autoComplete="off"
                  />
                  {editError && <p className="mt-1.5 text-[13px] font-medium text-coral-600">{editError}</p>}
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => saveEdit(category)} disabled={busyId === category.id} className="btn btn-primary !px-3 !py-2">
                    {busyId === category.id ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                    Save
                  </button>
                  <button type="button" onClick={() => setEditingId(null)} className="btn btn-secondary !px-3 !py-2">
                    <X className="h-4 w-4" aria-hidden="true" />
                    Cancel
                  </button>
                </div>
              </div>
            </li>
          ) : (
            <li key={category.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="break-words font-semibold">{category.name}</p>
                <p className="text-[13px] text-ink-faint">Added {formatDate(category.createdAt)}</p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[13px] font-semibold ${
                  category.isActive ? 'bg-green-100 text-green-800' : 'border border-line bg-paper text-ink-soft'
                }`}
              >
                {category.isActive ? 'Active' : 'Disabled'}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(category)}
                  disabled={busyId === category.id}
                  className="btn btn-secondary !px-3 !py-1.5 text-sm"
                  aria-label={`Rename ${category.name}`}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Rename
                </button>
                <button
                  type="button"
                  onClick={() => toggleActive(category)}
                  disabled={busyId === category.id}
                  className="btn btn-secondary !px-3 !py-1.5 text-sm"
                  aria-label={`${category.isActive ? 'Disable' : 'Enable'} ${category.name}`}
                >
                  {category.isActive ? 'Disable' : 'Enable'}
                </button>
                <button
                  type="button"
                  onClick={() => setToDelete(category)}
                  disabled={busyId === category.id}
                  className="btn btn-secondary !px-3 !py-1.5 text-sm text-coral-600 hover:!bg-coral-50"
                  aria-label={`Delete ${category.name}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Delete
                </button>
              </div>
            </li>
          )
        )}
      </ul>

      {!loading && !error && categories.length === 0 && (
        <div className="mt-5 rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center">
          <p className="font-display text-xl font-bold">{search || status !== 'all' ? 'No categories match' : 'No categories yet'}</p>
          <p className="mt-1 text-ink-soft">
            {search || status !== 'all' ? 'Try a different search or filter.' : 'Add the first one with the form above.'}
          </p>
        </div>
      )}

      {toDelete && <ConfirmDelete category={toDelete} busy={busyId === toDelete.id} onCancel={() => setToDelete(null)} onConfirm={confirmDelete} />}
    </div>
  );
}

function ConfirmDelete({ category, busy, onCancel, onConfirm }) {
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && cancelRef.current();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-title">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        <h2 id="delete-title" className="text-xl font-bold">
          Delete "{category.name}"?
        </h2>
        <p className="mt-2 text-ink-soft">
          This cannot be undone. If you only want to hide it from students, use <strong>Disable</strong> instead.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={busy} className="btn btn-secondary">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className="btn btn-danger" autoFocus>
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Delete category
          </button>
        </div>
      </div>
    </div>
  );
}