import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, Loader2, Lock, Mail, Trash2 } from 'lucide-react';
import Alert from '../components/Alert';
import AdminBadge from '../components/AdminBadge';
import Avatar from '../components/chat/Avatar';
import EmailCodeForm from '../components/EmailCodeForm';
import PasswordField from '../components/PasswordField';
import PasswordStrength from '../components/PasswordStrength';
import PrivateImage from '../components/PrivateImage';
import TextField from '../components/TextField';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { profileApi } from '../api';
import { parseApiError } from '../api/client';
import { formatDate } from '../utils/format';
import {
  validateConfirmPassword,
  validateEmail,
  validateName,
  validatePassword,
  validatePhone,
} from '../utils/validators';

/** Verified students and admins can edit their profile - except the registration number and the ID card photo. */
export default function Profile() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';

  if (!isAdmin && user.verificationStatus !== 'verified') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
        <h1 className="text-3xl font-bold">Your profile</h1>
        <div className="mt-6">
          <PhotoCard user={user} />
        </div>
        <Alert variant="info" title="Editing your other details unlocks after verification" className="mt-6">
          Your ID card has to be approved first. You can check the progress on your dashboard.
        </Alert>
        <Link to="/dashboard" className="btn btn-primary mt-6">
          Go to my dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold sm:text-4xl">Your profile</h1>
          {isAdmin && <AdminBadge badge={user.adminBadge} />}
        </div>
        <p className="mt-1 text-ink-soft">Keep your details up to date. Your registration number and ID card photo are fixed.</p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <PhotoCard user={user} />
          <DetailsForm user={user} />
          <EmailSection user={user} />
          <PasswordForm />
        </div>
        <LockedDetails user={user} />
      </div>
    </div>
  );
}

function Card({ title, id, children }) {
  return (
    <section className="rounded-xl border border-line bg-white p-6" aria-labelledby={id}>
      <h2 id={id} className="text-xl font-bold">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

const PHOTO_MAX_MB = 5;
const PHOTO_SIZE = 512; // the photo is cropped to a square of this many pixels before uploading

/**
 * Crops the chosen image to a centred square and shrinks it, so every avatar is small and looks the same
 * everywhere. Browsers apply the phone's EXIF rotation when drawing, so sideways photos come out upright.
 * Falls back to the original file if the browser cannot do it.
 */
async function squarePhoto(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const out = Math.min(PHOTO_SIZE, side);
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out);
    bitmap.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    return blob ? new File([blob], 'avatar.jpg', { type: 'image/jpeg' }) : file;
  } catch {
    return file;
  }
}

