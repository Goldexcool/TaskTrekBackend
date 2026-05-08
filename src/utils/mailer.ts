import nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

console.log('Setting up email transporter with:', {
  user: process.env.EMAIL_USER
    ? process.env.EMAIL_USER.substring(0, 5) + '...'
    : 'undefined',
  pass: process.env.EMAIL_PASS ? '[REDACTED]' : 'undefined'
});

let transporter: Transporter | null = null;

const getTransporter = (): Transporter | null => {
  if (transporter) return transporter;

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error('Email configuration missing! Check your .env file');
    return null;
  }

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    logger: true
  });

  return transporter;
};

const sendPasswordResetEmail = async (email: string, resetToken: string): Promise<boolean> => {
  try {
    console.log(`Attempting to send password reset email to: ${email}`);

    const transport = getTransporter();
    if (!transport) {
      throw new Error('Email transporter not configured');
    }

    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;

    const mailOptions = {
      from: `"TaskTrek Security" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Password Reset Request',
      html: `
        <div style="background: #f9fafc; margin: 0; padding: 20px 0; font-family: 'SF Pro Display', 'Segoe UI', Helvetica, Arial, sans-serif; color: #1c2540;">
          <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.08);">
            <!-- Header -->
            <div style="background: linear-gradient(to right, #2e5bff, #4466f2); padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-weight: 600; font-size: 24px;">
                <span style="font-weight: 800;">Task</span>Trek
              </h1>
              <p style="color: rgba(255, 255, 255, 0.85); margin: 5px 0 0 0; font-size: 15px;">Enterprise Task Management</p>
            </div>

            <!-- Content -->
            <div style="padding: 40px 30px;">
              <h2 style="color: #1c2540; font-size: 22px; font-weight: 600; margin-top: 0; margin-bottom: 15px;">Reset Your Password</h2>
              <p style="font-size: 16px; line-height: 1.6; color: #4e5d78; margin-bottom: 25px;">A request has been received to change the password for your TaskTrek account. This link will be valid for the next 15 minutes.</p>

              <div style="margin: 30px 0; text-align: center;">
                <a href="${resetUrl}" style="display: inline-block; padding: 14px 36px; background: #2e5bff; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 500;">Reset Password</a>
              </div>

              <div style="background-color: #f7faff; border-left: 4px solid #2e5bff; padding: 18px; margin-top: 30px; border-radius: 4px;">
                <p style="font-size: 15px; color: #4e5d78; margin: 0;">If you did not request a password change, please ignore this email or contact support if you have questions.</p>
              </div>

              <div style="margin-top: 30px; color: #8492a6; font-size: 14px;">
                <p>If the button doesn't work, copy and paste this URL into your browser:</p>
                <p style="background-color: #f5f7fa; padding: 12px; border-radius: 6px; font-family: monospace; word-break: break-all; margin: 10px 0 0 0; font-size: 13px;">${resetUrl}</p>
              </div>
            </div>

            <!-- Footer -->
            <div style="background-color: #f5f7fa; padding: 25px 30px; text-align: center;">
              <p style="color: #8492a6; font-size: 14px; margin: 0 0 10px 0;">© ${new Date().getFullYear()} TaskTrek. All rights reserved.</p>
            </div>
          </div>
        </div>
      `
    };

    const info = await transport.sendMail(mailOptions);
    console.log(`Password reset email sent: ${(info as { messageId: string }).messageId}`);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    throw new Error('Failed to send password reset email');
  }
};

const sendPasswordResetConfirmationEmail = async (email: string): Promise<boolean> => {
  try {
    console.log(`Sending password reset confirmation to: ${email}`);

    const transport = getTransporter();
    if (!transport) {
      throw new Error('Email transporter not configured');
    }

    const mailOptions = {
      from: `"TaskTrek Security" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Password Reset Successful',
      html: `
        <div style="background: #f9fafc; margin: 0; padding: 20px 0; font-family: 'SF Pro Display', 'Segoe UI', Helvetica, Arial, sans-serif; color: #1c2540;">
          <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.08);">
            <!-- Header -->
            <div style="background: linear-gradient(to right, #2e5bff, #4466f2); padding: 30px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-weight: 600; font-size: 24px;">
                <span style="font-weight: 800;">Task</span>Trek
              </h1>
              <p style="color: rgba(255, 255, 255, 0.85); margin: 5px 0 0 0; font-size: 15px;">Enterprise Task Management</p>
            </div>

            <!-- Content -->
            <div style="padding: 40px 30px; text-align: center;">
              <h2 style="color: #1c2540; font-size: 24px; font-weight: 600; margin-top: 0; margin-bottom: 15px;">Password Updated Successfully</h2>
              <p style="font-size: 16px; line-height: 1.6; color: #4e5d78; margin-bottom: 25px;">Your TaskTrek account password has been changed successfully. You can now log in with your new credentials.</p>

              <div style="margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/login" style="display: inline-block; padding: 14px 36px; background: #2e5bff; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 500;">Log In</a>
              </div>

              <div style="background-color: #fff7ed; border-left: 4px solid #ff7849; padding: 18px; margin-top: 30px; border-radius: 4px; text-align: left;">
                <h4 style="color: #ff7849; font-size: 15px; margin-top: 0; margin-bottom: 10px; font-weight: 600;">Security Notice</h4>
                <p style="font-size: 14px; color: #4e5d78; margin: 0;">If you did not initiate this password change, please contact our security team immediately at <a href="mailto:security@tasktrek.com" style="color: #2e5bff; font-weight: 500;">security@tasktrek.com</a></p>
              </div>
            </div>

            <!-- Footer -->
            <div style="background-color: #f5f7fa; padding: 25px 30px; text-align: center;">
              <p style="color: #8492a6; font-size: 14px; margin: 0 0 10px 0;">© ${new Date().getFullYear()} TaskTrek. All rights reserved.</p>
            </div>
          </div>
        </div>
      `
    };

    const info = await transport.sendMail(mailOptions);
    console.log(`Password reset confirmation email sent: ${(info as { messageId: string }).messageId}`);
    return true;
  } catch (error) {
    console.error('Error sending password reset confirmation email:', error);
    throw new Error('Failed to send password reset confirmation email');
  }
};

