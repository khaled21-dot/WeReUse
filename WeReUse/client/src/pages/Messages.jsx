import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImageOff, MessageCircle } from 'lucide-react';
import Alert from '../components/Alert';
import Avatar from '../components/chat/Avatar';
import { useAuth } from '../context/AuthContext';
import { useRealtime, useRealtimeEvent } from '../context/RealtimeContext';
import { chatApi } from '../api';
import { parseApiError } from '../api/client';
import { imageUrl, priceLabel } from '../utils/listings';
import { previewText } from '../utils/chat';
import { timeAgo } from '../utils/format';

/** The inbox: every chat I am part of, most recent first. */
export default function Messages() {
  const { connected } = useRealtime();
  const { user, syncAccount } = useAuth();
  const userId = user ? user.id : null;
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const latest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++latest.current;
    try {
      const res = await chatApi.list();
      if (requestId !== latest.current) return;
      const list = res.data.data.conversations;
      setConversations(list);
      setError('');
      // answered for a different account (another tab logged in as someone else): put this tab right
      if (list.some((c) => c.me && c.me.id !== userId)) syncAccount();
    } catch (err) {
      if (requestId === latest.current) setError(parseApiError(err).message);
    } finally {
      if (requestId === latest.current) setLoading(false);
    }
  }, [userId, syncAccount]);

  useEffect(() => {
    load();
  }, [load]);

  // new message, someone read my message, or the connection came back: reload the list
  useRealtimeEvent('message:new', load);
  useRealtimeEvent('conversation:read', load);
  useRealtimeEvent('offer:updated', load);
  useRealtimeEvent('resync', load);

  // without a live connection, check every 15 seconds
  useEffect(() => {
    if (connected) return undefined;
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [connected, load]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="text-3xl font-bold sm:text-4xl">Messages</h1>
        <p className="mt-1 text-ink-soft">Your chats with buyers and sellers about items.</p>
      </header>

      {error && (
        <Alert variant="error" className="mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <span>{error}</span>
            <button type="button" onClick={load} className="font-semibold underline">
              Try again
            </button>
          </div>
        </Alert>
      )}

      <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white" aria-label="Conversations">
        {loading && [0, 1, 2].map((i) => <li key={i} className="h-20 animate-pulse bg-paper" aria-hidden="true" />)}

        {conversations.map((c) => {
          const unread = c.unread > 0;
          return (
            <li key={c.id}>
              <Link to={`/messages/${c.id}`} className={`flex gap-3.5 px-4 py-3.5 hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 ${unread ? 'bg-blue-50/50' : ''}`}>
                <Avatar name={c.other.name} src={c.other.avatar} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className={`truncate ${unread ? 'font-bold' : 'font-semibold'}`}>{c.other.name}</p>
                    <time dateTime={c.lastMessageAt} className="shrink-0 text-xs text-ink-faint">
                      {timeAgo(c.lastMessageAt)}
                    </time>
                  </div>
                  <p className="truncate text-[13px] text-ink-soft">
                    {c.myRole === 'seller' ? 'Asking about' : 'You asked about'} <span className="font-semibold">{c.listing.title}</span>
                    {!c.listing.deleted && ` · ${priceLabel(c.listing)}`}
                    {c.listing.deleted && ' · deleted'}
                  </p>
                  <div className="mt-0.5 flex items-center justify-between gap-3">
                    <p className={`truncate text-[15px] ${unread ? 'font-semibold text-ink' : 'text-ink-soft'}`}>{previewText(c.lastMessage)}</p>
                    {unread && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-bold text-white" aria-label={`${c.unread} unread`}>
                        {c.unread > 9 ? '9+' : c.unread}
                      </span>
                    )}
                  </div>
                </div>
                <span className="hidden h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-line bg-paper sm:block" aria-hidden="true">
                  {c.listing.image ? (
                    <img src={imageUrl(c.listing.image)} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center text-ink-faint">
                      <ImageOff className="h-5 w-5" />
                    </span>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>

      {!loading && !error && conversations.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-white px-6 py-12 text-center">
          <MessageCircle className="mx-auto h-8 w-8 text-ink-faint" aria-hidden="true" />
          <p className="mt-3 text-lg font-semibold">No conversations yet</p>
          <p className="mt-1 text-ink-soft">Open an item and choose "Message seller" to start one.</p>
          <Link to="/listings" className="btn btn-primary mt-4">
            Browse items
          </Link>
        </div>
      )}
    </div>
  );
}