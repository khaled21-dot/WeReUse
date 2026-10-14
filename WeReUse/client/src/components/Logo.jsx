import { Link } from 'react-router-dom';

export function LogoMark({ size = 40, className = '' }) {
  return <img src="/logo.png" alt="" width={size} height={size} className={`shrink-0 ${className}`} />;
}

export default function Logo({ size = 40, to = '/', className = '', textClass = 'text-xl text-ink' }) {
  return (
    <Link to={to} className={`inline-flex items-center gap-2.5 ${className}`} aria-label="WeReUse home">
      <LogoMark size={size} />
      <span className={`font-display font-extrabold tracking-tight ${textClass}`}>WeReUse</span>
    </Link>
  );
}
