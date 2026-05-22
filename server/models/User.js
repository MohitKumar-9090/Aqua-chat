import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    firebaseUid: { type: String, required: true, unique: true, index: true },
    displayName: { type: String, trim: true, required: true, default: 'New Friend' },
    username: { type: String, trim: true, lowercase: true, unique: true, sparse: true, index: true },
    email: { type: String, trim: true, lowercase: true, index: true },
    phoneNumber: { type: String, trim: true, index: true },
    searchableKeywords: [{ type: String, index: true }],
    photoURL: { type: String, default: '' },
    bio: { type: String, trim: true, default: 'Hey there! I am using AquaChat.' },
    verified: { type: Boolean, default: false },
    isOnline: { type: Boolean, default: false },
    lastSeen: { type: Date, default: Date.now },
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    connectionRequestsSent: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    connectionRequestsReceived: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    connections: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  },
  { timestamps: true }
);

userSchema.index({ username: 'text', displayName: 'text', email: 'text', phoneNumber: 'text' });
userSchema.index({ phoneNumber: 1 });
userSchema.index({ email: 1 });

const normalizeSearchValue = (value = '') => value.toString().trim().toLowerCase();
const normalizePhoneValue = (value = '') => value.toString().replace(/[^\d+]/g, '');
const prefixes = (value = '') => {
  const clean = normalizeSearchValue(value);
  return Array.from({ length: clean.length }, (_, index) => clean.slice(0, index + 1));
};

userSchema.pre('save', function setSearchableKeywords(next) {
  const values = [
    this.displayName,
    this.username,
    this.email,
    this.phoneNumber,
    normalizePhoneValue(this.phoneNumber)
  ].filter(Boolean);

  this.searchableKeywords = [...new Set(values.flatMap((value) => [normalizeSearchValue(value), ...prefixes(value)]))];
  next();
});

userSchema.virtual('name').get(function getName() {
  return this.displayName;
});

userSchema.virtual('phone').get(function getPhone() {
  return this.phoneNumber;
});

userSchema.virtual('profilePicture').get(function getProfilePicture() {
  return this.photoURL;
});

userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

export default mongoose.model('User', userSchema);
