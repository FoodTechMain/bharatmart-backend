import { Types } from 'mongoose';
import type { Request as ExpressRequest } from 'express-serve-static-core';
import type { Response as ExpressResponse } from 'express-serve-static-core';
import { IUserDocument } from '../models/User';
import { IShopDocument } from '../models/Shop';

export interface AuthRequest extends ExpressRequest {
  user?: IUserDocument;
  shop?: IShopDocument;
  franchiseId?: Types.ObjectId;
  userType?: 'admin' | 'franchise';
  headers: ExpressRequest['headers'];
  body: any;
  params: any;
  query: any;
}

export interface AuthResponse extends ExpressResponse {
  status(code: number): this;
  json(body: any): this;
  send(body: any): this;
  setHeader(name: string, value: string): this;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  details?: any;
  message?: string;
}

export interface PaginationQuery {
  page?: string;
  limit?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationMeta {
  total: number;
  currentPage: number;
  limit: number;
  totalPages: number;
  page?: number;
  pages?: number;
  hasNext?: boolean;
  hasPrev?: boolean;
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T;
  pagination: PaginationMeta;
  stats?: any;
}

export interface IdParam {
  id: string;
}

export interface CategoryIdParam {
  categoryId: string;
}

export interface BulkStatusUpdate {
  ids: Types.ObjectId[];
  isActive: boolean;
}

export interface UserUpdateData {
  name?: string;
  email?: string;
  phone?: string;
  password?: string;
  role?: UserRole;
  permissions?: string[];
  isActive?: boolean;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
  };
  avatar?: string;
}

export type UserRole = 'superadmin' | 'admin' | 'user' | 'staff' | 'shop_owner' | 'customer';

export type VerificationStatus = 'pending' | 'approved' | 'rejected' | 'verified';

export function createPaginationMeta(
  total: number,
  page: number,
  limit: number
): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  return {
    total,
    currentPage: page,
    limit,
    totalPages,
    page,
    pages: totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  };
}