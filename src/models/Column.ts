import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IColumn {
  title: string;
  board: mongoose.Types.ObjectId;
  position: number;
  tenant?: mongoose.Types.ObjectId;
}

export interface IColumnDocument extends IColumn, Document {}

const ColumnSchema = new Schema<IColumnDocument>(
  {
    title: {
      type: String,
      required: [true, 'Please provide a column title'],
      trim: true
    },
    board: {
      type: Schema.Types.ObjectId,
      ref: 'Board',
      required: [true, 'Column must be associated with a board']
    },
    position: {
      type: Number,
      default: 0
    },
    tenant: {
      type: Schema.Types.ObjectId,
      ref: 'Tenant',
      index: true
    }
  },
  {
    timestamps: true
  }
);

const Column: Model<IColumnDocument> = mongoose.model<IColumnDocument>('Column', ColumnSchema);

export default Column;

// CJS interop — allows require() in Jest test files
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof module !== 'undefined') { (module as any).exports = Column; (module as any).exports.default = Column; }
