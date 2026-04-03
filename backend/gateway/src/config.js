export function loadConfig(env = process.env) {
  const rawPort = env.PORT;
  const providerOrderRaw = env.HQ_PROVIDER_ORDER || 'sina,tencent';
  const providerOrder = providerOrderRaw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const providerMode = env.HQ_PROVIDER_MODE || 'live';

  let port = 18080;
  if (rawPort && /^\d+$/.test(rawPort)) {
    const numeric = Number(rawPort);
    if (numeric >= 1 && numeric <= 65535) port = numeric;
    else console.warn(`Invalid PORT "${rawPort}", falling back to 18080`);
  } else if (rawPort) {
    console.warn(`Invalid PORT "${rawPort}", falling back to 18080`);
  }

  return {
    port,
    providerOrder: providerOrder.length ? providerOrder : ['sina', 'tencent'],
    providerMode
  };
}
