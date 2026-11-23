const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Listing = require('../models/Listing');
const User = require('../models/User');
const Notification = require('../models/Notification');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const {
  parse,
  startConversationSchema,
  sendMessageSchema,
  offerActionSchema,
  messagesQuerySchema,
} = require('../utils/validators');
const rules = require('../utils/chatRules');
const { emitToUser } = require('../utils/realtime');

// Only what the other student may see - never an email address or phone number.
const USER_FIELDS = 'name department batch verificationStatus status avatar';
const LISTING_FIELDS = 'title images status price listingType';

const notFound = () => new AppError('Conversation not found.', 404);
const idOf = (x) => String(x && x._id ? x._id : x);
const throwProblem = (p) => {
  throw new AppError(p.message, p.status, { code: p.code });
};

// ---------- shaping the JSON the client receives ----------
const withRelations = (query) =>
  query.populate('buyer', USER_FIELDS).populate('seller', USER_FIELDS).populate('listing', LISTING_FIELDS);

const presentPerson = (p) =>
  p && p._id
    ? {
        id: String(p._id),
        name: p.name,
        avatar: p.avatar || null,
        department: p.department || '',
        batch: p.batch || '',
        isVerified: p.verificationStatus === 'verified',
      }
    : { id: idOf(p), name: 'Deleted account', avatar: null, department: '', batch: '', isVerified: false };

function presentConversation(c, viewerId) {
  const side = rules.sideOf(c, viewerId);
  const other = side === 'buyer' ? c.seller : c.buyer;
  const me = side === 'buyer' ? c.buyer : c.seller;
  const listing = c.listing && c.listing._id ? c.listing : null;
  const snapshot = c.listingSnapshot || {};

  return {
    id: String(c._id),
    myRole: side,
    // who the server thinks is asking: lets the app notice that another tab logged in as someone else
    me: presentPerson(me),
    other: presentPerson(other),
    listing: listing
      ? {
          id: String(listing._id),
          title: listing.title,
          image: listing.images && listing.images[0] ? listing.images[0] : null,
          status: listing.status,
          price: listing.price ?? null,
          listingType: listing.listingType,
          deleted: false,
        }
      : {
          id: idOf(c.listing),
          title: snapshot.title || 'Deleted item',
          image: snapshot.image || null,
          status: 'closed',
          price: null,
          listingType: snapshot.listingType || 'sell',
          deleted: true,
        },
    lastMessage:
      c.lastMessage && c.lastMessage.createdAt
        ? {
            text: c.lastMessage.text,
            type: c.lastMessage.type,
            mine: c.lastMessage.senderId ? String(c.lastMessage.senderId) === String(viewerId) : false,
            createdAt: c.lastMessage.createdAt,
          }
        : null,
    unread: (c.unread && c.unread[side]) || 0,
    theirReadAt: (c.readAt && c.readAt[rules.otherSide(side)]) || null,
    agreedOffer: c.agreedOffer ? String(c.agreedOffer) : null,
    lastMessageAt: c.lastMessageAt,
    createdAt: c.createdAt,
  };
}

function presentMessage(m) {
  return {
    id: String(m._id),
    conversationId: String(m.conversation),
    senderId: m.sender ? String(m.sender) : null,
    type: m.type,
    text: m.text || '',
    offer: m.type === 'offer' && m.offer
      ? {
          kind: m.offer.kind,
          amount: m.offer.amount ?? null,
          item: m.offer.item || '',
          status: m.offer.status,
          respondedAt: m.offer.respondedAt || null,
          respondedBy: m.offer.respondedBy ? String(m.offer.respondedBy) : null,
        }
      : null,
    createdAt: m.createdAt,
  };
}

// ---------- helpers ----------
/** The conversation, if this student is the buyer or the seller. Anyone else gets "not found". */
async function loadConversation(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw notFound();
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation) throw notFound();
  const side = rules.sideOf(conversation, req.user._id);
  if (!side) throw notFound();
  return { conversation, side };
}

