import mongoose, { Document, Model, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUserData {
  bio: string;
  avatar: string;
  jobTitle: string;
  location: string;
  website: string;
  social: {
    twitter: string;
    facebook: string;
    instagram: string;
    linkedin: string;
    github: string;
  };
}

export interface IUser {
  name: string;
  username: string;
  email: string;
  password: string;
  isVerified: boolean;
  verificationCode?: string;
  verificationExpires?: Date;
  resetPasswordToken?: string;
  resetPasswordExpire?: Date;
  refreshToken?: string | null;
  teams: mongoose.Types.ObjectId[];
  currentTenant?: mongoose.Types.ObjectId | null;
  userData?: IUserData;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface IUserDocument extends IUser, Document<any, any, any> {
  matchPassword(enteredPassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUserDocument>(
  {
    name: {
      type: String,
      trim: true,
      default: function (this: IUserDocument) {
        return this.username;
      }
    },
    username: {
      type: String,
      required: [true, 'Please provide a username'],
      unique: true,
      sparse: true,
      trim: true
    },
    email: {
      type: String,
      required: [true, 'Please provide an email'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email'
      ]
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: 8,
      select: false,
      set: function (password: string) {
        if (password.startsWith('$2b$') || password.startsWith('$2a$')) {
          return password;
        }
        return password;
      }
    },
    isVerified: {
      type: Boolean,
      default: false
    },
    verificationCode: {
      type: String
    },
    verificationExpires: {
      type: Date
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
    refreshToken: {
      type: String,
      default: null,
      select: false
    },
    teams: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Team'
      }
    ],
    currentTenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null
    },
    userData: {
      type: Schema.Types.Mixed,
      default: {
        bio: '',
        avatar: '',
        jobTitle: '',
        location: '',
        website: '',
        social: {
          twitter: '',
          facebook: '',
          instagram: '',
          linkedin: '',
          github: ''
        }
      }
    }
  },
  { timestamps: true }
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
UserSchema.methods.toJSON = function (this: IUserDocument): any {
  const user = this.toObject() as Record<string, unknown>;
  delete user.password;
  delete user.refreshToken;
  delete user.verificationCode;
  delete user.resetPasswordToken;
  return user;
};

UserSchema.methods.matchPassword = async function (
  this: IUserDocument,
  enteredPassword: string
): Promise<boolean> {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User: Model<IUserDocument> =
  (mongoose.models.User as Model<IUserDocument>) ||
  mongoose.model<IUserDocument>('User', UserSchema);

export default User;

// CJS interop — allows require() in Jest test files
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof module !== 'undefined') { (module as any).exports = User; (module as any).exports.default = User; }
