import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, EyeOff, Flag, ImageOff, Loader2, MessageCircle, Pencil, Star, Trash2, UserRound } from 'lucide-react';
import Alert from '../components/Alert';
import Spinner from '../components/Spinner';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { chatApi, listingApi, ratingApi } from '../api';
import { parseApiError } from '../api/client';
import { formatDate, timeAgo } from '../utils/format';
import { CONDITION_LABELS, TYPE_BADGE, TYPE_LABELS, formatUsed, imageUrl, priceLabel } from '../utils/listings';
import Avatar from '../components/chat/Avatar';
import ReportUserDialog from '../components/ReportUserDialog';

// Under the seller card: open their profile (to rate them) or report them straight away
function SellerActions({ seller, isMine }) {
  const { user } = useAuth();
  const toast = useToast();
  const [reporting, setReporting] = useState(false);
  const student = user.role === 'student';
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      <Link to={`/users/${seller.id}`} className="btn btn-secondary !py-1.5 text-sm">
        {student && !isMine ? <Star className="h-4 w-4" aria-hidden="true" /> : <UserRound className="h-4 w-4" aria-hidden="true" />}
        {student && !isMine ? 'View profile & rate' : 'View profile'}
      </Link>
      {student && !isMine && (
        <button type="button" onClick={() => setReporting(true)} className="btn btn-ghost !py-1.5 text-sm !text-coral-600">
          <Flag className="h-4 w-4" aria-hidden="true" />
          Report seller
        </button>
      )}
      {reporting && (
        <ReportUserDialog
          person={seller}
          onClose={() => setReporting(false)}
          onSent={(message) => {
            setReporting(false);
            toast.success(message);
          }}
        />
      )}
    </div>
  );
}
import { Stars } from '../components/StarRating';

// The seller's latest reviews (from students who rated them on their profile)
function SellerReviews({ sellerId }) {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    ratingApi
      .forSeller(sellerId)
      .then((res) => active && setData(res.data.data))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [sellerId]);

  if (!data || data.ratings.length === 0) return null;
  const shown = open ? data.ratings : data.ratings.slice(0, 2);
  return (
    <div className="mt-3 border-t border-line pt-3">
      <ul className="space-y-2.5">
        {shown.map((r) => (
          <li key={r.id} className="text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Stars value={r.stars} showValue={false} size="xs" />
              {r.buyer.id ? (
                <Link to={`/users/${r.buyer.id}`} className="font-semibold hover:text-blue-700">
                  {r.buyer.name}
                </Link>
              ) : (
                <span className="font-semibold">{r.buyer.name}</span>
              )}
              <span className="text-ink-faint">· {timeAgo(r.createdAt)}</span>
            </div>
            {r.comment && <p className="mt-0.5 break-words text-ink-soft">{r.comment}</p>}
          </li>
        ))}
      </ul>
      {data.ratings.length > 2 && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mt-2 text-sm font-semibold text-blue-700 hover:underline">
          {open ? 'Show fewer reviews' : `Show all ${data.ratings.length} reviews`}
        </button>
      )}
    </div>
  );
}

// "Message seller": opens (or reopens) the chat about this item
function ContactSeller({ listing }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  if (user.role !== 'student') return null; // admins only look
  if (user.verificationStatus !== 'verified') {
    return (
      <p className="mt-5 inline-flex items-center gap-2 rounded-lg bg-paper px-3.5 py-2.5 text-sm text-ink-soft">
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        Only verified students can message sellers.
      </p>
    );
  }
  if (listing.status !== 'available') return null;

  const start = async () => {
    setBusy(true);
    try {
      const res = await chatApi.start(listing.id);
      navigate(`/messages/${res.data.data.conversation.id}`);
    } catch (err) {
      toast.error(parseApiError(err).message);
      setBusy(false);
    }
  };

  const donate = listing.listingType === 'donate';
  const forSale = listing.listingType === 'sell';
  return (
    <div className="mt-5">
      <button type="button" onClick={start} disabled={busy} className="btn btn-primary w-full sm:w-auto">
        {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <MessageCircle className="h-5 w-5" aria-hidden="true" />}
        {donate ? 'Ask for this item' : 'Message seller'}
      </button>
      <p className="mt-2 text-[13px] text-ink-faint">
        {forSale
          ? 'Ask a question or make a price offer, then arrange the handover in the chat.'
          : donate
            ? 'Send a message to ask for it.'
            : 'Ask a question or propose an exchange.'}
      </p>
    </div>
  );
}

