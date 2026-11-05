/**
 * Court Case Management System - CSRF Manager Concurrency Unit Tests
 * Uses Node.js native test runner (zero external dependencies).
 */

import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { csrfManager, ApiClientError } from '../src/api/client.ts';

describe('CSRF Token Manager - Concurrency & Race Condition Guards', () => {
  beforeEach(() => {
    csrfManager.clearToken();
  });

  test('single-flight pattern: multiple concurrent calls trigger only one fetch', async () => {
    let fetchCount = 0;
    globalThis.fetch = (async () => {
      fetchCount++;
      // Simulate network latency
      await new Promise((resolve) => setTimeout(resolve, 30));
      return new Response(JSON.stringify({ status: 'success', csrf_token: 'token-single-flight' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    const [token1, token2, token3] = await Promise.all([
      csrfManager.ensureToken(),
      csrfManager.ensureToken(),
      csrfManager.ensureToken(),
    ]);

    assert.strictEqual(fetchCount, 1, 'Only one fetch should have been dispatched.');
    assert.strictEqual(token1, 'token-single-flight');
    assert.strictEqual(token2, 'token-single-flight');
    assert.strictEqual(token3, 'token-single-flight');
    assert.strictEqual(csrfManager.getToken(), 'token-single-flight');
  });

  test('clearToken() invalidates in-flight retrieval and prevents late response from restoring token', async () => {
    let resolveFetch: (res: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    globalThis.fetch = (() => fetchPromise) as typeof fetch;

    // 1. Call ensureToken() while token is empty -> starts in-flight fetch
    const pendingEnsure = csrfManager.ensureToken();

    // 2. While in-flight, explicitly clearToken() (e.g. user logged out)
    csrfManager.clearToken();
    assert.strictEqual(csrfManager.getToken(), null);

    // 3. Now let the in-flight fetch complete
    resolveFetch!(
      new Response(JSON.stringify({ status: 'success', csrf_token: 'stale-token-after-logout' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    // 4. Pending request should reject due to invalidation
    await assert.rejects(
      async () => {
        await pendingEnsure;
      },
      (err: unknown) => {
        assert.ok(err instanceof ApiClientError);
        assert.strictEqual(err.message, 'CSRF token request invalidated by session clear.');
        return true;
      }
    );

    // 5. In-memory token MUST remain null! The late response did not resurrect it.
    assert.strictEqual(csrfManager.getToken(), null);
  });

  test('setToken() preserves new token against late responses from older in-flight requests', async () => {
    let resolveFetch: (res: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });

    globalThis.fetch = (() => fetchPromise) as typeof fetch;

    // 1. Call ensureToken() -> starts in-flight fetch
    const pendingEnsure = csrfManager.ensureToken();

    // 2. While in-flight, a login rotates the token via setToken()
    csrfManager.setToken('rotated-login-token-777');
    assert.strictEqual(csrfManager.getToken(), 'rotated-login-token-777');

    // 3. Late response from the older request finally arrives
    resolveFetch!(
      new Response(JSON.stringify({ status: 'success', csrf_token: 'stale-prelogin-token-111' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await pendingEnsure;

    // 4. Caller receives the newer active token, and in-memory token is NOT overwritten
    assert.strictEqual(result, 'rotated-login-token-777');
    assert.strictEqual(csrfManager.getToken(), 'rotated-login-token-777');
  });

  test('older request finally block does not clear newer in-flight request Promise', async () => {
    let resolveFetch1: (res: Response) => void;
    const fetchPromise1 = new Promise<Response>((resolve) => {
      resolveFetch1 = resolve;
    });

    let resolveFetch2: (res: Response) => void;
    const fetchPromise2 = new Promise<Response>((resolve) => {
      resolveFetch2 = resolve;
    });

    let callCount = 0;
    globalThis.fetch = (() => {
      callCount++;
      return callCount === 1 ? fetchPromise1 : fetchPromise2;
    }) as typeof fetch;

    // 1. Start Request 1
    const p1 = csrfManager.ensureToken();

    // 2. Invalidate Request 1 via clearToken()
    csrfManager.clearToken();

    // 3. Start Request 2 (new in-flight promise)
    const p2 = csrfManager.ensureToken();

    // 4. Request 1 completes first and enters its finally block
    resolveFetch1!(
      new Response(JSON.stringify({ status: 'success', csrf_token: 'token-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    // Request 1 rejects
    await assert.rejects(async () => await p1);

    // 5. Verify Request 2 is STILL the active in-flight request:
    // A new call to ensureToken() should coalesce with Request 2
    const p2Coalesced = csrfManager.ensureToken();
    assert.strictEqual(callCount, 2, 'Should not have triggered a third fetch.');

    // 6. Request 2 completes
    resolveFetch2!(
      new Response(JSON.stringify({ status: 'success', csrf_token: 'token-2' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const [res2, res2Coalesced] = await Promise.all([p2, p2Coalesced]);
    assert.strictEqual(res2, 'token-2');
    assert.strictEqual(res2Coalesced, 'token-2');
    assert.strictEqual(csrfManager.getToken(), 'token-2');
  });
});

