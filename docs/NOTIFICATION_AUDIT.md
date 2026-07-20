# AquaChat notification audit

Audit date: 2026-07-20  
Implemented stack: React/Vite PWA, Firebase Auth/Firestore/RTDB/FCM, Node/Express on Render.

## Scope finding

This repository contains no Flutter project, AndroidManifest, native Android notification code, or `flutter_local_notifications` integration. Android 13 runtime permission handling, notification channels, notification badges, and full-screen call intents therefore cannot be implemented or verified here. The PWA requests the browser notification permission and uses Web Push/FCM instead.

## Notification flow

1. A signed-in user writes a Firestore message or RTDB call room/index.
2. The Render listener validates the Firestore chat or canonical RTDB call room.
3. Render claims a recipient/event document in `notificationEvents` before FCM delivery.
4. Firebase Admin sends a data-only FCM payload to valid recipient tokens.
5. The page handles foreground FCM via `onMessage`; the Firebase service worker handles background/terminated delivery via `onBackgroundMessage`.
6. Notification click data contains `chatId`, `callId`, action, and URL; the page opens the correct chat or invokes the current call action.

`notificationEvents` is internal-only (Firestore rules have no matching allow rule), retained for 30 days, and pruned by the Render process.

## Issues found and disposition

| Severity | Finding | Root cause | Disposition |
| --- | --- | --- | --- |
| Critical | Duplicate message notifications | Chat-list changes generated browser notifications in addition to FCM. | Fixed: FCM is the single delivery source. |
| Critical | Duplicate background push notifications | The service worker registered both raw `push` and Firebase `onBackgroundMessage` handlers. | Fixed: only Firebase background messaging executes. |
| Critical | Cross-instance duplicate sends | Deduplication was only an in-memory Render map. | Fixed: durable Firestore recipient/event claims. |
| High | Notifications lost during Render restart | Startup watermark excluded messages created while the process was down. | Fixed: durable Firestore listener checkpoint replays the downtime window. |
| High | Incoming-call trigger could be spoofed/stale | `userIncoming` index was trusted without checking the RTDB room. | Fixed: room, caller, participant, and ringing status are checked first. |
| High | Call click could not reliably open its chat | RTDB call rooms did not store `chatId`. | Fixed for new calls: room now stores `chatId`; FCM payload uses it. |
| Medium | Token rotation accumulated stale tokens | The browser persisted new tokens without removing its prior token. | Fixed: a browser installation replaces its prior locally recorded token; Admin removes FCM-invalid tokens. |
| Medium | In-memory message dedupe could grow without bound | A process-local map retained every message for 24 hours. | Fixed: durable claims replace the map. |
| Low | Service worker keepalive survived component cleanup | No cleanup called `stopSwKeepalive`. | Fixed. |
| High, open | Chat document update rule is overly broad | Any chat participant may update the entire chat document, including membership. This can be abused to influence the server's recipient list. | Not changed: safely tightening it requires a coordinated review of group management and unread-count writes. |
| High, open | Native Android parity is unavailable | This is a PWA-only repository. | A Flutter/Android project is required for channels, Android 13 permission, badge APIs, and full-screen call intent. |

## Delivery and retry semantics

The service retries only FCM responses that explicitly identify a token as transiently failed. It never retries a thrown multicast request because its delivery state is unknown; retrying that whole batch is a duplicate-notification risk. The durable listener checkpoint replays messages missed while Render is unavailable. This is deliberate at-most-once notification behavior; FCM itself cannot provide a true exactly-once acknowledgement after an unknown network outcome.

## Required deployment checks

- Configure `FIREBASE_SERVICE_ACCOUNT_JSON` (or project credentials) and `FIREBASE_DATABASE_URL` only in Render secrets.
- Configure `VITE_FIREBASE_MESSAGING_VAPID_KEY` in the web deployment.
- Deploy `firestore.rules` and `database.rules.json`; then address the open chat-update rule before treating the system as security-complete.
- Confirm the FCM API is enabled for the Firebase project and the deployed service worker is `/firebase-messaging-sw.js`.

## Manual test checklist

- [ ] On two accounts/devices, send one direct message with receiver foregrounded; exactly one foreground notification is displayed unless that chat is already selected.
- [ ] Repeat with the receiver backgrounded and with the PWA terminated; exactly one system notification appears.
- [ ] Send one group message; every other group member receives one notification with group context.
- [ ] Tap a message notification from a running PWA and a terminated PWA; the intended chat opens.
- [ ] Start a voice and video call in foreground, background, and terminated states; one incoming notification arrives and its Accept/Reject action reaches the active call flow.
- [ ] Rotate/revoke the browser FCM token, reload, and confirm `users/{uid}.fcmTokens` replaces the local old token. Confirm an FCM invalid-token response removes the token server-side.
- [ ] Restart one Render instance during a test message; inspect Render logs for `duplicate_suppressed`/`fcm_send_complete` and verify one notification only.
- [ ] Run two Render instances briefly; verify the same message produces one `notificationEvents` claim per recipient and one visible notification.
- [ ] Verify no FCM token or credential appears in client logs, Render logs, or source control.

## Verification performed

`node --check` passed for the Node listener, server bootstrap, and service worker. `npm run build` completed successfully for the React/Vite client.
