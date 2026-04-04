const DEFAULT_TIMEOUT_MS = 8000;

export async function fetchText(url, { headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS, responseType = 'text' } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    if (responseType === 'arrayBuffer') {
      return response.arrayBuffer();
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchJson(url, options) {
  const text = await fetchText(url, options);
  return JSON.parse(text);
}
