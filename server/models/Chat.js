import mongoose from 'mongoose';

const participantSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['member', 'admin'], default: 'member' },
    joinedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const chatSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['direct', 'group'], required: true, index: true },
    name: { type: String, trim: true },
    avatarUrl: { type: String, default: '' },
    participants: [participantSchema],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' }
  },
  { timestamps: true }
);

chatSchema.index({ 'participants.user': 1, updatedAt: -1 });
chatSchema.index({ type: 1, 'participants.user': 1 });

export default mongoose.model('Chat', chatSchema);
