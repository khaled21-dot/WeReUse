import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { FullPageSpinner } from './Spinner';
import { homeFor } from '../utils/format';

/** Only logged-in users (optionally only certain roles) may see the page. */
export function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />;
  return children;
}

/** Login / register pages: logged-in users are sent to their own home instead. */
export function GuestRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (user) {
    // After logging in, go back to the page the visitor originally asked for (if any)
    const from = location.state?.from;
    const target = from?.pathname && !['/login', '/register'].includes(from.pathname) ? from : homeFor(user);
    return <Navigate to={target} replace />;
  }
  return children;
}
