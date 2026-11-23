import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { chatApi } from '../api';

// One Socket.IO connection for the whole app (only for verified students). The server pushes:
//   message:new, offer:updated, conversation:read, notification:new   -> passed on to whoever subscribed
//   unread:update                                                     -> the number on the Messages link
// After a dropped connection comes back, a local "resync" event tells open screens to reload what they missed.

export const RealtimeContext = createContext(null); // exported so tests can provide a fake connection
const IDLE = { connected: false, unread: 0, subscribe: () => () => {}, refreshUnread: async () => {} };
const PUSHED = ['message:new', 'offer:updated', 'conversation:read', 'notification:new'];

export function RealtimeProvider({ children }) {
  const { user } = useAuth();
  const listeners = useRef(new Map()); // event name -> Set of functions
  const [connected, setConnected] = useState(false);
  const [unread, setUnread] = useState(0);

  const active = Boolean(user && user.role === 'student' && user.verificationStatus === 'verified');
  const userId = user ? user.id : null;

  const emitLocal = useCallback((event, payload) => {
    const set = listeners.current.get(event);
    if (!set) return;
    set.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        console.error(`Handler for "${event}" failed:`, err);
      }
    });
  }, []);

  const subscribe = useCallback((event, fn) => {
    if (!listeners.current.has(event)) listeners.current.set(event, new Set());
    listeners.current.get(event).add(fn);
    return () => listeners.current.get(event)?.delete(fn);
  }, []);

  const refreshUnread = useCallback(async () => {
    try {
      const res = await chatApi.unreadCount();
      setUnread(res.data.data.count);
    } catch {
      /* the badge is not critical */
    }
  }, []);

  useEffect(() => {
    if (!active) {
      setUnread(0);
      setConnected(false);
      return undefined;
    }
    refreshUnread();

    const url = import.meta.env.VITE_SOCKET_URL; // leave empty: same address as the app (Vite forwards /socket.io)
    const socket = url ? io(url, { withCredentials: true }) : io({ withCredentials: true });

    let firstConnect = true;
    socket.on('connect', () => {
      setConnected(true);
      if (!firstConnect) {
        refreshUnread();
        emitLocal('resync');
      }
      firstConnect = false;
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('unread:update', (payload) => setUnread(Number(payload && payload.count) || 0));
    PUSHED.forEach((event) => socket.on(event, (payload) => emitLocal(event, payload)));

    // if sockets are unavailable, keep the badge roughly right anyway
    const poll = setInterval(() => {
      if (!socket.connected) refreshUnread();
    }, 30000);

    return () => {
      clearInterval(poll);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [active, userId, refreshUnread, emitLocal]);

  const value = useMemo(() => ({ connected, unread, subscribe, refreshUnread }), [connected, unread, subscribe, refreshUnread]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

/** { connected, unread, subscribe, refreshUnread } - safe to call without a provider (e.g. in tests). */
export function useRealtime() {
  return useContext(RealtimeContext) || IDLE;
}

/** Runs handler(payload) whenever the server pushes `event`. */
export function useRealtimeEvent(event, handler) {
  const { subscribe } = useRealtime();
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => subscribe(event, (payload) => latest.current(payload)), [event, subscribe]);
}