import Activity from '../models/Activity';
import Task from '../models/Task';
import mongoose from 'mongoose';

type Metadata = Record<string, unknown>;

const generateDescription = (action: string, metadata: Metadata = {}): string => {
  switch (action) {
    case 'created_task':
      return `Created task "${(metadata.taskTitle as string) || 'Untitled'}"`;
    case 'updated_task':
      return `Updated task "${(metadata.taskTitle as string) || 'Untitled'}"`;
    case 'moved_task':
      return `Moved task "${(metadata.taskTitle as string) || 'Untitled'}"`;
    case 'deleted_task':
      return `Deleted task "${(metadata.taskTitle as string) || 'Untitled'}"`;
    case 'created_board':
      return `Created board "${(metadata.boardTitle as string) || 'Untitled'}"`;
    case 'created_team':
      return `Created team "${(metadata.teamName as string) || 'Untitled'}"`;
    default:
      return `Performed action: ${action.replace(/_/g, ' ')}`;
  }
};

const logTaskActivity = async (
  userId: string | mongoose.Types.ObjectId,
  action: string,
  taskId: string | mongoose.Types.ObjectId,
  boardId: string | mongoose.Types.ObjectId | null | undefined,
  columnId: string | mongoose.Types.ObjectId | null | undefined,
  metadata: Metadata = {},
  tenantId: string | mongoose.Types.ObjectId | null = null
): Promise<void> => {
  try {
    const task = await Task.findById(taskId);
    const taskTitle = task ? task.title : ((metadata.taskTitle as string) || 'Unknown task');
    await Activity.create({
      user: userId,
      action,
      description: generateDescription(action, { ...metadata, taskTitle }),
      taskId,
      boardId,
      columnId,
      metadata,
      timestamp: Date.now(),
      ...(tenantId && { tenant: tenantId })
    });
  } catch (error) {
    console.error(`Error logging task activity (${action}):`, error);
  }
};

const logBoardActivity = async (
  userId: string | mongoose.Types.ObjectId,
  action: string,
  boardId: string | mongoose.Types.ObjectId | null | undefined,
  metadata: Metadata = {},
  tenantId: string | mongoose.Types.ObjectId | null = null
): Promise<void> => {
  try {
    await Activity.create({
      user: userId,
      action,
      description: generateDescription(action, metadata),
      boardId,
      metadata,
      timestamp: Date.now(),
      ...(tenantId && { tenant: tenantId })
    });
  } catch (error) {
    console.error(`Error logging board activity (${action}):`, error);
  }
};

const logTeamActivity = async (
  userId: string | mongoose.Types.ObjectId,
  action: string,
  teamId: string | mongoose.Types.ObjectId | null | undefined,
  metadata: Metadata = {},
  tenantId: string | mongoose.Types.ObjectId | null = null
): Promise<void> => {
  try {
    await Activity.create({
      user: userId,
      action,
      description: generateDescription(action, metadata),
      teamId,
      metadata,
      timestamp: Date.now(),
      ...(tenantId && { tenant: tenantId })
    });
  } catch (error) {
    console.error(`Error logging team activity (${action}):`, error);
  }
};

export { logTaskActivity, logBoardActivity, logTeamActivity, generateDescription };
