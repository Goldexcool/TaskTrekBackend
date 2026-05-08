import mongoose, { Document, Model, Schema } from 'mongoose';
import slugify from 'slugify';

export interface ITenantMember {
  user: mongoose.Types.ObjectId;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  status: 'active' | 'invited' | 'suspended';
  joinedAt?: Date;
  invitedAt?: Date;
}

export interface ITenant {
  name: string;
  slug: string;
  description: string;
  logo: string;
  owner: mongoose.Types.ObjectId;
  members: ITenantMember[];
  settings?: Record<string, unknown>;
  status: 'active' | 'suspended' | 'deleted';
}

export interface ITenantDocument extends ITenant, Document {}

const TenantMemberSchema = new Schema<ITenantMember>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member', 'viewer'],
      default: 'member'
    },
    status: {
      type: String,
      enum: ['active', 'invited', 'suspended'],
      default: 'active'
    },
    joinedAt: { type: Date, default: Date.now },
    invitedAt: { type: Date }
  },
  { _id: false }
);

const TenantSchema = new Schema<ITenantDocument>(
  {
    name: {
      type: String,
      required: [true, 'Organization name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters']
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true
    },
    description: { type: String, default: '', maxlength: 300 },
    logo: { type: String, default: '' },
    owner: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    members: [TenantMemberSchema],
    settings: {
      type: Schema.Types.Mixed,
      default: {}
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'deleted'],
      default: 'active'
    }
  },
  { timestamps: true }
);

// Auto-generate a unique slug from name before saving
TenantSchema.pre('save', async function (next) {
  if (!this.isModified('name') && this.slug) return next();

  const base = slugify(this.name, { lower: true, strict: true });
  let slug = base;
  let count = 0;

  while (
    await (mongoose.models.Tenant as Model<ITenantDocument>).exists({
      slug,
      _id: { $ne: this._id }
    })
  ) {
    count++;
    slug = `${base}-${count}`;
  }

  this.slug = slug;
  next();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
TenantSchema.index({ slug: 1 }, { unique: true } as any);
TenantSchema.index({ owner: 1 });
TenantSchema.index({ 'members.user': 1 });
TenantSchema.index({ status: 1 });
TenantSchema.index({ createdAt: -1 });

const Tenant: Model<ITenantDocument> = mongoose.model<ITenantDocument>('Tenant', TenantSchema);

export default Tenant;

// CJS interop — allows require() in Jest test files
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof module !== 'undefined') { (module as any).exports = Tenant; (module as any).exports.default = Tenant; }