async function unreadTotal(userId) {
  const rows = await Conversation.find({ $or: [{ buyer: userId }, { seller: userId }] }).select('buyer unread').lean();
  return rows.reduce((sum, c) => sum + ((String(c.buyer) === String(userId) ? c.unread && c.unread.buyer : c.unread && c.unread.seller) || 0), 0);
}

/** Tell both people (all their open tabs) about something that happened in a conversation. */
function pushToBoth(conversation, event, payload) {
  emitToUser(conversation.buyer, event, payload);
  emitToUser(conversation.seller, event, payload);
}

async function pushUnread(userId) {
  emitToUser(userId, 'unread:update', { count: await unreadTotal(userId) });
}

/** Saves "this is now the last message" on the conversation and counts it as unread for the other side. */
async function recordMessage(conversation, side, message) {
  await Conversation.updateOne(
    { _id: conversation._id },
    {
      $set: {
        lastMessage: { text: rules.previewFor(message), type: message.type, senderId: message.sender || null, createdAt: message.createdAt },
        lastMessageAt: message.createdAt,
        hasMessages: true,
        // whoever writes has obviously seen everything so far
        ...(message.sender ? { [`readAt.${side}`]: message.createdAt } : {}),
      },
      $inc: { [`unread.${rules.otherSide(side)}`]: 1 },
    }
  );
}

/** A bell notification. Several unread chat messages from the same chat become ONE notification. */
async function notify(userId, conversationId, type, message) {
  try {
    if (type === 'message') {
      await Notification.deleteMany({ userId, type: 'message', relatedId: conversationId, isRead: false });
    }
    await Notification.create({ userId, type, relatedId: conversationId, message: String(message).slice(0, 300) });
    emitToUser(userId, 'notification:new', {});
  } catch (err) {
    console.error('Could not create the chat notification:', err.message); // the message itself is already saved
  }
}

async function recipientProblem(conversation, side) {
  const recipient = await User.findById(conversation[rules.otherSide(side)]).select('status');
  if (!recipient || recipient.status !== 'active') {
    return { status: 409, code: 'RECIPIENT_UNAVAILABLE', message: 'This student can no longer receive messages.' };
  }
  return null;
}

// ---------- endpoints ----------

/** POST /api/conversations   { listingId }  - open (or reopen) a chat with the seller of an item */
exports.startConversation = asyncHandler(async (req, res) => {
  const { listingId } = parse(startConversationSchema, req.body);

  const listing = await Listing.findById(listingId).populate('category', 'isActive').populate('seller', 'status name');
  const blocked = rules.startChatProblem({
    listing,
    category: listing && listing.category,
    seller: listing && listing.seller,
    userId: req.user._id,
  });
  if (blocked) throwProblem(blocked);

  const filter = { listing: listing._id, buyer: req.user._id };
  let conversation = await Conversation.findOne(filter);
  let created = false;
  if (!conversation) {
    try {
      conversation = await Conversation.create({
        ...filter,
        seller: listing.seller._id,
        listingSnapshot: { title: listing.title, image: listing.images[0] || '', listingType: listing.listingType },
      });
      created = true;
    } catch (err) {
      if (err.code !== 11000) throw err;
      conversation = await Conversation.findOne(filter); // a double click created it a moment ago
    }
  }

  const full = await withRelations(Conversation.findById(conversation._id)).lean();
  res.status(created ? 201 : 200).json({ success: true, data: { conversation: presentConversation(full, req.user._id) } });
});

/** GET /api/conversations - my inbox, most recent first */
exports.listConversations = asyncHandler(async (req, res) => {
  const me = req.user._id;
  const conversations = await withRelations(
    Conversation.find({ $or: [{ buyer: me }, { seller: me, hasMessages: true }] })
      .sort({ lastMessageAt: -1, _id: -1 })
      .limit(100)
  ).lean();

  res.json({
    success: true,
    data: {
      conversations: conversations.map((c) => presentConversation(c, me)),
      unreadTotal: await unreadTotal(me),
    },
  });
});

