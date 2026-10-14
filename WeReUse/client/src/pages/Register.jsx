import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Lock } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import TextField from '../components/TextField';
import PasswordField from '../components/PasswordField';
import PasswordStrength from '../components/PasswordStrength';
import FileDropzone from '../components/FileDropzone';
import EmailCodeForm from '../components/EmailCodeForm';
import Alert from '../components/Alert';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { parseApiError } from '../api/client';
import {
  validateName,
  validateEmail,
  validatePassword,
  validateConfirmPassword,
  validateRegNumber,
  validateRegisterForm,
} from '../utils/validators';

const INITIAL = {
  name: '',
  email: '',
  universityRegNumber: '',
  department: '',
  batch: '',
  password: '',
  confirmPassword: '',
};

// The waiting registration survives a page refresh (it lives on the server for an hour)
const PENDING_KEY = 'wereuse.pendingEmail';
const readPending = () => {
  try {
    const email = sessionStorage.getItem(PENDING_KEY);
    return email ? { email, expiresInMinutes: 10, resendAfterSeconds: 0 } : null;
  } catch {
    return null;
  }
};
const savePending = (email) => {
  try {
    if (email) sessionStorage.setItem(PENDING_KEY, email);
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* sessionStorage can be unavailable (private mode) - the flow still works without it */
  }
};

const FIELD_ORDER = ['name', 'email', 'universityRegNumber', 'department', 'batch', 'password', 'confirmPassword', 'idCard'];

// Validators used when a field loses focus
const ON_BLUR = {
  name: (v) => validateName(v.name),
  email: (v) => validateEmail(v.email),
  universityRegNumber: (v) => validateRegNumber(v.universityRegNumber),
  password: (v) => validatePassword(v.password),
  confirmPassword: (v) => validateConfirmPassword(v.confirmPassword, v.password),
};

