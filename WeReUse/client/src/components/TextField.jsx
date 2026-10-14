import { forwardRef, useId } from 'react';

const TextField = forwardRef(function TextField(
  { id, label, error, hint, optional = false, className = '', inputClassName = '', ...props },
  ref
) {
  const autoId = useId();
  const inputId = id || autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = [hint && !error ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={className}>
      <label htmlFor={inputId} className="label">
        {label}
        {optional && <span className="ml-1.5 font-normal text-ink-faint">(optional)</span>}
      </label>
      <input
        ref={ref}
        id={inputId}
        className={`input ${inputClassName}`}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={describedBy}
        {...props}
      />
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-[13px] text-ink-faint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1.5 text-[13px] font-medium text-coral-600">
          {error}
        </p>
      )}
    </div>
  );
});

export default TextField;
