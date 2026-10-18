import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, X } from 'lucide-react';
import Logo from './Logo';
import NotificationBell from './NotificationBell';
import AdminBadge from './AdminBadge';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { homeFor, initials } from '../utils/format';

const linkClass = ({ isActive }) =>
  `rounded-lg px-3 py-2 text-[15px] font-semibold transition-colors ${
    isActive ? 'bg-blue-50 text-blue-700' : 'text-ink-soft hover:bg-blue-50 hover:text-ink'
  }`;

export default function Navbar() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      /* the cookie may already be gone - the user is logged out locally either way */
    }
    toast.info('You have been logged out.');
    navigate('/', { replace: true });
  };

  const isAdmin = user?.role === 'admin';
  const homeLabel = isAdmin ? 'Verification queue' : 'My dashboard';
  const canEditProfile = isAdmin || user?.verificationStatus === 'verified'; // verified students and admins only

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo size={38} />

        {/* desktop */}
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {user ? (
            <>
              <NavLink to={homeFor(user)} end className={linkClass}>
                {homeLabel}
              </NavLink>
              {isAdmin && (
                <NavLink to="/admin/categories" className={linkClass}>
                  Categories
                </NavLink>
              )}
              {!isAdmin && (
                <NavLink to="/categories" className={linkClass}>
                  Categories
                </NavLink>
              )}
              {canEditProfile && (
                <NavLink to="/profile" className={linkClass}>
                  My profile
                </NavLink>
              )}
              {/* only students get in-app notifications */}
              {!isAdmin && <NotificationBell refreshKey={user.verificationStatus} />}
              <span
                className={`ml-2 flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold ${
                  isAdmin ? 'bg-gold-400 text-gold-900 ring-2 ring-gold-600' : 'bg-blue-800 text-white'
                }`}
                title={user.name}
                aria-hidden="true"
              >
                {initials(user.name)}
              </span>
              {isAdmin && <AdminBadge badge={user.adminBadge} size="sm" className="ml-2" />}
              <button type="button" onClick={handleLogout} className="btn btn-ghost !px-3 !py-2">
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Log out
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className={linkClass}>
                Log in
              </NavLink>
              <NavLink to="/register" className="btn btn-primary ml-1">
                Create account
              </NavLink>
            </>
          )}
        </nav>

        {/* mobile */}
        <div className="flex items-center gap-1 md:hidden">
          {user && !isAdmin && <NotificationBell refreshKey={user.verificationStatus} />}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="rounded-lg p-2 text-ink hover:bg-blue-50"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {open && (
        <nav className="border-t border-line bg-white px-4 py-3 md:hidden" aria-label="Mobile">
          <div className="flex flex-col gap-1">
            {user ? (
              <>
                <p className="flex flex-wrap items-center gap-2 px-3 py-1 text-sm text-ink-faint">
                  Signed in as {user.name}
                  {isAdmin && <AdminBadge badge={user.adminBadge} size="sm" />}
                </p>
                <NavLink to={homeFor(user)} end className={linkClass}>
                  {homeLabel}
                </NavLink>
                {isAdmin && (
                  <NavLink to="/admin/categories" className={linkClass}>
                    Categories
                  </NavLink>
                )}
                {!isAdmin && (
                  <NavLink to="/categories" className={linkClass}>
                    Categories
                  </NavLink>
                )}
                {canEditProfile && (
                  <NavLink to="/profile" className={linkClass}>
                    My profile
                  </NavLink>
                )}
                <button type="button" onClick={handleLogout} className="btn btn-secondary mt-2">
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Log out
                </button>
              </>
            ) : (
              <>
                <NavLink to="/login" className={linkClass}>
                  Log in
                </NavLink>
                <NavLink to="/register" className="btn btn-primary mt-2">
                  Create account
                </NavLink>
              </>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}