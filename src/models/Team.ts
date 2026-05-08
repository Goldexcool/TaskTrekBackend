import mongoose, { Document, Model, Schema } from 'mongoose';

export interface ITeamMember {
  user: mongoose.Types.ObjectId;
  role: 'admin' | 'member' | 'viewer';
  joinedAt?: Date;
}

export interface ITeam {
  name: string;
  description: string;
  owner: mongoose.Types.ObjectId;
  admins: mongoose.Types.ObjectId[];
  members: ITeamMember[];
  createdAt?: Date;
  updatedAt?: Date;
  isArchived: boolean;
  tenant?: mongoose.Types.ObjectId;
}

export interface ITeamDocument extends ITeam, Document {}

const TeamMemberSchema = new Schema<ITeamMember>({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'member', 'viewer'],
    default: 'viewer'
  },
  joinedAt: {
    type: Date,
    default: Date.now
  }
});

const TeamSchema = new Schema<ITeamDocument>({
  name: {
    type: String,
    required: [true, 'Team name is required'],
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  owner: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  admins: [
    {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  ],
  members: [
    {
      user: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      role: {
        type: String,
        enum: ['admin', 'member', 'viewer'],
        default: 'viewer'
      }
    }
  ],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  isArchived: {
    type: Boolean,
    default: false
  },
  tenant: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true
  }
});

// Make sure indexes are created for better query performance
TeamSchema.index({ owner: 1 });
TeamSchema.index({ admins: 1 });
TeamSchema.index({ 'members.user': 1 });

const Team: Model<ITeamDocument> = mongoose.model<ITeamDocument>('Team', TeamSchema);

export default Team;

// CJS interop — allows require() in Jest test files
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof module !== 'undefined') { (module as any).exports = Team; (module as any).exports.default = Team; }
