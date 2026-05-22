import mongoose from 'mongoose';

const seenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, default: Date.now }
  },
  { _id: false }
);

const statusSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['image', 'video', 'text'], required: true },
    caption: { type: String, trim: true, default: '' },
    mediaUrl: { type: String, default: '' },
    background: { type: String, default: '#9AE6E6' },
    seenBy: [seenSchema],
    expiresAt: { type: Date, required: true }
  },
  { timestamps: true }
);

statusSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
statusSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model('Status', statusSchema);
