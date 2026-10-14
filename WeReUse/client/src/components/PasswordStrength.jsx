import { passwordStrength } from '../utils/validators';

const LABELS = ['', 'Weak', 'Okay', 'Good', 'Strong'];
const COLORS = ['bg-line', 'bg-coral-600', 'bg-amber-600', 'bg-blue-500', 'bg-green-500'];

export default function PasswordStrength({ value }) {
  if (!value) return null;
  const score = passwordStrength(value);
  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= score ? COLORS[score] : 'bg-line'}`} />
        ))}
      </div>
      <p className="mt-1 text-[13px] text-ink-soft">
        Password strength: <span className="font-semibold">{LABELS[score]}</span>
      </p>
    </div>
  );
}
