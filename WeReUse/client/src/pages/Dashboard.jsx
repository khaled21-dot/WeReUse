import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clock, Loader2, Lock, RefreshCw } from 'lucide-react';
import PassCard from '../components/PassCard';
import StatusBadge from '../components/StatusBadge';
import Alert from '../components/Alert';
import TextField from '../components/TextField';
import FileDropzone from '../components/FileDropzone';
import PrivateImage from '../components/PrivateImage';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { verificationApi } from '../api';
import { parseApiError } from '../api/client';
import { validateIdFile, validateRegNumber } from '../utils/validators';
import { firstName, formatDate, formatDateTime } from '../utils/format';

const ACCESS = [
  { title: 'Post items to sell, swap or donate', text: 'Create listings that other students can find.' },
  { title: 'Chat with buyers and sellers', text: 'Agree on a price and arrange a meet-up on campus.' },
  { title: 'Rate students after a deal', text: 'Build trust by leaving honest feedback.' },
];

export default function Dashboard() {
  const { user, refreshUser } = useAuth();
  const toast = useToast();
  const status = user.verificationStatus;

  const previous = useRef(status);
  const [refreshing, setRefreshing] = useState(false);

  // Tell the student as soon as the admin has decided
  useEffect(() => {
    if (previous.current === 'pending' && status === 'verified') {
      toast.success("You're verified! Your pass now carries the verified badge.");
    } else if (previous.current === 'pending' && status === 'rejected') {
      toast.error('Your ID card was rejected. The reason is shown below.');
    }
    previous.current = status;
  }, [status, toast]);

  // While waiting, quietly re-check every 15 seconds and whenever the tab regains focus
  useEffect(() => {
    if (status !== 'pending') return undefined;
    const timer = setInterval(refreshUser, 15000);
    const onFocus = () => refreshUser();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [status, refreshUser]);

  const checkNow = async () => {
    setRefreshing(true);
    await refreshUser();
    setRefreshing(false);
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold sm:text-4xl">Hi, {firstName(user.name)}</h1>
        <p className="mt-1 text-ink-soft">
          {status === 'verified' && 'Your student account is fully active.'}
          {status === 'pending' && 'Your account is created. One step left: the admin reviews your ID card.'}
          {status === 'rejected' && 'Your ID card could not be approved yet. You can send a new photo below.'}
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,24rem)_1fr]">
        <PassCard user={user} />

        <div className="space-y-6">
          {status === 'pending' && <PendingPanel user={user} refreshing={refreshing} onCheck={checkNow} />}
          {status === 'verified' && <VerifiedPanel user={user} />}
          {status === 'rejected' && <RejectedPanel user={user} />}
        </div>
      </div>

      <section className="mt-10 rounded-xl border border-line bg-white" aria-labelledby="access-title">
        <h2 id="access-title" className="px-6 pt-6 text-xl font-bold">
          What your pass unlocks
        </h2>
        <ul className="mt-3 divide-y divide-line">
          {ACCESS.map((item) => (
            <li key={item.title} className="flex items-center gap-4 px-6 py-4">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                  status === 'verified' ? 'bg-green-100 text-green-700' : 'bg-paper text-ink-faint'
                }`}
                aria-hidden="true"
              >
                {status === 'verified' ? <Check className="h-5 w-5" /> : <Lock className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{item.title}</p>
                <p className="text-sm text-ink-soft">{item.text}</p>
              </div>
              <span className={`shrink-0 text-sm font-semibold ${status === 'verified' ? 'text-green-700' : 'text-ink-faint'}`}>
                {status === 'verified' ? 'Unlocked' : 'Locked until verified'}
              </span>
            </li>
          ))}
        </ul>
        <p className="px-6 pb-5 pt-2 text-sm text-ink-faint">
          The server enforces this rule: posting, chat and ratings open once your ID card is approved.
        </p>
      </section>

      <section className="mt-6 rounded-xl border border-line bg-white p-6" aria-labelledby="account-title">
        <h2 id="account-title" className="text-xl font-bold">
          Account details
        </h2>
        <dl className="mt-4 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <Detail label="Email" value={user.email} />
          <Detail label="Member since" value={formatDate(user.createdAt)} />
          <Detail label="Department" value={user.department || 'Not provided'} />
          <Detail label="Batch" value={user.batch || 'Not provided'} />
        </dl>
      </section>
    </div>
  );
}

function Detail({ label, value }) {
  return (
    <div>
      <dt className="text-[13px] text-ink-faint">{label}</dt>
      <dd className="break-words font-semibold">{value}</dd>
    </div>
  );
}

function IdPreview({ user }) {
  return (
    <div className="rounded-xl border border-line bg-white p-4">
      <p className="mb-3 text-sm font-semibold">The ID card you submitted</p>
      <PrivateImage
        userId={user.id}
        version={user.verificationSubmittedAt}
        alt="The ID card you submitted"
        className="h-48 w-full rounded-lg border border-line"
        zoomable
      />
      <p className="mt-2 text-[13px] text-ink-faint">Only you and the admin team can see this image.</p>
    </div>
  );
}

function PendingPanel({ user, refreshing, onCheck }) {
  // When automatic checking is on, the card is read by the server first; an admin only looks at it if that is not sure.
  const auto = user.autoVerification || {};
  const checking = auto.state === 'queued' || auto.state === 'processing';
  const adminLooking = auto.decision === 'review' || auto.state === 'failed';

  const copy = checking
    ? {
        title: 'We are checking your ID card',
        text: 'We compare the name and registration number on your card with the details you entered. This usually takes about a minute, and this page updates by itself.',
        step: 'Automatic check',
        note: 'Reading your ID card now',
      }
    : adminLooking
      ? {
          title: 'An admin is taking a quick look',
          text: 'Our automatic check could not be sure about your ID card, so an admin will compare it with the name and registration number you entered. This page updates by itself when a decision is made.',
          step: 'Admin review',
          note: 'Your ID card is in the queue',
        }
      : {
          title: 'Your ID card is waiting for review',
          text: 'An admin compares it with the name and registration number you entered. This page updates by itself when a decision is made.',
          step: 'Admin review',
          note: 'Your ID card is in the queue',
        };

  const steps = [
    { label: 'ID card submitted', note: formatDateTime(user.verificationSubmittedAt), state: 'done' },
    { label: copy.step, note: copy.note, state: 'current' },
    { label: 'Full access', note: 'Unlocks as soon as you are approved', state: 'todo' },
  ];

  return (
    <>
      <section className="rounded-xl border border-line bg-white p-6" aria-labelledby="pending-title">
        <StatusBadge status="pending" />
        <h2 id="pending-title" className="mt-3 text-2xl font-bold">
          {copy.title}
        </h2>
        <p className="mt-2 max-w-prose text-ink-soft">{copy.text}</p>

        <ol className="mt-6 space-y-5">
          {steps.map((step, i) => (
            <li key={step.label} className="relative flex gap-4">
              {i < steps.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-0.5rem)] w-0.5 bg-line" aria-hidden="true" />}
              <span
                className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  step.state === 'done'
                    ? 'bg-green-500 text-white'
                    : step.state === 'current'
                      ? 'bg-amber-100 text-amber-800 ring-2 ring-amber-600'
                      : 'border border-line bg-white text-ink-faint'
                }`}
                aria-hidden="true"
              >
                {step.state === 'done' ? <Check className="h-4 w-4" /> : step.state === 'current' ? <Clock className="h-4 w-4" /> : <Lock className="h-3.5 w-3.5" />}
              </span>
              <div>
                <p className={`font-semibold ${step.state === 'todo' ? 'text-ink-faint' : ''}`}>
                  {step.label}
                  {step.state === 'current' && <span className="sr-only"> (current step)</span>}
                </p>
                <p className="text-sm text-ink-soft">{step.note}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button type="button" onClick={onCheck} disabled={refreshing} className="btn btn-secondary">
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            Check status now
          </button>
          <span className="text-sm text-ink-faint">We also check automatically while this page is open.</span>
        </div>
      </section>
      <IdPreview user={user} />
    </>
  );
}

