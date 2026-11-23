import { Loader2, Tag } from 'lucide-react';
import { OFFER_STATUS_TEXT, clock, offerHeadline } from '../../utils/chat';

const STATUS_STYLE = {
  accepted: 'bg-green-100 text-green-800',
  declined: 'bg-coral-50 text-coral-800',
  withdrawn: 'bg-paper text-ink-soft',
  superseded: 'bg-paper text-ink-soft',
};

/** An offer inside the thread, with the right buttons for who is looking at it. */
export default function OfferCard({ message, mine, otherName, busy, onAnswer }) {
  const { offer } = message;
  const pending = offer.status === 'pending';
  const who = mine ? 'You' : otherName;

  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className="w-full max-w-sm rounded-xl border border-blue-200 bg-white p-3.5 shadow-sm">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
          <Tag className="h-3.5 w-3.5" aria-hidden="true" />
          {who} made an offer
        </p>
        <p className="mt-1 text-xl font-bold">{offerHeadline(offer)}</p>
        {offer.kind === 'exchange' && <p className="mt-0.5 break-words text-[15px]">{offer.item}</p>}
        {message.text && <p className="mt-2 whitespace-pre-line break-words border-t border-line pt-2 text-[15px] text-ink-soft">{message.text}</p>}

        {pending ? (
          <div className="mt-3">
            {mine ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-ink-soft">Waiting for an answer</span>
                <button type="button" onClick={() => onAnswer(message, 'withdraw')} disabled={busy} className="btn btn-ghost !px-3 !py-1.5 text-sm">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Withdraw
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => onAnswer(message, 'accept')} disabled={busy} className="btn btn-primary !px-4 !py-2 text-sm">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  Accept
                </button>
                <button type="button" onClick={() => onAnswer(message, 'decline')} disabled={busy} className="btn btn-secondary !px-4 !py-2 text-sm">
                  Decline
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className={`mt-3 inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLE[offer.status] || 'bg-paper text-ink-soft'}`}>
            {OFFER_STATUS_TEXT[offer.status] || offer.status}
          </p>
        )}
        <p className="mt-2 text-[11px] text-ink-faint">{clock(message.createdAt)}</p>
      </div>
    </div>
  );
}