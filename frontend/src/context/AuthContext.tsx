/**
 * Court Case Management System - Authentication Provider Component
 *
 * Implements session validation, login, logout, and token-clearing workflows
 * utilizing AuthSessionController for request-generation concurrency guards
 * and ref-based lifecycle guards against React StrictMode duplicate execution.
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AuthContext, type AuthContextType } from './auth-context';
import { AuthSessionController, type AuthState } from './authSessionController';

export interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const isMountedRef = useRef<boolean>(true);
  const didInitializeRef = useRef<boolean>(false);

  const [state, setState] = useState<AuthState>({
    user: null,
    loading: true,
    error: null,
  });

  const controller = useMemo(() => new AuthSessionController(), []);

  // Centralized startup session validation reuses refreshUser()
  // Guarded against React StrictMode effect replay via didInitializeRef
  useEffect(() => {
    isMountedRef.current = true;
    controller.setOnStateChange((newState) => {
      if (isMountedRef.current) {
        setState(newState);
      }
    });

    if (!didInitializeRef.current) {
      didInitializeRef.current = true;
      queueMicrotask(() => {
        // Prevent validation from starting if genuine unmount occurred before microtask tick
        if (isMountedRef.current) {
          void controller.refreshUser();
        }
      });
    }

    return () => {
      isMountedRef.current = false;
      controller.setOnStateChange(undefined);
    };
  }, [controller]);

  const value: AuthContextType = useMemo(
    () => ({
      user: state.user,
      loading: state.loading,
      error: state.error,
      login: (u, p) => controller.login(u, p),
      logout: () => controller.logout(),
      refreshUser: () => controller.refreshUser(),
    }),
    [state.user, state.loading, state.error, controller]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
