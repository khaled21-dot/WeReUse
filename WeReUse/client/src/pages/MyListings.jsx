import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImageOff, Loader2, Pencil, Plus } from 'lucide-react';
import Alert from '../components/Alert';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { listingApi } from '../api';
import { parseApiError } from '../api/client';
import { formatDate } from '../utils/format';
import { CONDITION_LABELS, TYPE_BADGE, TYPE_LABELS, imageUrl, priceLabel } from '../utils/listings';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available' },
  { key: 'closed', label: 'No longer available' },
];

export default function MyListings() {
  const { user } = useAuth();
  const toast = useToast();
  const canPost = user.verificationStatus === 'verified';

  const [status, setStatus] = useState('all');
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError('');
    try {
      const res = await listingApi.mine({ status });
      if (requestId === latestRequest.current) setListings(res.data.data.listings);
    } catch (err) {
      if (requestId === latestRequest.current) setError(parseApiError(err).message);
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (listing) => {
    setBusyId(listing.id);
    try {
      const res = await listingApi.setStatus(listing.id, listing.status === 'available' ? 'closed' : 'available');
      toast.success(res.data.message);
      await load();
    } catch (err) {
      toast.error(parseApiError(err).message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (listing) => {
    setBusyId(listing.id);
    try {
      await listingApi.remove(listing.id);
      toast.success('Your item was deleted.');
      setToDelete(null);
      await load();
    } catch (err) {
      toast.error(parseApiError(err).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">My listings</h1>
          <p className="mt-1 text-ink-soft">The items you posted. Close one when it is sold, swapped or given away.</p>
        </div>
        {canPost && (
          <Link to="/listings/new" className="btn btn-primary">
            <Plus className="h-5 w-5" aria-hidden="true" />
            Post an item
          </Link>
        )}
      </header>

      <div role="tablist" aria-label="Filter my listings" className="inline-flex overflow-hidden rounded-lg border border-line bg-white">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={status === tab.key}
            onClick={() => setStatus(tab.key)}
            className={`px-4 py-2 text-sm font-semibold transition-colors ${status === tab.key ? 'bg-blue-50 text-blue-700' : 'text-ink-soft hover:bg-paper'}`}
          >
            {tab.label}
          </button>
        ))}
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

      <ul className={`mt-5 divide-y divide-line overflow-hidden rounded-xl border border-line bg-white ${loading && listings.length ? 'opacity-60' : ''}`}>
        {loading && listings.length === 0 && [0, 1, 2].map((i) => <li key={i} className="h-24 animate-pulse bg-paper" aria-hidden="true" />)}

        {listings.map((l) => (
          <li key={l.id} className="p-4">
            <div className="flex gap-4">
              <Link to={`/listings/${l.id}`} className="h-20 w-24 shrink-0 overflow-hidden rounded-lg border border-line bg-paper" aria-hidden="true" tabIndex={-1}>
                {l.images[0] ? (
                  <img src={imageUrl(l.images[0])} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center text-ink-faint">
                    <ImageOff className="h-6 w-6" />
                  </span>
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TYPE_BADGE[l.listingType]}`}>{TYPE_LABELS[l.listingType]}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${l.status === 'available' ? 'bg-green-100 text-green-800' : 'bg-paper text-ink-soft'}`}>
                    {l.status === 'available' ? 'Available' : 'No longer available'}
                  </span>
                  {l.category && !l.category.isActive && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Category disabled</span>}
                </div>
                <Link to={`/listings/${l.id}`} className="mt-1 block break-words font-semibold hover:text-blue-700">
                  {l.title}
                </Link>
                <p className="text-sm text-ink-soft">
                  {priceLabel(l)} · {CONDITION_LABELS[l.condition]} · {l.category?.name || 'Uncategorised'}
                </p>
                <p className="text-[13px] text-ink-faint">Posted {formatDate(l.createdAt)}</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 sm:pl-28">
              <Link to={`/listings/${l.id}/edit`} className="btn btn-secondary !px-3 !py-1.5 text-sm">
                <Pencil className="h-4 w-4" aria-hidden="true" />
                Edit
              </Link>
              <button type="button" onClick={() => toggle(l)} disabled={busyId === l.id} className="btn btn-secondary !px-3 !py-1.5 text-sm">
                {busyId === l.id && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {l.status === 'available' ? 'Mark as no longer available' : 'Make available again'}
              </button>
              {toDelete === l.id ? (
                <span className="inline-flex items-center gap-2" role="alertdialog" aria-label={`Confirm deleting ${l.title}`}>
                  <button type="button" onClick={() => remove(l)} disabled={busyId === l.id} className="btn btn-danger !px-3 !py-1.5 text-sm">
                    Yes, delete
                  </button>
                  <button type="button" onClick={() => setToDelete(null)} className="btn btn-ghost !px-3 !py-1.5 text-sm">
                    Keep it
                  </button>
                </span>
              ) : (
                <button type="button" onClick={() => setToDelete(l.id)} className="btn btn-ghost !px-3 !py-1.5 text-sm !text-coral-600">
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {!loading && !error && listings.length === 0 && (
        <div className="mt-5 rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center">
          <p className="text-lg font-semibold">{status === 'all' ? "You haven't posted anything yet" : 'Nothing here'}</p>
          {canPost && status === 'all' && (
            <Link to="/listings/new" className="btn btn-primary mt-4">
              Post your first item
            </Link>
          )}
        </div>
      )}
    </div>
  );
}