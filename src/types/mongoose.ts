import { Document, Model, Types } from 'mongoose';

export interface BulkWriteResult {
  ok: number;
  nInserted: number;
  nUpserted: number;
  nMatched: number;
  nModified: number;
  nRemoved: number;
  upserted: Array<{ index: number; _id: Types.ObjectId }>;
  mongoose?: {
    validationErrors: Error[];
    results: (Error | WriteError | null)[];
  };
}

export interface WriteError {
  code: number;
  index: number;
  errmsg: string;
}

export interface BulkWriteOperation<T extends Document> {
  insertOne?: {
    document: Partial<T>;
  };
  updateOne?: {
    filter: Record<string, any>;
    update: Record<string, any>;
    upsert?: boolean;
  };
  updateMany?: {
    filter: Record<string, any>;
    update: Record<string, any>;
    upsert?: boolean;
  };
  deleteOne?: {
    filter: Record<string, any>;
  };
  deleteMany?: {
    filter: Record<string, any>;
  };
  replaceOne?: {
    filter: Record<string, any>;
    replacement: Partial<T>;
    upsert?: boolean;
  };
}

export interface Sluggable {
  slug: string;
}

export interface Addressable {
  address: {
    street?: string;
    city: string;
    state: string;
    zipCode?: string;
    country: string;
  };
}

export type WeightUnit = 'g' | 'kg' | 'lb' | 'oz';
export type DimensionUnit = 'cm' | 'in' | 'm' | 'ft';

export interface IProductWeight {
  value: number;
  unit: WeightUnit;
}

export interface IProductDimensions {
  length?: number;
  width?: number;
  height?: number;
  unit: DimensionUnit;
}

export interface VerificationStatus {
  status: 'pending' | 'approved' | 'rejected';
  notes?: string;
  verifiedBy?: Types.ObjectId;
  verifiedAt?: Date;
}

export interface BulkWriteOptions {
  ordered?: boolean;
  bypassDocumentValidation?: boolean;
  session?: any;
}

export interface DeleteManyModel<T> {
  filter: Record<string, any>;
}

export interface AnyBulkWriteOperation<T> {
  insertOne?: {
    document: T;
  };
  updateOne?: {
    filter: Record<string, any>;
    update: Record<string, any>;
    upsert?: boolean;
  };
  updateMany?: {
    filter: Record<string, any>;
    update: Record<string, any>;
    upsert?: boolean;
  };
  deleteOne?: {
    filter: Record<string, any>;
  };
  deleteMany?: DeleteManyModel<T>;
  replaceOne?: {
    filter: Record<string, any>;
    replacement: T;
    upsert?: boolean;
  };
}