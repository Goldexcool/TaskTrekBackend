import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IBoardMember {
  user: mongoose.Types.ObjectId;
  role: 'admin' | 'member' | 'viewer';
  addedAt?: Date;
  addedBy?: mongoose.Types.ObjectId;
}

export interface IBoard {
  title: string;
  description?: string;
  team: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  backgroundColor: string;
  colorScheme: string;
  image?: string;
  members: IBoardMember[];
  tenant?: mongoose.Types.ObjectId;
}

export interface IBoardDocument extends IBoard, Document {}

const BoardSchema = new Schema<IBoardDocument>(
  {
    title: {
      type: String,
      required: [true, 'Please add a title'],
      trim: true,
      maxlength: [50, 'Title cannot be more than 50 characters']
    },
    description: {
      type: String,
      maxlength: [200, 'Description cannot be more than 200 characters']
    },
    team: {
      type: Schema.Types.ObjectId,
      ref: 'Team',
      required: true
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    backgroundColor: {
      type: String,
      default: '#f5f5f5'
    },
    colorScheme: {
      type: String,
      default: 'default'
    },
    image: {
      type: String
    },
    members: [
      {
        user: {
          type: Schema.Types.ObjectId,
          ref: 'User'
        },
        role: {
          type: String,
          enum: ['admin', 'member', 'viewer'],
          default: 'viewer'
        },
        addedAt: Date,
        addedBy: {
          type: Schema.Types.ObjectId,
          ref: 'User'
        }
      }
    ],
    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true
    }
  },
  {
    timestamps: true
  }
);

const Board: Model<IBoardDocument> = mongoose.model<IBoardDocument>('Board', BoardSchema);

export default Board;

// CJS interop — allows require() in Jest test files
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof module !== 'undefined') { (module as any).exports = Board; (module as any).exports.default = Board; }
