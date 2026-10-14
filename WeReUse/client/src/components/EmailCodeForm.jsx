import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import TextField from './TextField';
import Alert from './Alert';
import { parseApiError } from '../api/client';
import { validateCode } from '../utils/validators';
import { maskEmail } from '../utils/format';

/**
 * "Enter the 6-digit code we e-mailed you" - used for registration and for changing the e-mail.
 *  onVerify(code) -> Promise   (throw / reject to show an error)
 *  onResend()     -> Promise<number | undefined>   (seconds until the next resend is allowed)
 */
export default function EmailCodeForm({
  email,
  expiresInMinutes = 10,
  initialCooldown = 0,
  submitLabel = 'Verify email',
  onVerify,
  onResend,
  onBack,
  backLabel = 'Use a different email',
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [seconds, setSeconds] = useState(initialCooldown);

  // count the resend cooldown down, one second at a time
  useEffect(() => {
    if (seconds <= 0) return undefined;
    const timer = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setNotice('');
    const message = validateCode(code);
    if (message) {
      setError(message);
      return;
    }
    setError('');
    setBusy(true);
    try {
      await onVerify(code.trim());
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.fieldErrors.code || parsed.message);
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (seconds > 0 || resending) return;
    setError('');
    setNotice('');
    setResending(true);
    try {
      const wait = await onResend();
      setNotice('A new code is on its way. Check your inbox and your spam folder.');
      setCode('');
      setSeconds(typeof wait === 'number' ? wait : 60);
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.message);
      const match = /(\d+) seconds/.exec(parsed.message);
      if (parsed.status === 429 && match) setSeconds(Number(match[1]));
    } finally {
      setResending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <p className="text-ink-soft">
        We sent a 6-digit code to <strong className="text-ink">{maskEmail(email)}</strong>. It expires in {expiresInMinutes}{' '}
        minutes. If you cannot see it, check your spam folder.
      </p>

      {notice && <Alert variant="success">{notice}</Alert>}

      <TextField
        id="verification-code"
        name="code"
        label="Verification code"
        value={code}
        onChange={(e) => {
          setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
          if (error) setError('');
        }}
        error={error}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        placeholder="123456"
        inputClassName="text-center font-display text-2xl font-bold tracking-[0.4em]"
      />

      <button type="submit" disabled={busy} className="btn btn-primary w-full py-3 text-base">
        {busy ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Checking...
          </>
        ) : (
          submitLabel
        )}
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <button
          type="button"
          onClick={resend}
          disabled={seconds > 0 || resending}
          className="font-semibold text-blue-600 hover:underline disabled:cursor-not-allowed disabled:text-ink-faint disabled:no-underline"
        >
          {seconds > 0 ? `Resend code in ${seconds}s` : resending ? 'Sending...' : 'Resend code'}
        </button>
        {onBack && (
          <button type="button" onClick={onBack} className="font-semibold text-ink-soft hover:underline">
            {backLabel}
          </button>
        )}
      </div>
    </form>
  );
}
