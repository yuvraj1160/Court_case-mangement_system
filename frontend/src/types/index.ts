/**
 * Court Case Management System - Core Frontend Type Definitions
 */

export type UserRole = 'admin' | 'clerk' | 'judge';

export interface User {
  user_id: number;
  username: string;
  role: UserRole;
  judge_id?: string | null;
}

