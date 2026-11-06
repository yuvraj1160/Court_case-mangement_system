/**
 * Court Case Management System - Login Submission Controller
 *
 * Encapsulates form submission locking, client-side validation, error mapping,
 * explicit confirmation of state transitions, lifecycle disposal guards,
 * and safe role-based redirection.
 */

import type { User } from '../types/index.ts';
import { resolveSafeRedirect } from '../routes/navigation.ts';
import { ApiClientError } from '../api/client.ts';

export interface LoginSubmissionState {
  isSubmitting: boolean;
  fieldErrors: { username?: string; password?: string };
  serverError: string | null;
}

export interface LoginSubmissionOptions {
  login: (username: string, password: string) => Promise<User | null | void>;
  getUser?: () => User | null;
  waitForUser?: (timeoutMs?: number) => Promise<User | null>;
  from?: unknown;
  onSuccess?: (destination: string) => void;
  onStateChange?: (state: LoginSubmissionState) => void;
  userWaitTimeoutMs?: number;
  navigationTimeoutMs?: number;
}

/**
 * Type guard to verify that a value meets the User contract.
 */
function isUser(val: unknown): val is User {
  return (
    typeof val === 'object' &&
    val !== null &&
    'user_id' in val &&
    'role' in val &&
    'username' in val
  );
}

interface UserWaiterRecord {
  timer: ReturnType<typeof setTimeout> | null;
  resolve: (user: User | null) => void;
  settled: boolean;
}

