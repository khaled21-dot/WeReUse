import { useState } from 'react';
import { Star } from 'lucide-react';

/** Read-only stars, e.g. ★★★★☆ 4.5 (12). Shows "No ratings yet" when count is 0. */
export function Stars({ value = 0, count, size = 'sm', showValue = true, className = '' }) {
  const px = size === 'lg' ? 'h-5 w-5' : size === 'xs' ? 'h-3 w-3' : 'h-4 w-4';
  if (count === 0) {
    return <span className={`text-[13px] text-ink-faint ${className}`}>No ratings yet</span>;
  }
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className="inline-flex" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => {
          const fill = rounded >= i ? 'full' : rounded >= i - 0.5 ? 'half' : 'none';
          return (
            <span key={i} className={`relative ${px}`}>
              <Star className={`absolute inset-0 ${px} text-gold-400`} />
              {fill !== 'none' && (
                <span className="absolute inset-0 overflow-hidden" style={{ width: fill === 'half' ? '50%' : '100%' }}>
                  <Star className={`${px} fill-gold-400 text-gold-400`} />
                </span>
              )}
            </span>
          );
        })}
      </span>
      <span className="sr-only">
        Rated {value} out of 5{count !== undefined ? ` from ${count} rating${count === 1 ? '' : 's'}` : ''}
      </span>
      {showValue && (
        <span className="text-[13px] font-semibold text-ink-soft" aria-hidden="true">
          {Number(value).toFixed(1)}
          {count !== undefined && <span className="font-normal text-ink-faint"> ({count})</span>}
        </span>
      )}
    </span>
  );
}

const WORDS = ['', 'Poor', 'Fair', 'Good', 'Very good', 'Excellent'];

/** Five radio buttons that look like stars. */
export function StarInput({ value, onChange, name = 'stars', disabled = false }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset className="flex items-center gap-2" disabled={disabled}>
      <legend className="sr-only">Your rating</legend>
      <div className="flex" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((i) => (
          <label key={i} className="cursor-pointer p-0.5" onMouseEnter={() => setHover(i)}>
            <input type="radio" name={name} value={i} checked={value === i} onChange={() => onChange(i)} className="peer sr-only" />
            <Star
              className={`h-7 w-7 rounded transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-blue-500 ${
                shown >= i ? 'fill-gold-400 text-gold-500' : 'text-line'
              }`}
              aria-hidden="true"
            />
            <span className="sr-only">
              {i} star{i === 1 ? '' : 's'}
            </span>
          </label>
        ))}
      </div>
      <span className="text-sm font-semibold text-ink-soft" aria-hidden="true">
        {WORDS[shown]}
      </span>
    </fieldset>
  );
}
