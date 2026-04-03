function createCircuitError(key) {
  const error = new Error(`Circuit is open for ${key}`);
  error.code = 'CIRCUIT_OPEN';
  error.statusCode = 503;
  return error;
}

export function createResilienceService({
  now = () => Date.now(),
  maxAttempts = 1,
  failureThreshold = 3,
  resetTimeoutMs = 30_000
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

    let lastError;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const value = await operation();
        state.failures = 0;
        state.openedAt = 0;
        return value;
      } catch (error) {
        lastError = error;
        state.failures += 1;

        if (state.failures >= failureThreshold) {
          state.openedAt = now();
        }

        if (attempt === attempts) {
          throw error;
        }
      }
    }

    throw lastError;
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
