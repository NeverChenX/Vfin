function createCircuitError(key) {
  const error = new Error(`Circuit is open for ${key}`);
  error.code = 'CIRCUIT_OPEN';
  error.statusCode = 503;
  return error;
}

// H10: maxAttempts bumped 1 -> 2 with a 250ms gap so single Sina/Tencent 503
// blips no longer push state.failures toward the 3-failure circuit threshold.
// retryDelayMs is configurable for tests.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createResilienceService({
  now = () => Date.now(),
  maxAttempts = 2,
  failureThreshold = 3,
  resetTimeoutMs = 30_000,
  retryDelayMs = 250,
} = {}) {
  const states = new Map();

  function getState(key) {
    if (!states.has(key)) {
      states.set(key, {
        failures: 0,
        openedAt: 0
      });
    }

    return states.get(key);
  }

  async function execute(operation, { key = 'default', attempts = maxAttempts } = {}) {
    const state = getState(key);

    if (state.openedAt && now() - state.openedAt < resetTimeoutMs) {
      throw createCircuitError(key);
    }

    if (state.openedAt && now() - state.openedAt >= resetTimeoutMs) {
      state.failures = 0;
      state.openedAt = 0;
    }

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const value = await operation();
        state.failures = 0;
        state.openedAt = 0;
        return value;
      } catch (error) {
        // UNSUPPORTED 类错误是预期行为，不应触发熔断
        if (error.code !== 'UNSUPPORTED_PROVIDER_OPERATION' && error.code !== 'CIRCUIT_OPEN') {
          state.failures += 1;
          if (state.failures >= failureThreshold) {
            state.openedAt = now();
          }
        }

        if (attempt === attempts) {
          throw error;
        }
        // H10: brief backoff between attempts so we don't immediately re-hit
        // a flapping upstream.
        if (retryDelayMs > 0) {
          await sleep(retryDelayMs);
        }
      }
    }
  }

  return {
    execute,
    getState: (key) => ({ ...getState(key) }),
    reset: (key) => {
      states.delete(key);
    },
    resetAll: () => states.clear()
  };
}
