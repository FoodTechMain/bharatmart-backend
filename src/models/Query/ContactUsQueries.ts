import mongoose, { Schema, Document } from 'mongoose';

export interface IContactUsQuery extends Document {
  name: string;
  email_id: string;
  phone_no: string;
  query: string;
  query_resolved: boolean;
  timestamp: Date;
}

const contactUsQuerySchema = new Schema({
  name: {
    type: String,
    required: true,
  },
  email_id: {
    type: String,
    required: true,
    match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please provide a valid email address']
  },
  phone_no: {
    type: String,
    required: true,
    match: [/^[0-9]{10}$/, 'Please provide a valid 10-digit phone number']
  },
  query: {
    type: String,
    required: true
  },
  query_resolved: {
    type: Boolean,
    default: false
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model<IContactUsQuery>('ContactUsQuery', contactUsQuerySchema);