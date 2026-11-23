import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { MAX_PRICE } from '../../utils/listings';

/** The small form for making an offer: a price (item for sale) or what you would give (item for exchange). */
export default function OfferForm({ listingType, onSubmit, onCancel }) {
  const isPrice = listingType === 'sell';
  const [amount, setAmount] = useState('');
  const [item, setItem] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (isPrice) {
      if (!amount || Number(amount) < 1) return setError('Enter your offer in taka');
      if (Number(amount) > MAX_PRICE) return setError('That amount is too high');
    } else if (item.trim().length < 2) {
      return setError('Say what you would give in exchange');
    }
    setError('');
    setBusy(true);
    try {
      await onSubmit({
        offer: isPrice ? { kind: 'price', amount: Number(amount) } : { kind: 'exchange', item: item.trim() },
        text: note.trim(),
      });
      return undefined;
    } catch (err) {
      setError(err.message || 'Could not send the offer. Please try again.');
      return undefined;
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Make an offer" className="rounded-xl border border-blue-200 bg-blue-50/50 p-4">
      <p className="font-semibold">{isPrice ? 'Make a price offer' : 'Propose an exchange'}</p>
      <div className="mt-3 space-y-3">
        {isPrice ? (
          <div>
            <label htmlFor="offer-amount" className="label">
              Your offer (৳ taka)
            </label>
            <div className="relative max-w-[12rem]">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" aria-hidden="true">
                ৳
              </span>
              <input id="offer-amount" inputMode="numeric" className="input pl-8" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 7))} />
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor="offer-item" className="label">
              What would you give in exchange?
            </label>
            <input id="offer-item" className="input" maxLength={200} value={item} onChange={(e) => setItem(e.target.value)} placeholder="For example: a scientific calculator" />
          </div>
        )}
        <div>
          <label htmlFor="offer-note" className="label">
            Add a note <span className="font-normal text-ink-faint">(optional)</span>
          </label>
          <input id="offer-note" className="input" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[13px] font-medium text-coral-600">
          {error}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <button type="submit" disabled={busy} className="btn btn-primary !py-2">
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Send offer
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className="btn btn-secondary !py-2">
          Cancel
        </button>
      </div>
    </form>
  );
}