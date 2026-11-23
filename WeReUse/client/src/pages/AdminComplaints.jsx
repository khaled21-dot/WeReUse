import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, MessageSquareWarning } from 'lucide-react';
import Alert from '../components/Alert';
import Spinner from '../components/Spinner';
import { useToast } from '../context/ToastContext';
import { adminApi } from '../api';
import { parseApiError } from '../api/client';
import { formatDateTime } from '../utils/format';
import { COMPLAINT_CATEGORY_LABELS, COMPLAINT_STATUS } from '../utils/support';

const TABS = [
  { key: 'open', label: 'Open' },
  { key: 'in_review', label: 'In review' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'dismissed', label: 'Closed' },
  { key: 'all', label: 'All' },
];

function ComplaintCard({ complaint, onUpdated }) {
  const toast = useToast();
  const [status, setStatus] = useState(complaint.status);
  const [response, setResponse] = useState(complaint.adminResponse);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const badge = COMPLAINT_STATUS[complaint.status] || COMPLAINT_STATUS.open;
  const scam = complaint.category === 'scam';

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await adminApi.updateComplaint(complaint.id, { status, adminResponse: response.trim() });
      toast.success(res.data.message);
      onUpdated(res.data.data.complaint);
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.fieldErrors.adminResponse || parsed.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={`rounded-xl border bg-white p-4 ${scam && complaint.status === 'open' ? 'border-coral-100 ring-1 ring-coral-100' : 'border-line'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="break-words font-semibold">{complaint.subject}</p>
          <p className="text-[13px] text-ink-faint">
            <span className={scam ? 'font-semibold text-coral-600' : ''}>{COMPLAINT_CATEGORY_LABELS[complaint.category]}</span> · {formatDateTime(complaint.createdAt)}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.badge}`}>{badge.label}</span>
      </div>

      {complaint.user && (
        <p className="mt-2 text-sm text-ink-soft">
          From{' '}
          <Link to={`/users/${complaint.user.id}`} className="font-semibold text-ink hover:text-blue-700 hover:underline">
            {complaint.user.name}
          </Link> · {complaint.user.email} · {complaint.user.universityRegNumber}
          {complaint.user.status !== 'active' && ` · ${complaint.user.status}`}
        </p>
      )}
      <p className="mt-3 whitespace-pre-line break-words text-[15px]">{complaint.description}</p>

      <form onSubmit={save} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[12rem_1fr]">
        <div>
          <label htmlFor={`status-${complaint.id}`} className="label">
            Status
          </label>
          <select id={`status-${complaint.id}`} className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(COMPLAINT_STATUS).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`response-${complaint.id}`} className="label">
            Response to the student <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <textarea id={`response-${complaint.id}`} rows={2} maxLength={1000} className="input resize-y" value={response} onChange={(e) => setResponse(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="text-[13px] font-medium text-coral-600 sm:col-span-2">
            {error}
          </p>
        )}
        <div className="sm:col-span-2">
          <button type="submit" disabled={busy} className="btn btn-primary !py-2 text-sm">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Save and notify student
          </button>
        </div>
      </form>
    </li>
  );
}

export default function AdminComplaints() {
  const [status, setStatus] = useState('open');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const latest = useRef(0);

  const load = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    try {
      const res = await adminApi.complaints({ status, limit: 50 });
      if (id !== latest.current) return;
      setData(res.data.data);
      setError('');
    } catch (err) {
      if (id !== latest.current) return;
      setError(parseApiError(err).message);
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  // a complaint that moved to another status leaves this tab
  const onUpdated = () => load();

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="inline-flex items-center gap-2.5 text-3xl font-bold">
        <MessageSquareWarning className="h-8 w-8 text-coral-600" aria-hidden="true" />
        Complaints
      </h1>
      <p className="mt-1 text-ink-soft">Scam reports and system problems sent by students. Scam reports are highlighted.</p>

      <div role="tablist" aria-label="Complaint status" className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={status === t.key}
            onClick={() => setStatus(t.key)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${status === t.key ? 'bg-blue-600 text-white' : 'border border-line bg-white text-ink-soft hover:bg-blue-50'}`}
          >
            {t.label}
            {data && <span className="ml-1.5 opacity-80">{data.counts[t.key] ?? 0}</span>}
          </button>
        ))}
      </div>

      {error && (
        <Alert variant="error" className="mt-4">
          {error}
        </Alert>
      )}
      {loading && !data && (
        <div className="flex justify-center py-12">
          <Spinner className="h-7 w-7 text-blue-600" label="Loading complaints" />
        </div>
      )}
      {data && data.complaints.length === 0 && <p className="mt-4 rounded-xl border border-line bg-white p-8 text-center text-ink-faint">No complaints here.</p>}
      {data && data.complaints.length > 0 && (
        <ul className={`mt-4 space-y-4 ${loading ? 'opacity-60' : ''}`}>
          {data.complaints.map((c) => (
            <ComplaintCard key={`${c.id}-${c.updatedAt}`} complaint={c} onUpdated={onUpdated} />
          ))}
        </ul>
      )}
    </div>
  );
}
