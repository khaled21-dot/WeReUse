import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Menu, X } from 'lucide-react';
import Logo from './Logo';
import NotificationBell from './NotificationBell';
import AdminBadge from './AdminBadge';
import Avatar from './chat/Avatar';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useRealtime } from '../context/RealtimeContext';
import { homeFor } from '../utils/format';

// The Messages link with a count of unread messages
function MessagesLink({ className }) {
  const { unread } = useRealtime();
  return (
    <NavLink to="/messages" className={className}>
      Messages
      {unread > 0 && (
        <span className="ml-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-bold text-white">
          <span aria-hidden="true">{unread > 9 ? '9+' : unread}</span>
          <span className="sr-only">{unread} unread</span>
        </span>
      )}
    </NavLink>
  );
}

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
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Logo size={38} />

        {/* desktop */}
        <nav className="hidden items-center gap-0.5 xl:flex" aria-label="Main">
          {user ? (
            <>
              <NavLink to={homeFor(user)} end className={linkClass}>
                {homeLabel}
              </NavLink>
              <NavLink to="/listings" end className={linkClass}>
                Browse
              </NavLink>
              {!isAdmin && (
                <NavLink to="/listings/mine" className={linkClass}>
                  My listings
                </NavLink>
              )}
              {!isAdmin && <MessagesLink className={linkClass} />}
              {isAdmin && (
                <NavLink to="/admin/categories" className={linkClass}>
                  Categories
                </NavLink>
              )}
              {isAdmin && (
                <NavLink to="/admin/complaints" className={linkClass}>
                  Complaints
                </NavLink>
              )}
              {isAdmin && (
                <NavLink to="/admin/reports" className={linkClass}>
                  Reports
                </NavLink>
              )}
              {!isAdmin && (
                <NavLink to="/categories" className={linkClass}>
                  Categories
                </NavLink>
              )}
              {!isAdmin && (
                <NavLink to="/support" className={linkClass} title="Complaint box: report a scam or a problem">
                  Help
                </NavLink>
              )}
              {canEditProfile && (
                <NavLink to="/profile" className={linkClass}>
                  My profile
                </NavLink>
              )}
              {/* only students get in-app notifications */}
              {!isAdmin && <NotificationBell refreshKey={user.verificationStatus} />}
              <NavLink to="/profile" className="ml-2 rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500" title={`${user.name} - profile photo`}>
                <span className="sr-only">Your profile</span>
                <Avatar name={user.name} src={user.avatar} size="sm" tone={isAdmin ? 'gold' : 'dark'} className="!h-9 !w-9" />
              </NavLink>
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
        <div className="flex items-center gap-1 xl:hidden">
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
        <nav className="border-t border-line bg-white px-4 py-3 xl:hidden" aria-label="Mobile">
          <div className="flex flex-col gap-1">
            {user ? (
              <>
                <p className="flex flex-wrap items-center gap-2 px-3 py-1 text-sm text-ink-faint">
                  <Avatar name={user.name} src={user.avatar} size="sm" tone={isAdmin ? 'gold' : 'dark'} />
                  Signed in as {user.name}
                  {isAdmin && <AdminBadge badge={user.adminBadge} size="sm" />}
                </p>
                <NavLink to={homeFor(user)} end className={linkClass}>
                  {homeLabel}
                </NavLink>
                <NavLink to="/listings" end className={linkClass}>
                  Browse
                </NavLink>
                {!isAdmin && (
                  <NavLink to="/listings/mine" className={linkClass}>
                    My listings
                  </NavLink>
                )}
                {!isAdmin && <MessagesLink className={linkClass} />}
                {isAdmin && (
                  <NavLink to="/admin/categories" className={linkClass}>
                    Categories
                  </NavLink>
                )}
                {isAdmin && (
                  <NavLink to="/admin/complaints" className={linkClass}>
                    Complaints
                  </NavLink>
                )}
                {isAdmin && (
                  <NavLink to="/admin/reports" className={linkClass}>
                    Reports
                  </NavLink>
                )}
                {!isAdmin && (
                  <NavLink to="/categories" className={linkClass}>
                    Categories
                  </NavLink>
                )}
                {!isAdmin && (
                  <NavLink to="/support" className={linkClass}>
                    Help &amp; complaints
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