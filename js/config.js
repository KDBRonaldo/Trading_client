const STORAGE_KEY = "stock-trading-client-state";
const SESSION_LIMIT_MS = 30 * 60 * 1000;
const DEMO_MODE = false;
const MANAGEMENT_INTEGRATION_MODE = true;
const MANAGEMENT_INTEGRATION_BASE_URL = "http://10.196.95.30:8081";
const ACCOUNT_SYSTEM_BASE_URL = "http://localhost:8080";
const ACCOUNT_SYSTEM_CERTIFICATE_CODE = "CERT-123456";
const ACCOUNT_SYSTEM_INTEGRATION_MODE = true;
const CENTRAL_KAFKA_INTEGRATION_MODE = true;
const storedCentralKafkaEnabled = localStorage.getItem("centralKafkaEnabled");

const API_CONFIG = {
  demoMode: DEMO_MODE,
  // 当前仅联调交易管理/中央交易；资金账户系统暂不调用。
  accountBaseUrl: ACCOUNT_SYSTEM_INTEGRATION_MODE && !DEMO_MODE ? ACCOUNT_SYSTEM_BASE_URL : "",
  // 本地会话服务仅在联调时显式配置，避免未启动 8090 服务阻塞演示账户登录。
  clientBaseUrl: CENTRAL_KAFKA_INTEGRATION_MODE ? "http://localhost:8090" : MANAGEMENT_INTEGRATION_MODE ? "" : DEMO_MODE ? "" : localStorage.getItem("clientApiBase") || "",
  managementBaseUrl: MANAGEMENT_INTEGRATION_MODE ? MANAGEMENT_INTEGRATION_BASE_URL : DEMO_MODE ? "" : localStorage.getItem("managementApiBase") || "",
  centralBaseUrl: MANAGEMENT_INTEGRATION_MODE ? "" : DEMO_MODE ? "" : localStorage.getItem("centralTradingApiBase") || "",
  centralKafkaEnabled: CENTRAL_KAFKA_INTEGRATION_MODE ? true : MANAGEMENT_INTEGRATION_MODE ? false : DEMO_MODE ? false : storedCentralKafkaEnabled === null ? true : storedCentralKafkaEnabled === "true",
  endpoints: {
    login: "/api/external/fund/login",
    completeCertificate: "/api/external/fund/complete-certificate",
    fundAccount: "/api/external/fund/snapshot",
    holdings: "/api/external/security/snapshot",
    changePassword: "/api/external/fund/password",
    fundBalanceChange: "/api/external/trade/fund-balance",
    securityHoldingChange: "/api/external/trade/security-holding",
    reviewOrder: "/api/trade-management/orders/review",
    reviewResult: "/api/trade-management/reviews/{reviewId}",
    quotes: "/api/central-trading/stocks",
    submitOrder: "/api/central-trading/orders",
    cancelOrder: "/api/central-trading/orders/{orderId}/cancel",
    orderResult: "/api/central-trading/orders/{orderId}/result",
    kafkaSubmitOrder: "/api/client/central/orders",
    kafkaCancelOrder: "/api/client/central/orders/{orderId}/cancel",
    kafkaOrderResult: "/api/client/central/orders/{orderId}/result",
    kafkaStockQuery: "/api/client/central/stock-queries",
    kafkaQuotes: "/api/client/central/stocks",
    clientSessions: "/api/client/sessions",
    clientSession: "/api/client/sessions/{sessionId}",
    clientOrders: "/api/client/orders",
    clientOrder: "/api/client/orders/{localOrderId}",
    clientTrades: "/api/client/trades",
    clientAlerts: "/api/client/alerts",
    clientAlert: "/api/client/alerts/{alertId}",
    clientNotifications: "/api/client/notifications",
    clientNotification: "/api/client/notifications/{notificationId}",
  },
  timeoutMs: 5000,
};