export class LoginSubmissionController {
  private isSubmitting = false;
  private isLocked = false;
  private isDisposed = false;
  private submissionGeneration = 0;
  private fieldErrors: { username?: string; password?: string } = {};
  private serverError: string | null = null;
  private options: LoginSubmissionOptions;
  private userWaiters: UserWaiterRecord[] = [];
  private navigationUnlockTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: LoginSubmissionOptions) {
    this.options = options;
  }

  public setOptions(options: LoginSubmissionOptions): void {
    this.options = options;
  }

  public getState(): LoginSubmissionState {
    return {
      isSubmitting: this.isSubmitting,
      fieldErrors: { ...this.fieldErrors },
      serverError: this.serverError,
    };
  }

  public isSubmissionLocked(): boolean {
    return this.isLocked;
  }

  public isDisposedState(): boolean {
    return this.isDisposed;
  }

  public clearFieldError(field: 'username' | 'password'): void {
    if (this.isDisposed) return;
    if (this.fieldErrors[field]) {
      delete this.fieldErrors[field];
      this.notify();
    }
  }

  public clearServerError(): void {
    if (this.isDisposed) return;
    if (this.serverError) {
      this.serverError = null;
      this.notify();
    }
  }

  public resetLock(): void {
    if (this.navigationUnlockTimer) {
      clearTimeout(this.navigationUnlockTimer);
      this.navigationUnlockTimer = null;
    }
    this.isLocked = false;
    this.isSubmitting = false;
    if (!this.isDisposed) {
      this.notify();
    }
  }

  /**
   * Invalidate any in-flight submission and release all resources.
   * Ensures that no pending login request can invoke onSuccess, navigate,
   * or publish state updates after component unmount.
   */
  public dispose(): void {
    this.isDisposed = true;
    this.submissionGeneration++;

    if (this.navigationUnlockTimer) {
      clearTimeout(this.navigationUnlockTimer);
      this.navigationUnlockTimer = null;
    }
    this.clearUserWaiters();
    this.isLocked = false;
    this.isSubmitting = false;
  }

  public getPendingWaitersCount(): number {
    return this.userWaiters.length;
  }

  /**
   * Explicitly notify the controller that an authenticated user state update has occurred.
   * Resolves any pending waiters waiting for asynchronous React state propagation,
   * clears their timeout handles, and removes their records.
   */
  public notifyUserChanged(user: User | null): void {
    if (this.isDisposed) return;
    if (this.userWaiters.length > 0) {
      const waiters = [...this.userWaiters];
      for (const waiter of waiters) {
        waiter.resolve(user);
      }
    }
  }

  /**
   * Reliably awaits confirmation of the authenticated user state.
   * Eliminates arbitrary setTimeout(0) ticks by combining direct accessor checks,
   * custom waitForUser callbacks, and event-driven state notification.
   * Tracks timeout handles and resolver functions together to ensure prompt cleanup.
   */
  public async waitForUserState(timeoutMs?: number): Promise<User | null> {
    if (this.isDisposed) return null;

    const immediate = this.options.getUser?.();
    if (immediate && isUser(immediate)) {
      return immediate;
    }

    if (this.options.waitForUser) {
      const user = await this.options.waitForUser(timeoutMs);
      if (this.isDisposed) return null;
      return user;
    }

    const waitLimit = timeoutMs ?? this.options.userWaitTimeoutMs ?? 500;
    return new Promise<User | null>((resolve) => {
      let waiterRecord: UserWaiterRecord;

      const finish = (result: User | null) => {
        if (waiterRecord.settled) return;
        waiterRecord.settled = true;

        if (waiterRecord.timer !== null) {
          clearTimeout(waiterRecord.timer);
          waiterRecord.timer = null;
        }

        const idx = this.userWaiters.indexOf(waiterRecord);
        if (idx !== -1) {
          this.userWaiters.splice(idx, 1);
        }

        resolve(result);
      };

      const timer = setTimeout(() => {
        if (this.isDisposed) {
          finish(null);
          return;
        }
        const fallback = this.options.getUser?.() ?? null;
        finish(isUser(fallback) ? fallback : null);
      }, waitLimit);

      const timerObj = timer as unknown as { unref?: () => void };
      if (typeof timerObj?.unref === 'function') {
        timerObj.unref();
      }

      waiterRecord = {
        timer,
        resolve: finish,
        settled: false,
      };

      this.userWaiters.push(waiterRecord);
    });
  }

  /**
   * Clears all pending user waiters by settling each through its resolver function.
   * finish() remains the single owner of marking settled, clearing timers,
   * removing records from userWaiters, and resolving the original Promise.
   */
  private clearUserWaiters(): void {
    if (this.userWaiters.length > 0) {
      const waiters = [...this.userWaiters];
      for (const waiter of waiters) {
        waiter.resolve(null);
      }
      this.userWaiters = [];
    }
  }

  private scheduleNavigationUnlockSafeguard(): void {
    if (this.navigationUnlockTimer) {
      clearTimeout(this.navigationUnlockTimer);
    }
    const timeout = this.options.navigationTimeoutMs ?? 5000;
    this.navigationUnlockTimer = setTimeout(() => {
      if (this.isDisposed) return;
      if (this.isLocked || this.isSubmitting) {
        this.isLocked = false;
        this.isSubmitting = false;
        this.notify();
      }
    }, timeout);
    const timerObj = this.navigationUnlockTimer as unknown as { unref?: () => void };
    if (typeof timerObj?.unref === 'function') {
      timerObj.unref();
    }
  }

  private notify(): void {
    if (this.isDisposed) {
      return;
    }
    if (this.options.onStateChange) {
      this.options.onStateChange(this.getState());
    }
  }

  /**
   * Process a login form submission with synchronous submission locking,
   * client validation, reliable authentication state resolution, error handling,
   * lifecycle disposal guards, and safe role-based redirection.
   *
   * @returns true if authentication succeeded and state transition completed; false otherwise.
   */
  public async submit(username: string, password: string): Promise<boolean> {
    // 1. Lifecycle & lock check: ignore submissions on disposed controllers or concurrent calls
    if (this.isDisposed) {
      return false;
    }
    if (this.isLocked || this.isSubmitting) {
      return false;
    }

    // 2. Client-side field validation
    const cleanUsername = username.trim();
    const errors: { username?: string; password?: string } = {};

    if (!cleanUsername) {
      errors.username = 'Please enter your username.';
    }
    if (!password) {
      errors.password = 'Please enter your password.';
    }

    if (Object.keys(errors).length > 0) {
      this.fieldErrors = errors;
      this.serverError = null;
      this.notify();
      return false;
    }

    // 3. Acquire lock synchronously and track submission generation
    const currentSubGen = ++this.submissionGeneration;
    this.isLocked = true;
    this.isSubmitting = true;
    this.fieldErrors = {};
    this.serverError = null;
    this.notify();

    // 4. Execute authentication
    try {
      const loginResult = await this.options.login(cleanUsername, password);

      // Verify controller is still active and submission has not been superseded or disposed
      if (this.isDisposed || currentSubGen !== this.submissionGeneration) {
        return false;
      }

      // Determine authenticated user identity
      let user: User | null = isUser(loginResult) ? loginResult : null;

      // If login() did not return the User directly, check synchronous accessor
      if (!user && this.options.getUser) {
        const directUser = this.options.getUser();
        if (isUser(directUser)) {
          user = directUser;
        }
      }

      // If still not available (e.g. delayed state propagation), reliably await confirmation
      if (!user) {
        user = await this.waitForUserState(this.options.userWaitTimeoutMs);

        // Re-verify lifecycle after awaiting state confirmation
        if (this.isDisposed || currentSubGen !== this.submissionGeneration) {
          return false;
        }
      }

      // 5. Successful login path: verify state transition and trigger redirection
      if (user && isUser(user)) {
        const destination = resolveSafeRedirect(user.role, this.options.from);

        if (this.options.onSuccess) {
          try {
            this.options.onSuccess(destination);
          } catch (navErr) {
            if (!this.isDisposed && currentSubGen === this.submissionGeneration) {
              this.resetLock();
            }
            throw navErr;
          }

          // If navigation was triggered, arm safeguard timer so controller
          // cannot remain permanently locked if navigation fails or does not unmount
          if (!this.isDisposed && currentSubGen === this.submissionGeneration) {
            this.scheduleNavigationUnlockSafeguard();
          }
        } else {
          // If no navigation callback was provided (e.g. headless/test environment),
          // define successful submission completion by unlocking immediately
          if (!this.isDisposed && currentSubGen === this.submissionGeneration) {
            this.isLocked = false;
            this.isSubmitting = false;
            this.notify();
          }
        }

        return true;
      }

      // 6. Safeguard: If login resolved but user identity was NOT established,
      // release lock so form cannot be left permanently stuck, and report actionable error.
      if (this.isDisposed || currentSubGen !== this.submissionGeneration) {
        return false;
      }

      this.isLocked = false;
      this.isSubmitting = false;
      this.serverError =
        'Authentication completed but session state was not established. Please try again.';
      this.notify();
      return false;
    } catch (err: unknown) {
      // If controller was disposed or superseded, suppress error presentation and state updates
      if (this.isDisposed || currentSubGen !== this.submissionGeneration) {
        return false;
      }

      // Release submission lock on authentication failure or network error
      this.isLocked = false;
      this.isSubmitting = false;

      if (err instanceof ApiClientError) {
        this.serverError = err.message;
      } else if (err instanceof Error) {
        this.serverError = err.message;
      } else {
        this.serverError = 'Authentication failed. Please verify your credentials.';
      }
      this.notify();
      return false;
    }
  }
}
