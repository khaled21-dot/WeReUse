import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, Flag, IdCard, Loader2, Package, ShieldAlert, Star } from 'lucide-react';
import Alert from '../components/Alert';
import Spinner from '../components/Spinner';
import Avatar from '../components/chat/Avatar';
import ListingCard from '../components/ListingCard';
import ModerationPanel from '../components/ModerationPanel';
import ReportUserDialog from '../components/ReportUserDialog';
import { StarInput, Stars } from '../components/StarRating';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { userApi } from '../api';
import { parseApiError } from '../api/client';
import { formatDate, timeAgo } from '../utils/format';

// "Rate this student": one rating per student, which can be changed or removed
function RateCard({ person, myRating, onSaved }) {
  const toast = useToast();
  const [editing, setEditing] = useState(!myRating);
  const [stars, setStars] = useState(myRating ? myRating.stars : 0);
  const [comment, setComment] = useState(myRating ? myRating.comment : '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (e) => {
    e.preventDefault();
    if (!stars) return setError('Choose 1 to 5 stars');
    setBusy(true);
    setError('');
    try {
      const res = await userApi.rate(person.id, { stars, comment: comment.trim() });
      toast.success(res.data.message);
      onSaved(res.data.data.rating, res.data.data.summary);
      setEditing(false);
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.fieldErrors.stars || parsed.fieldErrors.comment || parsed.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  const remove = async () => {
    setBusy(true);
    try {
      const res = await userApi.removeRating(person.id);
      toast.success(res.data.message);
      setStars(0);
      setComment('');
      setEditing(true);
      onSaved(null, res.data.data.summary);
    } catch (err) {
      toast.error(parseApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-gold-200 bg-gold-50 p-4" aria-labelledby="rate-title">
      <h2 id="rate-title" className="inline-flex items-center gap-2 font-bold">
        <Star className="h-5 w-5 fill-gold-400 text-gold-500" aria-hidden="true" />
        {myRating && !editing ? 'Your rating' : `Rate ${person.name}`}
      </h2>
      {myRating && !editing ? (
        <div className="mt-2">
          <Stars value={myRating.stars} showValue={false} size="lg" />
          {myRating.comment && <p className="mt-1 break-words text-sm text-ink-soft">“{myRating.comment}”</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => setEditing(true)} className="btn btn-secondary !py-1.5 text-sm">
              Change rating
            </button>
            <button type="button" onClick={remove} disabled={busy} className="btn btn-ghost !py-1.5 text-sm">
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Remove
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={save} noValidate aria-label={`Rate ${person.name}`} className="mt-2">
          <StarInput value={stars} onChange={setStars} name="profile-stars" disabled={busy} />
          <label htmlFor="profile-rating-comment" className="sr-only">
            Comment
          </label>
          <textarea
            id="profile-rating-comment"
            rows={2}
            maxLength={500}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="How was dealing with them? (optional)"
            className="input mt-2 resize-none"
          />
          {error && (
            <p role="alert" className="mt-1.5 text-[13px] font-medium text-coral-600">
              {error}
            </p>
          )}
          <div className="mt-2.5 flex gap-2">
            <button type="submit" disabled={busy} className="btn btn-primary !py-2 text-sm">
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {myRating ? 'Save rating' : 'Submit rating'}
            </button>
            {myRating && (
              <button type="button" onClick={() => setEditing(false)} disabled={busy} className="btn btn-secondary !py-2 text-sm">
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

export default function UserProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | missing | error
  const [problem, setProblem] = useState('');
  const [reporting, setReporting] = useState(false);

  const load = useCallback(async () => {
    setState('loading');
    try {
      const res = await userApi.profile(id);
      setData(res.data.data);
      setState('ready');
    } catch (err) {
      const parsed = parseApiError(err);
      setProblem(parsed.message);
      setState(parsed.status === 404 ? 'missing' : 'error');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (state === 'loading') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-blue-600" label="Loading profile" />
      </div>
    );
  }
  if (state !== 'ready') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <h1 className="text-2xl font-bold">{state === 'missing' ? 'This profile is not available' : 'Something went wrong'}</h1>
        <p className="mt-2 text-ink-soft">{state === 'missing' ? 'The account may not exist, or it has been blocked by an admin.' : problem}</p>
        <Link to="/listings" className="btn btn-primary mt-5">
          Browse items
        </Link>
      </div>
    );
  }

  const { profile, listings, reviews, viewer } = data;
  const isAdmin = user.role === 'admin';

  const onRated = (rating, summary) =>
    setData((d) => ({
      ...d,
      profile: { ...d.profile, rating: summary.average, ratingCount: summary.count },
      viewer: { ...d.viewer, myRating: rating },
    }));

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <button type="button" onClick={() => window.history.back()} className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </button>

      {profile.isMe && (
        <Alert variant="info" className="mt-4">
          This is how other students see your profile.{' '}
          <Link to="/profile" className="font-semibold underline">
            Edit my details
          </Link>
        </Alert>
      )}

      <div className="mt-4 grid gap-6 md:grid-cols-[minmax(0,1fr)_20rem]">
        {/* who */}
        <section className="rounded-xl border border-line bg-white p-5" aria-labelledby="profile-name">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar name={profile.name} src={profile.avatar} size="xl" className="!h-24 !w-24 !text-3xl ring-4 ring-blue-50" />
            <div className="min-w-0 flex-1">
              <h1 id="profile-name" className="flex flex-wrap items-center gap-2 text-3xl font-bold">
                {profile.name}
                {profile.isVerified && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[13px] font-semibold text-green-800">
                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    Verified student
                  </span>
                )}
              </h1>
              <p className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-paper px-2.5 py-1 text-sm">
                <IdCard className="h-4 w-4 text-ink-faint" aria-hidden="true" />
                <span className="text-ink-faint">Student ID</span>
                <span className="font-semibold tracking-wide">{profile.studentId}</span>
              </p>
              <p className="mt-1 text-ink-soft">
                {[profile.department, profile.batch && `Batch ${profile.batch}`].filter(Boolean).join(' · ') || 'Student'} · Member since {formatDate(profile.memberSince)}
              </p>
              <Stars value={profile.rating} count={profile.ratingCount} size="lg" className="mt-1.5" />
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-paper p-3">
              <dt className="inline-flex items-center gap-1.5 text-[13px] text-ink-faint">
                <Package className="h-4 w-4" aria-hidden="true" />
                Items on offer
              </dt>
              <dd className="text-xl font-bold">{profile.stats.activeListings}</dd>
            </div>
            <div className="rounded-lg bg-paper p-3">
              <dt className="inline-flex items-center gap-1.5 text-[13px] text-ink-faint">
                <Star className="h-4 w-4" aria-hidden="true" />
                Ratings received
              </dt>
              <dd className="text-xl font-bold">{profile.ratingCount}</dd>
            </div>
          </dl>
        </section>

        {/* actions */}
        <aside className="space-y-4">
          {viewer.canRate && <RateCard key={viewer.myRating ? 'rated' : 'new'} person={profile} myRating={viewer.myRating} onSaved={onRated} />}
          {!viewer.canRate && viewer.canReport && user.verificationStatus !== 'verified' && (
            <p className="rounded-xl border border-line bg-white p-4 text-sm text-ink-soft">You can rate students once your own verification is approved.</p>
          )}

          {viewer.canReport && (
            <section className="rounded-xl border border-line bg-white p-4" aria-labelledby="report-heading">
              <h2 id="report-heading" className="font-bold">
                Something wrong?
              </h2>
              {viewer.hasOpenReport ? (
                <p className="mt-1 text-sm text-ink-soft">You reported {profile.name}. The admins are looking into it.</p>
              ) : (
                <>
                  <p className="mt-1 text-sm text-ink-soft">Report scams, harassment or fake items. Only admins see it.</p>
                  <button type="button" onClick={() => setReporting(true)} className="btn btn-secondary mt-3 w-full !text-coral-600">
                    <Flag className="h-4 w-4" aria-hidden="true" />
                    Report user
                  </button>
                </>
              )}
            </section>
          )}

          {isAdmin && (
            <section className="space-y-3 rounded-xl border border-gold-300 bg-gold-50 p-4" aria-labelledby="admin-heading">
              <h2 id="admin-heading" className="inline-flex items-center gap-2 font-bold">
                <ShieldAlert className="h-5 w-5 text-gold-700" aria-hidden="true" />
                Admin
              </h2>
              <dl className="space-y-1 text-sm">
                <div>
                  <dt className="inline text-ink-faint">E-mail: </dt>
                  <dd className="inline break-all font-semibold">{profile.email}</dd>
                </div>
                <div>
                  <dt className="inline text-ink-faint">Times reported: </dt>
                  <dd className="inline font-semibold">
                    {profile.reportCount}{' '}
                    {profile.reportCount > 0 && (
                      <Link to="/admin/reports?status=all" className="font-normal text-blue-700 underline">
                        see reports
                      </Link>
                    )}
                  </dd>
                </div>
              </dl>
              <ModerationPanel account={profile} onChanged={(next) => setData((d) => ({ ...d, profile: { ...d.profile, ...next } }))} />
            </section>
          )}
        </aside>
      </div>

      {/* items */}
      <section className="mt-8" aria-labelledby="items-title">
        <h2 id="items-title" className="text-xl font-bold">
          {profile.isMe ? 'Your items on offer' : `${profile.name.split(' ')[0]}'s items`}
        </h2>
        {listings.length === 0 ? (
          <p className="mt-3 rounded-xl border border-line bg-white p-6 text-center text-ink-faint">No items on offer right now.</p>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {listings.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </ul>
        )}
      </section>

      {/* reviews */}
      <section className="mt-8" aria-labelledby="reviews-title">
        <h2 id="reviews-title" className="text-xl font-bold">
          Ratings &amp; reviews
        </h2>
        {reviews.length === 0 ? (
          <p className="mt-3 rounded-xl border border-line bg-white p-6 text-center text-ink-faint">No ratings yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-white">
            {reviews.map((r) => (
              <li key={r.id} className="flex gap-3 p-4">
                <Avatar name={r.rater.name} src={r.rater.avatar} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    {r.rater.id ? (
                      <Link to={`/users/${r.rater.id}`} className="font-semibold hover:text-blue-700">
                        {r.rater.name}
                      </Link>
                    ) : (
                      <span className="font-semibold">{r.rater.name}</span>
                    )}
                    <Stars value={r.stars} showValue={false} size="xs" />
                    <span className="text-ink-faint">{timeAgo(r.updatedAt || r.createdAt)}</span>
                  </p>
                                    {r.comment && <p className="mt-1 break-words text-[15px] text-ink-soft">{r.comment}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {reporting && (
        <ReportUserDialog
          person={profile}
          onClose={() => setReporting(false)}
          onSent={(message) => {
            setReporting(false);
            toast.success(message);
            setData((d) => ({ ...d, viewer: { ...d.viewer, hasOpenReport: true } }));
          }}
        />
      )}
    </div>
  );
}