/** Profile photo: upload, change or remove it. It is the avatar shown in the navbar, chats and listings. */
function PhotoCard({ user }) {
  const { setUser } = useAuth();
  const toast = useToast();
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null); // blob: URL while uploading
  const [busy, setBusy] = useState(''); // '' | 'upload' | 'remove'
  const [error, setError] = useState('');

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const choose = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // choosing the same file again should work too
    if (!file) return;
    setError('');
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      setError('Choose a JPG or PNG image.');
      return;
    }
    if (file.size > PHOTO_MAX_MB * 1024 * 1024) {
      setError(`The photo must be smaller than ${PHOTO_MAX_MB} MB.`);
      return;
    }

    setBusy('upload');
    const ready = await squarePhoto(file);
    setPreview(URL.createObjectURL(ready));
    try {
      const res = await profileApi.uploadAvatar(ready);
      setUser(res.data.data.user);
      toast.success('Your profile photo was updated.');
    } catch (err) {
      const parsed = parseApiError(err);
      setError(parsed.fieldErrors.avatar || parsed.message);
    } finally {
      setPreview(null);
      setBusy('');
    }
  };

  const remove = async () => {
    setError('');
    setBusy('remove');
    try {
      const res = await profileApi.removeAvatar();
      setUser(res.data.data.user);
      toast.success('Your profile photo was removed.');
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setBusy('');
    }
  };

  return (
    <Card title="Profile photo" id="photo-title">
      <div className="flex flex-wrap items-center gap-5">
        <div className="relative">
          <Avatar name={user.name} src={preview || user.avatar} size="xl" tone="dark" />
          {busy === 'upload' && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-white/60">
              <Loader2 className="h-6 w-6 animate-spin text-blue-700" aria-hidden="true" />
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-soft">
            Your photo is shown next to your name in chats, on your listings and in the menu bar. JPG or PNG, up to {PHOTO_MAX_MB} MB.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <input
              ref={inputRef}
              id="avatar-input"
              type="file"
              accept="image/jpeg,image/png"
              className="sr-only"
              onChange={choose}
              aria-label="Choose a profile photo"
            />
            <button type="button" onClick={() => inputRef.current?.click()} disabled={Boolean(busy)} className="btn btn-primary">
              <Camera className="h-5 w-5" aria-hidden="true" />
              {user.avatar ? 'Change photo' : 'Upload photo'}
            </button>
            {user.avatar && (
              <button type="button" onClick={remove} disabled={Boolean(busy)} className="btn btn-secondary">
                {busy === 'remove' ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Trash2 className="h-5 w-5" aria-hidden="true" />}
                Remove
              </button>
            )}
          </div>
          {error && (
            <p className="mt-2 text-sm font-semibold text-coral-800" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function DetailsForm({ user }) {
  const { setUser } = useAuth();
  const toast = useToast();
  const isAdmin = user.role === 'admin';

  const [values, setValues] = useState({
    name: user.name || '',
    department: user.department || '',
    batch: user.batch || '',
    phone: user.phone || '',
  });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const change = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    if (errors[key]) setErrors((er) => ({ ...er, [key]: '' }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setFormError('');

    const found = {};
    const nameError = validateName(values.name);
    if (nameError) found.name = nameError;
    if (isAdmin) {
      const phoneError = validatePhone(values.phone);
      if (phoneError) found.phone = phoneError;
    } else {
      if (values.department.trim().length > 80) found.department = 'Department is too long';
      if (values.batch.trim().length > 20) found.batch = 'Batch is too long';
    }
    setErrors(found);
    if (Object.keys(found).length) return;

    // send only what actually changed
    const next = isAdmin
      ? { name: values.name.trim(), phone: values.phone.trim() }
      : { name: values.name.trim(), department: values.department.trim(), batch: values.batch.trim() };
    const current = isAdmin
      ? { name: user.name, phone: user.phone }
      : { name: user.name, department: user.department || '', batch: user.batch || '' };
    const changes = Object.fromEntries(Object.entries(next).filter(([key, value]) => value !== current[key]));
    if (Object.keys(changes).length === 0) {
      toast.info('There is nothing to save yet.');
      return;
    }

    setBusy(true);
    try {
      const res = await profileApi.update(changes);
      setUser(res.data.data.user);
      toast.success('Your profile was updated.');
    } catch (err) {
      const parsed = parseApiError(err);
      if (Object.keys(parsed.fieldErrors).length) setErrors(parsed.fieldErrors);
      else setFormError(parsed.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Personal details" id="details-title">
      <form onSubmit={submit} noValidate className="grid gap-5 sm:grid-cols-2">
        {formError && (
          <Alert variant="error" className="sm:col-span-2">
            {formError}
          </Alert>
        )}
        <TextField
          id="profile-name"
          name="name"
          label="Full name"
          className="sm:col-span-2"
          value={values.name}
          onChange={change('name')}
          error={errors.name}
          autoComplete="name"
        />
        {isAdmin ? (
          <TextField
            id="profile-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            label="Phone number"
            className="sm:col-span-2"
            value={values.phone}
            onChange={change('phone')}
            error={errors.phone}
            hint="A Bangladeshi mobile number, for example 01712345678."
            autoComplete="tel"
          />
        ) : (
          <>
            <TextField
              id="profile-department"
              name="department"
              label="Department"
              optional
              value={values.department}
              onChange={change('department')}
              error={errors.department}
              autoComplete="off"
            />
            <TextField
              id="profile-batch"
              name="batch"
              label="Batch"
              optional
              value={values.batch}
              onChange={change('batch')}
              error={errors.batch}
              autoComplete="off"
            />
          </>
        )}
        <div className="sm:col-span-2">
          <button type="submit" disabled={busy} className="btn btn-primary">
            {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
            Save changes
          </button>
        </div>
      </form>
    </Card>
  );
}

function EmailSection({ user }) {
  const { setUser } = useAuth();
  const toast = useToast();

  // 'view' -> 'form' (new address + password) -> 'code' (enter the code sent to the new address)
  const [step, setStep] = useState(user.pendingEmail ? 'code' : 'view');
  const [pending, setPending] = useState(
    user.pendingEmail ? { email: user.pendingEmail, expiresInMinutes: 10, resendAfterSeconds: 0 } : null
  );
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setStep('view');
    setPending(null);
    setNewEmail('');
    setPassword('');
    setErrors({});
    setFormError('');
  };

  const requestCode = async (e) => {
    e.preventDefault();
    if (busy) return;
    setFormError('');
    const found = {};
    const emailError = validateEmail(newEmail);
    if (emailError) found.newEmail = emailError;
    if (!password) found.password = 'Enter your current password to confirm it is you';
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      const res = await profileApi.requestEmailChange({ newEmail: newEmail.trim(), password });
      const info = res.data.data;
      setPending({ email: info.pendingEmail, expiresInMinutes: info.expiresInMinutes, resendAfterSeconds: info.resendAfterSeconds });
      setPassword('');
      setStep('code');
    } catch (err) {
      const parsed = parseApiError(err);
      if (Object.keys(parsed.fieldErrors).length) setErrors(parsed.fieldErrors);
      else setFormError(parsed.message);
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    try {
      await profileApi.cancelEmailChange();
    } catch {
      /* the pending change simply expires on its own */
    }
    reset();
  };

  return (
    <Card title="Email address" id="email-title">
      {step === 'view' && (
        <>
          <p className="flex flex-wrap items-center gap-2">
            <Mail className="h-5 w-5 text-ink-faint" aria-hidden="true" />
            <span className="break-all font-semibold">{user.email}</span>
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            {user.emailVerifiedAt
              ? `Verified on ${formatDate(user.emailVerifiedAt)}.`
              : 'This is the address you log in with.'}
          </p>
          <button type="button" onClick={() => setStep('form')} className="btn btn-secondary mt-4">
            Change email
          </button>
        </>
      )}

      {step === 'form' && (
        <form onSubmit={requestCode} noValidate className="space-y-5">
          <p className="text-sm text-ink-soft">
            We will send a code to the new address. Your email only changes after you enter it.
          </p>
          {formError && <Alert variant="error">{formError}</Alert>}
          <TextField
            id="new-email"
            name="newEmail"
            type="email"
            inputMode="email"
            label="New email address"
            value={newEmail}
            onChange={(e) => {
              setNewEmail(e.target.value);
              if (errors.newEmail) setErrors((er) => ({ ...er, newEmail: '' }));
            }}
            error={errors.newEmail}
            autoComplete="email"
          />
          <PasswordField
            id="email-change-password"
            name="password"
            label="Your current password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password) setErrors((er) => ({ ...er, password: '' }));
            }}
            error={errors.password}
            autoComplete="current-password"
          />
          <div className="flex gap-3">
            <button type="submit" disabled={busy} className="btn btn-primary">
              {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
              Send code
            </button>
            <button type="button" onClick={reset} disabled={busy} className="btn btn-secondary">
              Cancel
            </button>
          </div>
        </form>
      )}

      {step === 'code' && pending && (
        <EmailCodeForm
          email={pending.email}
          expiresInMinutes={pending.expiresInMinutes}
          initialCooldown={pending.resendAfterSeconds}
          submitLabel="Confirm new email"
          onVerify={async (code) => {
            const res = await profileApi.confirmEmailChange(code);
            setUser(res.data.data.user);
            toast.success('Your email address was updated.');
            reset();
          }}
          onResend={async () => {
            const res = await profileApi.resendEmailChange();
            return res.data.data?.resendAfterSeconds;
          }}
          onBack={cancel}
          backLabel="Cancel the change"
        />
      )}
    </Card>
  );
}

function PasswordForm() {
  const toast = useToast();
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const change = (key) => (e) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    if (errors[key]) setErrors((er) => ({ ...er, [key]: '' }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setFormError('');

    const found = {};
    if (!values.currentPassword) found.currentPassword = 'Current password is required';
    const newError = validatePassword(values.newPassword);
    if (newError) found.newPassword = newError;
    else if (values.newPassword === values.currentPassword) found.newPassword = 'Choose a password that is different from your current one';
    const confirmError = validateConfirmPassword(values.confirmPassword, values.newPassword);
    if (confirmError) found.confirmPassword = confirmError;
    setErrors(found);
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      await profileApi.changePassword(values);
      setValues({ currentPassword: '', newPassword: '', confirmPassword: '' });
      toast.success('Password changed. Your other devices were logged out.');
    } catch (err) {
      const parsed = parseApiError(err);
      if (Object.keys(parsed.fieldErrors).length) setErrors(parsed.fieldErrors);
      else setFormError(parsed.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Password" id="password-title">
      <form onSubmit={submit} noValidate className="space-y-5">
        {formError && <Alert variant="error">{formError}</Alert>}
        <PasswordField
          id="current-password"
          name="currentPassword"
          label="Current password"
          value={values.currentPassword}
          onChange={change('currentPassword')}
          error={errors.currentPassword}
          autoComplete="current-password"
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <PasswordField
            id="new-password"
            name="newPassword"
            label="New password"
            value={values.newPassword}
            onChange={change('newPassword')}
            error={errors.newPassword}
            hint="At least 8 characters with a letter and a number."
            autoComplete="new-password"
            below={<PasswordStrength value={values.newPassword} />}
          />
          <PasswordField
            id="confirm-new-password"
            name="confirmPassword"
            label="Confirm new password"
            value={values.confirmPassword}
            onChange={change('confirmPassword')}
            error={errors.confirmPassword}
            autoComplete="new-password"
          />
        </div>
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
          Change password
        </button>
      </form>
    </Card>
  );
}

/** Read-only: these two were checked by an admin and cannot be edited by anyone. */
function LockedDetails({ user }) {
  const isAdmin = user.role === 'admin';
  return (
    <aside className="h-fit rounded-xl border border-line bg-white p-6" aria-labelledby="locked-title">
      <h2 id="locked-title" className="flex items-center gap-2 text-xl font-bold">
        <Lock className="h-5 w-5 text-ink-faint" aria-hidden="true" />
        Cannot be changed
      </h2>
      <p className="mt-2 text-sm text-ink-soft">
        An admin checked these when you joined, so nobody can edit them. If one is wrong, contact an admin.
      </p>

      <dl className="mt-5">
        <dt className="text-[13px] text-ink-faint">University registration number</dt>
        <dd className="break-all text-lg font-semibold tabular-nums tracking-wide">{user.universityRegNumber}</dd>
      </dl>

      {user.hasIdCard && (
        <div className="mt-5">
          <p className="mb-2 text-[13px] text-ink-faint">University ID card photo</p>
          <PrivateImage
            userId={user.id}
            kind={isAdmin ? 'admin' : 'student'}
            version={user.updatedAt}
            alt="Your university ID card"
            className="h-44 w-full rounded-lg border border-line"
            zoomable
          />
        </div>
      )}
    </aside>
  );
}
