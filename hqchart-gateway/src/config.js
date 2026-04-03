export function loadConfig(env = process.env) {
  const parsedPort = Number.parseInt(env.PORT ?? '', 10);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 18080;

  return {
    port
  };
}
