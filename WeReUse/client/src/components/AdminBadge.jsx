import { ShieldCheck } from 'lucide-react';

const SIZES = {
  sm: 'gap-1 px-2 py-1 text-[11px]',
  md: 'gap-1.5 px-3 py-1.5 text-[13px]',
  lg: 'gap-2 px-4 py-2 text-base',
};
const ICON_SIZES = { sm: 'h-3 w-3', md: 'h-3.5 w-3.5', lg: 'h-4 w-4' };

const isHex = (value) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

/**
 * The golden "Admin" badge. The label and colour come from the admin's record
 * (admins.adminBadge = { label: "Admin", color: "#FFD700" }); a gold default is used otherwise.
 */
export default function AdminBadge({ badge, size = 'md', className = '' }) {
  const label = (badge?.label || '').trim() || 'Admin';
  const color = isHex(badge?.color) ? badge.color : '#FFD700';

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border font-bold leading-none ${SIZES[size] || SIZES.md} ${className}`}
      style={{
        backgroundColor: color,
        // a soft highlight on top gives the badge a metallic gold look
        backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0))',
        borderColor: '#B8860B',
        color: '#4A3600',
      }}
    >
      <ShieldCheck className={ICON_SIZES[size] || ICON_SIZES.md} aria-hidden="true" />
      {label}
    </span>
  );
}
