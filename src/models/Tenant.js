const mongoose = require('mongoose');
const slugify = require('slugify');

const TenantMemberSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
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
}, { _id: false });

const TenantSchema = new mongoose.Schema({
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
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [TenantMemberSchema],
  settings: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  status: {
    type: String,
    enum: ['active', 'suspended', 'deleted'],
    default: 'active'
  }
}, { timestamps: true });

// Auto-generate a unique slug from name before saving
TenantSchema.pre('save', async function (next) {
  if (!this.isModified('name') && this.slug) return next();

  const base = slugify(this.name, { lower: true, strict: true });
  let slug = base;
  let count = 0;

  while (await mongoose.models.Tenant.exists({ slug, _id: { $ne: this._id } })) {
    count++;
    slug = `${base}-${count}`;
  }

  this.slug = slug;
  next();
});

TenantSchema.index({ slug: 1 }, { unique: true });
TenantSchema.index({ owner: 1 });
TenantSchema.index({ 'members.user': 1 });
TenantSchema.index({ status: 1 });
TenantSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Tenant', TenantSchema);
