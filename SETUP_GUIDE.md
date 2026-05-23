# AquaChat - Complete Setup & Deployment Guide

## Table of Contents
1. [Project Overview](#project-overview)
2. [Prerequisites](#prerequisites)
3. [Firebase Configuration](#firebase-configuration)
4. [Environment Variables](#environment-variables)
5. [Local Development](#local-development)
6. [Vercel Deployment](#vercel-deployment)
7. [Render Backend Deployment](#render-backend-deployment)
8. [PWA Configuration](#pwa-configuration)
9. [Mobile App Installation](#mobile-app-installation)
10. [Testing Checklist](#testing-checklist)
11. [Troubleshooting](#troubleshooting)

## Project Overview

**AquaChat** is a premium real-time messaging platform with:
- Real-time messaging and group chats
- Firebase Authentication (Email, Google, Phone)
- Progressive Web App (PWA) support
- Responsive design for all devices
- Offline support with service workers
- Status updates and user search
- Premium glassmorphism UI

### Tech Stack
- **Frontend**: React 18 + Vite + Tailwind CSS
- **Backend**: Node.js + Express
- **Auth**: Firebase Authentication
- **Database**: Firebase Realtime DB + Firestore
- **Storage**: Firebase Cloud Storage
- **Hosting**: Vercel (Frontend) + Render (Backend)

## Prerequisites

### Required
- Node.js 18+ (LTS recommended)
- npm 8+ or yarn
- Firebase account (https://firebase.google.com)
- Vercel account (https://vercel.com)
- Render account (https://render.com)
- Google Cloud Console project

### Optional
- Mobile device for testing
- Ngrok for local tunnel testing

## Firebase Configuration

### Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com)
2. Click "Create a project"
3. Project name: `aquachat` (or your choice)
4. Enable Google Analytics (optional)
5. Select or create Google Cloud project
6. Wait for project creation

### Step 2: Enable Authentication Methods

1. In Firebase Console, go to **Build** → **Authentication**
2. Click **Get Started**
3. Enable these sign-in methods:
   - **Email/Password**: 
     - Enable both "Email/password" and "Email link (passwordless sign-in)"
   - **Google**:
     - Click "Google"
     - Enable it
     - Add project support email and public-facing name
   - **Phone** (optional):
     - Click "Phone"
     - Enable it
     - Add test phone numbers for development

### Step 3: Configure Google OAuth Redirect URIs

1. Go to **Project Settings** → **Service Accounts** → **Google Cloud Console**
2. Or go directly to [Google Cloud Console](https://console.cloud.google.com)
3. Select your project
4. Go to **APIs & Services** → **OAuth 2.0 Consent Screen**
5. Configure:
   - App name: "AquaChat"
   - User support email: your-email@gmail.com
   - Developer contact: your-email@gmail.com
6. Go to **APIs & Services** → **Credentials**
7. Find your "Web client" OAuth 2.0 ID
8. Click on it to edit
9. Add authorized redirect URIs:
   ```
   http://localhost:5173
   http://localhost:3000
   https://aquachat.vercel.app
   https://www.aquachat.vercel.app
   https://your-custom-domain.com
   ```
10. Save

### Step 4: Configure Authorized Domains

1. In Firebase Console, go to **Build** → **Authentication**
2. Click **Settings** tab
3. Scroll to "Authorized domains"
4. Add:
   ```
   localhost
   aquachat.vercel.app
   www.aquachat.vercel.app
   your-custom-domain.com
   ```

### Step 5: Set Up Firestore Database

1. Go to **Build** → **Firestore Database**
2. Click **Create Database**
3. Choose location: `us-central1` (or nearest to you)
4. Start in **production mode**
5. Create collection `users`
6. Create collection `chats`
7. Create collection `messages`
8. Create collection `statuses`

### Step 6: Set Up Realtime Database

1. Go to **Build** → **Realtime Database**
2. Click **Create Database**
3. Choose location: `us-central1`
4. Start in **locked mode** (restrictive rules)

### Step 7: Set Up Cloud Storage

1. Go to **Build** → **Cloud Storage**
2. Click **Get Started**
3. Choose location: `us-central1`
4. Start with restrictive security rules

### Step 8: Get Firebase Configuration

1. Go to **Project Settings** (gear icon)
2. In **Your apps** section, select the web app
3. Copy the Firebase configuration:
   ```javascript
   {
     apiKey: "AIza...",
     authDomain: "aquachat-xxx.firebaseapp.com",
     projectId: "aquachat-xxx",
     storageBucket: "aquachat-xxx.appspot.com",
     messagingSenderId: "xxx",
     appId: "1:xxx:web:xxx",
     databaseURL: "https://aquachat-xxx-default-rtdb.firebaseio.com",
   }
   ```

## Environment Variables

### Local Development (.env.local)

Create `client/.env.local`:

```bash
# Firebase Configuration
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=aquachat-xxx.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=aquachat-xxx
VITE_FIREBASE_APP_ID=1:xxx:web:xxx
VITE_FIREBASE_DATABASE_URL=https://aquachat-xxx-default-rtdb.firebaseio.com
VITE_FIREBASE_STORAGE_BUCKET=aquachat-xxx.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=xxx

# API Configuration
VITE_API_URL=http://localhost:3000
VITE_API_BASE=/api

# Environment
VITE_ENV=development
```

Create `server/.env`:

```bash
# Server
NODE_ENV=development
PORT=3000

# Database (if using MongoDB/PostgreSQL)
DATABASE_URL=...

# Firebase Admin
FIREBASE_ADMIN_SDK_KEY=... # Service account JSON
FIREBASE_PROJECT_ID=aquachat-xxx

# CORS
CORS_ORIGIN=http://localhost:5173

# Mail Service (optional)
SMTP_HOST=...
SMTP_PORT=...
SMTP_USER=...
SMTP_PASS=...
```

## Local Development

### Step 1: Install Dependencies

```bash
# Frontend
cd client
npm install

# Backend
cd ../server
npm install
```

### Step 2: Start Backend Server

```bash
cd server
npm run dev
```

Server runs on `http://localhost:3000`

### Step 3: Start Frontend (new terminal)

```bash
cd client
npm run dev
```

Frontend runs on `http://localhost:5173`

### Step 4: Test in Browser

- Open `http://localhost:5173`
- Sign up with email or Google
- Test messaging features
- Open DevTools → Application → Service Workers (check if registered)

## Vercel Deployment

### Step 1: Prepare Repository

```bash
# Initialize git if not done
git init
git add .
git commit -m "Initial commit"
```

### Step 2: Connect to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click "New Project"
3. Import your Git repository
4. Select `client` as root directory
5. Framework: React
6. Build command: `npm run build`
7. Output directory: `dist`

### Step 3: Add Environment Variables

In Vercel Project Settings → Environment Variables, add:

```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=aquachat-xxx.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=aquachat-xxx
VITE_FIREBASE_APP_ID=1:xxx:web:xxx
VITE_FIREBASE_DATABASE_URL=https://...
VITE_FIREBASE_STORAGE_BUCKET=aquachat-xxx.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=xxx
VITE_API_URL=https://aquachat-api.onrender.com (backend URL)
VITE_API_BASE=/api
```

### Step 4: Deploy

1. Click "Deploy"
2. Wait for build to complete
3. Visit your Vercel URL
4. Test Google login (should work now)

### Step 5: Configure Production Domain

1. In Vercel Settings → Domains
2. Add your custom domain
3. Follow DNS configuration
4. Update Firebase Authorized Domains with your domain

## Render Backend Deployment

### Step 1: Prepare Backend

1. Add `start` script to `server/package.json`:
   ```json
   "scripts": {
     "start": "node index.js",
     "dev": "nodemon index.js"
   }
   ```

2. Ensure port is configurable:
   ```javascript
   const PORT = process.env.PORT || 3000;
   ```

### Step 2: Deploy to Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Select your repository
4. Configure:
   - Name: `aquachat-api`
   - Environment: `Node`
   - Build: `npm install`
   - Start: `npm start`
   - Region: Select closest to you
5. Add environment variables:
   ```
   NODE_ENV=production
   FIREBASE_PROJECT_ID=aquachat-xxx
   CORS_ORIGIN=https://aquachat.vercel.app
   ```

### Step 3: Update Backend CORS

In `server/index.js`:

```javascript
app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://aquachat.vercel.app',
    'https://www.aquachat.vercel.app',
    process.env.CORS_ORIGIN
  ],
  credentials: true
}));
```

### Step 4: Update Frontend API URL

After Render deploys, update Vercel with:

```
VITE_API_URL=https://aquachat-api.onrender.com
```

## PWA Configuration

### Step 1: Verify Web App Manifest

Check `client/public/manifest.webmanifest`:
- ✅ App name and short name
- ✅ Icons (any size, maskable versions)
- ✅ Start URL with PWA indicator
- ✅ Display mode: standalone
- ✅ Theme color and background color
- ✅ Orientation: portrait-primary

### Step 2: Verify Service Worker

Check `client/public/sw.js`:
- ✅ App shell caching
- ✅ Offline fallback page
- ✅ Network-first strategy for API
- ✅ Stale-while-revalidate for assets
- ✅ Push notification support
- ✅ Background sync support

### Step 3: Register Service Worker

Already done in `client/src/main.jsx` and App component:

```javascript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

### Step 4: HTTPS Requirement

PWAs only work over HTTPS:
- ✅ Vercel: Automatic HTTPS
- ✅ Render: Automatic HTTPS
- ✅ Custom domain: Use Let's Encrypt or similar

### Step 5: Test PWA Features

1. Open app in Chrome/Edge:
   - Look for "Install" button in address bar
   - Click to install
   - App should launch fullscreen

2. Open DevTools → Application:
   - Check Service Workers (registered)
   - Check Manifest (valid)
   - Check Offline (can load offline.html)

3. Test offline:
   - Go online, load app
   - Go to DevTools → Network → Offline
   - Refresh - should see cached content

## Mobile App Installation

### Android

1. **In Browser**:
   - Open AquaChat in Chrome
   - Wait 30 seconds
   - Tap "Install" button at bottom
   - Follow prompts
   - App appears on home screen

2. **Via Add to Home Screen**:
   - Tap menu (⋮)
   - "Add to home screen"
   - App launches fullscreen

### iPhone/iPad

1. **Safari**:
   - Open AquaChat in Safari
   - Tap Share button
   - "Add to Home Screen"
   - App appears on home screen
   - Tap to launch fullscreen

2. **Standalone Mode**:
   - Appears in fullscreen without Safari UI
   - Status bar shows battery/signal
   - Swipe up to close

### Requirements for Installation

- ✅ HTTPS (all browsers require this)
- ✅ Valid web app manifest
- ✅ Service worker registered
- ✅ Icons provided (any size works, prefer SVG)
- ✅ Start URL specified
- ✅ Standalone display mode

## Testing Checklist

### Authentication
- [ ] Email signup works
- [ ] Email login works
- [ ] Email verification works (if enabled)
- [ ] Google popup sign-in works
- [ ] Google redirect sign-in works (popup blocked fallback)
- [ ] Phone OTP sign-in works
- [ ] Logout works
- [ ] Session persists on page refresh
- [ ] Multiple Gmail accounts work
- [ ] Error messages are clear

### Messaging
- [ ] Send text messages
- [ ] Receive messages in real-time
- [ ] Send images/videos/audio
- [ ] Create group chats
- [ ] Add/remove group members
- [ ] Display typing indicators
- [ ] Show message delivery status
- [ ] Mark messages as read

### People & Search
- [ ] Search users by email
- [ ] Search users by phone
- [ ] Search users by username
- [ ] Connect with users
- [ ] View user profiles
- [ ] Follow/unfollow users

### Mobile Responsiveness
- [ ] Auth screen responsive on mobile (320px - 768px)
- [ ] Chat area responsive
- [ ] Sidebar collapses on mobile
- [ ] Navigation works on mobile
- [ ] No horizontal scrolling
- [ ] Touch-friendly button sizes (44x44px minimum)
- [ ] Text readable on mobile
- [ ] Images scale properly

### PWA Features
- [ ] Install prompt appears on Android
- [ ] App installs to home screen
- [ ] App launches fullscreen (standalone)
- [ ] Works offline (loads app shell)
- [ ] Service worker registered
- [ ] Caching strategy working
- [ ] Push notifications (if enabled)
- [ ] Splash screen shows (with icon)

### Performance
- [ ] App loads in < 3 seconds
- [ ] Messages send/receive quickly
- [ ] No lag on typing
- [ ] Images load progressively
- [ ] No memory leaks (check DevTools)
- [ ] Bundle size reasonable (< 500KB gzipped)

### Cross-Browser
- [ ] Chrome/Chromium (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Chrome Mobile (Android)
- [ ] Safari Mobile (iOS)

### Accessibility
- [ ] Keyboard navigation works
- [ ] Color contrast sufficient
- [ ] Touch targets 44x44px minimum
- [ ] Labels on form fields
- [ ] Alt text on images

## Troubleshooting

### Google Sign-In Issues

**Problem**: "auth/popup-blocked" error
- **Solution**: 
  - Allow popups in browser
  - Check popup blocker settings
  - App will fallback to redirect automatically

**Problem**: "auth/invalid-credential" error
- **Solution**:
  - Verify Google OAuth settings in Firebase
  - Check authorized redirect URIs
  - Ensure domain is authorized
  - Clear browser cache and cookies

**Problem**: Only one Gmail account works
- **Solution**:
  - This means Google OAuth isn't properly configured
  - Check Firebase Authorized Domains
  - Check Google OAuth redirect URIs
  - Verify service account permissions

### Deployment Issues

**Problem**: Environmental variables not loading
- **Solution**:
  - Restart deployment after adding env vars
  - Use `VITE_` prefix for Vite
  - Check spelling exactly

**Problem**: CORS errors
- **Solution**:
  - Add frontend URL to backend CORS
  - Restart backend server
  - Check API_URL matches exactly

**Problem**: Service worker not updating
- **Solution**:
  - Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
  - Clear DevTools cache
  - Unregister old service worker

### Mobile Installation

**Problem**: Install button not appearing
- **Solution**:
  - Must be HTTPS
  - Must have valid manifest
  - Must have service worker
  - Wait 30+ seconds
  - Try different browser

**Problem**: App won't launch fullscreen
- **Solution**:
  - Check manifest display: "standalone"
  - Re-install app
  - Check start_url in manifest

### Performance Issues

**Problem**: App is slow
- **Solution**:
  - Check bundle size: `npm run build` then check `dist` folder
  - Enable Vite preload/prefetch
  - Check for N+1 API calls
  - Use React DevTools Profiler

**Problem**: High memory usage
- **Solution**:
  - Check for memory leaks in DevTools
  - Ensure components unmount properly
  - Clear listeners in useEffect cleanup
  - Check for circular references

## Support

For issues or questions:
1. Check error messages in browser console
2. Check this troubleshooting guide
3. Review Firebase documentation
4. Check Vercel deployment logs
5. Check Render deployment logs

---

**Last Updated**: May 2026
**Version**: 2.0
**Status**: Production Ready
