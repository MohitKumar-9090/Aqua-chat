# AquaChat — Firebase Authentication Email Templates

Professional, mobile-friendly templates for **Email verification** and **Password reset**, with consistent AquaChat branding and credit to **Mohit Pandey**.

---

## Before you start (one-time setup)

1. Open [Firebase Console](https://console.firebase.google.com) → your AquaChat project.
2. Go to **Build → Authentication → Settings → Authorized domains**.
3. Add every domain users will use:
   - `localhost`
   - `your-app.vercel.app`
   - Your custom domain (if any)
4. Go to **Authentication → Sign-in method** → enable **Email/Password**.
5. Go to **Authentication → Templates** (or **Templates** tab under Authentication).

### Sender & project branding (recommended)

| Field | Recommended value |
|--------|---------------------|
| **Project public name** | `AquaChat` |
| **Sender name** (if using custom SMTP later) | `AquaChat` |
| **Support / reply-to** | Your real support email |
| **Accent color** (Firebase button theme) | `#06b6d4` |

> Firebase’s built-in sender is `noreply@PROJECT.firebaseapp.com` until you configure custom SMTP. That is normal for development; production apps often add [custom email domain](https://firebase.google.com/docs/auth/custom-email-handler) later.

---

## How to apply templates in Firebase Console

For **each** template below:

1. **Authentication → Templates**
2. Click the template name (**Email address verification** or **Password reset**)
3. Click the **pencil (Edit)** icon
4. Set **Subject** exactly as listed below
5. Paste the **HTML body** into the message / body field
6. Set **Action button text** as listed (Firebase renders the button using `%LINK%` automatically when you use the default action URL)
7. **Save**

### If your console uses “Customize action URL”

- Leave the default Firebase link unless you host a custom email handler.
- Your app already handles `?mode=verifyEmail&oobCode=...` on the production URL.

### If the editor requires `%LINK%` in the body

The HTML below includes an optional fallback link line using `%LINK%`. If Firebase shows **duplicate buttons**, remove the manual `<a href="%LINK%">` block and rely on the console **Action button** only.

---

## 1. Email address verification

### Subject line (copy exactly)

```
Welcome to AquaChat — verify your email
```

**Alternates (pick one if you prefer shorter inbox titles):**

- `Verify your AquaChat account`
- `One quick step to join AquaChat`

### Action button text

```
Verify email & continue
```

### Plain-text version (optional — paste if Firebase offers a text tab)

```
Welcome to AquaChat

Thanks for signing up. Confirm your email to start chatting with your community.

Verify your email:
%LINK%

This link was sent to %EMAIL% and expires in 24 hours.

If you didn’t create an AquaChat account, you can safely ignore this email.

—
AquaChat
Built with care by Mohit Pandey
```

### HTML body (paste into Firebase template editor)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verify your AquaChat email</title>
</head>
<body style="margin:0;padding:0;background-color:#ecfeff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:linear-gradient(180deg,#ecfeff 0%,#f8fdff 45%,#ffffff 100%);padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;">
          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#0891b2 0%,#22d3ee 100%);color:#ffffff;font-size:22px;font-weight:800;line-height:52px;text-align:center;">
                    A
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 0;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#0891b2;">
                AquaChat
              </p>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff;border:1px solid #cffafe;border-radius:20px;padding:36px 32px;box-shadow:0 12px 40px rgba(6,182,212,0.10);">
              <h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;font-weight:800;color:#083344;letter-spacing:-0.02em;">
                Welcome aboard
              </h1>
              <p style="margin:0 0 20px;font-size:16px;line-height:1.65;color:#475569;">
                You&apos;re one step away from joining the <strong style="color:#0e7490;">AquaChat</strong> community — a calm, modern space for real-time messages, groups, and calls.
              </p>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.65;color:#64748b;">
                Please confirm that <strong style="color:#334155;">%EMAIL%</strong> belongs to you. This helps keep your account secure.
              </p>
              <!-- Firebase injects the primary CTA button below your custom HTML when using default action URL -->
              <p style="margin:28px 0 0;font-size:13px;line-height:1.6;color:#94a3b8;text-align:center;">
                Button not working? Copy and paste this link into your browser:<br />
                <a href="%LINK%" style="color:#0891b2;word-break:break-all;text-decoration:underline;">%LINK%</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding:28px 12px 8px;">
              <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#64748b;">
                Didn&apos;t sign up? You can ignore this email — no account will be created.
              </p>
              <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#94a3b8;">
                This link expires in 24 hours for your security.
              </p>
              <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#94a3b8;">
                &copy; AquaChat &middot; Built with care by <strong style="color:#64748b;font-weight:600;">Mohit Pandey</strong>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

### Wording notes (verification)

| Element | Copy |
|--------|------|
| Headline | **Welcome aboard** — warm, product-led |
| Community | Mentions AquaChat community without hype |
| Security | Email + expiry called out calmly |
| Creator credit | Footer only — professional, not promotional |

---

## 2. Password reset

### Subject line (copy exactly)

```
Reset your AquaChat password
```

**Alternates:**

- `AquaChat — password reset request`
- `Secure password reset for your AquaChat account`

### Action button text

```
Create new password
```

### Plain-text version (optional)

```
Reset your AquaChat password

We received a request to reset the password for %EMAIL%.

Create a new password:
%LINK%

This link expires in 1 hour. If you didn’t request a reset, ignore this email — your password will stay the same.

For your security, never share this link with anyone.

—
AquaChat
Built with care by Mohit Pandey
```

### HTML body (paste into Firebase template editor)

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your AquaChat password</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:linear-gradient(180deg,#f0fdfa 0%,#f8fafc 50%,#ffffff 100%);padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:520px;">
          <!-- Header -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="center" style="width:52px;height:52px;border-radius:14px;background:linear-gradient(135deg,#0891b2 0%,#22d3ee 100%);color:#ffffff;font-size:22px;font-weight:800;line-height:52px;text-align:center;">
                    A
                  </td>
                </tr>
              </table>
              <p style="margin:14px 0 0;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#0891b2;">
                AquaChat
              </p>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:20px;padding:36px 32px;box-shadow:0 12px 40px rgba(15,23,42,0.06);">
              <p style="margin:0 0 10px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#0e7490;">
                Security notice
              </p>
              <h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;font-weight:800;color:#0f172a;letter-spacing:-0.02em;">
                Reset your password
              </h1>
              <p style="margin:0 0 20px;font-size:16px;line-height:1.65;color:#475569;">
                We received a request to reset the password for your AquaChat account linked to <strong style="color:#334155;">%EMAIL%</strong>.
              </p>
              <p style="margin:0 0 28px;font-size:15px;line-height:1.65;color:#64748b;">
                Tap the button below to choose a new password. For your protection, this link works once and expires in <strong>1 hour</strong>.
              </p>
              <p style="margin:28px 0 0;font-size:13px;line-height:1.6;color:#94a3b8;text-align:center;">
                Button not working? Copy and paste this link into your browser:<br />
                <a href="%LINK%" style="color:#0891b2;word-break:break-all;text-decoration:underline;">%LINK%</a>
              </p>
            </td>
          </tr>
          <!-- Security callout -->
          <tr>
            <td style="padding-top:20px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#fff7ed;border:1px solid #fed7aa;border-radius:14px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <p style="margin:0;font-size:13px;line-height:1.6;color:#9a3412;">
                      <strong>Didn&apos;t request this?</strong> Ignore this email. Your password will not change unless you use the link above.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding:28px 12px 8px;">
              <p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#94a3b8;">
                Never share reset links or verification codes with anyone — including people claiming to be support.
              </p>
              <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#94a3b8;">
                &copy; AquaChat &middot; Built with care by <strong style="color:#64748b;font-weight:600;">Mohit Pandey</strong>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
```

### Wording notes (password reset)

| Element | Copy |
|--------|------|
| Tone | Security-first, calm (Notion/Discord style) |
| Urgency | 1-hour expiry stated clearly |
| Safety | Amber callout for unsolicited requests |
| Creator credit | Same footer as verification — consistent |

---

## Branding reference

### Visual system

| Token | Value | Usage |
|--------|--------|--------|
| Primary | `#06b6d4` / `#0891b2` | Logo gradient, links, labels |
| Background | `#ecfeff` → `#f8fdff` | Outer email canvas |
| Text primary | `#083344` / `#0f172a` | Headlines |
| Text body | `#475569` / `#64748b` | Paragraphs |
| Card | `#ffffff` + soft border | Main content |
| Radius | `20px` card, `14px` logo | Modern app feel |

### Voice & tone

- **Do:** Short sentences, clear CTAs, one idea per paragraph.
- **Don’t:** ALL CAPS, excessive emojis, “Act now!!!”, or multiple CTAs.
- **Mohit Pandey line:** Use **“Built with care by Mohit Pandey”** in the footer only (professional; reads like a product credit, not an ad).

### Optional heart variant (use only if you want the exact tagline)

Replace the footer line with:

```html
&copy; AquaChat &middot; Built with &#10084;&#65039; by <strong style="color:#64748b;font-weight:600;">Mohit Pandey</strong>
```

> Some email clients render emoji inconsistently; **“Built with care by”** is the safer production default.

---

## Firebase template variables reference

| Variable | Meaning |
|----------|---------|
| `%EMAIL%` | User’s email address |
| `%LINK%` | Verification or reset URL (one-time) |
| `%DISPLAY_NAME%` | Display name (if set) |

---

## Testing checklist

- [ ] Sign up with a real inbox → subject + HTML render correctly on mobile (Gmail iOS/Android)
- [ ] Verification CTA opens your app / site and completes verify flow
- [ ] Reset password email arrives within 1 minute
- [ ] Reset link works once; second click shows expired (expected)
- [ ] Footer shows AquaChat + Mohit Pandey on both templates
- [ ] Email lands in inbox (not spam) — warm up domain if using custom SMTP later
- [ ] Dark mode clients: body text still readable (light card on tinted background)

---

## Optional next step (production polish)

When you outgrow `firebaseapp.com` sender addresses:

1. Configure a custom domain (e.g. `mail.yourdomain.com`) via Firebase / Google Cloud / SendGrid.
2. Set **From:** `AquaChat <noreply@yourdomain.com>`
3. Add SPF/DKIM records so Gmail shows your logo and improves deliverability.

Your in-app copy (`EmailVerificationPanel`, `ForgotPasswordModal`) already matches this tone — no code changes required for templates-only updates.
