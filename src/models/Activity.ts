import mongoose, { Document, Model, Schema } from 'mongoose';

type ActivityAction =
  | 'created_task'
  | 'updated_task'
  | 'moved_task'
  | 'deleted_task'
  | 'created_board'
  | 'updated_board'
  | 'deleted_board'
  | 'created_team'
  | 'updated_team'
  | 'deleted_team'
  | 'added_member'
  | 'removed_member'
  | 'changed_role';

export interface IActivity {
  user: mongoose.Types.ObjectId;
  action: ActivityAction | string;
  description?: string;
  taskId?: mongoose.Types.ObjectId;
  boardId?: mongoose.Types.ObjectId;
  columnId?: mongoose.Types.ObjectId;
  teamId?: mongoose.Types.ObjectId;
  metadata?: Record<string, unknown>;
  tenant?: mongoose.Types.ObjectId;
  timestamp?: Date;
}

export interface IActivityDocument extends IActivity, Document {}

const actionMap: Record<string, string> = {
  created_task: 'Created a task',
  updated_task: 'Updated a task',
  moved_task: 'Moved a task',
  deleted_task: 'Deleted a task',
  created_board: 'Created a board',
  updated_board: 'Updated a board',
  deleted_board: 'Deleted a board',
  created_team: 'Created a team',
  updated_team: 'Updated a team',
  deleted_team: 'Deleted a team',
  added_member: 'Added a member',
  removed_member: 'Removed a member',
  changed_role: 'Changed member role'
};

const ActivitySchema = new Schema<IActivityDocument>(
  {
    user: {
      type: Schema.Types.ObjectId,
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
      default: function (this: IActivityDocument) {
        return actionMap[this.action as string] || 'Performed an action';
      }
    },
    taskId: {
      type: Schema.Types.ObjectId,
      ref: 'Task'
    },
    boardId: {
      type: Schema.Types.ObjectId,
      ref: 'Board'
    },
    columnId: {
      type: Schema.Types.ObjectId,
      ref: 'Column'
    },
    teamId: {
      type: Schema.Types.ObjectId,
      ref: 'Team'
    },
    metadata: {
      type: Object,
      default: {}
    },
    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

ActivitySchema.index({ user: 1, timestamp: -1 });
ActivitySchema.index({ boardId: 1, timestamp: -1 });
ActivitySchema.index({ teamId: 1 });
ActivitySchema.index({ taskId: 1 });

const Activity: Model<IActivityDocument> = mongoose.model<IActivityDocument>(
  'Activity',
  ActivitySchema
);

export default Activity;

// CJS interop — allows require() in Jest test files
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof module !== 'undefined') { (module as any).exports = Activity; (module as any).exports.default = Activity; }
