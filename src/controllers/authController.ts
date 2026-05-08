import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from '../models/User';
import {
  sendPasswordResetEmail,
  sendPasswordResetConfirmationEmail,
  sendWelcomeEmail
} from '../utils/mailer';

console.log('Available mailer functions:', {
  sendPasswordResetEmail: typeof sendPasswordResetEmail,
  sendPasswordResetConfirmationEmail: typeof sendPasswordResetConfirmationEmail,
  sendWelcomeEmail: typeof sendWelcomeEmail
});

// Generate access token
const generateAccessToken = (userId: string | mongoose.Types.ObjectId, email: string): string => {
  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is not defined!');
    throw new Error('Server configuration error');
  }

  console.log(
    'Generating access token with JWT_SECRET:',
    process.env.JWT_SECRET.substring(0, 3) +
      '...[hidden]...' +
      process.env.JWT_SECRET.substring(process.env.JWT_SECRET.length - 3)
  );

  return jwt.sign({ id: userId, email }, process.env.JWT_SECRET, { expiresIn: '24h' });
};

// Generate refresh token
const generateRefreshToken = (userId: string | mongoose.Types.ObjectId): string => {
  if (!process.env.REFRESH_TOKEN_SECRET) {
    console.error('REFRESH_TOKEN_SECRET is not defined!');
    throw new Error('Server configuration error');
  }

  console.log(
    'Generating refresh token with REFRESH_TOKEN_SECRET:',
    process.env.REFRESH_TOKEN_SECRET.substring(0, 3) +
      '...[hidden]...' +
      process.env.REFRESH_TOKEN_SECRET.substring(process.env.REFRESH_TOKEN_SECRET.length - 3)
  );

  return jwt.sign({ id: userId }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });
};

// Signup user
export const signup = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, email, password, name } = req.body as {
      username?: string;
      email?: string;
      password?: string;
      name?: string;
    };

    // Validate input
    if (!username || !email || !password) {
      res.status(400).json({
        success: false,
        message: 'Please provide username, email and password'
      });
      return;
    }

    // Use username as name if name is not provided
    const userName = name || username;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      res.status(400).json({
        success: false,
        message: 'User with this email or username already exists'
      });
      return;
    }

    // Create user
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      name: userName
    });

    // Generate tokens
    const accessToken = generateAccessToken(user._id, user.email);
    const refreshToken = generateRefreshToken(user._id);

    // Persist refresh token so it can be validated on /refresh-token
    await User.findByIdAndUpdate(user._id, { refreshToken });

    // Send welcome email (non-blocking)
    try {
      console.log('Attempting to send welcome email to new user');
      await sendWelcomeEmail(user);
      console.log('Welcome email successfully queued');
    } catch (emailError) {
      console.error('Error sending welcome email:', emailError);
      // Continue with registration even if email fails
    }

    // Return user info and tokens
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        name: user.name
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message || 'An error occurred during signup'
    });
  }
};

// Login user
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };

    // Check if MongoDB is connected before proceeding
    if (mongoose.connection.readyState !== 1) {
      res.status(503).json({
        success: false,
        message: 'Database connection unavailable, please try again later',
        error: 'DB_CONNECTION_ERROR'
      });
      return;
    }

    console.log('Login attempt for:', email);

    // Find user with password
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      console.log('User not found');
      res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
      return;
    }

    console.log('User found:', user.username || user.name);

    // Explicitly convert both to strings
    const isPasswordValid = await bcrypt.compare(String(password), String(user.password));
    console.log('Password validation result:', isPasswordValid);

    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
      return;
    }

    // Generate tokens
    const accessToken = generateAccessToken(user._id, user.email);
    const refreshToken = generateRefreshToken(user._id);

    // Store refresh token in database
    user.refreshToken = refreshToken;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Login successful',
      user: {
        id: user._id,
        name: user.name || user.username,
        email: user.email
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Login error:', error);

    // Special handling for database timeout errors
    if ((error as Error).message && (error as Error).message.includes('buffering timed out')) {
      res.status(503).json({
        success: false,
        message: 'Database operation timed out, please try again',
        error: (error as Error).message
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Server error',
      error: (error as Error).message
    });
  }
};

// Special login route for Gold user
export const loginGold = async (req: Request, res: Response): Promise<void> => {
  try {
    const { password } = req.body as { password?: string };

    // Fixed credentials for Gold user
    const email = 'ogunseitangold105@gmail.com';

    console.log('Special login attempt for Gold user');

    // Find the user
    const user = await User.findOne({ email });

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
      return;
    }

    // Only accept the correct password for this special route
    if (password !== 'Goldexcool@001') {
      res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
      return;
    }

    console.log('Gold user credentials verified');

    // Generate tokens
    const accessToken = generateAccessToken(user._id, user.email);
    const refreshToken = generateRefreshToken(user._id);

    // Store refresh token
    user.refreshToken = refreshToken;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Login successful (Gold user)',
      user: {
        id: user._id,
        name: user.name || user.username,
        email: user.email
      },
      accessToken,
      refreshToken
    });
  } catch (error) {
    console.error('Gold login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: (error as Error).message
    });
  }
};

