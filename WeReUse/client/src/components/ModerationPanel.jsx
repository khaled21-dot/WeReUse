import { useState } from 'react';
import { Ban, Clock, Loader2, RotateCcw } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { adminApi } from '../api';
import { parseApiError } from '../api/client';
import { formatDateTime } from '../utils/format';
import { ACCOUNT_STATUS } from '../utils/support';

const DAY_CHOICES = [1, 3, 7, 30];

/**
 * Admin tools for one student: block temporarily, remove (ban) or restore.
 * `account` is { id, name, status, suspendedUntil, moderationReason }. onChanged(newAccountFields) after a change.
 * `reportId` (optional) marks that report as handled when the admin acts.
 */
export default function ModerationPanel({ account, reportId, onChanged, compact = false }) {
  const toast = useToast();
  const [mode, setMode] = useState(null); // suspend | ban | null
  const [days, setDays] = useState('7');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const status = ACCOUNT_STATUS[account.status] || ACCOUNT_STATUS.active;

  const send = async (action) => {
    const found = {};
    if (action === 'suspend' && !(Number(days) >= 1 && Number(days) <= 365)) found.days = 'Choose 1 to 365 days';
    if (action !== 'restore' && reason.trim().length < 3) found.reason = 'Give a reason (the student will see it)';
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    try {
      const res = await adminApi.moderate(account.id, {
        action,
        ...(action === 'suspend' ? { days: Number(days) } : {}),
        ...(action !== 'restore' ? { reason: reason.trim() } : {}),
        ...(reportId ? { reportId } : {}),
      });
      toast.success(res.data.message);
      setMode(null);
      setReason('');
      onChanged(res.data.data.user);
    } catch (err) {
      const parsed = parseApiError(err);
      setErrors({ ...parsed.fieldErrors, form: Object.keys(parsed.fieldErrors).length ? '' : parsed.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={compact ? '' : 'rounded-xl border border-line bg-white p-4'}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${status.badge}`}>{status.label}</span>
        {account.status === 'suspended' && account.suspendedUntil && <span className="text-sm text-ink-soft">until {formatDateTime(account.suspendedUntil)}</span>}
        {account.status !== 'active' && account.moderationReason && <span className="text-sm text-ink-soft">· {account.moderationReason}</span>}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {account.status !== 'active' && (
          <button type="button" onClick={() => send('restore')} disabled={busy} className="btn btn-success !py-1.5 text-sm">
            {busy && !mode ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RotateCcw className="h-4 w-4" aria-hidden="true" />}
            Restore account
          </button>
        )}
        {account.status !== 'banned' && (
          <button type="button" onClick={() => setMode(mode === 'suspend' ? null : 'suspend')} aria-expanded={mode === 'suspend'} className="btn btn-secondary !py-1.5 text-sm">
            <Clock className="h-4 w-4" aria-hidden="true" />
            {account.status === 'suspended' ? 'Change block' : 'Block temporarily'}
          </button>
        )}
        {account.status !== 'banned' && (
          <button type="button" onClick={() => setMode(mode === 'ban' ? null : 'ban')} aria-expanded={mode === 'ban'} className="btn btn-ghost !py-1.5 text-sm !text-coral-600">
            <Ban className="h-4 w-4" aria-hidden="true" />
            Remove user
          </button>
        )}
      </div>

      {mode && (
        <div className={`mt-3 rounded-lg border p-3.5 ${mode === 'ban' ? 'border-coral-100 bg-coral-50' : 'border-amber-100 bg-amber-50'}`}>
          <p className="text-sm font-semibold">
            {mode === 'ban'
              ? `Remove ${account.name}? They cannot log in any more and their items are hidden. You can restore the account later.`
              : `Block ${account.name} for a while. They are logged out and cannot log in until the block ends.`}
          </p>
          {mode === 'suspend' && (
            <fieldset className="mt-3">
              <legend className="label">How long?</legend>
              <div className="flex flex-wrap items-center gap-2">
                {DAY_CHOICES.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDays(String(d))}
                    aria-pressed={days === String(d)}
                    className={`rounded-full px-3 py-1 text-sm font-semibold ${days === String(d) ? 'bg-ink text-white' : 'border border-line bg-white text-ink-soft'}`}
                  >
                    {d} day{d === 1 ? '' : 's'}
                  </button>
                ))}
                <label className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
                  or
                  <input
                    inputMode="numeric"
                    className="input !w-20 !py-1"
                    value={days}
                    onChange={(e) => setDays(e.target.value.replace(/\D/g, '').slice(0, 3))}
                    aria-label="Number of days"
                    aria-invalid={errors.days ? 'true' : 'false'}
                  />
                  days
                </label>
              </div>
              {errors.days && <p className="mt-1 text-[13px] font-medium text-coral-600">{errors.days}</p>}
            </fieldset>
          )}
          <div className="mt-3">
            <label htmlFor={`mod-reason-${account.id}`} className="label">
              Reason <span className="font-normal text-ink-faint">(shown to the student)</span>
            </label>
            <input
              id={`mod-reason-${account.id}`}
              className="input"
              maxLength={300}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={mode === 'ban' ? 'e.g. Repeated scams' : 'e.g. Scam report under review'}
              aria-invalid={errors.reason ? 'true' : 'false'}
            />
            {errors.reason && <p className="mt-1 text-[13px] font-medium text-coral-600">{errors.reason}</p>}
          </div>
          {errors.form && (
            <p role="alert" className="mt-2 text-[13px] font-medium text-coral-600">
              {errors.form}
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => send(mode)} disabled={busy} className={`btn !py-1.5 text-sm ${mode === 'ban' ? 'btn-danger' : 'btn-primary'}`}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {mode === 'ban' ? 'Remove user' : `Block for ${days || '?'} day${days === '1' ? '' : 's'}`}
            </button>
            <button type="button" onClick={() => setMode(null)} disabled={busy} className="btn btn-secondary !py-1.5 text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
