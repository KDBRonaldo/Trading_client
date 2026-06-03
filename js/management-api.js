async function reviewOrderByManagement(orderPayload) {
  if (!API_CONFIG.managementBaseUrl) return { ok: true, approved: true };
  const result = await requestJson(
    API_CONFIG.managementBaseUrl,
    API_CONFIG.endpoints.reviewOrder,
    {
      method: "POST",
      body: orderPayload,
    },
  );
  if (!result.ok) return result;
  const payload = result.data.data || result.data;
  return {
    ok: payload.approved !== false && result.data.success !== false,
    approved: payload.approved !== false,
    message: payload.message || result.data.message || "交易管理系统审查未通过",
  };
}
