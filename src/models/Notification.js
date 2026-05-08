const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: [
      'team_invitation', 
      'team_invitation_accepted', 
      'task_assigned',
      'task_completed',
      'task_reopened',
      'task_comment',
      'board_created',
      'board_shared',
      'task_due_soon',
      'mention'
    ],
    required: true
  },
  message: {
    type: String,
    required: true
  },
  read: {
    type: Boolean,
    default: false
  },
  relatedTask: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  },
  relatedBoard: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board'
  },
  relatedTeam: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team'
  },
  initiator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Notification', NotificationSchema);