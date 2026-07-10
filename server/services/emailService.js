import { Resend } from 'resend';

class EmailService {
  constructor() {
    this.apiKey = process.env.RESEND_API_KEY?.trim().replace(/^['"]|['"]$/g, '');
    this.fromEmail = process.env.RESEND_FROM_EMAIL?.trim().replace(/^['"]|['"]$/g, '') || 'AquaChat <noreply@aquachat.in>';
    
    if (this.apiKey) {
      this.resend = new Resend(this.apiKey);
      console.log('[EmailService] Resend service initialized successfully.');
    } else {
      console.warn('[EmailService] RESEND_API_KEY environment variable is not defined. Email sending will run in SIMULATION mode.');
      this.resend = null;
    }
  }

  /**
   * Send Email Verification
   * @param {string} email
   * @param {string} verificationLink
   * @param {string} firstName
   */
  async sendVerificationEmail(email, verificationLink, firstName = 'there') {
    const subject = '🎉 Welcome to AquaChat – Verify Your Email';
    const htmlContent = this.getVerificationEmailTemplate(verificationLink, firstName);

    if (!this.resend) {
      console.warn(`[EmailService] Cannot send verification email to ${email} (RESEND_API_KEY is missing).`);
      throw new Error('Email service configuration error: RESEND_API_KEY is not defined on the server.');
    }

    try {
      console.log(`[EmailService] Sending verification email to ${email} via Resend...`);
      const response = await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject: subject,
        html: htmlContent,
      });

      console.log('[EmailService] Resend API Raw Response:', JSON.stringify(response, null, 2));

      if (response.error) {
        console.error(`[EmailService] Resend returned an error when sending verification to ${email}:`, response.error);
        throw new Error(response.error.message || JSON.stringify(response.error));
      }

      console.log(`[EmailService] Verification email sent to ${email} (ID: ${response.data?.id || 'unknown'})`);
      return response.data;
    } catch (error) {
      console.error(`[EmailService] Failed to send verification email to ${email}:`, error);
      throw error;
    }
  }

  /**
   * Send Password Reset Email
   * @param {string} email
   * @param {string} resetLink
   * @param {string} firstName
   */
  async sendPasswordResetEmail(email, resetLink, firstName = 'there') {
    const subject = '🔐 Reset Your AquaChat Password';
    const htmlContent = this.getPasswordResetEmailTemplate(resetLink, firstName);

    if (!this.resend) {
      console.warn(`[EmailService] Cannot send password reset email to ${email} (RESEND_API_KEY is missing).`);
      throw new Error('Email service configuration error: RESEND_API_KEY is not defined on the server.');
    }

    try {
      console.log(`[EmailService] Sending password reset email to ${email} via Resend...`);
      const response = await this.resend.emails.send({
        from: this.fromEmail,
        to: email,
        subject: subject,
        html: htmlContent,
      });

      console.log('[EmailService] Resend API Raw Response:', JSON.stringify(response, null, 2));

      if (response.error) {
        console.error(`[EmailService] Resend returned an error when sending password reset to ${email}:`, response.error);
        throw new Error(response.error.message || JSON.stringify(response.error));
      }

      console.log(`[EmailService] Password reset email sent to ${email} (ID: ${response.data?.id || 'unknown'})`);
      return response.data;
    } catch (error) {
      console.error(`[EmailService] Failed to send password reset email to ${email}:`, error);
      throw error;
    }
  }

  /**
   * Generates the verification email HTML template
   */
  getVerificationEmailTemplate(verificationLink, firstName) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to AquaChat</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; width: 100% !important; height: 100%;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);">
          
          <!-- Header -->
          <tr>
            <td align="center" style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); padding: 35px 20px;">
              <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; display: flex; align-items: center; justify-content: center; font-family: 'Inter', sans-serif;">
                <span style="margin-right: 10px;">💬</span> AquaChat
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 20px;">
                Hi ${firstName}! 👋
              </p>
              
              <p style="font-size: 16px; line-height: 26px; color: #334155; margin-top: 0; margin-bottom: 12px;">
                Welcome to AquaChat.
              </p>
              
              <p style="font-size: 16px; line-height: 26px; color: #334155; margin-top: 0; margin-bottom: 24px;">
                Thank you for creating your AquaChat account. To activate your account and start using all features, please verify your email.
              </p>

              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 30px auto; text-align: center;">
                <tr>
                  <td align="center" style="background-color: #0284c7; border-radius: 8px;">
                    <a href="${verificationLink}" target="_blank" style="display: inline-block; background-color: #0284c7; color: #ffffff; font-weight: 600; font-size: 16px; text-decoration: none; padding: 14px 32px; border-radius: 8px; border: 1px solid #0284c7; transition: background-color 0.2s ease-in-out;">
                      Verify Email
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size: 14px; color: #ef4444; text-align: center; margin-top: 0; margin-bottom: 30px; font-weight: 500;">
                Verification link expires in 30 minutes.
              </p>

