import { createSinaProvider } from './sina-provider.js';
import { createTencentProvider } from './tencent-provider.js';

function createRegistryError(message, { statusCode = 502, code = 'PROVIDER_REGISTRY_ERROR', attempts = [] } = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  error.attempts = attempts;
  return error;
}

export function createProviderRegistry({
  primary = 'sina',
  fallback = ['tencent'],
  providers
} = {}) {
  const providerMap = providers ?? new Map([
    ['sina', createSinaProvider()],
    ['tencent', createTencentProvider()]
  ]);

  function getProvider(name) {
    const provider = providerMap instanceof Map ? providerMap.get(name) : providerMap[name];

    if (!provider) {
      throw createRegistryError(`Provider "${name}" is not registered`, {
        statusCode: 500,
        code: 'UNKNOWN_PROVIDER'
      });
    }

    return provider;
  }

  function listProviders(preferredProvider) {
    const names = preferredProvider
      ? [preferredProvider, primary, ...fallback]
      : [primary, ...fallback];

    return [...new Set(names)].map((name) => getProvider(name));
  }

  async function execute(operation, context) {
    const attempts = [];
    const providersToTry = listProviders(context.provider);

    for (const provider of providersToTry) {
      try {
        const data = await provider.fetch(operation, context);
        return {
          provider: provider.name,
          data,
          attempts
        };
      } catch (error) {
        attempts.push({
          provider: provider.name,
          message: error.message,
          code: error.code
        });
      }
    }

    throw createRegistryError(`All providers failed for ${operation}`, {
      statusCode: 502,
      code: 'ALL_PROVIDERS_FAILED',
      attempts
    });
  }

  return {
    execute,
    getProvider,
    listProviders: () => listProviders().map((provider) => provider.name)
  };
}
