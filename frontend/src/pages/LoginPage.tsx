/**
 * Court Case Management System - Login Page
 *
 * Professional judicial portal authentication interface.
 * Implements accessible form controls, client-side validation, show/hide password,
 * server error presentation, duplicate submission prevention (with synchronous locking),
 * and secure role-scoped redirection.
 */

import React, { useState, useRef, useEffect } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  Scale,
  User as UserIcon,
  Lock,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context';
import { resolveSafeRedirect } from '../routes/navigation';
import type { User } from '../types';
import {
  LoginSubmissionController,
  type LoginSubmissionState,
} from './loginSubmissionController';

export const LoginPage: React.FC = () => {
  const { user, loading: authLoading, login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [submissionState, setSubmissionState] = useState<LoginSubmissionState>({
    isSubmitting: false,
    fieldErrors: {},
    serverError: null,
  });

  // Track the latest user in a ref so controller can evaluate state transitions
  const userRef = useRef<User | null>(user);
  const controllerRef = useRef<LoginSubmissionController | null>(null);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    userRef.current = user;
    if (user) {
      controllerRef.current?.notifyUserChanged(user);
    }
  }, [user]);

  // Keep controller instance and its callbacks synchronized with component props/state.
  // StrictMode-compatible lifecycle:
  // Setup creates and attaches an active controller instance.
  // Cleanup disposes and detaches it.
  // When StrictMode replays setup -> cleanup -> setup, setup creates a fresh active controller,
  // ensuring the active controller is never left disposed.
  useEffect(() => {
    isMountedRef.current = true;
    const controller = new LoginSubmissionController({
      login,
      getUser: () => userRef.current,
      from: location.state?.from,
      onStateChange: (newState) => {
        if (isMountedRef.current) {
          setSubmissionState(newState);
        }
      },
      onSuccess: (destination) => {
        if (isMountedRef.current) {
          navigate(destination, { replace: true });
        }
      },
    });
    controllerRef.current = controller;

    return () => {
      isMountedRef.current = false;
      controller.dispose();
      controllerRef.current = null;
    };
  }, [login, location.state?.from, navigate]);

  // If session is already authenticated, redirect to authorized route
  if (authLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center"
      >
        <Loader2 className="h-10 w-10 animate-spin text-slate-800 mb-4" />
        <span className="text-slate-700 font-medium text-base">Verifying active session...</span>
        <span className="sr-only">Loading</span>
      </div>
    );
  }

  if (user) {
    const destination = resolveSafeRedirect(user.role, location.state?.from);
    return <Navigate to={destination} replace />;
  }

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUsername(e.target.value);
    controllerRef.current?.clearFieldError('username');
    controllerRef.current?.clearServerError();
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    controllerRef.current?.clearFieldError('password');
    controllerRef.current?.clearServerError();
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const controller = controllerRef.current;
    if (!controller || !isMountedRef.current || controller.isDisposedState()) {
      return;
    }
    const success = await controller.submit(username, password);
    // Issue 3: Do not call setPassword('') if component has unmounted or submission was invalidated
    if (!success && isMountedRef.current && !controller.isDisposedState()) {
      setPassword('');
    }
  };

  const { isSubmitting, fieldErrors, serverError } = submissionState;

  return (
    <div className="min-h-[75vh] flex flex-col justify-center items-center py-6 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl shadow-slate-900/5 border border-slate-200 overflow-hidden">
        {/* Subtle gold emblem bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600" />

        <div className="p-8 sm:p-10">
          {/* Judicial Header & Seal */}
          <div className="text-center mb-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-amber-400 border border-amber-400/30 shadow-xs mb-4">
              <Scale className="h-7 w-7" />
            </div>

            <div className="inline-block px-3 py-1 rounded-full bg-amber-50 border border-amber-200/70 text-[11px] font-semibold tracking-wider text-amber-800 uppercase mb-2">
              Official Judicial Portal
            </div>

            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Sign In to Your Account
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Enter your credentials to access case dockets and records.
            </p>
          </div>

          {/* Access Warning / Security Banner */}
          <div className="mb-6 p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-start space-x-2.5 text-xs text-slate-600">
            <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              Restricted judicial system. All access attempts are monitored and audit logged.
            </span>
          </div>

          {/* Server Authentication Error Alert */}
          {serverError && (
            <div
              role="alert"
              aria-live="assertive"
              className="mb-6 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start space-x-2.5"
            >
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium leading-relaxed">{serverError}</div>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Username Input */}
            <div>
              <label
                htmlFor="username"
                className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
              >
                Username
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <UserIcon className="h-4 w-4" />
                </div>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  disabled={isSubmitting}
                  value={username}
                  onChange={handleUsernameChange}
                  placeholder="e.g. court_admin"
                  className={`w-full pl-10 pr-4 py-2.5 bg-slate-50 border ${
                    fieldErrors.username
                      ? 'border-rose-400 ring-1 ring-rose-400 bg-rose-50/20'
                      : 'border-slate-300'
                  } rounded-xl text-slate-900 placeholder:text-slate-400 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                  aria-invalid={!!fieldErrors.username}
                  aria-describedby={fieldErrors.username ? 'username-error' : undefined}
                />
              </div>
              {fieldErrors.username && (
                <p
                  id="username-error"
                  className="text-xs text-rose-600 mt-1 flex items-center gap-1 font-medium"
                >
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  {fieldErrors.username}
                </p>
              )}
            </div>

            {/* Password Input */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  value={password}
                  onChange={handlePasswordChange}
                  placeholder="Enter your security password"
                  className={`w-full pl-10 pr-11 py-2.5 bg-slate-50 border ${
                    fieldErrors.password
                      ? 'border-rose-400 ring-1 ring-rose-400 bg-rose-50/20'
                      : 'border-slate-300'
                  } rounded-xl text-slate-900 placeholder:text-slate-400 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-slate-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  disabled={isSubmitting}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-700 transition-colors focus:outline-none cursor-pointer disabled:cursor-not-allowed"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {fieldErrors.password && (
                <p
                  id="password-error"
                  className="text-xs text-rose-600 mt-1 flex items-center gap-1 font-medium"
                >
                  <AlertCircle className="h-3 w-3 shrink-0" />
                  {fieldErrors.password}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || authLoading}
                aria-busy={isSubmitting}
                className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm rounded-xl shadow-xs transition-all focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center space-x-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                    <span>Verifying credentials...</span>
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4 text-amber-400" />
                    <span>Sign In to Portal</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Footer Security Notice */}
          <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-center text-center text-[11px] text-slate-400 space-x-1.5">
            <Lock className="h-3 w-3 text-slate-400" />
            <span>Encrypted Session &bull; Role-Based Authorization</span>
          </div>
        </div>
      </div>
    </div>
  );
};
