import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IToken {
  userId: mongoose.Types.ObjectId;
  token: string;
  type: 'password-reset' | 'email-verification';
  createdAt?: Date;
}

export interface ITokenDocument extends IToken, Document {}

const tokenSchema = new Schema<ITokenDocument>({
  userId: {
    type: Schema.Types.ObjectId,
    required: true,
    ref: 'User'
  },
  token: {
    type: String,
    required: true
  },
  type: {
    type: String,
    required: true,
    enum: ['password-reset', 'email-verification']
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 3600 // Token expires after 1 hour
  }
});

const Token: Model<ITokenDocument> = mongoose.model<ITokenDocument>('Token', tokenSchema);

export default Token;

// CJS interop — allows require() in Jest test files
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof module !== 'undefined') { (module as any).exports = Token; (module as any).exports.default = Token; }
