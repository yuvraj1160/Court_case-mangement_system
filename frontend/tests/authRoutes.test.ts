/**
 * Court Case Management System - Navigation & Route Guard Unit Tests
 * Uses Node.js native test runner (zero external dependencies).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getRoleDashboardPath } from '../src/routes/navigation.ts';
import type { User, UserRole } from '../src/types/index.ts';

describe('Navigation Helpers - getRoleDashboardPath', () => {
  test('correctly routes admin role to /admin', () => {
    assert.strictEqual(getRoleDashboardPath('admin'), '/admin');
  });

  test('correctly routes clerk role to /clerk', () => {
    assert.strictEqual(getRoleDashboardPath('clerk'), '/clerk');
  });

  test('correctly routes judge role to /judge', () => {
    assert.strictEqual(getRoleDashboardPath('judge'), '/judge');
  });

  test('safely falls back to /login for invalid or unexpected roles', () => {
    assert.strictEqual(getRoleDashboardPath('unknown' as unknown as UserRole), '/login');
    assert.strictEqual(getRoleDashboardPath('' as unknown as UserRole), '/login');
  });
});

describe('RoleGuard Authorization Simulation Matrix', () => {
  /**
   * Evaluates access decision for a user against allowed roles,
   * matching RoleGuard component behavior.
   */
  const evaluateRoleGuard = (
    user: User | null,
    allowedRoles: UserRole[]
  ): { allow: boolean; redirectTo?: string } => {
    if (!user) {
      return { allow: false, redirectTo: '/login' };
    }
    if (!allowedRoles.includes(user.role)) {
      return { allow: false, redirectTo: getRoleDashboardPath(user.role) };
    }
    return { allow: true };
  };

  test('unauthenticated guest is redirected to /login for admin route', () => {
    const res = evaluateRoleGuard(null, ['admin']);
    assert.strictEqual(res.allow, false);
    assert.strictEqual(res.redirectTo, '/login');
  });

  test('unauthenticated guest is redirected to /login for clerk route', () => {
    const res = evaluateRoleGuard(null, ['clerk']);
    assert.strictEqual(res.allow, false);
    assert.strictEqual(res.redirectTo, '/login');
  });

  test('unauthenticated guest is redirected to /login for judge route', () => {
    const res = evaluateRoleGuard(null, ['judge']);
    assert.strictEqual(res.allow, false);
    assert.strictEqual(res.redirectTo, '/login');
  });

  test('admin user accessing admin route is allowed', () => {
    const admin: User = { user_id: 1, username: 'admin_sys', role: 'admin', judge_id: null };
    const res = evaluateRoleGuard(admin, ['admin']);
    assert.strictEqual(res.allow, true);
    assert.strictEqual(res.redirectTo, undefined);
  });

  test('clerk user accessing clerk route is allowed', () => {
    const clerk: User = { user_id: 2, username: 'clerk_records', role: 'clerk', judge_id: null };
    const res = evaluateRoleGuard(clerk, ['clerk']);
    assert.strictEqual(res.allow, true);
    assert.strictEqual(res.redirectTo, undefined);
  });

  test('judge user accessing judge route is allowed', () => {
    const judge: User = {
      user_id: 3,
      username: 'judge_davis',
      role: 'judge',
      judge_id: 'd9b90c2a-6058-45e0-949d-e4dcb2410a01',
    };
    const res = evaluateRoleGuard(judge, ['judge']);
    assert.strictEqual(res.allow, true);
    assert.strictEqual(res.redirectTo, undefined);
  });

  test('clerk attempting to access admin route is redirected to /clerk (no loop, no dead end)', () => {
    const clerk: User = { user_id: 2, username: 'clerk_records', role: 'clerk', judge_id: null };
    const res = evaluateRoleGuard(clerk, ['admin']);
    assert.strictEqual(res.allow, false);
    assert.strictEqual(res.redirectTo, '/clerk');
  });

  test('judge attempting to access admin route is redirected to /judge', () => {
    const judge: User = {
      user_id: 3,
      username: 'judge_davis',
      role: 'judge',
      judge_id: 'd9b90c2a-6058-45e0-949d-e4dcb2410a01',
    };
    const res = evaluateRoleGuard(judge, ['admin']);
    assert.strictEqual(res.allow, false);
    assert.strictEqual(res.redirectTo, '/judge');
  });

  test('admin attempting to access clerk route is redirected to /admin', () => {
    const admin: User = { user_id: 1, username: 'admin_sys', role: 'admin', judge_id: null };
    const res = evaluateRoleGuard(admin, ['clerk']);
    assert.strictEqual(res.allow, false);
    assert.strictEqual(res.redirectTo, '/admin');
  });

  test('admin attempting to access judge route is redirected to /admin', () => {
    const admin: User = { user_id: 1, username: 'admin_sys', role: 'admin', judge_id: null };
    const res = evaluateRoleGuard(admin, ['judge']);
    assert.strictEqual(res.allow, false);
    assert.strictEqual(res.redirectTo, '/admin');
  });

  test('clerk attempting to access judge route is redirected to /clerk', () => {
    const clerk: User = { user_id: 2, username: 'clerk_records', role: 'clerk', judge_id: null };
    const res = evaluateRoleGuard(clerk, ['judge']);
    assert.strictEqual(res.allow, false);
    assert.strictEqual(res.redirectTo, '/clerk');
  });

  test('judge attempting to access clerk route is redirected to /judge', () => {
    const judge: User = {
      user_id: 3,
      username: 'judge_davis',
      role: 'judge',
      judge_id: 'd9b90c2a-6058-45e0-949d-e4dcb2410a01',
    };
    const res = evaluateRoleGuard(judge, ['clerk']);
    assert.strictEqual(res.allow, false);
    assert.strictEqual(res.redirectTo, '/judge');
  });
});

describe('Root & Login Redirection Logic Simulation', () => {
  const evaluateRootRedirect = (
    user: User | null
  ): { target: string } => {
    if (!user) {
      return { target: '/login' };
    }
    return { target: getRoleDashboardPath(user.role) };
  };

  test('root / redirects unauthenticated visitor to /login', () => {
    assert.strictEqual(evaluateRootRedirect(null).target, '/login');
  });

  test('root / redirects authenticated admin to /admin', () => {
    const admin: User = { user_id: 1, username: 'admin', role: 'admin', judge_id: null };
    assert.strictEqual(evaluateRootRedirect(admin).target, '/admin');
  });

  test('root / redirects authenticated clerk to /clerk', () => {
    const clerk: User = { user_id: 2, username: 'clerk', role: 'clerk', judge_id: null };
    assert.strictEqual(evaluateRootRedirect(clerk).target, '/clerk');
  });

  test('root / redirects authenticated judge to /judge', () => {
    const judge: User = { user_id: 3, username: 'judge', role: 'judge', judge_id: 'uuid-1' };
    assert.strictEqual(evaluateRootRedirect(judge).target, '/judge');
  });
});
