// Shared by the models, the validators and the chat rules.
exports.MAX_MESSAGE_LENGTH = 1000;
exports.MAX_EXCHANGE_ITEM_LENGTH = 200;
exports.MESSAGE_TYPES = ['text', 'offer', 'system'];
exports.OFFER_KINDS = ['price', 'exchange'];
// pending -> accepted | declined (by the other side) | withdrawn (by the sender) | superseded (a newer offer replaced it)
exports.OFFER_STATUSES = ['pending', 'accepted', 'declined', 'withdrawn', 'superseded'];
exports.OFFER_ACTIONS = ['accept', 'decline', 'withdraw'];