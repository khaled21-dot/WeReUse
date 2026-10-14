import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { homeFor } from '../utils/format';

export default function NotFound() {
  const { user } = useAuth();
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 text-center">
      <img src="/logo.png" alt="" width={96} height={96} className="opacity-90" />
      <h1 className="mt-6 text-3xl font-bold">We could not find that page</h1>
      <p className="mt-2 text-ink-soft">The link may be old, or the address may have a typo.</p>
      <Link to={user ? homeFor(user) : '/'} className="btn btn-primary mt-6">
        {user ? 'Back to my account' : 'Back to the home page'}
      </Link>
    </div>
  );
}