function VerifiedPanel({ user }) {
  return (
    <section className="rounded-xl border border-green-200 bg-green-50 p-6" aria-labelledby="verified-title">
      <StatusBadge status="verified" />
      <h2 id="verified-title" className="mt-3 text-2xl font-bold">
        You're a verified student
      </h2>
      <p className="mt-2 max-w-prose text-ink-soft">
        Your ID card was approved{user.reviewedAt ? ` on ${formatDate(user.reviewedAt)}` : ''}. Your pass now carries the
        verified badge that other students will see.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        <Link to="/listings/new" className="btn btn-primary">
          Post an item
        </Link>
        <Link to="/listings" className="btn btn-secondary">
          Browse items
        </Link>
        <Link to="/profile" className="btn btn-secondary">
          Edit my profile
        </Link>
      </div>
    </section>
  );
}

function RejectedPanel({ user }) {
  const { setUser } = useAuth();
  const toast = useToast();

  const [regNumber, setRegNumber] = useState(user.universityRegNumber);
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setFormError('');

    const found = {};
    const regError = validateRegNumber(regNumber);
    if (regError) found.universityRegNumber = regError;
    const fileError = validateIdFile(file);
    if (fileError) found.idCard = fileError;
    setErrors(found);
    if (Object.keys(found).length) return;

    const body = new FormData();
    body.append('idCard', file);
    const cleaned = regNumber.trim().toUpperCase();
    if (cleaned !== user.universityRegNumber) body.append('universityRegNumber', cleaned);

    setSubmitting(true);
    try {
      const res = await verificationApi.resubmit(body);
      setUser(res.data.data.user); // status is "pending" again - the page switches by itself
      toast.success('Thanks! Your new ID card is now waiting for review.');
    } catch (err) {
      const parsed = parseApiError(err);
      setFormError(parsed.message);
      if (Object.keys(parsed.fieldErrors).length) setErrors(parsed.fieldErrors);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-xl border border-line bg-white p-6" aria-labelledby="rejected-title">
      <StatusBadge status="rejected" />
      <h2 id="rejected-title" className="mt-3 text-2xl font-bold">
        Your ID card needs another look
      </h2>

      <Alert variant="error" title="Reason from the admin" className="mt-4">
        {user.rejectionReason || 'No reason was given.'}
      </Alert>

      <form onSubmit={onSubmit} noValidate className="mt-6 space-y-5">
        <h3 className="text-lg font-bold">Send a new photo</h3>
        {formError && <Alert variant="error">{formError}</Alert>}

        <TextField
          id="universityRegNumber"
          name="universityRegNumber"
          label="University registration number"
          value={regNumber}
          onChange={(e) => {
            setRegNumber(e.target.value);
            if (errors.universityRegNumber) setErrors((er) => ({ ...er, universityRegNumber: '' }));
          }}
          error={errors.universityRegNumber}
          hint="Fix this too if the admin said it did not match your card."
          autoCapitalize="characters"
          spellCheck={false}
        />

        <FileDropzone
          id="idCard"
          label="New ID card photo"
          hint="A clear, well-lit photo of the front of your card. JPG or PNG, up to 5 MB."
          file={file}
          error={errors.idCard}
          onSelect={(f) => {
            setFile(f);
            setErrors((er) => ({ ...er, idCard: '' }));
          }}
          onReject={(message) => {
            setFile(null);
            setErrors((er) => ({ ...er, idCard: message }));
          }}
          onClear={() => setFile(null)}
        />

        <button type="submit" disabled={submitting} className="btn btn-primary">
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              Sending...
            </>
          ) : (
            'Send for review again'
          )}
        </button>
      </form>
    </section>
  );
}