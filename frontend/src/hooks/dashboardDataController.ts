/**
 * Court Case Management System - Dashboard Data Controller
 *
 * Implements a generation-counter ("latest request wins") mechanism to guard
 * against race conditions across rapid refetches or role transitions.
 * Pure TypeScript logic with zero React dependencies for 100% testability.
 */

import type { UserRole, DashboardResponse, DashboardDataForRole } from '../types/index.ts';
import { getDashboard as defaultGetDashboard } from '../api/dashboard.api.ts';
import { ApiClientError } from '../api/client.ts';

export interface DashboardState<T extends UserRole> {
  data: DashboardDataForRole<T> | null;
  role: T | null;
  loading: boolean;
  isLoading: boolean;
  error: string | null;
  statusCode: number | null;
}

export interface DashboardDataControllerOptions<T extends UserRole> {
  expectedRole: T;
  expectedJudgeId?: string | null;
  onStateChange?: (state: DashboardState<T>) => void;
  initialLoading?: boolean;
  api?: {
    getDashboard?: typeof defaultGetDashboard;
  };
}

export class DashboardDataController<T extends UserRole> {
  private expectedRole: T;
  private expectedJudgeId?: string | null;
  private generation: number = 0;
  private isDisposed: boolean = false;
  private abortController: AbortController | null = null;
  private onStateChange?: (state: DashboardState<T>) => void;
  private api: {
    getDashboard: typeof defaultGetDashboard;
  };

  private state: DashboardState<T>;

  constructor(options: DashboardDataControllerOptions<T>) {
    this.expectedRole = options.expectedRole;
    this.expectedJudgeId = options.expectedJudgeId;
    this.onStateChange = options.onStateChange;
    this.api = {
      getDashboard: options.api?.getDashboard ?? defaultGetDashboard,
    };
    const isInitiallyLoading = options.initialLoading ?? true;
    this.state = {
      data: null,
      role: null,
      loading: isInitiallyLoading,
      isLoading: isInitiallyLoading,
      error: null,
      statusCode: null,
    };
  }

  public setExpectedRole(role: T, judgeId?: string | null): void {
    if (this.expectedRole !== role || this.expectedJudgeId !== judgeId) {
      this.expectedRole = role;
      this.expectedJudgeId = judgeId;
      if (this.abortController) {
        this.abortController.abort();
        this.abortController = null;
      }
      this.generation++;
      this.updateState({
        data: null,
        role: null,
        loading: true,
        isLoading: true,
        error: null,
        statusCode: null,
      });
    }
  }

  public getExpectedRole(): T {
    return this.expectedRole;
  }

  public getExpectedJudgeId(): string | null | undefined {
    return this.expectedJudgeId;
  }

  public setOnStateChange(callback?: (state: DashboardState<T>) => void): void {
    this.onStateChange = callback;
  }

  public getState(): DashboardState<T> {
    return { ...this.state };
  }

  public getGeneration(): number {
    return this.generation;
  }

  public isBusy(): boolean {
    return this.state.loading;
  }

  private updateState(partial: Partial<DashboardState<T>>): void {
    if (this.isDisposed) return;
    const nextLoading = partial.loading !== undefined ? partial.loading : this.state.loading;
    this.state = {
      ...this.state,
      ...partial,
      loading: nextLoading,
      isLoading: nextLoading,
    };
    if (this.onStateChange) {
      this.onStateChange(this.getState());
    }
  }

  /**
   * Fetch dashboard data from GET /api/dashboard.
   * Increments generation counter to invalidate earlier in-flight responses.
   */
  public async fetch(): Promise<void> {
    if (this.isDisposed) {
      return;
    }

    // Cancel any existing in-flight abort controller
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.abortController = new AbortController();
    const currentGen = ++this.generation;

    this.updateState({
      loading: true,
      error: null,
    });

    try {
      const response: DashboardResponse = await this.api.getDashboard({
        signal: this.abortController.signal,
      });

      // Stale check: only update if this request is still the latest
      if (this.isDisposed || currentGen !== this.generation) {
        return;
      }

      // 1. Validate response status envelope
      if (!response || response.status !== 'success') {
        this.updateState({
          loading: false,
          data: null,
          role: null,
          error: 'Invalid response format received from dashboard API.',
          statusCode: 500,
        });
        return;
      }

      // 2. Validate role matches expected role
      if (response.role !== this.expectedRole) {
        this.updateState({
          loading: false,
          data: null,
          role: null,
          error: `Dashboard role mismatch: expected '${this.expectedRole}', but received '${response.role}'.`,
          statusCode: 403,
        });
        return;
      }

      // 3. For judge role: require non-null valid expectedJudgeId and verify match
      if (this.expectedRole === 'judge') {
        const trimmedExpectedJudgeId =
          typeof this.expectedJudgeId === 'string' ? this.expectedJudgeId.trim() : '';

        if (!trimmedExpectedJudgeId) {
          this.updateState({
            loading: false,
            data: null,
            role: null,
            error: 'Judge identity validation failed: missing or invalid expected judge_id.',
            statusCode: 403,
          });
          return;
        }

        const judgeData = response.data as { judge_id?: string | null };
        const returnedJudgeId =
          typeof judgeData?.judge_id === 'string' ? judgeData.judge_id.trim() : null;

        if (!returnedJudgeId || returnedJudgeId !== trimmedExpectedJudgeId) {
          this.updateState({
            loading: false,
            data: null,
            role: null,
            error: `Judge identity mismatch: expected '${trimmedExpectedJudgeId}', but received '${returnedJudgeId ?? 'null'}'.`,
            statusCode: 403,
          });
          return;
        }
      }

      // Valid response
      this.updateState({
        loading: false,
        data: response.data as DashboardDataForRole<T>,
        role: response.role as T,
        error: null,
        statusCode: 200,
      });
    } catch (err: unknown) {
      // If disposed or stale, suppress updates
      if (this.isDisposed || currentGen !== this.generation) {
        return;
      }

      // If aborted by a newer request or disposal, suppress error
      if (err instanceof Error && (err.name === 'AbortError' || err.message.includes('aborted'))) {
        return;
      }

      let errorMessage: string;
      let status: number | null = null;

      if (err instanceof ApiClientError) {
        status = err.status;
        if (err.status === 401) {
          errorMessage = 'Authentication required. Please sign in again.';
        } else if (err.status === 403) {
          errorMessage = 'Access forbidden. You do not have permission to view this dashboard.';
        } else if (err.status === 500) {
          errorMessage = 'Dashboard service temporarily unavailable. Please try again later.';
        } else {
          errorMessage = err.message || `Request failed with status ${err.status}.`;
        }
      } else if (err instanceof Error) {
        errorMessage = err.message;
      } else {
        errorMessage = 'Unable to connect to dashboard service.';
      }

      this.updateState({
        loading: false,
        data: null,
        role: null,
        error: errorMessage,
        statusCode: status,
      });
    } finally {
      if (currentGen === this.generation) {
        this.abortController = null;
      }
    }
  }

  public dispose(): void {
    this.isDisposed = true;
    this.onStateChange = undefined;
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}

