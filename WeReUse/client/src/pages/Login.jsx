import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AuthLayout from '../components/AuthLayout';
import TextField from '../components/TextField';
import PasswordField from '../components/PasswordField';
import Alert from '../components/Alert';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { parseApiError } from '../api/client';
import { validateEmail } from '../utils/validators';
import { firstName } from '../utils/format';

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    setFormError('');

    const found = {};
    const emailError = validateEmail(email);
    if (emailError) found.email = emailError;
    if (!password) found.password = 'Password is required';
    setErrors(found);
    if (Object.keys(found).length) {
      document.getElementById(found.email ? 'email' : 'password')?.focus();
      return;
    }

    setSubmitting(true);
    try {
      // On success the user becomes logged in and <GuestRoute> redirects to the right page.
      const user = await login(email.trim(), password);
      toast.success(`Welcome back, ${firstName(user.name)}.`);
    } catch (err) {
      const parsed = parseApiError(err);
      setFormError(parsed.message);
      if (parsed.fieldErrors && Object.keys(parsed.fieldErrors).length) setErrors(parsed.fieldErrors);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to check your verification status and manage your account."
      footer={
        <>
          New to WeReUse?{' '}
          <Link to="/register" className="font-semibold text-blue-600 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {formError && <Alert variant="error">{formError}</Alert>}

        <TextField
          id="email"
          name="email"
          type="email"
          inputMode="email"
          label="Email address"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (errors.email) setErrors((er) => ({ ...er, email: '' }));
          }}
          error={errors.email}
          autoComplete="username"
        />

        <PasswordField
          id="password"
          name="password"
          label="Password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            if (errors.password) setErrors((er) => ({ ...er, password: '' }));
          }}
          error={errors.password}
          autoComplete="current-password"
        />

        <button type="submit" disabled={submitting} className="btn btn-primary w-full py-3 text-base">
          {submitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              Logging in...
            </>
          ) : (
            'Log in'
          )}
        </button>
      </form>
    </AuthLayout>
  );
}
