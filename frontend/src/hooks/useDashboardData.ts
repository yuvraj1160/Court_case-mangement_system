/**
 * Court Case Management System - useDashboardData Hook
 *
 * Provides reactive access to role-tailored dashboard data fetched from
 * GET /api/dashboard with race condition protection and lifecycle guards.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { UserRole } from '../types/index.ts';
import {
  DashboardDataController,
  type DashboardState,
  type DashboardDataControllerOptions,
} from './dashboardDataController.ts';

export interface UseDashboardDataOptions<T extends UserRole> {
  expectedJudgeId?: string | null;
  autoFetch?: boolean;
  userId?: number | string | null;
  api?: DashboardDataControllerOptions<T>['api'];
}

export interface UseDashboardDataResult<T extends UserRole> extends DashboardState<T> {
  refetch: () => Promise<void>;
}

export function useDashboardData<T extends UserRole>(
  expectedRole: T,
  options: UseDashboardDataOptions<T> = {}
): UseDashboardDataResult<T> {
  const { expectedJudgeId, autoFetch = true, userId, api } = options;
  const isMountedRef = useRef<boolean>(true);
  const controllerRef = useRef<DashboardDataController<T> | null>(null);

  const identityKey = `${expectedRole}:${expectedJudgeId ?? ''}:${userId ?? ''}`;

  // Track the identity key that the currently stored state belongs to
  const [activeIdentityKey, setActiveIdentityKey] = useState<string>(identityKey);

  // Synchronous initial state generation: genuine loading state before first request
  const [state, setState] = useState<DashboardState<T>>(() => {
    const isInitiallyLoading = autoFetch !== false;
    return {
      data: null,
      role: null,
      loading: isInitiallyLoading,
      isLoading: isInitiallyLoading,
      error: null,
      statusCode: null,
    };
  });

  // Synchronous identity transition guard (runs during render, BEFORE useEffect):
  // When identityKey changes, synchronously reset state to prevent stale data flash
  if (activeIdentityKey !== identityKey) {
    setActiveIdentityKey(identityKey);
    const isInitiallyLoading = autoFetch !== false;
    setState({
      data: null,
      role: null,
      loading: isInitiallyLoading,
      isLoading: isInitiallyLoading,
      error: null,
      statusCode: null,
    });
  }

  // Derive identity-guarded state: if state is not associated with the current identity,
  // never leak previous identity's data to the component
  const isIdentityCurrent = activeIdentityKey === identityKey;
  const isRoleMatching = state.role === null || state.role === expectedRole;
  const isJudgeMatching =
    expectedRole !== 'judge' ||
    !expectedJudgeId ||
    !state.data ||
    (state.data as { judge_id?: string }).judge_id === expectedJudgeId;

  const isSafeState = isIdentityCurrent && isRoleMatching && isJudgeMatching;

  const effectiveState: DashboardState<T> = isSafeState
    ? state
    : {
        data: null,
        role: null,
        loading: autoFetch !== false,
        isLoading: autoFetch !== false,
        error: null,
        statusCode: null,
      };

  // StrictMode-compatible and account-switch lifecycle:
  // Setup creates and attaches an active controller instance configured for the identity.
  // Cleanup disposes and detaches it, aborting any active requests.
  // When StrictMode replays setup -> cleanup -> setup, setup creates a fresh active controller,
  // ensuring the active controller is never left disposed.
  // When identity changes, cleanup disposes the old controller, aborting in-flight requests,
  // preventing stale responses from updating the new user's dashboard.
  useEffect(() => {
    isMountedRef.current = true;

    const controller = new DashboardDataController<T>({
      expectedRole,
      expectedJudgeId,
      initialLoading: autoFetch !== false,
      api,
      onStateChange: (newState) => {
        if (isMountedRef.current && controllerRef.current === controller) {
          setState(newState);
        }
      },
    });

    controllerRef.current = controller;

    if (autoFetch !== false) {
      void controller.fetch();
    }

    return () => {
      isMountedRef.current = false;
      controller.dispose();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [expectedRole, expectedJudgeId, autoFetch, api, identityKey]);

  const refetch = useCallback(() => {
    if (controllerRef.current) {
      return controllerRef.current.fetch();
    }
    return Promise.resolve();
  }, []);

  return {
    ...effectiveState,
    refetch,
  };
}
