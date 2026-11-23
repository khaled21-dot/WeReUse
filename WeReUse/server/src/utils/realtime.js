'use strict';
/**
 * Real-time push with Socket.IO.
 *
 * Design: every WRITE (send a message, make / answer an offer, mark read) is a normal REST call, so
 * it uses the same login, validation and rate limits as the rest of the API. Socket.IO only PUSHES
 * the result to the people involved, so their screens update instantly:
 *
 *   message:new          { conversationId, message }      a new message (also system lines)
 *   offer:updated        { conversationId, message }      an offer was accepted / declined / withdrawn / replaced
 *   conversation:read    { conversationId, readAt }       the other person opened the chat ("Seen")
 *   unread:update        { count }                        total unread messages for the navbar badge
 *   notification:new     {}                               the bell should reload
 *
 * Each student joins a private room "user:<id>"; events are sent to rooms, never broadcast.
 * socket.io is loaded only when the server starts, so everything else works without it.
 */
const { CLIENT_URLS, COOKIE_NAME } = require('../config/env');
const { verifyToken } = require('./token');

let io = null;
const room = (userId) => `user:${userId}`;

/** "a=1; b=2" -> { a: "1", b: "2" } */
function parseCookies(header) {
  const out = {};
  String(header || '')
    .split(';')
    .forEach((part) => {
      const i = part.indexOf('=');
      if (i < 1) return;
      const name = part.slice(0, i).trim();
      let value = part.slice(i + 1).trim();
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      try {
        out[name] = decodeURIComponent(value);
      } catch {
        out[name] = value;
      }
    });
  return out;
}

/** The same checks as the `protect` middleware, for a socket handshake. Returns the student, or null. */
async function authenticate(cookieHeader) {
  const token = parseCookies(cookieHeader)[COOKIE_NAME];
  if (!token) return null;
  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return null;
  }
  if (payload.type !== 'student') return null; // admins do not use the chat

  const User = require('../models/User'); // loaded here so this file has no start-up dependencies
  const user = await User.findById(payload.id).select('status suspendedUntil passwordChangedAt');
  if (user) await require('./moderation').refreshSuspension(user);
  if (!user || user.status !== 'active') return null;
  if (user.passwordChangedAt && payload.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) return null;
  return user;
}

/** Attaches Socket.IO to the HTTP server. Returns false when the package is not installed. */
function init(httpServer) {
  let Server;
  try {
    ({ Server } = require('socket.io'));
  } catch {
    return false;
  }

  io = new Server(httpServer, {
    serveClient: false,
    cors: { origin: CLIENT_URLS, credentials: true },
    // Browsers do not apply CORS to WebSockets, so the Origin is checked here (blocks other websites
    // from opening a socket with a visitor's cookie).
    allowRequest: (req, callback) => {
      const origin = req.headers.origin;
      callback(null, !origin || CLIENT_URLS.includes(origin));
    },
  });

  io.use(async (socket, next) => {
    try {
      const user = await authenticate(socket.handshake.headers.cookie);
      if (!user) return next(new Error('unauthorized'));
      socket.data.userId = String(user._id);
      return next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(room(socket.data.userId));
  });
  return true;
}

/** Sends an event to every open tab / device of one student. Never throws: chat still works without sockets. */
function emitToUser(userId, event, payload = {}) {
  if (!io || !userId) return;
  try {
    io.to(room(userId)).emit(event, payload);
  } catch (err) {
    console.error('Real-time push failed:', err.message);
  }
}

/** Closes every open socket of a student (e.g. right after an admin blocks them). */
function disconnectUser(userId) {
  if (!io || !userId) return;
  try {
    io.in(room(userId)).disconnectSockets(true);
  } catch (err) {
    console.error('Could not disconnect the student:', err.message);
  }
}

const isActive = () => Boolean(io);
const setIo = (fake) => {
  io = fake; // tests
};

async function shutdown() {
  if (!io) return;
  const current = io;
  io = null;
  await new Promise((resolve) => current.close(() => resolve()));
}

module.exports = { init, emitToUser, disconnectUser, isActive, setIo, shutdown, parseCookies, authenticate, room };