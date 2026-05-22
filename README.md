# AquaChat

A full-stack WhatsApp-like web app with React, Tailwind CSS, Node.js, Express, MongoDB, Firebase Authentication, Cloudinary media uploads, Socket.IO realtime messaging, and WebRTC call signaling.

## Features

- Firebase authentication with email/password, Google, and phone OTP.
- Persistent auth state and backend Firebase ID token verification.
- User profiles with display name, avatar, bio, online status, and last seen.
- Direct chats, group chats, admin add/remove controls, typing indicators, delivery receipts, and seen receipts.
- Paginated message history from MongoDB.
- Cloudinary-backed image, video, audio, and voice note uploads.
- 24-hour statuses with seen tracking and MongoDB TTL expiration.
- Voice/video call flow using WebRTC peer connections and Socket.IO signaling.
- Mobile-first WhatsApp-style light UI with aqua and baby pink accents.

## Project Structure

```text
client/
server/
  config/
  controllers/
  middleware/
  models/
  routes/
  socket/
```

## Environment

Create `server/.env`:

```env
MONGODB_URI=YOUR_MONGODB_URI
CLOUDINARY_CLOUD_NAME=YOUR_CLOUD_NAME
CLOUDINARY_API_KEY=YOUR_API_KEY
CLOUDINARY_API_SECRET=YOUR_API_SECRET

FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
FIREBASE_CLIENT_EMAIL=YOUR_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY=YOUR_PRIVATE_KEY
```

Create `client/.env`:

```env
REACT_APP_FIREBASE_API_KEY=YOUR_FIREBASE_API_KEY
REACT_APP_FIREBASE_AUTH_DOMAIN=YOUR_AUTH_DOMAIN
REACT_APP_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
REACT_APP_FIREBASE_APP_ID=YOUR_APP_ID
```

For local development, also set:

```env
# server/.env
CLIENT_URL=http://localhost:5173
PORT=5000

# client/.env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_SOCKET_URL=http://localhost:5000
```

## Run Locally

```bash
npm install
npm run dev:server
npm run dev:client
```

Open `http://localhost:5173`.

## Deployment

- Deploy `client/` to Vercel. Set the frontend Firebase variables plus `REACT_APP_API_URL` and `REACT_APP_SOCKET_URL` to your Render server URL.
- Deploy `server/` to Render. Set all backend secrets, `CLIENT_URL` to the Vercel app URL, and keep Firebase private key line breaks escaped as `\n`.
- Use HTTPS in production so Firebase phone auth, media capture, and WebRTC APIs work reliably.

## Notes

- The frontend only receives Firebase public config.
- The backend verifies Firebase ID tokens before every protected API route and socket connection.
- MongoDB indexes are defined for users, chat membership, message pagination, and status expiration.
- Cloudinary stores media bytes; MongoDB stores URLs and Cloudinary public IDs.
"# Aqua-chat" 
