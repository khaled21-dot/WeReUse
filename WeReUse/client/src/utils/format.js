const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

const toDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const formatDate = (value) => {
  const d = toDate(value);
  return d ? dateFmt.format(d) : '-';
};

export const formatDateTime = (value) => {
  const d = toDate(value);
  return d ? dateTimeFmt.format(d) : '-';
};

export function timeAgo(value, now = Date.now()) {
  const d = toDate(value);
  if (!d) return '';
  const seconds = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(d);
}

export const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?';

export const firstName = (name = '') => name.trim().split(/\s+/)[0] || 'there';

export const homeFor = (user) => (user?.role === 'admin' ? '/admin' : '/dashboard');

/** "rahim.uddin@example.com" -> "ra***@example.com" (same as the server shows) */
export const maskEmail = (email = '') => {
  const [local, domain] = String(email).split('@');
  if (!domain) return email;
  return `${local.slice(0, Math.min(2, local.length))}***@${domain}`;
};