/** GET /api/conversations/unread-count - for the navbar badge */
exports.unreadCount = asyncHandler(async (req, res) => {
  res.json({ success: true, data: { count: await unreadTotal(req.user._id) } });
});

/** GET /api/conversations/:id */
exports.getConversation = asyncHandler(async (req, res) => {
  const { conversation } = await loadConversation(req);
  const full = await withRelations(Conversation.findById(conversation._id)).lean();
  res.json({ success: true, data: { conversation: presentConversation(full, req.user._id) } });
});

/** GET /api/conversations/:id/messages?before=<messageId>&limit=30 - oldest first inside the page */
exports.listMessages = asyncHandler(async (req, res) => {
  const { conversation } = await loadConversation(req);
  const { before, limit } = parse(messagesQuerySchema, req.query);

  const filter = { conversation: conversation._id };
  if (before) filter._id = { $lt: before };
  const rows = await Message.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();

  res.json({
    success: true,
    data: { messages: rows.slice(0, limit).reverse().map(presentMessage), hasMore: rows.length > limit },
  });
});

/** POST /api/conversations/:id/messages   { text } or { offer: { kind, amount | item }, text? } */
exports.sendMessage = asyncHandler(async (req, res) => {
  const { conversation, side } = await loadConversation(req);
  const input = parse(sendMessageSchema, req.body);

  const listing = await Listing.findById(conversation.listing).select('status listingType');
  if (!listing) throwProblem({ status: 409, code: 'LISTING_DELETED', message: 'This item was deleted, so the conversation is read-only.' });
  const unavailable = await recipientProblem(conversation, side);
  if (unavailable) throwProblem(unavailable);
  if (input.offer) {
    const blocked = rules.offerProblem({ listing, conversation, offer: input.offer });
    if (blocked) throwProblem(blocked);
  }

  // A new offer replaces any offer that is still waiting for an answer
  let superseded = [];
  if (input.offer) {
    const waiting = await Message.find({ conversation: conversation._id, type: 'offer', 'offer.status': 'pending' }).select('_id').lean();
    if (waiting.length) {
      const ids = waiting.map((m) => m._id);
      await Message.updateMany(
        { _id: { $in: ids }, 'offer.status': 'pending' },
        { $set: { 'offer.status': 'superseded', 'offer.respondedAt': new Date() } }
      );
      superseded = ids.map(String);
    }
  }

  const message = await Message.create({
    conversation: conversation._id,
    sender: req.user._id,
    type: input.offer ? 'offer' : 'text',
    text: input.text,
    ...(input.offer
      ? {
          offer: {
            kind: input.offer.kind,
            amount: input.offer.kind === 'price' ? input.offer.amount : undefined,
            item: input.offer.kind === 'exchange' ? input.offer.item : '',
          },
        }
      : {}),
  });
  await recordMessage(conversation, side, message);

  const shaped = presentMessage(message);
  const recipientId = conversation[rules.otherSide(side)];
  pushToBoth(conversation, 'message:new', { conversationId: String(conversation._id), message: shaped });
  superseded.forEach((id) => pushToBoth(conversation, 'offer:updated', { conversationId: String(conversation._id), messageId: id, status: 'superseded' }));
  await pushUnread(recipientId);

  const title = (conversation.listingSnapshot && conversation.listingSnapshot.title) || 'your item';
  await notify(
    recipientId,
    conversation._id,
    input.offer ? 'offer' : 'message',
    input.offer
      ? `${req.user.name} made an offer on "${title}": ${rules.describeOffer(input.offer)}.`
      : `${req.user.name}: ${rules.previewFor(message)}`
  );

  res.status(201).json({ success: true, data: { message: shaped, supersededOffers: superseded } });
});