// Refresh token handler
export const refreshTokenHandler = async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body as { refreshToken?: string };

  if (!refreshToken) {
    res.status(401).json({
      success: false,
      message: 'No refresh token provided'
    });
    return;
  }

  // Check if refresh token secret exists
  if (!process.env.REFRESH_TOKEN_SECRET) {
    console.error('REFRESH_TOKEN_SECRET is not defined in environment variables');
    res.status(500).json({
      success: false,
      message: 'Server configuration error'
    });
    return;
  }

  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET) as {
      id: string;
    };

    // Find user with this refresh token (refreshToken field has select:false)
    const user = await User.findOne({
      _id: decoded.id,
      refreshToken
    }).select('+refreshToken');

    if (!user) {
      res.status(403).json({
        success: false,
        message: 'Invalid refresh token'
      });
      return;
    }

    // Generate new tokens
    const newAccessToken = generateAccessToken(user._id, user.email);
    const newRefreshToken = generateRefreshToken(user._id);

    // Update refresh token in database
    user.refreshToken = newRefreshToken;
    await user.save();

    // Return new tokens
    res.status(200).json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(403).json({
      success: false,
      message: 'Invalid refresh token',
      error: (error as Error).message
    });
  }
};

// Logout user
export const logout = async (req: Request, res: Response): Promise<void> => {
  const { refreshToken } = req.body as { refreshToken?: string };

  try {
    // Find user with this refresh token and clear it
    const user = await User.findOneAndUpdate(
      { refreshToken },
      { refreshToken: null },
      { new: true }
    );

    if (!user) {
      res.status(200).json({
        success: true,
        message: 'Logged out'
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: (error as Error).message
    });
  }
};

// Get current user
export const getMe = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('GetMe called with user ID:', req.user?.id);

    if (!req.user || !req.user.id) {
      console.error('User ID missing in request object');
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    const user = await User.findById(req.user.id).select('-password -refreshToken');
    console.log('User found?', !!user);

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        id: user._id,
        username: user.username,
        email: user.email,
        name: user.name,
        teams: user.teams,
        createdAt: (user as unknown as Record<string, unknown>).createdAt,
        updatedAt: (user as unknown as Record<string, unknown>).updatedAt
      }
    });
  } catch (error) {
    console.error('GetMe error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: (error as Error).message
    });
  }
};

// Forgot password
export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body as { email?: string };

    if (!email) {
      res.status(400).json({
        success: false,
        message: 'Please provide your email address'
      });
      return;
    }

    // Find the user by email
    const user = await User.findOne({ email });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User with this email does not exist'
      });
      return;
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');

    // Hash the token and save to user
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Set token expiry (15 minutes)
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpire = new Date(Date.now() + 15 * 60 * 1000);

    await user.save();

    // Send email with reset token
    try {
      await sendPasswordResetEmail(user.email, resetToken);

      res.status(200).json({
        success: true,
        message: 'Password reset email sent'
      });
    } catch (error) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save();

      console.error('Error in password reset process:', error);

      res.status(500).json({
        success: false,
        message: 'Email could not be sent',
        error: (error as Error).message
      });
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message
    });
  }
};

// Reset password
export const resetPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const { password } = req.body as { password?: string };

    if (!token || !password) {
      res.status(400).json({
        success: false,
        message: 'Please provide token and new password'
      });
      return;
    }

    const hashedToken = crypto.createHash('sha256').update(token as string).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpire: { $gt: Date.now() }
    });

    if (!user) {
      res.status(400).json({
        success: false,
        message: 'Invalid or expired token'
      });
      return;
    }

    // Check password strength
    if (password.length < 8) {
      res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);

    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    await sendPasswordResetConfirmationEmail(user.email);

    res.status(200).json({
      success: true,
      message: 'Password reset successful'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: (error as Error).message
    });
  }
};

export const authenticateToken = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    console.log('No token provided in request:', req.headers);
    res.status(401).json({
      success: false,
      message: 'Access denied. No token provided.'
    });
    return;
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.ACCESS_TOKEN_SECRET as string
    ) as { id: string };
    console.log('Token decoded successfully:', decoded);
    req.user = { id: decoded.id };
    next();
  } catch (error) {
    console.error('Token verification error:', (error as Error).message);
    res.status(403).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};
