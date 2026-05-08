const mongoose = require('mongoose');

const ActivitySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    enum: [
      'created_task', 
      'updated_task', 
      'moved_task', 
      'deleted_task',
      'created_board', 
      'updated_board', 
      'deleted_board',
      'created_team', 
      'updated_team', 
      'deleted_team',
      'added_member',
      'removed_member',
      'changed_role'
    ],
    required: true
  },
  description: {
    type: String,
    default: function() {
      const actionMap = {
        'created_task': 'Created a task',
        'updated_task': 'Updated a task',
        'moved_task': 'Moved a task',
        'deleted_task': 'Deleted a task',
        'created_board': 'Created a board',
        'updated_board': 'Updated a board',
        'deleted_board': 'Deleted a board',
        'created_team': 'Created a team',
        'updated_team': 'Updated a team',
        'deleted_team': 'Deleted a team',
        'added_member': 'Added a member',
        'removed_member': 'Removed a member',
        'changed_role': 'Changed member role'
      };
      return actionMap[this.action] || 'Performed an action';
    }
  },
  taskId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  },
  boardId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Board'
  },
  columnId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Column'
  },
  teamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team'
  },
  metadata: {
    type: Object,
    default: {}
  },
  tenant: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

ActivitySchema.index({ user: 1, timestamp: -1 });
ActivitySchema.index({ boardId: 1, timestamp: -1 });
ActivitySchema.index({ teamId: 1 });
ActivitySchema.index({ taskId: 1 });

module.exports = mongoose.model('Activity', ActivitySchema);