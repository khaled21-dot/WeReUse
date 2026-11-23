import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BadgeCheck, CheckCheck, ImageOff, Loader2, Send, Tag, UserRound, WifiOff } from 'lucide-react';
import Alert from '../components/Alert';
import Spinner from '../components/Spinner';
import Avatar from '../components/chat/Avatar';
import OfferCard from '../components/chat/OfferCard';
import OfferForm from '../components/chat/OfferForm';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useRealtime, useRealtimeEvent } from '../context/RealtimeContext';
import { chatApi, listingApi } from '../api';
import { parseApiError } from '../api/client';
import { clock, dayLabel, mergeMessages, sameDay } from '../utils/chat';
import { imageUrl, priceLabel } from '../utils/listings';

const MAX_LENGTH = 1000;
const REFRESH_CODES = ['LISTING_CLOSED', 'LISTING_DELETED', 'DEAL_AGREED', 'OFFER_NOT_PENDING'];

export default function Conversation() {
  const { id } = useParams();
  const { user, syncAccount } = useAuth();
  const toast = useToast();
  const { connected, refreshUnread } = useRealtime();

  const [conv, setConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [state, setState] = useState('loading'); // loading | ready | missing | error
  const [problem, setProblem] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [offerOpen, setOfferOpen] = useState(false);
  const [busyOffer, setBusyOffer] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [marking, setMarking] = useState(false);

  const listRef = useRef(null);
  const endRef = useRef(null);
  const stickToBottom = useRef(true);

  // ---------- loading ----------
  const markRead = useCallback(() => {
    if (document.visibilityState === 'hidden') return;
    chatApi
      .markRead(id)
      .then(() => refreshUnread())
      .catch(() => {});
  }, [id, refreshUnread]);

  const loadConversation = useCallback(async () => {
    const res = await chatApi.get(id);
    setConv(res.data.data.conversation);
  }, [id]);

  const load = useCallback(async () => {
    try {
      const [c, m] = await Promise.all([chatApi.get(id), chatApi.messages(id, { limit: 30 })]);
      setConv(c.data.data.conversation);
      setMessages(m.data.data.messages);
      setHasMore(m.data.data.hasMore);
      setState('ready');
      markRead();
    } catch (err) {
      const parsed = parseApiError(err);
      setProblem(parsed.message);
      setState(parsed.status === 404 ? 'missing' : 'error');
    }
  }, [id, markRead]);

  useEffect(() => {
    setState('loading');
    setMessages([]);
    setConv(null);
    stickToBottom.current = true;
    load();
  }, [load]);

  // The server answers for whoever owns the login cookie. If that is not the account this tab shows
  // (someone logged in as another student in a different tab), reload instead of mixing up the two.
  useEffect(() => {
    if (conv && conv.me && conv.me.id !== user.id) syncAccount();
  }, [conv, user.id, syncAccount]);

  /** Pick up anything missed (after a dropped connection, or while polling). */
  const syncLatest = useCallback(async () => {
    try {
      const [c, m] = await Promise.all([chatApi.get(id), chatApi.messages(id, { limit: 30 })]);
      setConv(c.data.data.conversation);
      setMessages((list) => mergeMessages(list, m.data.data.messages));
      markRead();
    } catch {
      /* try again next time */
    }
  }, [id, markRead]);

  // no live connection: check for new messages every 8 seconds
  useEffect(() => {
    if (connected || state !== 'ready') return undefined;
    const timer = setInterval(syncLatest, 8000);
    return () => clearInterval(timer);
  }, [connected, state, syncLatest]);

  // coming back to this tab: I have now seen everything
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && state === 'ready' && markRead();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [state, markRead]);

  // ---------- live events ----------
  useRealtimeEvent('message:new', ({ conversationId, message }) => {
    if (conversationId !== id) return;
    setMessages((list) => mergeMessages(list, [message]));
    if (message.senderId !== user.id) markRead();
    if (message.type === 'system') loadConversation().catch(() => {});
  });
  useRealtimeEvent('offer:updated', ({ conversationId, messageId, status, message }) => {
    if (conversationId !== id) return;
    setMessages((list) => list.map((m) => (m.id === messageId && m.offer ? { ...m, offer: { ...m.offer, ...(message ? message.offer : {}), status } } : m)));
    if (status === 'accepted') setConv((c) => (c ? { ...c, agreedOffer: messageId } : c));
  });
  useRealtimeEvent('conversation:read', ({ conversationId, readAt }) => {
    if (conversationId === id) setConv((c) => (c ? { ...c, theirReadAt: readAt } : c));
  });
  useRealtimeEvent('resync', () => {
    if (state === 'ready') syncLatest();
  });

  // ---------- scrolling ----------
  useEffect(() => {
    if (stickToBottom.current && endRef.current) endRef.current.scrollIntoView({ block: 'end' });
  }, [messages]);

  const onScroll = () => {
    const el = listRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  const loadOlder = async () => {
    if (loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    const el = listRef.current;
    const heightBefore = el ? el.scrollHeight : 0;
    try {
      const res = await chatApi.messages(id, { limit: 30, before: messages[0].id });
      stickToBottom.current = false;
      setMessages((list) => mergeMessages(list, res.data.data.messages));
      setHasMore(res.data.data.hasMore);
      // keep the message the person was reading where it was
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - heightBefore;
      });
    } catch (err) {
      toast.error(parseApiError(err).message);
    } finally {
      setLoadingOlder(false);
    }
  };

  // ---------- actions ----------
  const handleFailure = (err) => {
    const parsed = parseApiError(err);
    if (REFRESH_CODES.includes(parsed.code)) loadConversation().catch(() => {});
    return parsed.message;
  };

  const sendText = async (e) => {
    if (e) e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError('');
    try {
      const res = await chatApi.send(id, { text });
      stickToBottom.current = true;
      setMessages((list) => mergeMessages(list, [res.data.data.message]));
      setDraft('');
    } catch (err) {
      setSendError(handleFailure(err));
    } finally {
      setSending(false);
    }
  };

  const sendOffer = async ({ offer, text }) => {
    try {
      const res = await chatApi.send(id, { offer, ...(text ? { text } : {}) });
      const replaced = res.data.data.supersededOffers || [];
      stickToBottom.current = true;
      setMessages((list) =>
        mergeMessages(
          list.map((m) => (replaced.includes(m.id) && m.offer ? { ...m, offer: { ...m.offer, status: 'superseded' } } : m)),
          [res.data.data.message]
        )
      );
      setOfferOpen(false);
    } catch (err) {
      throw new Error(handleFailure(err));
    }
  };

  const answerOffer = async (message, action) => {
    setBusyOffer(message.id);
    try {
      const res = await chatApi.answer(id, message.id, action);
      stickToBottom.current = true;
      setMessages((list) => mergeMessages(list, [res.data.data.message, res.data.data.systemMessage]));
      if (action === 'accept') setConv((c) => (c ? { ...c, agreedOffer: message.id } : c));
    } catch (err) {
      toast.error(handleFailure(err));
      syncLatest();
    } finally {
      setBusyOffer(null);
    }
  };

  const markSold = async () => {
    setMarking(true);
    try {
      await listingApi.setStatus(conv.listing.id, 'closed');
      toast.success('Marked as sold. Other students can no longer see the item.');
      await loadConversation();
    } catch (err) {
      toast.error(parseApiError(err).message);
    } finally {
      setMarking(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      sendText();
    }
  };

  // ---------- screens ----------
  if (state === 'loading') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Spinner className="h-8 w-8 text-blue-600" label="Loading conversation" />
      </div>
    );
  }

  if (state !== 'ready') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:px-6">
        <h1 className="text-2xl font-bold">{state === 'missing' ? 'Conversation not found' : 'Something went wrong'}</h1>
        <p className="mt-2 text-ink-soft">{state === 'missing' ? 'It may not exist, or it is not one of your chats.' : problem}</p>
        <div className="mt-5 flex justify-center gap-3">
          <Link to="/messages" className="btn btn-primary">
            Back to messages
          </Link>
          {state === 'error' && (
            <button type="button" onClick={load} className="btn btn-secondary">
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }

  const { listing, other } = conv;
  const me = conv.me || { id: user.id, name: user.name, avatar: user.avatar };
  const deleted = listing.deleted;
  const closed = !deleted && listing.status !== 'available';
  const agreed = Boolean(conv.agreedOffer);
  const canOffer = !deleted && !closed && !agreed && listing.listingType !== 'donate';
  const lastMine = [...messages].reverse().find((m) => m.senderId === user.id);
  const seen = lastMine && conv.theirReadAt && new Date(conv.theirReadAt) >= new Date(lastMine.createdAt);

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <Link to="/messages" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All messages
      </Link>

      {/* who + which item */}
      <header className="mt-3 rounded-xl border border-line bg-white p-3.5">
        <div className="flex items-center gap-3">
          <Avatar name={other.name} src={other.avatar} />
          <div className="min-w-0 flex-1">
            <h1 className="flex flex-wrap items-center gap-2 text-lg font-bold">
              <Link to={`/users/${other.id}`} className="hover:text-blue-700 hover:underline">
                {other.name}
              </Link>
              {other.isVerified && (
                <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                  <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Verified student
                </span>
              )}
            </h1>
            <p className="text-sm text-ink-soft">{conv.myRole === 'seller' ? 'is interested in your item' : 'is the seller'}</p>
          </div>
          <Link to={`/users/${other.id}`} className="btn btn-ghost shrink-0 !px-2.5 !py-1.5 text-sm">
            <UserRound className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Profile · rate · report</span>
            <span className="sm:hidden">Profile</span>
          </Link>
        </div>
        <div className="mt-3 flex items-center gap-3 rounded-lg bg-paper p-2.5">
          <span className="h-12 w-14 shrink-0 overflow-hidden rounded-md border border-line bg-white" aria-hidden="true">
            {listing.image ? <img src={imageUrl(listing.image)} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-ink-faint"><ImageOff className="h-5 w-5" /></span>}
          </span>
          <div className="min-w-0 flex-1">
            {deleted ? (
              <p className="truncate font-semibold">{listing.title}</p>
            ) : (
              <Link to={`/listings/${listing.id}`} className="block truncate font-semibold hover:text-blue-700">
                {listing.title}
              </Link>
            )}
            <p className="text-sm text-ink-soft">{deleted ? 'This item was deleted' : closed ? 'No longer available' : priceLabel(listing)}</p>
          </div>
        </div>
      </header>

      {/* state banners */}
      {deleted && (
        <Alert variant="warning" className="mt-3">
          This item was deleted, so you can read this conversation but not reply.
        </Alert>
      )}
      {closed && (
        <Alert variant="info" className="mt-3">
          This item is no longer available. You can keep chatting, but offers are closed.
        </Alert>
      )}
      {agreed && !deleted && (
        <Alert variant="success" className="mt-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>A deal is agreed. Arrange the handover here.</span>
            {conv.myRole === 'seller' && !closed && (
              <button type="button" onClick={markSold} disabled={marking} className="btn btn-primary !px-3 !py-1.5 text-sm">
                {marking && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Mark item as sold
              </button>
            )}
          </div>
        </Alert>
      )}
      {!connected && (
        <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-1.5 text-sm text-amber-800" role="status">
          <WifiOff className="h-4 w-4" aria-hidden="true" />
          Not connected live - new messages appear within a few seconds.
        </p>
      )}

      {/* the thread */}
      <div
        ref={listRef}
        onScroll={onScroll}
        role="log"
        aria-live="polite"
        aria-label={`Messages with ${other.name}`}
        className="mt-3 h-[min(55vh,34rem)] space-y-2.5 overflow-y-auto rounded-xl border border-line bg-paper/60 p-3.5"
      >
        {hasMore && (
          <div className="text-center">
            <button type="button" onClick={loadOlder} disabled={loadingOlder} className="btn btn-ghost !py-1.5 text-sm">
              {loadingOlder && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Load earlier messages
            </button>
          </div>
        )}

        {messages.length === 0 && (
          <p className="py-10 text-center text-ink-faint">
            {conv.myRole === 'buyer' ? `Say hello to ${other.name}. Ask about the item, or make an offer.` : 'No messages yet.'}
          </p>
        )}

        {messages.map((m, i) => {
          const mine = m.senderId === user.id;
          const prev = messages[i - 1];
          const next = messages[i + 1];
          const newDay = i === 0 || !sameDay(prev.createdAt, m.createdAt);
          // consecutive messages from the same person form a group: name on the first, photo on the last
          const firstOfGroup = newDay || !prev || prev.type === 'system' || prev.senderId !== m.senderId;
          const lastOfGroup = !next || next.type === 'system' || next.senderId !== m.senderId || !sameDay(next.createdAt, m.createdAt);
          const sender = mine ? me : other;
          return (
            <div key={m.id}>
              {newDay && (
                <p className="my-2 text-center text-xs font-semibold text-ink-faint">{dayLabel(m.createdAt)}</p>
              )}
              {m.type === 'system' ? (
                <p className="mx-auto max-w-md rounded-lg bg-white px-3 py-2 text-center text-[13px] text-ink-soft">{m.text}</p>
              ) : (
                <div className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''} ${firstOfGroup && i > 0 ? 'pt-1.5' : ''}`}>
                  {lastOfGroup ? <Avatar name={sender.name} src={sender.avatar} size="sm" /> : <span className="w-8 shrink-0" aria-hidden="true" />}
                  <div className="min-w-0 flex-1">
                    {firstOfGroup && (
                      <p className={`mb-0.5 px-1 text-xs font-semibold text-ink-soft ${mine ? 'text-right' : ''}`}>{mine ? 'You' : sender.name}</p>
                    )}
                    {m.type === 'offer' && m.offer ? (
                      <OfferCard message={m} mine={mine} otherName={other.name} busy={busyOffer === m.id} onAnswer={answerOffer} />
                    ) : (
                      <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] rounded-2xl px-3.5 py-2 ${mine ? 'rounded-br-md bg-blue-600 text-white' : 'rounded-bl-md border border-line bg-white'}`}>
                          <span className="sr-only">{mine ? 'You' : sender.name}: </span>
                          <p className="whitespace-pre-line break-words text-[15px]">{m.text}</p>
                          <p className={`mt-0.5 text-right text-[11px] ${mine ? 'text-blue-100' : 'text-ink-faint'}`}>{clock(m.createdAt)}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              {mine && lastMine && lastMine.id === m.id && seen && (
                <p className="mt-0.5 flex items-center justify-end gap-1 pr-10 text-[11px] text-ink-faint">
                  <CheckCheck className="h-3.5 w-3.5 text-blue-500" aria-hidden="true" />
                  Seen
                </p>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {/* composer */}
      {!deleted && (
        <div className="mt-3 space-y-3">
          {offerOpen && canOffer && <OfferForm listingType={listing.listingType} onSubmit={sendOffer} onCancel={() => setOfferOpen(false)} />}

          <form onSubmit={sendText} aria-label="Send a message" className="flex items-end gap-2">
            <div className="flex-1">
              <label htmlFor="chat-draft" className="sr-only">
                Message
              </label>
              <textarea
                id="chat-draft"
                rows={2}
                maxLength={MAX_LENGTH}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Write a message…"
                className="input resize-none"
                aria-invalid={sendError ? 'true' : 'false'}
              />
              {draft.length > 800 && <p className="mt-1 text-right text-xs text-ink-faint">{draft.length} / {MAX_LENGTH}</p>}
            </div>
            <button type="submit" disabled={sending || !draft.trim()} className="btn btn-primary h-[3.1rem]" aria-label="Send message">
              {sending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Send className="h-5 w-5" aria-hidden="true" />}
            </button>
          </form>
          {sendError && (
            <p role="alert" className="text-[13px] font-medium text-coral-600">
              {sendError}
            </p>
          )}

          {canOffer && !offerOpen && (
            <button type="button" onClick={() => setOfferOpen(true)} className="btn btn-secondary !py-2 text-sm">
              <Tag className="h-4 w-4" aria-hidden="true" />
              {listing.listingType === 'sell' ? 'Make an offer' : 'Propose an exchange'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}