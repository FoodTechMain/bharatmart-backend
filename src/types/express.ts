import type { Request as ExpressRequest } from 'express-serve-static-core';
import type { Response as ExpressResponse } from 'express-serve-static-core';
import type { NextFunction as ExpressNextFunction } from 'express-serve-static-core';
import { IUserDocument } from '../models/User';
import { IShopDocument } from '../models/Shop';

export interface AuthRequest extends ExpressRequest {
  user?: IUserDocument;
  shop?: IShopDocument;
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

export type AuthNextFunction = ExpressNextFunction;

// Extend the Request interface to include the user property
declare global {
  namespace Express {
    interface Request {
      user?: IUserDocument;
      shop?: IShopDocument;
    }
  }
}