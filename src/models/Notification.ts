import mongoose, { Document, Model, Schema } from 'mongoose';

type NotificationType =
  | 'team_invitation'
  | 'team_invitation_accepted'
  | 'task_assigned'
  | 'task_completed'
  | 'task_reopened'
  | 'task_comment'
  | 'board_created'
  | 'board_shared'
  | 'task_due_soon'
  | 'mention';

export interface INotification {
  recipient: mongoose.Types.ObjectId;
  type: NotificationType | string;
  message: string;
  read: boolean;
  relatedTask?: mongoose.Types.ObjectId;
  relatedBoard?: mongoose.Types.ObjectId;
  relatedTeam?: mongoose.Types.ObjectId;
  initiator?: mongoose.Types.ObjectId;
  tenant?: mongoose.Types.ObjectId;
  createdAt?: Date;
}

export interface INotificationDocument extends INotification, Document {}

const NotificationSchema = new Schema<INotificationDocument>({
  recipient: {
    type: Schema.Types.ObjectId,
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
    type: Schema.Types.ObjectId,
    ref: 'Task'
  },
  relatedBoard: {
    type: Schema.Types.ObjectId,
    ref: 'Board'
  },
  relatedTeam: {
    type: Schema.Types.ObjectId,
    ref: 'Team'
  },
  initiator: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  tenant: {
    type: Schema.Types.ObjectId,
    ref: 'Tenant',
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Notification: Model<INotificationDocument> = mongoose.model<INotificationDocument>(
  'Notification',
  NotificationSchema
);

export default Notification;

// CJS interop — allows require() in Jest test files
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof module !== 'undefined') { (module as any).exports = Notification; (module as any).exports.default = Notification; }
