import { Document, Types } from 'mongoose';

export interface ITimestamps {
  createdAt: Date;
  updatedAt: Date;
}

export interface IAddress {
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}

export interface ISEO {
  title?: string;
  description?: string;
  keywords?: string[];
}

export interface IImage {
  url: string;
  alt?: string;
  isPrimary?: boolean;
}

export interface IWeight {
  value: number;
  unit: string;
}

export interface IDimensions {
  length?: number;
  width?: number;
  height?: number;
  unit?: string;
}

// Base interface for Mongoose documents with common fields
export interface BaseDocument extends Document, ITimestamps {
  _id: Types.ObjectId;
}