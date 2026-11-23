import { useEffect, useRef, useState } from 'react';
import { Flag, Loader2, X } from 'lucide-react';
import { userApi } from '../api';
import { parseApiError } from '../api/client';
import { REPORT_REASONS } from '../utils/support';

/** "Report this student" window. The report goes to the admins' report box. */
export default function ReportUserDialog({ person, onClose, onSent }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const firstRef = useRef(null);

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose, busy]);

  const submit = async (e) => {
    e.preventDefault();
    const found = {};
    if (!reason) found.reason = 'Choose a reason';
    if (details.trim().length < 10) found.details = 'Please describe what happened (at least 10 characters)';
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const res = await userApi.report(person.id, { reason, details: details.trim() });
      onSent(res.data.message);
    } catch (err) {
      const parsed = parseApiError(err);
      setErrors({ ...parsed.fieldErrors, form: Object.keys(parsed.fieldErrors).length ? '' : parsed.message });
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-ink/40 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <form
        onSubmit={submit}
        noValidate
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="report-title" className="inline-flex items-center gap-2 text-xl font-bold">
              <Flag className="h-5 w-5 text-coral-600" aria-hidden="true" />
              Report {person.name}
            </h2>
            <p className="mt-0.5 text-[13px] text-ink-faint">Only the admins see reports. {person.name} is not told who reported them.</p>
          </div>
          <button type="button" onClick={onClose} disabled={busy} className="rounded-lg p-1.5 text-ink-soft hover:bg-paper" aria-label="Close">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <fieldset className="mt-4">
          <legend className="label">Why are you reporting this student?</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {REPORT_REASONS.map((r, i) => (
              <label
                key={r.value}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
                  reason === r.value ? 'border-coral-600 bg-coral-50' : 'border-line hover:border-coral-100'
                }`}
              >
                <input
                  ref={i === 0 ? firstRef : undefined}
                  type="radio"
                  name="report-reason"
                  value={r.value}
                  checked={reason === r.value}
                  onChange={() => setReason(r.value)}
                  className="h-4 w-4 accent-coral-600"
                />
                {r.label}
              </label>
            ))}
          </div>
          {errors.reason && <p className="mt-1 text-[13px] font-medium text-coral-600">{errors.reason}</p>}
        </fieldset>

        <div className="mt-4">
          <label htmlFor="report-details" className="label">
            What happened?
          </label>
          <textarea
            id="report-details"
            rows={5}
            maxLength={2000}
            className="input"
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Include dates, item names and what was said or done."
            aria-invalid={errors.details ? 'true' : 'false'}
          />
          {errors.details && <p className="mt-1 text-[13px] font-medium text-coral-600">{errors.details}</p>}
        </div>

        {errors.form && (
          <p role="alert" className="mt-3 text-[13px] font-medium text-coral-600">
            {errors.form}
          </p>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-secondary">
            Cancel
          </button>
          <button type="submit" disabled={busy} className="btn btn-danger">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Flag className="h-4 w-4" aria-hidden="true" />}
            Send report to admins
          </button>
        </div>
      </form>
    </div>
  );
}
