import type { Request } from 'express';

export type Role = 'ADMIN' | 'STUDENT';

/** Identity resolved from the server-side session. This is the ONLY source of tenant identity. */
export interface AuthContext {
  userId: string;
  role: Role;
  institutionId: string;
  studentId: string | null;
}

export type AuthedRequest = Request & { auth: AuthContext; id: string };

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    csrf?: string;
    createdAt?: number;
  }
}
declare module 'express-serve-static-core' {
  interface Request {
    id?: string;
    auth?: AuthContext;
  }
}
