const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); 

const UserSchema = new mongoose.Schema(
  {
    name: { 
      type: String,
      trim: true,
      default: function() {
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
      set: function(password) {
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
    teams: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team'
    }],
    currentTenant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tenant',
      default: null
    },
    userData: {
      type: mongoose.Schema.Types.Mixed,
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

UserSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  delete user.refreshToken;
  delete user.verificationCode;
  delete user.resetPasswordToken;
  return user;
};


UserSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.models.User || mongoose.model('User', UserSchema);

module.exports = User;