export default function ListingDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const latestRequest = useRef(0);

  const [listing, setListing] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | missing | error
  const [message, setMessage] = useState('');
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setState('loading');
    try {
      const res = await listingApi.get(id);
      if (requestId !== latestRequest.current) return;
      setListing(res.data.data.listing);
      setActive(0);
      setState('ready');
    } catch (err) {
      if (requestId !== latestRequest.current) return;
      const parsed = parseApiError(err);
      setMessage(parsed.message);
      setState(parsed.status === 404 ? 'missing' : 'error');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleStatus = async () => {
    setBusy(true);
    try {
      const next = listing.status === 'available' ? 'closed' : 'available';
      const res = await listingApi.setStatus(listing.id, next);
      setListing(res.data.data.listing);
      toast.success(res.data.message);
    } catch (err) {
      toast.error(parseApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await listingApi.remove(listing.id);
      toast.success('Your item was deleted.');
      navigate('/listings/mine', { replace: true });
    } catch (err) {
      toast.error(parseApiError(err).message);
      setBusy(false);
    }
  };

  if (state === 'loading') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-blue-600" label="Loading item" />
      </div>
    );
  }

  if (state !== 'ready') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <h1 className="text-2xl font-bold">{state === 'missing' ? 'This item is not available' : 'Something went wrong'}</h1>
        <p className="mt-2 text-ink-soft">
          {state === 'missing' ? 'It may have been sold, given away or removed by the seller.' : message}
        </p>
        <div className="mt-5 flex justify-center gap-3">
          <Link to="/listings" className="btn btn-primary">
            Browse items
          </Link>
          {state === 'error' && (
            <button type="button" onClick={load} className="btn btn-secondary">
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  const closed = listing.status === 'closed';
  const categoryDisabled = listing.category && !listing.category.isActive;
  const photos = listing.images;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <Link to="/listings" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to browse
      </Link>

      {(closed || categoryDisabled) && (
        <Alert variant="warning" className="mt-4">
          <span className="inline-flex items-center gap-2">
            <EyeOff className="h-4 w-4" aria-hidden="true" />
            {closed ? 'This item is marked as no longer available, so other students cannot see it.' : 'Its category has been disabled, so other students cannot see it.'}
          </span>
        </Alert>
      )}

      <div className="mt-5 grid gap-8 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* photos */}
        <div>
          <div className="aspect-[4/3] overflow-hidden rounded-xl border border-line bg-paper">
            {photos[active] ? (
              <img src={imageUrl(photos[active])} alt={`${listing.title}, photo ${active + 1} of ${photos.length}`} className="h-full w-full object-contain" />
            ) : (
              <div className="flex h-full items-center justify-center text-ink-faint">
                <ImageOff className="h-10 w-10" aria-hidden="true" />
              </div>
            )}
          </div>
          {photos.length > 1 && (
            <ul className="mt-3 grid grid-cols-5 gap-2">
              {photos.map((file, i) => (
                <li key={file}>
                  <button
                    type="button"
                    onClick={() => setActive(i)}
                    aria-label={`Show photo ${i + 1}`}
                    aria-current={i === active ? 'true' : undefined}
                    className={`block aspect-square w-full overflow-hidden rounded-lg border-2 ${i === active ? 'border-blue-500' : 'border-transparent hover:border-blue-200'}`}
                  >
                    <img src={imageUrl(file)} alt="" loading="lazy" className="h-full w-full object-cover" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* details */}
        <div className="min-w-0">
          <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${TYPE_BADGE[listing.listingType]}`}>{TYPE_LABELS[listing.listingType]}</span>
          <h1 className="mt-2 break-words text-3xl font-bold">{listing.title}</h1>
          <p className="mt-2 text-3xl font-bold text-blue-800">{priceLabel(listing)}</p>
          <p className="mt-1 text-sm text-ink-faint">Posted {timeAgo(listing.createdAt)}</p>

          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border border-line bg-white p-4">
            <div>
              <dt className="text-[13px] text-ink-faint">Category</dt>
              <dd className="font-semibold">{listing.category?.name || '-'}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-ink-faint">Condition</dt>
              <dd className="font-semibold">{CONDITION_LABELS[listing.condition]}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[13px] text-ink-faint">Time used</dt>
              <dd className="font-semibold">{formatUsed(listing.usedFor)}</dd>
            </div>
            {listing.listingType === 'exchange' && (
              <div className="col-span-2">
                <dt className="text-[13px] text-ink-faint">Wants in return</dt>
                <dd className="break-words font-semibold">{listing.exchangeFor || 'Open to offers'}</dd>
              </div>
            )}
          </dl>

          <section className="mt-5" aria-labelledby="description-title">
            <h2 id="description-title" className="text-lg font-bold">
              Description
            </h2>
            <p className="mt-1.5 whitespace-pre-line break-words text-ink-soft">{listing.description}</p>
          </section>

          {listing.seller && (
            <section className="mt-5 rounded-xl border border-line bg-white p-4" aria-labelledby="seller-title">
              <h2 id="seller-title" className="text-sm font-semibold text-ink-faint">
                {listing.listingType === 'donate' ? 'Given by' : 'Seller'}
              </h2>
              <div className="mt-2 flex items-center gap-3">
                <Avatar name={listing.seller.name} src={listing.seller.avatar} size="lg" />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
                    <Link to={`/users/${listing.seller.id}`} className="hover:text-blue-700 hover:underline">
                      {listing.seller.name}
                    </Link>
                    {listing.seller.isVerified && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[13px] font-semibold text-green-800">
                        <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                        Verified student
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-ink-soft">
                    {[listing.seller.department, listing.seller.batch && `Batch ${listing.seller.batch}`].filter(Boolean).join(' · ') || 'Student'}
                    {' · '}Member since {formatDate(listing.seller.memberSince)}
                  </p>
                  <Stars value={listing.seller.rating || 0} count={listing.seller.ratingCount || 0} className="mt-1" />
                </div>
              </div>
              <SellerActions seller={listing.seller} isMine={listing.isMine} />
              {listing.seller.ratingCount > 0 && <SellerReviews sellerId={listing.seller.id} />}
            </section>
          )}

          {listing.isMine ? (
            <section className="mt-5 rounded-xl border border-line bg-paper p-4" aria-label="Manage your item">
              <p className="font-semibold">This is your item</p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link to={`/listings/${listing.id}/edit`} className="btn btn-primary">
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Edit item
                </Link>
                <button type="button" onClick={toggleStatus} disabled={busy} className="btn btn-secondary">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {closed ? 'Make available again' : 'Mark as no longer available'}
                </button>
                {!confirmDelete && (
                  <button type="button" onClick={() => setConfirmDelete(true)} disabled={busy} className="btn btn-ghost !text-coral-600">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Delete
                  </button>
                )}
              </div>
              {confirmDelete && (
                <div role="alertdialog" aria-label="Confirm delete" className="mt-4 rounded-lg border border-coral-100 bg-coral-50 p-3.5">
                  <p className="text-sm font-semibold text-coral-800">Delete this item and its photos for good?</p>
                  <div className="mt-3 flex gap-2">
                    <button type="button" onClick={remove} disabled={busy} className="btn btn-danger !px-3 !py-2">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                      Yes, delete
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(false)} disabled={busy} className="btn btn-secondary !px-3 !py-2">
                      Keep it
                    </button>
                  </div>
                </div>
              )}
            </section>
          ) : (
            <ContactSeller listing={listing} />
          )}
        </div>
      </div>
    </div>
  );
}