export default function Register() {
  const { register, verifyEmail, resendCode } = useAuth();
  const toast = useToast();

  const [values, setValues] = useState(INITIAL);
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pending, setPending] = useState(readPending); // set once the code has been e-mailed

  const setError = (name, message) =>
    setErrors((current) => {
      const next = { ...current };
      if (message) next[name] = message;
      else delete next[name];
      return next;
    });

  const onChange = (name) => (e) => {
    const value = e.target.value;
    setValues((v) => ({ ...v, [name]: value }));
    if (errors[name]) setError(name, '');
    // keep "confirm password" in sync while the password is being edited
    if (name === 'password' && values.confirmPassword) {
      setError('confirmPassword', validateConfirmPassword(values.confirmPassword, value));
    }
  };

  const onBlur = (name) => () => {
    if (ON_BLUR[name]) setError(name, ON_BLUR[name](values));
  };

  const focusFirstError = (errs) => {
    const key = FIELD_ORDER.find((k) => errs[k]);
    if (!key) return;
    const el = document.getElementById(key === 'idCard' ? 'idCard-dropzone' : key);
    el?.focus?.();
    el?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setFormError('');

    const found = validateRegisterForm(values, file);
    setErrors(found);
    if (Object.keys(found).length) {
      setFormError('Please fix the highlighted fields.');
      focusFirstError(found);
      return;
    }

    const body = new FormData();
    body.append('name', values.name.trim());
    body.append('email', values.email.trim());
    body.append('universityRegNumber', values.universityRegNumber.trim());
    body.append('department', values.department.trim());
    body.append('batch', values.batch.trim());
    body.append('password', values.password);
    body.append('confirmPassword', values.confirmPassword);
    body.append('idCard', file);

    setSubmitting(true);
    try {
      // Step 1: the details are checked and a 6-digit code is e-mailed. No account exists yet.
      const info = await register(body);
      savePending(info.email);
      setPending(info);
      toast.info('We sent you a verification code.');
    } catch (err) {
      const parsed = parseApiError(err);
      if (Object.keys(parsed.fieldErrors).length) {
        setErrors(parsed.fieldErrors);
        setFormError(parsed.status === 409 ? parsed.message : 'Please fix the highlighted fields.');
        focusFirstError(parsed.fieldErrors);
      } else {
        setFormError(parsed.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ----- step 2: enter the code -----
  if (pending) {
    const startOver = () => {
      savePending(null);
      setPending(null);
    };
    return (
      <AuthLayout
        title="Check your email"
        subtitle="One more step: confirm that this email address is really yours."
        footer="Your account is only created after the code is confirmed."
      >
        <EmailCodeForm
          email={pending.email}
          expiresInMinutes={pending.expiresInMinutes}
          initialCooldown={pending.resendAfterSeconds}
          submitLabel="Verify email and create account"
          onVerify={async (code) => {
            // On success the student is logged in and <GuestRoute> sends them to the dashboard.
            await verifyEmail(pending.email, code);
            savePending(null);
            toast.success('Email verified. Your ID card is now with the admin team.');
          }}
          onResend={() => resendCode(pending.email)}
          onBack={startOver}
          backLabel="Wrong email? Start over"
        />
      </AuthLayout>
    );
  }

  // ----- step 1: the form -----
  return (
    <AuthLayout
      title="Create your WeReUse account"
      subtitle="Use your real details. An admin checks your ID card before you can post or chat."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-blue-600 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="grid gap-5 sm:grid-cols-2">
        {formError && (
          <Alert variant="error" className="sm:col-span-2">
            {formError}
          </Alert>
        )}

        <TextField
          id="name"
          name="name"
          label="Full name"
          className="sm:col-span-2"
          value={values.name}
          onChange={onChange('name')}
          onBlur={onBlur('name')}
          error={errors.name}
          autoComplete="name"
          placeholder="As written on your ID card"
        />

        <TextField
          id="email"
          name="email"
          type="email"
          inputMode="email"
          label="Email address"
          className="sm:col-span-2"
          value={values.email}
          onChange={onChange('email')}
          onBlur={onBlur('email')}
          error={errors.email}
          hint="Any email you check regularly. It does not have to be a university address."
          autoComplete="email"
        />

        <TextField
          id="universityRegNumber"
          name="universityRegNumber"
          label="University registration number"
          className="sm:col-span-2"
          value={values.universityRegNumber}
          onChange={onChange('universityRegNumber')}
          onBlur={onBlur('universityRegNumber')}
          error={errors.universityRegNumber}
          hint="Exactly as printed on your ID card, for example 241-35-032."
          autoCapitalize="characters"
          spellCheck={false}
          autoComplete="off"
        />

        <TextField
          id="department"
          name="department"
          label="Department"
          optional
          value={values.department}
          onChange={onChange('department')}
          error={errors.department}
          placeholder="Software Engineering"
          autoComplete="off"
        />

        <TextField
          id="batch"
          name="batch"
          label="Batch"
          optional
          value={values.batch}
          onChange={onChange('batch')}
          error={errors.batch}
          placeholder="42"
          autoComplete="off"
        />

        <PasswordField
          id="password"
          name="password"
          label="Password"
          value={values.password}
          onChange={onChange('password')}
          onBlur={onBlur('password')}
          error={errors.password}
          hint="At least 8 characters with a letter and a number."
          autoComplete="new-password"
          below={<PasswordStrength value={values.password} />}
        />

        <PasswordField
          id="confirmPassword"
          name="confirmPassword"
          label="Confirm password"
          value={values.confirmPassword}
          onChange={onChange('confirmPassword')}
          onBlur={onBlur('confirmPassword')}
          error={errors.confirmPassword}
          autoComplete="new-password"
        />

        <div className="sm:col-span-2">
          <FileDropzone
            id="idCard"
            label="University ID card photo"
            hint="A clear photo of the front of your card. JPG or PNG, up to 5 MB."
            file={file}
            error={errors.idCard}
            onSelect={(f) => {
              setFile(f);
              setError('idCard', '');
            }}
            onReject={(message) => {
              setFile(null);
              setError('idCard', message);
            }}
            onClear={() => setFile(null)}
          />
          <p className="mt-2 flex items-start gap-1.5 text-[13px] text-ink-soft">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Only you and the admin team can see this image. Other students never can.
          </p>
        </div>

        <div className="sm:col-span-2">
          <button type="submit" disabled={submitting} className="btn btn-primary w-full py-3 text-base">
            {submitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                Creating your account...
              </>
            ) : (
              'Create account'
            )}
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}
