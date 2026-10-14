import { Lock, Recycle, ShieldCheck } from 'lucide-react';

const POINTS = [
  { icon: ShieldCheck, title: 'Verified members only', text: 'An admin checks every ID card before anyone can post or chat.' },
  { icon: Lock, title: 'Your ID stays private', text: 'Only you and the admin team can see the photo you upload.' },
  { icon: Recycle, title: 'Reuse beats waste', text: 'Sell, swap or give away things you no longer need.' },
];

export default function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[5fr_7fr]">
      <aside className="hidden bg-blue-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div>
          <div className="inline-flex rounded-full bg-white p-3">
            <img src="/logo.png" alt="" width={112} height={112} />
          </div>
          <p className="mt-9 max-w-md font-display text-4xl font-bold leading-[1.1] text-white">
            Trade with students you can trust.
          </p>
          <p className="mt-4 max-w-md text-blue-100">
            WeReUse is a campus-only marketplace. Everyone on it has shown a real university ID.
          </p>
        </div>
        <ul className="mt-12 space-y-6">
          {POINTS.map(({ icon: Icon, title: t, text }) => (
            <li key={t} className="flex gap-4">
              <Icon className="mt-0.5 h-6 w-6 shrink-0 text-green-300" aria-hidden="true" />
              <div>
                <p className="font-semibold text-white">{t}</p>
                <p className="text-sm text-blue-100">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </aside>

      <div className="flex items-start justify-center px-5 py-10 sm:px-10 lg:items-center lg:py-14">
        <div className="w-full max-w-xl">
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="mt-2 text-ink-soft">{subtitle}</p>
          <div className="mt-8">{children}</div>
          {footer && <p className="mt-6 text-center text-sm text-ink-soft">{footer}</p>}
        </div>
      </div>
    </div>
  );
}
