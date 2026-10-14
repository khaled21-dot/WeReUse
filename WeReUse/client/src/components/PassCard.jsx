import { BadgeCheck, Clock, XCircle } from 'lucide-react';
import { LogoMark } from './Logo';
import { initials } from '../utils/format';

const STATUS = {
  verified: { label: 'Verified student', band: 'bg-green-600 text-white', icon: BadgeCheck },
  pending: { label: 'Under review', band: 'bg-amber-100 text-amber-800', icon: Clock },
  rejected: { label: 'Needs a new ID photo', band: 'bg-coral-100 text-coral-800', icon: XCircle },
};

/** The student's WeReUse pass - its bottom band shows the verification status at a glance. */
export default function PassCard({ user }) {
  const { label, band, icon: Icon } = STATUS[user.verificationStatus] || STATUS.pending;
  const detail = [user.department, user.batch && `Batch ${user.batch}`].filter(Boolean).join(' \u00b7 ');

  return (
    <article
      aria-label="Your student pass"
      className="relative mx-auto w-full max-w-sm overflow-hidden rounded-pass border border-line bg-white"
    >
      <div className="flex justify-center pt-4" aria-hidden="true">
        <span className="h-2.5 w-16 rounded-full border border-line bg-paper" />
      </div>

      <div className="px-7 pb-7 pt-5">
        <div className="flex items-center justify-between">
          <LogoMark size={36} />
          <span className="text-sm font-semibold text-ink-soft">Student pass</span>
        </div>

        <div
          className="mt-7 flex h-20 w-20 items-center justify-center rounded-2xl bg-blue-800 font-display text-3xl font-bold text-white"
          aria-hidden="true"
        >
          {initials(user.name)}
        </div>

        <h2 className="mt-4 break-words font-display text-2xl font-bold leading-tight">{user.name}</h2>
        <p className="mt-1 text-sm text-ink-soft">{detail || 'University student'}</p>

        <dl className="mt-6">
          <dt className="text-[13px] text-ink-faint">Registration number</dt>
          <dd className="break-all text-lg font-semibold tabular-nums tracking-wide">{user.universityRegNumber}</dd>
        </dl>
      </div>

      {/* tear-off line with the two notches */}
      <div className="relative" aria-hidden="true">
        <div className="mx-6 border-t-2 border-dashed border-line" />
        <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full border border-line bg-paper" />
        <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full border border-line bg-paper" />
      </div>

      <div className={`flex items-center gap-2.5 px-7 py-4 ${band}`}>
        <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="font-semibold">{label}</span>
      </div>
    </article>
  );
}
