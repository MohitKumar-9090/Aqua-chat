import Status from '../models/Status.js';
import { asyncHandler, createError } from '../utils/asyncHandler.js';

export const listStatuses = asyncHandler(async (_req, res) => {
  const statuses = await Status.find({ expiresAt: { $gt: new Date() } })
    .populate('user', 'displayName username photoURL')
    .populate('seenBy.user', 'displayName username photoURL')
    .sort({ createdAt: -1 });

  res.json({ statuses });
});

export const createStatus = asyncHandler(async (req, res) => {
  const { type = 'text', caption = '', mediaUrl = '', background = '#9AE6E6' } = req.body;
  if (type !== 'text' && !mediaUrl) {
    throw createError(400, 'mediaUrl is required for media statuses');
  }

  const status = await Status.create({
    user: req.user._id,
    type,
    caption,
    mediaUrl,
    background,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
  });

  const populated = await Status.findById(status._id).populate('user', 'displayName username photoURL');
  req.app.get('io')?.emit('status:new', populated);
  res.status(201).json({ status: populated });
});

export const markStatusSeen = asyncHandler(async (req, res) => {
  const status = await Status.findById(req.params.statusId);
  if (!status) throw createError(404, 'Status not found');

  const alreadySeen = status.seenBy.some((receipt) => receipt.user.toString() === req.user._id.toString());
  if (status.user.toString() !== req.user._id.toString() && !alreadySeen) {
    status.seenBy.push({ user: req.user._id, at: new Date() });
    await status.save();
  }

  res.json({ status });
});
