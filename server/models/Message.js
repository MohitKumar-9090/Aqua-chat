import mongoose from 'mongoose';

const readReceiptSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, default: Date.now }
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    chat: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'voice', 'file', 'call'],
      default: 'text'
    },
    body: { type: String, trim: true, default: '' },
    mediaUrl: { type: String, default: '' },
    cloudinaryPublicId: { type: String, default: '' },
    duration: { type: Number, default: 0 },
    status: { type: String, enum: ['sent', 'delivered', 'seen'], default: 'sent' },
    deliveredTo: [readReceiptSchema],
    seenBy: [readReceiptSchema],
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' }
  },
  { timestamps: true }
);

messageSchema.index({ chat: 1, createdAt: -1 });
messageSchema.index({ sender: 1, createdAt: -1 });

export default mongoose.model('Message', messageSchema);
