import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, RefreshCw, Search, X } from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import PrivateImage from '../components/PrivateImage';
import Alert from '../components/Alert';
import AdminBadge from '../components/AdminBadge';
import TextField from '../components/TextField';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { adminApi } from '../api';
import { parseApiError } from '../api/client';
import { formatDate, formatDateTime } from '../utils/format';
import Avatar from '../components/chat/Avatar';
import { validatePhone } from '../utils/validators';

const PAGE_SIZE = 10;

const TABS = [
  { key: 'pending', label: 'Pending', statKey: 'pending' },
  { key: 'verified', label: 'Verified', statKey: 'verified' },
  { key: 'rejected', label: 'Rejected', statKey: 'rejected' },
  { key: 'all', label: 'All students', statKey: 'total' },
];

const QUICK_REASONS = [
  'The photo is blurry or cut off.',
  'The name on the card does not match the account.',
  'The registration number does not match the card.',
  'This is not a university ID card.',
];

export default function AdminVerifications() {
  const { user: admin } = useAuth();
  const toast = useToast();

  const [status, setStatus] = useState('pending');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ users: [], pagination: { page: 1, limit: PAGE_SIZE, total: 0, pages: 1 } });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const latestRequest = useRef(0);

  // Wait until the admin stops typing before searching
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError('');
    try {
      const [listRes, statsRes] = await Promise.all([
        adminApi.list({ status, search, page, limit: PAGE_SIZE }),
        adminApi.stats(),
      ]);
      if (requestId !== latestRequest.current) return; // a newer request replaced this one
      setData(listRes.data.data);
      setStats(statsRes.data.data.stats);
    } catch (err) {
      if (requestId !== latestRequest.current) return;
      setError(parseApiError(err).message);
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, [status, search, page]);

  useEffect(() => {
    load();
  }, [load]);

  // If the last student on a page was just reviewed, step back one page
  useEffect(() => {
    if (!loading && !error && data.users.length === 0 && page > 1) setPage((p) => p - 1);
  }, [loading, error, data.users.length, page]);

  const closeDrawer = useCallback(() => setSelected(null), []);
  const afterReview = useCallback(() => {
    setSelected(null);
    load();
  }, [load]);

  const { users, pagination } = data;
  const from = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1;
  const to = Math.min(pagination.page * pagination.limit, pagination.total);
  const firstLoad = loading && users.length === 0 && !error;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Verification queue</h1>
          <p className="mt-1 max-w-prose text-ink-soft">
            Open a student, compare the ID card photo with the name and registration number they typed, then approve or
            reject.
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading} className="btn btn-secondary">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </header>

      <AdminProfile admin={admin} />

      {/* The counts double as the status filter */}
      <div
        role="tablist"
        aria-label="Filter students by verification status"
        className="grid grid-cols-2 divide-x divide-y divide-line overflow-hidden rounded-xl border border-line bg-white sm:grid-cols-4 sm:divide-y-0"
      >
        {TABS.map((tab) => {
          const active = status === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => {
                setStatus(tab.key);
                setPage(1);
              }}
              className={`px-5 py-4 text-left transition-colors ${active ? 'bg-blue-50' : 'hover:bg-paper'}`}
            >
              <span className={`block text-sm ${active ? 'font-semibold text-blue-700' : 'text-ink-soft'}`}>{tab.label}</span>
              <span className="mt-1 block font-display text-3xl font-bold tabular-nums">
                {stats ? stats[tab.statKey] : '-'}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative mt-5 max-w-md">
        <label htmlFor="student-search" className="sr-only">
          Search students
        </label>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
        <input
          id="student-search"
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search by name, email, registration number or department"
          className="input pl-10"
          autoComplete="off"
        />
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

      {/* Table on larger screens */}
      <div className={`mt-5 hidden overflow-hidden rounded-xl border border-line bg-white md:block ${loading && !firstLoad ? 'opacity-60' : ''}`}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-paper text-ink-soft">
            <tr>
              <th scope="col" className="px-4 py-3 font-semibold">Student</th>
              <th scope="col" className="px-4 py-3 font-semibold">Registration no.</th>
              <th scope="col" className="px-4 py-3 font-semibold">Department</th>
              <th scope="col" className="px-4 py-3 font-semibold">Submitted</th>
              <th scope="col" className="px-4 py-3 font-semibold">Status</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">Action</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {firstLoad &&
              [0, 1, 2, 3].map((i) => (
                <tr key={i} aria-hidden="true">
                  <td colSpan={6} className="px-4 py-4">
                    <div className="h-5 animate-pulse rounded bg-paper" />
                  </td>
                </tr>
              ))}
            {users.map((s) => (
              <tr key={s.id} className="cursor-pointer hover:bg-paper" onClick={() => setSelected(s)}>
                <td className="px-4 py-3">
                  <p className="font-semibold">{s.name}</p>
                  <p className="text-ink-soft">{s.email}</p>
                </td>
                <td className="px-4 py-3 font-semibold tabular-nums">{s.universityRegNumber}</td>
                <td className="px-4 py-3 text-ink-soft">
                  {[s.department, s.batch && `Batch ${s.batch}`].filter(Boolean).join(' \u00b7 ') || '-'}
                </td>
                <td className="px-4 py-3 text-ink-soft">{formatDate(s.verificationSubmittedAt)}</td>
                <td className="px-4 py-3"><StatusBadge status={s.verificationStatus} /></td>
                <td className="px-4 py-3 text-right">
                  <button
                    type="button"
                    className={`btn !px-3 !py-1.5 text-sm ${s.verificationStatus === 'pending' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(s);
                    }}
                    aria-label={`${s.verificationStatus === 'pending' ? 'Review' : 'View'} ${s.name}`}
                  >
                    {s.verificationStatus === 'pending' ? 'Review' : 'View'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cards on phones */}
      <ul className={`mt-5 space-y-3 md:hidden ${loading && !firstLoad ? 'opacity-60' : ''}`}>
        {firstLoad && [0, 1, 2].map((i) => <li key={i} className="h-24 animate-pulse rounded-xl bg-white" aria-hidden="true" />)}
        {users.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setSelected(s)}
              className="w-full rounded-xl border border-line bg-white p-4 text-left hover:border-blue-300"
            >
              <span className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{s.name}</span>
                  <span className="block truncate text-sm text-ink-soft">{s.email}</span>
                </span>
                <StatusBadge status={s.verificationStatus} />
              </span>
              <span className="mt-2 block text-sm tabular-nums text-ink-soft">
                {s.universityRegNumber} &middot; submitted {formatDate(s.verificationSubmittedAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {!loading && !error && users.length === 0 && (
        <div className="mt-5 rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center">
          <p className="font-display text-xl font-bold">
            {search ? `No students match "${search}"` : status === 'pending' ? 'No students are waiting for review' : 'Nothing here yet'}
          </p>
          <p className="mt-1 text-ink-soft">
            {search ? 'Try a different name, email or registration number.' : 'New sign-ups will appear in this list.'}
          </p>
        </div>
      )}

      {pagination.total > 0 && (
        <nav className="mt-4 flex items-center justify-between" aria-label="Pagination">
          <p className="text-sm text-ink-soft">
            Showing {from}&ndash;{to} of {pagination.total}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-secondary !px-3 !py-2"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Previous
            </button>
            <button
              type="button"
              className="btn btn-secondary !px-3 !py-2"
              disabled={page >= pagination.pages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </nav>
      )}

      {selected && <ReviewDrawer student={selected} onClose={closeDrawer} onChanged={afterReview} />}
    </div>
  );
}

/** The logged-in admin's own details, with the golden Admin badge. */
function AdminProfile({ admin }) {
  if (!admin) return null;
  return (
    <section
      aria-label="Your admin profile"
      className="mb-8 flex flex-wrap items-center gap-x-6 gap-y-4 rounded-xl border border-gold-300 bg-gold-50 p-4 sm:p-5"
    >
      <Avatar name={admin.name} src={admin.avatar} size="lg" tone="gold" className="font-display !text-xl" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="break-words text-xl font-bold">{admin.name}</h2>
          <AdminBadge badge={admin.adminBadge} />
        </div>
        <dl className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-soft">
          <div>
            <dt className="sr-only">Email</dt>
            <dd>{admin.email}</dd>
          </div>
          <div>
            <dt className="sr-only">Phone number</dt>
            <dd>{admin.phone}</dd>
          </div>
          <div>
            <dt className="sr-only">University registration number</dt>
            <dd>Reg. {admin.universityRegNumber}</dd>
          </div>
        </dl>
        <Link to="/profile" className="mt-2 inline-block text-sm font-semibold text-gold-700 underline hover:text-gold-900">
          Edit profile
        </Link>
      </div>

      {admin.hasIdCard && (
        <div className="w-44 shrink-0">
          <p className="mb-1 text-[13px] text-ink-soft">My ID card</p>
          <PrivateImage
            kind="admin"
            userId={admin.id}
            version={admin.updatedAt}
            alt="Your university ID card"
            className="h-24 w-full rounded-lg border border-gold-300"
            zoomable
          />
        </div>
      )}
    </section>
  );
}

function ReviewDrawer({ student, onClose, onChanged }) {
  const toast = useToast();
  const [mode, setMode] = useState('view'); // 'view' | 'reject'
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [busy, setBusy] = useState(false);

  const panelRef = useRef(null);
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;

  const isPending = student.verificationStatus === 'pending';

  // Focus the panel once, close on Escape, and stop the page behind from scrolling
  useEffect(() => {
    panelRef.current?.focus();
    document.body.classList.add('overflow-hidden');
    const onKey = (e) => {
      if (e.key === 'Escape' && !busyRef.current) closeRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('overflow-hidden');
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const handleFailure = (err) => {
    const parsed = parseApiError(err);
    toast.error(parsed.message);
    // Someone else already reviewed this student, or it no longer exists: refresh the list
    if (parsed.status === 409 || parsed.status === 404) onChanged();
  };

  const approve = async () => {
    setBusy(true);
    try {
      await adminApi.approve(student.id);
      toast.success(`${student.name} is now a verified student.`);
      onChanged();
    } catch (err) {
      handleFailure(err);
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    const cleaned = reason.trim();
    if (cleaned.length < 5) {
      setReasonError('Please give a reason (at least 5 characters). The student will see it.');
      return;
    }
    setBusy(true);
    try {
      await adminApi.reject(student.id, cleaned);
      toast.success(`${student.name} was rejected. They can upload a new ID card.`);
      onChanged();
    } catch (err) {
      handleFailure(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-ink/50"
        aria-label="Close review panel"
        tabIndex={-1}
        onClick={() => !busy && onClose()}
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl focus:outline-none"
      >
        <div className="flex items-start justify-between gap-4 border-b border-line p-5">
          <div className="min-w-0">
            <h2 id="drawer-title" className="break-words text-2xl font-bold">
              {student.name}
            </h2>
            <div className="mt-2">
              <StatusBadge status={student.verificationStatus} />
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-2 text-ink-soft hover:bg-blue-50 hover:text-ink"
            aria-label="Close review panel"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 space-y-6 p-5">
          <div>
            <p className="mb-2 text-sm font-semibold">Submitted ID card</p>
            <PrivateImage
              userId={student.id}
              version={student.verificationSubmittedAt}
              alt={`ID card submitted by ${student.name}`}
              className="h-64 w-full rounded-lg border border-line"
              zoomable
            />
          </div>

          <div className="rounded-xl bg-blue-50 p-4">
            <p className="text-[13px] text-blue-800">Registration number the student typed</p>
            <p className="break-all font-display text-2xl font-bold tabular-nums tracking-wide text-blue-900">
              {student.universityRegNumber}
            </p>
            <p className="mt-1 text-[13px] text-blue-800">It must match the number printed on the card.</p>
          </div>

          <dl className="grid gap-4 sm:grid-cols-2">
            <Info label="Name on account" value={student.name} />
            <Info label="Email" value={student.email} />
            <Info label="Department" value={student.department || 'Not provided'} />
            <Info label="Batch" value={student.batch || 'Not provided'} />
            <Info label="Submitted" value={formatDateTime(student.verificationSubmittedAt)} />
            {!isPending && (
              <div>
                <dt className="text-[13px] text-ink-faint">Reviewed</dt>
                <dd className="font-semibold">
                  {formatDateTime(student.reviewedAt)}
                  {student.reviewedBy?.name && (
                    <span className="mt-1 flex flex-wrap items-center gap-2 font-normal text-ink-soft">
                      by {student.reviewedBy.name}
                      <AdminBadge badge={student.reviewedBy.adminBadge} size="sm" />
                    </span>
                  )}
                  {!student.reviewedBy?.name && ['approved', 'rejected'].includes(student.autoVerification?.decision) && (
                    <span className="mt-1 block font-normal text-ink-soft">by the automatic check</span>
                  )}
                </dd>
              </div>
            )}
          </dl>

          {student.autoVerification?.summary && (
            <Alert variant="info" title="Automatic check">
              {student.autoVerification.summary}
            </Alert>
          )}

          {student.verificationStatus === 'rejected' && student.rejectionReason && (
            <Alert variant="error" title="Rejection reason">
              {student.rejectionReason}
            </Alert>
          )}

          <PromoteSection student={student} busy={busy} setBusy={setBusy} onDone={onChanged} />
        </div>

        {isPending ? (
          <div className="sticky bottom-0 border-t border-line bg-white p-5">
            {mode === 'view' ? (
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={approve} disabled={busy} className="btn btn-success flex-1">
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
                  Approve student
                </button>
                <button type="button" onClick={() => setMode('reject')} disabled={busy} className="btn btn-secondary flex-1">
                  Reject...
                </button>
              </div>
            ) : (
              <div>
                <label htmlFor="reject-reason" className="label">
                  Why is it being rejected? <span className="font-normal text-ink-faint">(the student will see this)</span>
                </label>
                <div className="mb-2 flex flex-wrap gap-2">
                  {QUICK_REASONS.map((text) => (
                    <button
                      key={text}
                      type="button"
                      onClick={() => {
                        setReason(text);
                        setReasonError('');
                      }}
                      className="rounded-full border border-line px-3 py-1 text-[13px] text-ink-soft hover:border-blue-300 hover:bg-blue-50"
                    >
                      {text.replace(/\.$/, '')}
                    </button>
                  ))}
                </div>
                <textarea
                  id="reject-reason"
                  rows={3}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (reasonError) setReasonError('');
                  }}
                  className="input"
                  aria-invalid={reasonError ? 'true' : 'false'}
                  aria-describedby={reasonError ? 'reject-reason-error' : undefined}
                  placeholder="Explain what is wrong so the student can fix it"
                />
                {reasonError && (
                  <p id="reject-reason-error" className="mt-1.5 flex items-center gap-1.5 text-[13px] font-medium text-coral-600">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    {reasonError}
                  </p>
                )}
                <div className="mt-3 flex gap-3">
                  <button type="button" onClick={reject} disabled={busy} className="btn btn-danger flex-1">
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
                    Confirm rejection
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('view');
                      setReasonError('');
                    }}
                    disabled={busy}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="border-t border-line p-5 text-sm text-ink-soft">
            This student has already been reviewed. A rejected student can upload a new ID card, which puts them back in the
            pending list.
          </div>
        )}
      </aside>
    </div>
  );
}

/** Lets an admin make this student an admin (the student moves from `users` to `admins`). */
function PromoteSection({ student, busy, setBusy, onDone }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');

  const active = student.status === 'active';
  const verified = student.verificationStatus === 'verified';

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    const message = validatePhone(phone);
    if (message) {
      setError(message);
      return;
    }
    setBusy(true);
    try {
      await adminApi.promote(student.id, phone.trim());
      toast.success(`${student.name} is now an admin.`);
      onDone();
    } catch (err) {
      const parsed = parseApiError(err);
      if (parsed.fieldErrors.phone) setError(parsed.fieldErrors.phone);
      else toast.error(parsed.message);
      if (parsed.status === 404) onDone(); // already promoted by someone else: refresh the list
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="promote-title" className="rounded-xl border border-gold-300 bg-gold-50 p-4">
      <h3 id="promote-title" className="text-base font-bold">
        Admin rights
      </h3>

      {!open ? (
        <>
          <p className="mt-1 text-sm text-ink-soft">
            Make this student an administrator. They keep their email and password, and get the golden Admin badge.
          </p>
          {!active && (
            <p className="mt-2 text-sm font-semibold text-coral-800">
              This account is {student.status}. Reactivate it before making the student an admin.
            </p>
          )}
          <button type="button" onClick={() => setOpen(true)} disabled={busy || !active} className="btn btn-gold mt-3">
            Make this student an admin
          </button>
        </>
      ) : (
        <form onSubmit={submit} noValidate className="mt-2 space-y-3">
          {!verified && (
            <Alert variant="warning" title="This student is not verified yet">
              Their ID card status is {student.verificationStatus}. Making them an admin skips that check, so be sure you
              know who they are.
            </Alert>
          )}
          <TextField
            id="promote-phone"
            name="phone"
            label="Phone number of the new admin"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value);
              if (error) setError('');
            }}
            error={error}
            hint="Admins need a mobile number, for example 01712345678."
            inputMode="tel"
            autoComplete="off"
          />
          <p className="text-sm text-ink-soft">
            They become an admin straight away and can approve students and make other admins. This is recorded in the
            audit log.
          </p>
          <div className="flex gap-3">
            <button type="submit" disabled={busy} className="btn btn-gold flex-1">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : null}
              Confirm: make admin
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setError('');
              }}
              disabled={busy}
              className="btn btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <dt className="text-[13px] text-ink-faint">{label}</dt>
      <dd className="break-words font-semibold">{value}</dd>
    </div>
  );
}