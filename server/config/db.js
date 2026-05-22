import mongoose from 'mongoose';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const connectDB = async () => {
  const uri = process.env.MONGODB_URI;

  if (!uri || uri === 'YOUR_MONGODB_URI') {
    throw new Error('MONGODB_URI is required in server/.env');
  }

  mongoose.set('strictQuery', true);

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      console.log(`Connecting to MongoDB, attempt ${attempt}/3`);
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        connectTimeoutMS: 10000
      });
      console.log('MongoDB connected');
      return;
    } catch (error) {
      console.error(`MongoDB connection attempt ${attempt} failed: ${error.message}`);
      if (attempt === 3) throw error;
      await wait(1500 * attempt);
    }
  }
};
