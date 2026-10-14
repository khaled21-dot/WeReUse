import { Loader2 } from 'lucide-react';

export default function Spinner({ className = 'h-5 w-5 text-blue-600', label = 'Loading' }) {
  return <Loader2 className={`animate-spin ${className}`} role="status" aria-label={label} />;
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Spinner className="h-8 w-8 text-blue-600" label="Loading your session" />
    </div>
  );
}
