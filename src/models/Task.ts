import mongoose, { Document, Model, Schema } from 'mongoose';

export interface ITask {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'todo' | 'in_progress' | 'done';
  dueDate?: Date;
  order: number;
  board: mongoose.Types.ObjectId;
  column: mongoose.Types.ObjectId;
  team?: mongoose.Types.ObjectId;
  assignedTo?: mongoose.Types.ObjectId | null;
  createdBy: mongoose.Types.ObjectId;
  completedBy?: mongoose.Types.ObjectId | null;
  completedAt?: Date | null;
  tenant?: mongoose.Types.ObjectId;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ITaskDocument extends ITask, Document {}

const TaskSchema = new Schema<ITaskDocument>(
  {
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      default: ''
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    status: {
      type: String,
      enum: ['todo', 'in_progress', 'done'],
      default: 'todo'
    },
    dueDate: {
      type: Date
    },
    order: {
      type: Number,
      required: true
    },
    board: {
      type: Schema.Types.ObjectId,
      ref: 'Board',
      required: true
    },
    column: {
      type: Schema.Types.ObjectId,
      ref: 'Column',
      required: true
    },
    team: {
      type: Schema.Types.ObjectId,
      ref: 'Team'
    },
    assignedTo: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    completedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },
    completedAt: {
      type: Date
    },
    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

TaskSchema.index({ board: 1 });
TaskSchema.index({ column: 1, order: 1 });
TaskSchema.index({ assignedTo: 1 });

const Task: Model<ITaskDocument> = mongoose.model<ITaskDocument>('Task', TaskSchema);

export default Task;

// CJS interop — allows require() in Jest test files
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof module !== 'undefined') { (module as any).exports = Task; (module as any).exports.default = Task; }
