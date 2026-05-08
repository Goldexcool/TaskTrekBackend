import bcrypt from 'bcryptjs';
import User, { IUserDocument } from '../models/User';

interface CreateUserData {
  password: string;
  [key: string]: unknown;
}

class UserService {
  static async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(String(password), salt);
  }

  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(String(password), String(hash));
    } catch (error) {
      console.error('Password verification error:', error);
      return false;
    }
  }

  static async createUser(userData: CreateUserData): Promise<IUserDocument> {
    const { password, ...otherData } = userData;

    // Hash the password
    const hashedPassword = await this.hashPassword(password);

    return User.create({
      ...otherData,
      password: hashedPassword
    });
  }

  static async findUserByEmailWithPassword(email: string): Promise<IUserDocument | null> {
    return User.findOne({ email }).select('+password');
  }

  static async updatePassword(
    userId: string,
    newPassword: string
  ): Promise<IUserDocument | null> {
    const hashedPassword = await this.hashPassword(newPassword);

    return User.findByIdAndUpdate(
      userId,
      { password: hashedPassword },
      { new: true }
    );
  }
}

export default UserService;
