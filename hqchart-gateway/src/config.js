export function loadConfig(env = process.env) {
  const rawPort = env.PORT;

  if (rawPort == null || rawPort === '') {
    return {
      port: 18080
    };
  }

  if (!/^\d+$/.test(rawPort)) {
    console.warn(`Invalid PORT "${rawPort}", falling back to 18080`);
    return {
      port: 18080
    };
  }

  const port = Number(rawPort);

  if (port < 1 || port > 65535) {
    console.warn(`Invalid PORT "${rawPort}", falling back to 18080`);
    return {
      port: 18080
    };
  }

  return {
    port
  };
}
