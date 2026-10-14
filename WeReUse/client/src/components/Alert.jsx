import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

const VARIANTS = {
  error: { icon: AlertTriangle, box: 'border-coral-100 bg-coral-50 text-coral-800' },
  success: { icon: CheckCircle2, box: 'border-green-200 bg-green-50 text-green-800' },
  warning: { icon: AlertTriangle, box: 'border-amber-100 bg-amber-50 text-amber-800' },
  info: { icon: Info, box: 'border-blue-100 bg-blue-50 text-blue-800' },
};

export default function Alert({ variant = 'info', title, children, className = '' }) {
  const { icon: Icon, box } = VARIANTS[variant] || VARIANTS.info;
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`flex gap-3 rounded-lg border p-3.5 text-sm ${box} ${className}`}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
    </div>
  );
}
