# Firebase & Vercel Configuration Checklist

## Firebase Configuration Checklist

### Project Setup
- [ ] Firebase project created
- [ ] Billing enabled (if using paid features)
- [ ] Google Cloud project linked
- [ ] Blaze plan selected (required for external API calls)

### Authentication
- [ ] Email/Password enabled
- [ ] Google Sign-In enabled
- [ ] Phone authentication enabled (optional)
- [ ] Google OAuth client created in Cloud Console
- [ ] OAuth consent screen configured

### Authorized Domains (Firebase Console → Authentication → Settings)
- [ ] `localhost`
- [ ] `aquachat.vercel.app`
- [ ] `www.aquachat.vercel.app`
- [ ] Custom domain (if applicable)

### Google OAuth Redirect URIs (Google Cloud Console → Credentials)
- [ ] `http://localhost:5173`
- [ ] `http://localhost:3000`
- [ ] `https://aquachat.vercel.app`
- [ ] `https://www.aquachat.vercel.app`
- [ ] Custom domain (if applicable)

### Firestore Database
- [ ] Firestore database created in production mode
- [ ] Collections created:
  - [ ] `users`
  - [ ] `chats`
  - [ ] `messages`
  - [ ] `statuses`
- [ ] Security rules configured:
  ```firestore
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /users/{userId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
      match /chats/{chatId} {
        allow read: if request.auth != null;
        allow write: if request.auth != null;
      }
      match /messages/{messageId} {
        allow read: if request.auth != null;
        allow write: if request.auth != null;
      }
    }
  }
  ```

### Realtime Database
- [ ] Database created
- [ ] Security rules configured
- [ ] Location matches Firestore

### Cloud Storage
- [ ] Storage bucket created
- [ ] Security rules configured:
  ```
  rules_version = '2';
  service firebase.storage {
    match /b/{bucket}/o {
      match /users/{userId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
  ```

### Environment Variables
- [ ] API key from Firebase Console
- [ ] Auth domain noted
- [ ] Project ID noted
- [ ] App ID noted
- [ ] Database URL noted
- [ ] Storage bucket noted
- [ ] Messaging sender ID noted

## Vercel Configuration Checklist

### Project Setup
- [ ] Repository connected to Vercel
- [ ] Root directory set to `client`
- [ ] Framework preset: React
- [ ] Build command: `npm run build`
- [ ] Output directory: `dist`

### Environment Variables (Settings → Environment Variables)

Add these variables for **Production**:
- [ ] `VITE_FIREBASE_API_KEY`
- [ ] `VITE_FIREBASE_AUTH_DOMAIN`
- [ ] `VITE_FIREBASE_PROJECT_ID`
- [ ] `VITE_FIREBASE_APP_ID`
- [ ] `VITE_FIREBASE_DATABASE_URL`
- [ ] `VITE_FIREBASE_STORAGE_BUCKET`
- [ ] `VITE_FIREBASE_MESSAGING_SENDER_ID`
- [ ] `VITE_API_URL=https://aquachat-api.onrender.com`
- [ ] `VITE_API_BASE=/api`

Add these variables for **Preview**:
- Same as production (or use development API if needed)

### Domains
- [ ] Default vercel.app domain works
- [ ] Custom domain added (Settings → Domains)
- [ ] DNS records configured
- [ ] SSL certificate auto-generated
- [ ] Domain added to Firebase Authorized Domains

### Build Settings
- [ ] Node.js version: 18.x or 20.x
- [ ] npm installed successfully
- [ ] Build completes without errors
- [ ] No unused dependencies warnings

### Deployments
- [ ] Initial deployment successful
- [ ] All environment variables loaded
- [ ] App accessible without errors
- [ ] Service worker registered
- [ ] PWA installable

### Monitoring
- [ ] Vercel Analytics enabled
- [ ] Build logs checked
- [ ] Runtime errors monitored
- [ ] Performance metrics reviewed

## API Configuration Checklist

### Backend Environment (server/.env)

```
NODE_ENV=production
PORT=3000
FIREBASE_PROJECT_ID=aquachat-xxx
CORS_ORIGIN=https://aquachat.vercel.app
CORS_ALLOW_CREDENTIALS=true
```

### CORS Headers
- [ ] Set correct origin
- [ ] Allow credentials
- [ ] Allow methods: GET, POST, PUT, DELETE, PATCH
- [ ] Allow headers: Content-Type, Authorization

### API Routes
- [ ] Authentication endpoints protected
- [ ] Database operations secured
- [ ] File upload endpoints secured
- [ ] Rate limiting implemented (optional)

## Security Checklist

### Firebase Security
- [ ] All authentication methods secure
- [ ] Database rules restrict unauthorized access
- [ ] Storage rules restrict unauthorized access
- [ ] Admin SDK credentials not exposed
- [ ] Service account key secured

### Frontend Security
- [ ] No API keys exposed in client code (use environment variables)
- [ ] All API calls use HTTPS
- [ ] Input validation on all forms
- [ ] XSS protection enabled (React built-in)
- [ ] CSRF tokens used (if applicable)

### Deployment Security
- [ ] HTTPS enforced everywhere
- [ ] Vercel security headers configured
- [ ] Backend CORS restricted
- [ ] Sensitive env vars in Vercel (not in code)
- [ ] API keys rotated regularly

## Performance Optimization Checklist

### Build Optimization
- [ ] Tree-shaking enabled
- [ ] Code splitting configured
- [ ] Minification enabled
- [ ] Dead code eliminated
- [ ] Bundle size < 500KB gzipped

### Runtime Optimization
- [ ] Lazy loading implemented
- [ ] Image optimization enabled
- [ ] Service worker caching configured
- [ ] API response caching configured
- [ ] Database queries optimized

### Monitoring
- [ ] Bundle analysis reviewed
- [ ] Vercel Analytics checked
- [ ] Performance metrics monitored
- [ ] Error rate tracked
- [ ] API response times measured

## Testing Checklist

### Functionality
- [ ] Email login/signup works
- [ ] Google login works
- [ ] Phone OTP works (if enabled)
- [ ] Messaging works end-to-end
- [ ] Groups create and work
- [ ] User search works
- [ ] File uploads work
- [ ] Offline mode works

### Cross-Device
- [ ] Desktop (Chrome, Firefox, Safari, Edge)
- [ ] Android (Chrome Mobile)
- [ ] iPhone/iPad (Safari)
- [ ] Tablet responsiveness
- [ ] PWA installation on each device

### PWA Features
- [ ] Installable on Android
- [ ] Installable on iOS
- [ ] Works offline
- [ ] Syncs online
- [ ] Push notifications (if enabled)

## Deployment Rollback Checklist

If you need to rollback:

### Vercel Rollback
1. [ ] Go to Deployments
2. [ ] Find previous working deployment
3. [ ] Click "..." → "Promote to Production"
4. [ ] Verify domain returns to previous state

### Environment Variables Rollback
1. [ ] Check previous values in version control
2. [ ] Update in Vercel settings
3. [ ] Trigger new deployment
4. [ ] Test thoroughly

## Monitoring & Maintenance

### Regular Tasks
- [ ] Check Vercel build logs (weekly)
- [ ] Review Firebase quota usage (weekly)
- [ ] Check error tracking (daily in production)
- [ ] Update dependencies (monthly)
- [ ] Test all features (quarterly)

### Alerts to Set Up
- [ ] Vercel build failures
- [ ] Firebase quota exceeded
- [ ] High error rate
- [ ] Deployment stuck
- [ ] API response time degradation

---

**Last Updated**: May 2026
**Version**: 2.0
**Maintainer**: Development Team
