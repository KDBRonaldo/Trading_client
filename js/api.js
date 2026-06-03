function buildApiUrl(baseUrl, endpoint, params = {}) {
  const path = endpoint.replace(/\{(\w+)\}/g, (_, key) =>
    encodeURIComponent(params[key] ?? ""),
  );
  return `${baseUrl}${path}`;
}

async function requestJson(
  baseUrl,
  endpoint,
  { params = {}, method = "GET", body } = {},
) {
  if (!baseUrl) return { ok: false, mock: true, message: "接口地址未配置" };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.timeoutMs);
  try {
    const response = await fetch(buildApiUrl(baseUrl, endpoint, params), {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        ok: false,
        message: data.message || `接口请求失败：${response.status}`,
      };
    }
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      message:
        error.name === "AbortError"
          ? "接口请求超时，请稍后重试"
          : "接口连接失败，请检查服务地址",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