interface MailUser {
  email: string;
  name?: string;
  username?: string;
}

const sendWelcomeEmail = async (user: MailUser): Promise<boolean> => {
  try {
    console.log(`Sending welcome email to: ${user.email}`);

    const transport = getTransporter();
    if (!transport) {
      console.error('Email transporter not configured');
      return false;
    }

    const mailOptions = {
      from: `"TaskTrek Team" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Welcome to TaskTrek - Your Productivity Journey Begins',
      html: `
        <div style="background: #f9fafc; margin: 0; padding: 20px 0; font-family: 'SF Pro Display', 'Segoe UI', Helvetica, Arial, sans-serif; color: #1c2540;">
          <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.08);">
            <!-- Header Banner -->
            <div style="background: linear-gradient(135deg, #2e5bff, #4466f2); height: 160px; position: relative;">
              <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; width: 100%;">
                <h1 style="margin: 0; color: #ffffff; font-weight: 700; font-size: 32px; letter-spacing: -0.5px;">
                  Welcome to <span style="font-weight: 800;">TaskTrek</span>
                </h1>
                <p style="color: rgba(255, 255, 255, 0.9); margin: 10px 0 0 0; font-size: 16px; letter-spacing: 0.2px;">Elevate your productivity</p>
              </div>
            </div>

            <!-- Content -->
            <div style="padding: 40px 30px;">
              <h2 style="color: #1c2540; font-size: 22px; font-weight: 600; margin-top: 0; margin-bottom: 15px;">Hello ${user.name || user.username},</h2>
              <p style="font-size: 16px; line-height: 1.6; color: #4e5d78; margin-bottom: 25px;">Thank you for joining TaskTrek! Your account has been successfully created and is ready to use.</p>

              <div style="margin: 35px 0; text-align: center;">
                <a href="${process.env.FRONTEND_URL || ''}/dashboard" style="display: inline-block; padding: 14px 36px; background: #2e5bff; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 500;">Get Started Now</a>
              </div>
            </div>

            <!-- Footer -->
            <div style="background-color: #f5f7fa; padding: 25px 30px; text-align: center;">
              <p style="color: #8492a6; font-size: 14px; margin: 0 0 10px 0;">© ${new Date().getFullYear()} TaskTrek. All rights reserved.</p>
            </div>
          </div>
        </div>
      `
    };

    const info = await transport.sendMail(mailOptions);
    console.log(`Welcome email sent: ${(info as { messageId: string }).messageId}`);
    return true;
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return false;
  }
};

const availableMailerFunctions = {
  sendPasswordResetEmail: typeof sendPasswordResetEmail,
  sendPasswordResetConfirmationEmail: typeof sendPasswordResetConfirmationEmail,
  sendWelcomeEmail: typeof sendWelcomeEmail
};

console.log('Available mailer functions:', availableMailerFunctions);

export {
  sendPasswordResetEmail,
  sendPasswordResetConfirmationEmail,
  sendWelcomeEmail,
  getTransporter
};
