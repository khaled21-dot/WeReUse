import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Flag, Loader2 } from 'lucide-react';
import Alert from '../components/Alert';
import Spinner from '../components/Spinner';
import Avatar from '../components/chat/Avatar';
import ModerationPanel from '../components/ModerationPanel';
import { Stars } from '../components/StarRating';
import { useToast } from '../context/ToastContext';
import { adminApi } from '../api';
import { parseApiError } from '../api/client';
import { formatDateTime } from '../utils/format';
import { REPORT_REASON_LABELS, REPORT_STATUS } from '../utils/support';

const TABS = [
  { key: 'open', label: 'Open' },
  { key: 'reviewing', label: 'Reviewing' },
  { key: 'action_taken', label: 'Action taken' },
  { key: 'dismissed', label: 'Dismissed' },
  { key: 'all', label: 'All' },
];

function Person({ label, person }) {
  if (!person) return <p className="text-sm text-ink-faint">{label}: deleted account</p>;
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <Avatar name={person.name} src={person.avatar} size="sm" />
      <div className="min-w-0">
        <p className="text-xs text-ink-faint">{label}</p>
        <Link to={`/users/${person.id}`} className="block truncate font-semibold hover:text-blue-700">
          {person.name}
        </Link>
        <p className="truncate text-xs text-ink-faint">{person.email}</p>
      </div>
    </div>
  );
}

function ReportCard({ report, onChanged }) {
  const toast = useToast();
  const [status, setStatus] = useState(report.status);
  const [note, setNote] = useState(report.adminNote);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reported, setReported] = useState(report.reported);
  const badge = REPORT_STATUS[report.status] || REPORT_STATUS.open;
  const serious = report.reason === 'scam' || report.reason === 'harassment';

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await adminApi.updateReport(report.id, { status, adminNote: note.trim() });
      toast.success(res.data.message);
      onChanged();
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.fieldErrors.adminNote || parsed.message);
      setBusy(false);
    }
  };

  return (
    <li className={`rounded-xl border bg-white p-4 ${serious && report.status === 'open' ? 'border-coral-100 ring-1 ring-coral-100' : 'border-line'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className={`inline-flex items-center gap-1.5 font-semibold ${serious ? 'text-coral-600' : ''}`}>
          <Flag className="h-4 w-4" aria-hidden="true" />
          {REPORT_REASON_LABELS[report.reason] || report.reason}
        </p>
        <span className="flex items-center gap-2 text-[13px] text-ink-faint">
          {formatDateTime(report.createdAt)}
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.badge}`}>{badge.label}</span>
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Person label="Reported by" person={report.reporter} />
        <ArrowRight className="h-4 w-4 shrink-0 text-ink-faint" aria-label="reported" />
        <Person label="Reported student" person={reported} />
        {reported && (
          <span className="ml-auto text-right text-xs text-ink-soft">
            <Stars value={reported.rating} count={reported.ratingCount} size="xs" />
            <span className={`mt-0.5 block font-semibold ${reported.timesReported > 1 ? 'text-coral-600' : ''}`}>
              Reported {reported.timesReported} time{reported.timesReported === 1 ? '' : 's'} in total
            </span>
          </span>
        )}
      </div>

      <p className="mt-3 whitespace-pre-line break-words rounded-lg bg-paper p-3 text-[15px]">{report.details}</p>

      {reported && (
        <div className="mt-4">
          <p className="label">Act on the reported account</p>
          <ModerationPanel
            compact
            account={reported}
            reportId={['open', 'reviewing'].includes(report.status) ? report.id : undefined}
            onChanged={(next) => {
              setReported((r) => ({ ...r, ...next }));
              if (next.status !== 'active') onChanged(); // the report was marked "action taken"
            }}
          />
        </div>
      )}

      <form onSubmit={save} className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-[11rem_1fr]">
        <div>
          <label htmlFor={`report-status-${report.id}`} className="label">
            Report status
          </label>
          <select id={`report-status-${report.id}`} className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(REPORT_STATUS).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`report-note-${report.id}`} className="label">
            Note to the reporter <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <textarea id={`report-note-${report.id}`} rows={2} maxLength={1000} className="input resize-y" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="text-[13px] font-medium text-coral-600 sm:col-span-2">
            {error}
          </p>
        )}
        <div className="sm:col-span-2">
          <button type="submit" disabled={busy} className="btn btn-primary !py-2 text-sm">
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Save and notify reporter
          </button>
        </div>
      </form>
    </li>
  );
}

export default function AdminReports() {
  const [params, setParams] = useSearchParams();
  const status = TABS.some((t) => t.key === params.get('status')) ? params.get('status') : 'open';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const latest = useRef(0);

  const load = useCallback(async () => {
    const id = ++latest.current;
    setLoading(true);
    try {
      const res = await adminApi.reports({ status, limit: 50 });
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

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="inline-flex items-center gap-2.5 text-3xl font-bold">
        <Flag className="h-8 w-8 text-coral-600" aria-hidden="true" />
        Report box
      </h1>
      <p className="mt-1 text-ink-soft">Students reported by other students. Block a student for a few days, remove them, or dismiss the report.</p>

      <div role="tablist" aria-label="Report status" className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={status === t.key}
            onClick={() => setParams(t.key === 'open' ? {} : { status: t.key }, { replace: true })}
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
          <Spinner className="h-7 w-7 text-blue-600" label="Loading reports" />
        </div>
      )}
      {data && data.reports.length === 0 && <p className="mt-4 rounded-xl border border-line bg-white p-8 text-center text-ink-faint">No reports here.</p>}
      {data && data.reports.length > 0 && (
        <ul className={`mt-4 space-y-4 ${loading ? 'opacity-60' : ''}`}>
          {data.reports.map((r) => (
            <ReportCard key={`${r.id}-${r.updatedAt}`} report={r} onChanged={load} />
          ))}
        </ul>
      )}
    </div>
  );
}
