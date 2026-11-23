import { Link } from 'react-router-dom';
import { ImageOff } from 'lucide-react';
import { CONDITION_LABELS, TYPE_BADGE, TYPE_LABELS, formatUsed, imageUrl, priceLabel } from '../utils/listings';
import { timeAgo } from '../utils/format';

/** One product in the browse grid / "my listings". Render inside a <ul>. */
export default function ListingCard({ listing }) {
  const cover = listing.images[0];
  const closed = listing.status === 'closed';

  return (
    <li>
      <Link
        to={`/listings/${listing.id}`}
        className="group block h-full overflow-hidden rounded-xl border border-line bg-white transition hover:border-blue-300 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
      >
        <div className="relative aspect-[4/3] bg-paper">
          {cover ? (
            <img
              src={imageUrl(cover)}
              alt=""
              loading="lazy"
              className={`h-full w-full object-cover ${closed ? 'opacity-50' : ''}`}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-ink-faint">
              <ImageOff className="h-8 w-8" aria-hidden="true" />
            </div>
          )}
          <span className={`absolute left-2 top-2 rounded-full px-2.5 py-1 text-xs font-semibold ${TYPE_BADGE[listing.listingType]}`}>
            {TYPE_LABELS[listing.listingType]}
          </span>
          {closed && (
            <span className="absolute bottom-2 left-2 rounded-full bg-ink px-2.5 py-1 text-xs font-semibold text-white">
              No longer available
            </span>
          )}
        </div>

        <div className="p-3.5">
          <p className="text-lg font-bold">{priceLabel(listing)}</p>
          <h3 className="mt-0.5 line-clamp-2 break-words font-semibold group-hover:text-blue-700">{listing.title}</h3>
          <p className="mt-1 text-[13px] text-ink-soft">
            {CONDITION_LABELS[listing.condition]}
            {listing.usedFor ? ` · ${formatUsed(listing.usedFor).replace('Used for ', '')}` : ''}
          </p>
          <p className="mt-0.5 truncate text-[13px] text-ink-faint">
            {listing.category?.name || 'Uncategorised'} · {timeAgo(listing.createdAt)}
          </p>
        </div>
      </Link>
    </li>
  );
}