/**
 * Court Case Management System - Auth Session Concurrency Controller
 *
 * Implements a request-generation counter ("latest request wins") mechanism
 * to prevent race conditions across concurrent /auth/me, login, and logout operations.
 */

import type { User } from '../types/index.ts';
import {
  getCurrentUser,
  login as authLogin,
  logout as authLogout,
} from '../api/auth.api.ts';
import { ApiClientError } from '../api/client.ts';

export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

export interface AuthSessionControllerOptions {
  onStateChange?: (state: AuthState) => void;
  api?: {
    getCurrentUser?: typeof getCurrentUser;
    login?: typeof authLogin;
    logout?: typeof authLogout;
  };
}

export class AuthSessionController {
  private user: User | null = null;
  private loading: boolean = true;
  private error: string | null = null;
  private generation: number = 0;
  private onStateChange?: (state: AuthState) => void;
  private api: {
    getCurrentUser: typeof getCurrentUser;
    login: typeof authLogin;
    logout: typeof authLogout;
  };

  constructor(options: AuthSessionControllerOptions = {}) {
    this.onStateChange = options.onStateChange;
    this.api = {
      getCurrentUser: options.api?.getCurrentUser ?? getCurrentUser,
      login: options.api?.login ?? authLogin,
      logout: options.api?.logout ?? authLogout,
    };
  }

  public setOnStateChange(callback?: (state: AuthState) => void): void {
    this.onStateChange = callback;
  }

  public getState(): AuthState {
    return {
      user: this.user,
      loading: this.loading,
      error: this.error,
    };
  }

  public getGeneration(): number {
    return this.generation;
  }

  private updateState(partial: Partial<AuthState>): void {
    if (partial.user !== undefined) this.user = partial.user;
    if (partial.loading !== undefined) this.loading = partial.loading;
    if (partial.error !== undefined) this.error = partial.error;

    if (this.onStateChange) {
      this.onStateChange(this.getState());
    }
  }

  /**
   * Re-validate session identity with GET /auth/me.
   * Increments generation counter to invalidate any earlier in-flight requests.
   */
  public async refreshUser(): Promise<void> {
    const currentGen = ++this.generation;
    this.updateState({ loading: true });

    try {
      const response = await this.api.getCurrentUser();
      // Stale check: only update if this request is still the latest
      if (currentGen === this.generation) {
        this.updateState({
          user: response.user,
          error: null,
          loading: false,
        });
      }
    } catch (err: unknown) {
      if (currentGen !== this.generation) {
        return;
      }

      if (err instanceof ApiClientError && err.status === 401) {
        // Backend confirms session is unauthenticated
        this.updateState({
          user: null,
          error: null,
          loading: false,
        });
      } else {
        // Network or server error
        const message =
          err instanceof ApiClientError
            ? err.message
            : err instanceof Error
            ? err.message
            : 'Unable to verify session with authentication server.';
        this.updateState({
          user: null,
          error: message,
          loading: false,
        });
      }
    }
  }

  /**
   * Authenticate credentials via POST /auth/login.
   * Increments generation counter to invalidate any pending /auth/me requests.
   * Returns the authenticated User upon successful completion and state transition.
   */
  public async login(username: string, password: string): Promise<User> {
    const currentGen = ++this.generation;
    this.updateState({ loading: true });

    try {
      const response = await this.api.login(username, password);
      if (currentGen === this.generation) {
        let authenticatedUser: User | null = null;
        if (response && response.user) {
          authenticatedUser = response.user;
        } else {
          const fresh = await this.api.getCurrentUser();
          if (currentGen === this.generation) {
            authenticatedUser = fresh.user;
          }
        }

        if (authenticatedUser) {
          this.updateState({
            user: authenticatedUser,
            error: null,
            loading: false,
          });
          return authenticatedUser;
        }
      }
      throw new Error('Login state transition superseded by concurrent action.');
    } finally {
      if (currentGen === this.generation) {
        this.updateState({ loading: false });
      }
    }
  }

  /**
   * Terminate active session via POST /auth/logout.
   * Increments generation counter to immediately invalidate pending session checks.
   * Local session state is cleared even if the server request fails.
   */
  public async logout(): Promise<void> {
    const currentGen = ++this.generation;
    // Immediately invalidate pending requests and clear local session state
    this.updateState({
      user: null,
      error: null,
      loading: true,
    });

    try {
      await this.api.logout();
    } catch (err: unknown) {
      console.warn('Logout server request failed, clearing local session state.', err);
    } finally {
      if (currentGen === this.generation) {
        this.updateState({
          user: null,
          error: null,
          loading: false,
        });
      }
    }
  }
}
