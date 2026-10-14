import { BadgeCheck, Clock, XCircle } from 'lucide-react';

const MAP = {
  pending: { label: 'Pending review', icon: Clock, cls: 'bg-amber-100 text-amber-800' },
  verified: { label: 'Verified', icon: BadgeCheck, cls: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rejected', icon: XCircle, cls: 'bg-coral-100 text-coral-800' },
};

export default function StatusBadge({ status }) {
  const { label, icon: Icon, cls } = MAP[status] || MAP.pending;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[13px] font-semibold ${cls}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
