const mongoose = require('mongoose');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { parse, resubmitSchema } = require('../utils/validators');
const { saveIdCard, deleteIdCard } = require('../utils/fileStore');
const sendIdCard = require('../utils/sendIdCard');
const { toRegKey } = require('../utils/regKey');
const { regKeyInUse } = require('../utils/accountLookup');
const { detectImageType } = require('../utils/imageType');

const idCardError = (message) =>
  new AppError(message, 400, { code: 'VALIDATION_ERROR', errors: { idCard: message } });

/**
 * POST /api/verification/resubmit   (multipart/form-data)
 * A rejected student uploads a new ID card (and optionally a corrected registration
 * number). The account goes back to "pending" for the admin queue (FR5).
 */
exports.resubmit = asyncHandler(async (req, res) => {
  const { universityRegNumber } = parse(resubmitSchema, req.body);

  if (req.user.verificationStatus !== 'rejected') {
    throw new AppError(
      req.user.verificationStatus === 'verified'
        ? 'Your account is already verified.'
        : 'Your verification is already waiting for review.',
      409,
      { code: 'INVALID_STATE' }
    );
  }

  if (!req.file) throw idCardError('Please upload a new photo of your university ID card.');
  const ext = detectImageType(req.file.buffer);
  if (!ext) throw idCardError('That file is not a valid JPG or PNG image.');

  // A different spelling of the same number (241-35-032 / 24135032) counts as the same number
  const newRegKey = universityRegNumber ? toRegKey(universityRegNumber) : null;
  if (newRegKey && newRegKey !== toRegKey(req.user.universityRegNumber)) {
    if (await regKeyInUse(newRegKey, { exceptUserId: req.user._id })) {
      const message = 'This university registration number is already registered.';
      throw new AppError(message, 409, { code: 'DUPLICATE', errors: { universityRegNumber: message } });
    }
  }

  const oldFile = req.user.idCardImageUrl;
  const newFile = await saveIdCard(req.file.buffer, ext);

  const set = {
    verificationStatus: 'pending',
    rejectionReason: '',
    idCardImageUrl: newFile,
    verificationSubmittedAt: new Date(),
    reviewedAt: null,
    reviewedBy: null,
  };
  if (universityRegNumber) {
    set.universityRegNumber = universityRegNumber;
    set.regKey = newRegKey;
  }

  let result;
  try {
    // The status filter makes this atomic: two parallel requests cannot both succeed.
    result = await User.updateOne(
      { _id: req.user._id, verificationStatus: 'rejected' },
      { $set: set },
      { runValidators: true }
    );
  } catch (err) {
    await deleteIdCard(newFile); // e.g. duplicate registration number
    throw err;
  }

  if (result.matchedCount === 0) {
    await deleteIdCard(newFile);
    throw new AppError('Your verification is no longer in a rejected state.', 409, { code: 'INVALID_STATE' });
  }

  const user = await User.findById(req.user._id);
  await deleteIdCard(oldFile); // the previous ID image is no longer needed
  res.json({
    success: true,
    message: 'Thanks! Your new ID card is now waiting for admin review.',
    data: { user },
  });
});

/**
 * GET /api/verification/id-card/:userId
 * The ONLY way to read an ID card image: allowed for its owner and for admins.
 */
exports.getIdCard = asyncHandler(async (req, res, next) => {
  const { userId } = req.params;
  if (!mongoose.isValidObjectId(userId)) throw new AppError('ID card not found.', 404);

  const isOwner = String(req.user._id) === String(userId);
  if (!isOwner && req.user.role !== 'admin') {
    throw new AppError('You are not allowed to view this document.', 403, { code: 'FORBIDDEN' });
  }

  const target = await User.findById(userId).select('idCardImageUrl');
  if (!target || !target.idCardImageUrl) throw new AppError('ID card not found.', 404);

  sendIdCard(res, next, target.idCardImageUrl);
});
