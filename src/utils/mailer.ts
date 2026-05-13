import https from 'https';

interface BrevoConfig {
  apiKey: string;
  senderEmail: string;
  senderName: string;
}

interface MailUser {
  email: string;
  name?: string;
  username?: string;
}

interface EmailLayoutOptions {
  preview: string;
  eyebrow: string;
  title: string;
  intro: string;
  bodyHtml?: string;
  ctaText?: string;
  ctaUrl?: string;
  closing?: string;
}

const maskValue = (value?: string): string =>
  value ? `${value.slice(0, 6)}...` : 'undefined';

const getTransporter = (): BrevoConfig | null => {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME || 'TaskTrek';

  if (!apiKey || !senderEmail) {
    console.error('Brevo configuration missing. Check BREVO_API_KEY and BREVO_SENDER_EMAIL.');
    return null;
  }

  return { apiKey, senderEmail, senderName };
};

console.log('Brevo mailer configured with:', {
  apiKey: maskValue(process.env.BREVO_API_KEY),
  senderEmail: process.env.BREVO_SENDER_EMAIL || 'undefined',
  senderName: process.env.BREVO_SENDER_NAME || 'TaskTrek'
});

const buildEmailLayout = ({
  preview,
  eyebrow,
  title,
  intro,
  bodyHtml = '',
  ctaText,
  ctaUrl,
  closing = 'TaskTrek'
}: EmailLayoutOptions): string => `
  <!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${title}</title>
    </head>
    <body style="margin:0;padding:0;background:#f3f1ec;color:#1f1b16;font-family:Georgia,'Times New Roman',serif;">
      <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preview}</div>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f1ec;padding:32px 16px;">
        <tr>
          <td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fbfaf7;border:1px solid #d9d1c6;">
              <tr>
                <td style="padding:28px 32px 20px;border-bottom:1px solid #e4ddd2;">
                  <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8a7761;font-family:Arial,Helvetica,sans-serif;">${eyebrow}</div>
                  <div style="margin-top:12px;font-size:30px;line-height:1.2;font-weight:700;color:#1f1b16;">${title}</div>
                  <div style="margin-top:14px;font-size:17px;line-height:1.7;color:#3c342c;font-family:Arial,Helvetica,sans-serif;">${intro}</div>
                </td>
              </tr>
              <tr>
                <td style="padding:28px 32px;">
                  <div style="font-size:15px;line-height:1.8;color:#4a4036;font-family:Arial,Helvetica,sans-serif;">${bodyHtml}</div>
                  ${ctaText && ctaUrl ? `
                    <div style="margin-top:28px;">
                      <a href="${ctaUrl}" style="display:inline-block;padding:14px 24px;background:#1f1b16;color:#fbfaf7;text-decoration:none;font-size:14px;letter-spacing:0.4px;font-weight:600;font-family:Arial,Helvetica,sans-serif;">
                        ${ctaText}
                      </a>
                    </div>
                  ` : ''}
                </td>
              </tr>
              <tr>
                <td style="padding:22px 32px;background:#efe8de;border-top:1px solid #e4ddd2;">
                  <div style="font-size:12px;line-height:1.8;color:#6f6255;font-family:Arial,Helvetica,sans-serif;">
                    ${closing}<br />
                    Focused work, organized beautifully.
                  </div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>
`;

const sendBrevoEmail = async ({
  toEmail,
  toName,
  subject,
  htmlContent
}: {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlContent: string;
}): Promise<boolean> => {
  const config = getTransporter();
  if (!config) {
    throw new Error('Brevo mailer not configured');
  }

  const payload = JSON.stringify({
    sender: {
      email: config.senderEmail,
      name: config.senderName
    },
    to: [
      {
        email: toEmail,
        ...(toName ? { name: toName } : {})
      }
    ],
    subject,
    htmlContent
  });

  return await new Promise<boolean>((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.brevo.com',
        path: '/v3/smtp/email',
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': config.apiKey,
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload)
        }
      },
      res => {
        let body = '';

        res.on('data', chunk => {
          body += chunk.toString();
        });

        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(true);
            return;
          }

          reject(
            new Error(
              `Brevo email failed with status ${res.statusCode ?? 'unknown'}: ${body || 'No response body'}`
            )
          );
        });
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
};

const sendPasswordResetEmail = async (email: string, resetToken: string): Promise<boolean> => {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;

  const html = buildEmailLayout({
    preview: 'Reset your TaskTrek password.',
    eyebrow: 'Security',
    title: 'Reset your password',
    intro: 'A password reset was requested for your TaskTrek account. If that was you, use the link below to choose a new password.',
    bodyHtml: `
      <p style="margin:0 0 16px;">For your security, this link expires in 15 minutes.</p>
      <p style="margin:0 0 16px;">If you did not request this change, you can safely ignore this email.</p>
      <p style="margin:20px 0 0;padding:16px;border:1px solid #d9d1c6;background:#f6f2eb;word-break:break-word;">
        ${resetUrl}
      </p>
    `,
    ctaText: 'Reset Password',
    ctaUrl: resetUrl,
    closing: 'TaskTrek Security'
  });

  try {
    return await sendBrevoEmail({
      toEmail: email,
      subject: 'Reset your TaskTrek password',
      htmlContent: html
    });
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw new Error('Failed to send password reset email');
  }
};

const sendPasswordResetConfirmationEmail = async (email: string): Promise<boolean> => {
  const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`;

  const html = buildEmailLayout({
    preview: 'Your TaskTrek password was updated.',
    eyebrow: 'Confirmation',
    title: 'Password updated',
    intro: 'Your TaskTrek password has been changed successfully. You can now sign in with your new credentials.',
    bodyHtml: `
      <p style="margin:0 0 16px;">If you did not make this change, contact your administrator or support immediately.</p>
    `,
    ctaText: 'Sign In',
    ctaUrl: loginUrl,
    closing: 'TaskTrek Security'
  });

  try {
    return await sendBrevoEmail({
      toEmail: email,
      subject: 'Your TaskTrek password was updated',
      htmlContent: html
    });
  } catch (error) {
    console.error('Error sending password reset confirmation email:', error);
    throw new Error('Failed to send password reset confirmation email');
  }
};

const sendWelcomeEmail = async (user: MailUser): Promise<boolean> => {
  const dashboardUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard`;
  const displayName = user.name || user.username || 'there';

  const html = buildEmailLayout({
    preview: 'Welcome to TaskTrek.',
    eyebrow: 'Welcome',
    title: 'Your workspace starts here',
    intro: `Hello ${displayName}, your TaskTrek account is ready. We built it to help your work stay calm, clear, and in motion.`,
    bodyHtml: `
      <p style="margin:0 0 16px;">Start by creating a workspace, organizing a board, and inviting the people who matter most to the work.</p>
      <p style="margin:0;">Everything ahead should feel structured, focused, and easy to follow.</p>
    `,
    ctaText: 'Open TaskTrek',
    ctaUrl: dashboardUrl,
    closing: 'TaskTrek'
  });

  try {
    return await sendBrevoEmail({
      toEmail: user.email,
      toName: displayName,
      subject: 'Welcome to TaskTrek',
      htmlContent: html
    });
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return false;
  }
};

export {
  sendPasswordResetEmail,
  sendPasswordResetConfirmationEmail,
  sendWelcomeEmail,
  getTransporter
};