              <!-- Benefits Box -->
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f0f9ff; border-radius: 12px; border: 1px solid #e0f2fe; padding: 20px; margin-bottom: 20px;">
                <tr>
                  <td style="font-size: 15px; font-weight: 700; color: #0369a1; padding-bottom: 12px;">
                    Why verify your email?
                  </td>
                </tr>
                <tr>
                  <td style="font-size: 14px; line-height: 22px; color: #0369a1;">
                    <div style="margin-bottom: 8px;">
                      <span style="font-weight: bold; margin-right: 8px; color: #0284c7;">✔</span> Secure your account
                    </div>
                    <div style="margin-bottom: 8px;">
                      <span style="font-weight: bold; margin-right: 8px; color: #0284c7;">✔</span> Recover your password
                    </div>
                    <div>
                      <span style="font-weight: bold; margin-right: 8px; color: #0284c7;">✔</span> Access all AquaChat features
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 35px 30px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 13px; color: #64748b; line-height: 20px;">
              <p style="font-size: 14px; font-weight: 600; color: #475569; margin-top: 0; margin-bottom: 4px;">
                Best Regards,
              </p>
              <p style="font-size: 15px; font-weight: 700; color: #0284c7; margin-top: 0; margin-bottom: 15px;">
                💬 AquaChat
              </p>
              <p style="margin-top: 0; margin-bottom: 8px;">
                Built with ❤️ by <strong>Mohit Pandey</strong>
              </p>
              <p style="margin-top: 0; margin-bottom: 8px;">
                &copy; 2026 AquaChat. All rights reserved.
              </p>
              <p style="margin-top: 0; margin-bottom: 0; font-size: 12px; color: #94a3b8; font-style: italic;">
                This is an automated email. Please do not reply.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  /**
   * Generates the password reset email HTML template
   */
  getPasswordResetEmailTemplate(resetLink, firstName) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your AquaChat Password</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; width: 100% !important; height: 100%;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 40px 10px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);">
          
          <!-- Header -->
          <tr>
            <td align="center" style="background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); padding: 35px 20px;">
              <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -0.5px; display: flex; align-items: center; justify-content: center; font-family: 'Inter', sans-serif;">
                <span style="margin-right: 10px;">💬</span> AquaChat
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <p style="font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 0; margin-bottom: 20px;">
                Hi ${firstName}! 👋
              </p>
              
              <p style="font-size: 16px; line-height: 26px; color: #334155; margin-top: 0; margin-bottom: 24px;">
                We received a request to reset your AquaChat password.
              </p>

              <!-- CTA Button -->
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 30px auto; text-align: center;">
                <tr>
                  <td align="center" style="background-color: #0284c7; border-radius: 8px;">
                    <a href="${resetLink}" target="_blank" style="display: inline-block; background-color: #0284c7; color: #ffffff; font-weight: 600; font-size: 16px; text-decoration: none; padding: 14px 32px; border-radius: 8px; border: 1px solid #0284c7; transition: background-color 0.2s ease-in-out;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size: 14px; color: #ef4444; text-align: center; margin-top: 0; margin-bottom: 24px; font-weight: 500;">
                Reset link expires in 30 minutes.
              </p>

              <p style="font-size: 15px; line-height: 24px; color: #64748b; margin-top: 0; margin-bottom: 0; text-align: center;">
                If you didn't request this, simply ignore this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 35px 30px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 13px; color: #64748b; line-height: 20px;">
              <p style="font-size: 14px; font-weight: 600; color: #475569; margin-top: 0; margin-bottom: 4px;">
                Best Regards,
              </p>
              <p style="font-size: 15px; font-weight: 700; color: #0284c7; margin-top: 0; margin-bottom: 15px;">
                💬 AquaChat
              </p>
              <p style="margin-top: 0; margin-bottom: 8px;">
                Built with ❤️ by <strong>Mohit Pandey</strong>
              </p>
              <p style="margin-top: 0; margin-bottom: 8px;">
                &copy; 2026 AquaChat. All rights reserved.
              </p>
              <p style="margin-top: 0; margin-bottom: 0; font-size: 12px; color: #94a3b8; font-style: italic;">
                This is an automated email. Please do not reply.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
}

export default new EmailService();
