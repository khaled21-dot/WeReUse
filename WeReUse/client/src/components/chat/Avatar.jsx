import { useEffect, useState } from 'react';
import { initials } from '../../utils/chat';
import { avatarUrl } from '../../utils/listings';

const SIZES = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-11 w-11 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-28 w-28 text-3xl',
};

/**
 * A person's profile photo, or their initials when they have none (or the photo cannot be loaded).
 * `src` is the stored file name from the API (user.avatar), or a full URL / blob: URL for a preview.
 */
export default function Avatar({ name, src, size = 'md', className = '', tone = 'blue' }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);

  const dims = SIZES[size] || SIZES.md;
  const colors = tone === 'dark' ? 'bg-blue-800 text-white' : tone === 'gold' ? 'bg-gold-400 text-gold-900 ring-2 ring-gold-600' : 'bg-blue-100 text-blue-800';
  const url = src && !broken ? (/^(blob:|data:|https?:|\/)/.test(src) ? src : avatarUrl(src)) : null;

  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold ${dims} ${url ? 'bg-paper' : colors} ${className}`}
      aria-hidden="true"
      title={name || undefined}
    >
      {url ? <img src={url} alt="" className="h-full w-full object-cover" onError={() => setBroken(true)} /> : initials(name)}
    </span>
  );
}