/** PATCH /api/conversations/:id/messages/:messageId/offer   { action: "accept" | "decline" | "withdraw" } */
exports.respondToOffer = asyncHandler(async (req, res) => {
  const { conversation, side } = await loadConversation(req);
  if (!mongoose.isValidObjectId(req.params.messageId)) throw new AppError('Offer not found.', 404);
  const { action } = parse(offerActionSchema, req.body);

  const offerMessage = await Message.findOne({ _id: req.params.messageId, conversation: conversation._id });
  const blocked = rules.offerResponseProblem({ message: offerMessage, userId: req.user._id, action });
  if (blocked) throwProblem(blocked);

  if (action === 'accept') {
    const listing = await Listing.findById(conversation.listing).select('status');
    if (!listing) throwProblem({ status: 409, code: 'LISTING_DELETED', message: 'This item was deleted, so the conversation is read-only.' });
    if (listing.status !== 'available') throwProblem({ status: 409, code: 'LISTING_CLOSED', message: 'This item is no longer available.' });
    if (conversation.agreedOffer) throwProblem({ status: 409, code: 'DEAL_AGREED', message: 'A deal is already agreed for this item.' });
  }

  // The filter on the status makes this safe if both people press a button at the same moment
  const updated = await Message.findOneAndUpdate(
    { _id: offerMessage._id, type: 'offer', 'offer.status': 'pending' },
    { $set: { 'offer.status': rules.STATUS_FOR_ACTION[action], 'offer.respondedAt': new Date(), 'offer.respondedBy': req.user._id } },
    { new: true }
  );
  if (!updated) throwProblem({ status: 409, code: 'OFFER_NOT_PENDING', message: 'This offer was already answered or replaced by a newer one.' });

  if (action === 'accept') {
    await Conversation.updateOne({ _id: conversation._id, agreedOffer: null }, { $set: { agreedOffer: updated._id } });
  }

  const system = await Message.create({
    conversation: conversation._id,
    sender: null,
    type: 'system',
    text: rules.systemTextFor(action, req.user.name, updated.offer),
  });
  await recordMessage(conversation, side, system);

  const conversationId = String(conversation._id);
  pushToBoth(conversation, 'offer:updated', { conversationId, messageId: String(updated._id), status: updated.offer.status, message: presentMessage(updated) });
  pushToBoth(conversation, 'message:new', { conversationId, message: presentMessage(system) });
  const otherId = conversation[rules.otherSide(side)];
  await pushUnread(otherId);

  const title = (conversation.listingSnapshot && conversation.listingSnapshot.title) || 'the item';
  const verb = { accept: 'accepted', decline: 'declined', withdraw: 'withdrew' }[action];
  await notify(otherId, conversation._id, 'offer', `${req.user.name} ${verb} ${action === 'withdraw' ? 'their' : 'your'} offer on "${title}".`);

  res.json({
    success: true,
    data: { message: presentMessage(updated), systemMessage: presentMessage(system), agreedOffer: action === 'accept' ? String(updated._id) : null },
  });
});

/** POST /api/conversations/:id/read - I opened the chat: clear my unread count, tell the other side ("Seen") */
exports.markRead = asyncHandler(async (req, res) => {
  const { conversation, side } = await loadConversation(req);
  const now = new Date();

  await Conversation.updateOne({ _id: conversation._id }, { $set: { [`unread.${side}`]: 0, [`readAt.${side}`]: now } });
  await Notification.updateMany(
    { userId: req.user._id, type: { $in: ['message', 'offer'] }, relatedId: conversation._id, isRead: false },
    { $set: { isRead: true } }
  );

  emitToUser(conversation[rules.otherSide(side)], 'conversation:read', { conversationId: String(conversation._id), readAt: now });
  const count = await unreadTotal(req.user._id);
  emitToUser(req.user._id, 'unread:update', { count });
  emitToUser(req.user._id, 'notification:new', {}); // the bell may have fewer unread items now

  res.json({ success: true, data: { unread: count, readAt: now } });
});

exports._test = { presentConversation, presentMessage };