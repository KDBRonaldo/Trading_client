package account.integration;

import account.common.AuthHeaders;
import account.controller.external.ExternalFundController;
import account.controller.external.ExternalSecurityController;
import account.controller.external.ExternalTradeController;
import account.controller.internal.DashboardController;
import account.controller.internal.FundAccountController;
import account.controller.internal.SecurityAccountController;
import account.controller.internal.StaffController;
import account.dao.DaoRegistry;
import account.dao.model.DomainEnums;
import account.exception.GlobalExceptionHandler;
import account.service.api.ClientAuthTokenService;
import account.service.api.FundAccountService;
import account.service.FundAccountServiceImpl;
import account.service.InMemoryClientAuthTokenService;
import account.service.InMemoryStaffAuthTokenService;
import account.service.OperationLogViewMapper;
import account.service.api.SecurityAccountService;
import account.service.SecurityAccountServiceImpl;
import account.service.api.StaffAuthTokenService;
import account.service.api.StaffService;
import account.service.StaffServiceImpl;
import account.support.TestDatabaseSupport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ApiIntegrationTest {

    private MockMvc mockMvc;
    private ObjectMapper objectMapper;
    private DaoRegistry registry;

    @BeforeEach
    void setUp() throws Exception {
        String jdbcUrl = "jdbc:h2:mem:api_" + UUID.randomUUID() + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
        TestDatabaseSupport.recreateSchema(jdbcUrl);
        registry = DaoRegistry.forDriverManager(jdbcUrl, "sa", "");
        TestDatabaseSupport.insertStaff(jdbcUrl, 1, "staff01", "staff-pass", "\u6b63\u5e38");
        TestDatabaseSupport.insertStaff(jdbcUrl, 2, "staff02", "staff-pass", "\u6b63\u5e38");

        objectMapper = new ObjectMapper().findAndRegisterModules();
        StaffAuthTokenService staffAuthTokenService = new InMemoryStaffAuthTokenService(28800L);
        ClientAuthTokenService clientAuthTokenService = new InMemoryClientAuthTokenService(7200L);
        BlacklistClient blacklistClient = userName -> false;

        StaffService staffService = new StaffServiceImpl(registry, staffAuthTokenService);
        FundAccountService fundService = new FundAccountServiceImpl(registry, blacklistClient, clientAuthTokenService);
        SecurityAccountService securityService = new SecurityAccountServiceImpl(registry, blacklistClient, clientAuthTokenService);
        OperationLogViewMapper operationLogViewMapper = new OperationLogViewMapper(registry);

                mockMvc = MockMvcBuilders.standaloneSetup(
                        new StaffController(staffService, staffAuthTokenService, objectMapper),
                        new SecurityAccountController(securityService, staffAuthTokenService, objectMapper),
                        new FundAccountController(fundService, staffAuthTokenService, objectMapper),
                        new DashboardController(registry, securityService, fundService, staffAuthTokenService, operationLogViewMapper),
                        new ExternalFundController(fundService, objectMapper),
                        new ExternalSecurityController(securityService, objectMapper),
                        new ExternalTradeController(fundService, securityService, objectMapper)
                )
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void internalAndExternalMainFlowWorksEndToEnd() throws Exception {
        String staffToken = staffLoginAndGetToken("staff01", "staff-pass");

        MvcResult createSecurityResult = mockMvc.perform(post("/api/internal/security/accounts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "investor_type": "\u4e2a\u4eba",
                                  "name": "Investor A",
                                  "gender": "\u7537",
                                  "id_type": "ID",
                                  "id_number": "330101199001010031",
                                  "phone": "13800000000",
                                  "address": "Hangzhou",
                                  "work_unit": "ZJU",
                                  "occupation": "Engineer",
                                  "education": "Bachelor"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode securityJson = readJson(createSecurityResult);
        assertEquals(0, securityJson.get("code").asInt());
        String secAccNo = securityJson.get("sec_acc_no").asText();
        int investorId = securityJson.get("investor_id").asInt();

        MvcResult createFundResult = mockMvc.perform(post("/api/internal/fund/accounts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "sec_acc_no": "%s",
                                  "id_number": "330101199001010031",
                                  "trade_password": "trade123",
                                  "withdraw_password": "withdraw123",
                                  "currency": "CNY"
                                }
                                """.formatted(secAccNo)))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode fundJson = readJson(createFundResult);
        assertEquals(0, fundJson.get("code").asInt());
        String fundAccNo = fundJson.get("fund_acc_no").asText();

        MvcResult updateInvestorResult = mockMvc.perform(put("/api/internal/security/investors")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "investor_id": %d,
                                  "name": "Investor A Updated",
                                  "work_unit": "ZJU-FSE"
                                }
                                """.formatted(investorId)))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode updateInvestorJson = readJson(updateInvestorResult);
        assertEquals("Investor A Updated", updateInvestorJson.get("name").asText());
        assertEquals("ZJU-FSE", updateInvestorJson.get("work_unit").asText());

        String clientToken = clientLoginAndGetToken(fundAccNo, "trade123");
        assertNotNull(clientToken);

        MvcResult fundSnapshotResult = mockMvc.perform(get("/api/external/fund/snapshot")
                        .param("fund_acc_no", fundAccNo)
                        .param("auth_token", clientToken))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode fundSnapshotJson = readJson(fundSnapshotResult);
        assertEquals(0, fundSnapshotJson.get("available_balance").decimalValue().compareTo(BigDecimal.ZERO));
        assertEquals(0, fundSnapshotJson.get("frozen_balance").decimalValue().compareTo(BigDecimal.ZERO));

        mockMvc.perform(post("/api/internal/fund/deposit")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "fund_acc_no": "%s",
                                  "amount": 1000.00
                                }
                                """.formatted(fundAccNo)))
                .andExpect(status().isOk());

        MvcResult fundFreezeResult = mockMvc.perform(post("/api/external/trade/fund-balance")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fund_acc_no": "%s",
                                  "ref_order_id": "ORD-API-1",
                                  "txn_type": "\u4e70\u5165\u51bb\u7ed3",
                                  "amount": 100.00
                                }
                                """.formatted(fundAccNo)))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode fundFreezeJson = readJson(fundFreezeResult);
        assertFalse(fundFreezeJson.get("duplicate").asBoolean());

        MvcResult fundFreezeDuplicateResult = mockMvc.perform(post("/api/external/trade/fund-balance")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fund_acc_no": "%s",
                                  "ref_order_id": "ORD-API-1",
                                  "txn_type": "\u4e70\u5165\u51bb\u7ed3",
                                  "amount": 100.00
                                }
                                """.formatted(fundAccNo)))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode fundFreezeDuplicateJson = readJson(fundFreezeDuplicateResult);
        assertTrue(fundFreezeDuplicateJson.get("duplicate").asBoolean());

        mockMvc.perform(post("/api/external/trade/security-holding")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "sec_acc_no": "%s",
                                  "stock_code": "600519",
                                  "stock_name": "\u8d35\u5dde\u8305\u53f0",
                                  "ref_order_id": "ORD-API-1",
                                  "change_type": "\u4e70\u5165\u589e\u52a0",
                                  "quantity": 10,
                                  "price": 10.0000
                                }
                                """.formatted(secAccNo)))
                .andExpect(status().isOk());

        MvcResult securitySnapshotResult = mockMvc.perform(get("/api/external/security/snapshot")
                        .param("sec_acc_no", secAccNo)
                        .param("auth_token", clientToken))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode securitySnapshotJson = readJson(securitySnapshotResult);
        assertEquals(secAccNo, securitySnapshotJson.get("sec_acc_no").asText());
        assertEquals(1, securitySnapshotJson.get("holdings").size());
        assertEquals("\u8d35\u5dde\u8305\u53f0", securitySnapshotJson.get("holdings").get(0).get("stock_name").asText());
    }

    @Test
    void deactivatedStaffTokenIsRejectedByProtectedInternalEndpoint() throws Exception {
        String adminToken = staffLoginAndGetToken("staff01", "staff-pass");
        String targetToken = staffLoginAndGetToken("staff02", "staff-pass");

        mockMvc.perform(post("/api/internal/staff/deactivate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, adminToken)
                        .content("""
                                {
                                  "target_staff_id": 2,
                                  "reason": "left"
                                }
                                """))
                .andExpect(status().isOk());

        MvcResult rejected = mockMvc.perform(post("/api/internal/security/accounts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, targetToken)
                        .content("""
                                {
                                  "investor_type": "\u4e2a\u4eba",
                                  "name": "Blocked Staff Investor",
                                  "gender": "\u7537",
                                  "id_type": "ID",
                                  "id_number": "330101199001010032"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode rejectedJson = readJson(rejected);
        assertEquals(1018, rejectedJson.get("code").asInt());
        assertEquals("ERR_018", rejectedJson.get("symbol").asText());
    }

    @Test
    void fundLossAndCloseFlowIsVisibleThroughInternalApi() throws Exception {
        String staffToken = staffLoginAndGetToken("staff01", "staff-pass");
        int investorId = TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9201",
                "FA9201",
                "330101199001010041",
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );
        assertTrue(investorId > 0);

        MvcResult lossResult = mockMvc.perform(post("/api/internal/fund/accounts/loss")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "fund_acc_no": "FA9201",
                                  "id_number": "330101199001010041",
                                  "reason": "lost card"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode lossJson = readJson(lossResult);
        assertEquals(0, lossJson.get("code").asInt());

        assertEquals("\u6302\u5931\u51bb\u7ed3", registry.fundAccountDao().findByAccountNo("FA9201").orElseThrow().status().dbValue());
        assertEquals("\u6302\u5931\u51bb\u7ed3", registry.securityAccountDao().findByAccountNo("SA9201").orElseThrow().status().dbValue());
    }

    @Test
    void dashboardStatsExcludeClosedAccounts() throws Exception {
        String staffToken = staffLoginAndGetToken("staff01", "staff-pass");
        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9401",
                "FA9401",
                "330101199001010071",
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );
        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9402",
                "FA9402",
                "330101199001010072",
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );
        registry.transactionManager().execute(connection -> {
            registry.securityAccountDao().updateStatus(connection, "SA9402", DomainEnums.AccountStatus.CLOSED);
            registry.fundAccountDao().updateStatus(connection, "FA9402", DomainEnums.AccountStatus.CLOSED);
            return null;
        });

        MvcResult statsResult = mockMvc.perform(get("/api/internal/dashboard/stats")
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode statsJson = readJson(statsResult);
        assertEquals(0, statsJson.get("code").asInt());
        assertEquals(1, statsJson.get("data").get("security_account_count").asInt());
        assertEquals(1, statsJson.get("data").get("fund_account_count").asInt());
    }

    @Test
    void bindUnbindAndRebindFlowWorksThroughInternalApi() throws Exception {
        String staffToken = staffLoginAndGetToken("staff01", "staff-pass");
        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9301",
                "FA9301",
                "330101199001010051",
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );
        registry.transactionManager().execute(connection -> {
            registry.securityAccountDao().unbindFundAccount(connection, "SA9301");
            registry.fundAccountDao().relinkSecurityAccount(connection, "FA9301", null);
            registry.securityAccountDao().updateStatus(connection, "SA9301", account.dao.model.DomainEnums.AccountStatus.NO_FUND_FROZEN);
            return null;
        });

        MvcResult bindResult = mockMvc.perform(post("/api/internal/fund/accounts/bind")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "fund_acc_no": "FA9301",
                                  "sec_acc_no": "SA9301"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode bindJson = readJson(bindResult);
        assertEquals(0, bindJson.get("code").asInt());
        assertEquals("FA9301", registry.securityAccountDao().findByAccountNo("SA9301").orElseThrow().linkedFundAcc());
        assertEquals("SA9301", registry.fundAccountDao().findByAccountNo("FA9301").orElseThrow().secAccNo());
        assertEquals("\u6b63\u5e38", registry.securityAccountDao().findByAccountNo("SA9301").orElseThrow().status().dbValue());

        MvcResult unbindResult = mockMvc.perform(post("/api/internal/fund/accounts/unbind")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "fund_acc_no": "FA9301",
                                  "sec_acc_no": "SA9301"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode unbindJson = readJson(unbindResult);
        assertEquals(0, unbindJson.get("code").asInt());
        assertEquals("\u65e0\u8d44\u91d1\u8d26\u6237\u51bb\u7ed3", registry.securityAccountDao().findByAccountNo("SA9301").orElseThrow().status().dbValue());
        var operationLogs = registry.operationLogDao().query(new account.dao.model.DomainModels.OperationLogQuery(
                1, null, null, null, "FUND", "FA9301", 20, 0
        ));
        assertTrue(operationLogs.stream().anyMatch(log -> log.operationType().contains("\u7ed1\u5b9a")));
        assertTrue(operationLogs.stream().anyMatch(log -> log.operationType().contains("\u89e3\u7ed1")));
    }

    @Test
    void externalPasswordChangeAndSingleStockSnapshotWork() throws Exception {
        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9302",
                "FA9302",
                "330101199001010052",
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );
        registry.transactionManager().execute(connection -> {
            registry.holdingDao().saveOrUpdate(connection, new account.dao.model.DomainModels.Holding(
                    null,
                    "SA9302",
                    "000001",
                    "\u5e73\u5b89\u94f6\u884c",
                    200,
                    20,
                    new BigDecimal("11.2300"),
                    java.time.LocalDateTime.now()
            ));
            return null;
        });

        String authToken = clientLoginAndGetToken("FA9302", "trade123");

        MvcResult passwordChange = mockMvc.perform(put("/api/external/fund/password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fund_acc_no": "FA9302",
                                  "auth_token": "%s",
                                  "password_type": "trade",
                                  "old_password": "trade123",
                                  "new_password": "trade456"
                                }
                                """.formatted(authToken)))
                .andExpect(status().isOk())
                .andReturn();
        assertEquals(0, readJson(passwordChange).get("code").asInt());

        String reloginToken = clientLoginAndGetToken("FA9302", "trade456");

        MvcResult singleStockSnapshot = mockMvc.perform(get("/api/external/security/snapshot")
                        .param("sec_acc_no", "SA9302")
                        .param("auth_token", reloginToken)
                        .param("stock_code", "000001"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode snapshotJson = readJson(singleStockSnapshot);
        assertEquals("000001", snapshotJson.get("stock_code").asText());
        assertEquals("\u5e73\u5b89\u94f6\u884c", snapshotJson.get("stock_name").asText());
        assertEquals(200, snapshotJson.get("quantity").asInt());
        assertEquals(20, snapshotJson.get("frozen_quantity").asInt());
        assertEquals(180, snapshotJson.get("available_quantity").asInt());
    }

    @Test
    void validationAndFailureResponsesAreReturnedForCommonBadRequests() throws Exception {
        String staffToken = staffLoginAndGetToken("staff01", "staff-pass");
        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9303",
                "FA9303",
                "330101199001010053",
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );

        MvcResult wrongWithdrawPassword = mockMvc.perform(post("/api/internal/fund/withdraw")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "fund_acc_no": "FA9303",
                                  "amount": 1.00,
                                  "withdraw_password": "wrong"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode wrongWithdrawJson = readJson(wrongWithdrawPassword);
        assertEquals(1004, wrongWithdrawJson.get("code").asInt());
        assertEquals("ERR_004", wrongWithdrawJson.get("symbol").asText());

        MvcResult invalidTradeCallback = mockMvc.perform(post("/api/external/trade/fund-balance")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fund_acc_no": "FA9303",
                                  "ref_order_id": "ORD-BAD-1",
                                  "txn_type": "BAD_TYPE",
                                  "amount": 10.00
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andReturn();
        assertEquals(4000, readJson(invalidTradeCallback).get("code").asInt());

        MvcResult invalidCreateSecurity = mockMvc.perform(post("/api/internal/security/accounts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "investor_type": "\u4e2a\u4eba",
                                  "name": "Minor",
                                  "gender": "\u7537",
                                  "id_type": "ID",
                                  "id_number": "330101201201010011"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn();
        assertEquals(1019, readJson(invalidCreateSecurity).get("code").asInt());

        MvcResult invalidClientToken = mockMvc.perform(get("/api/external/fund/snapshot")
                        .param("fund_acc_no", "FA9303")
                        .param("auth_token", "bad-token"))
                .andExpect(status().isOk())
                .andReturn();
        assertEquals(1018, readJson(invalidClientToken).get("code").asInt());
    }

    @Test
    void externalSellAndCancelWorkflowCompletesThroughApis() throws Exception {
        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9401",
                "FA9401",
                "330101199001010081",
                new BigDecimal("500.00"),
                BigDecimal.ZERO
        );
        registry.transactionManager().execute(connection -> {
            registry.holdingDao().saveOrUpdate(connection, new account.dao.model.DomainModels.Holding(
                    null,
                    "SA9401",
                    "600036",
                    "\u62db\u5546\u94f6\u884c",
                    300,
                    0,
                    new BigDecimal("35.0000"),
                    java.time.LocalDateTime.now()
            ));
            return null;
        });

        String authToken = clientLoginAndGetToken("FA9401", "trade123");

        mockMvc.perform(post("/api/external/trade/security-holding")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "sec_acc_no": "SA9401",
                                  "stock_code": "600036",
                                  "stock_name": "\u62db\u5546\u94f6\u884c",
                                  "ref_order_id": "ORD-SELL-API",
                                  "change_type": "\u5356\u51fa\u51bb\u7ed3",
                                  "quantity": 100
                                }
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/external/trade/security-holding")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "sec_acc_no": "SA9401",
                                  "stock_code": "600036",
                                  "stock_name": "\u62db\u5546\u94f6\u884c",
                                  "ref_order_id": "ORD-SELL-API",
                                  "change_type": "\u5356\u51fa\u6263\u51cf",
                                  "quantity": 100
                                }
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/external/trade/fund-balance")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fund_acc_no": "FA9401",
                                  "ref_order_id": "ORD-SELL-API",
                                  "txn_type": "\u5356\u51fa\u56de\u6b3e",
                                  "amount": 3000.00
                                }
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/external/trade/fund-balance")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fund_acc_no": "FA9401",
                                  "ref_order_id": "ORD-CANCEL-API",
                                  "txn_type": "\u4e70\u5165\u51bb\u7ed3",
                                  "amount": 50.00
                                }
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/external/trade/fund-balance")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fund_acc_no": "FA9401",
                                  "ref_order_id": "ORD-CANCEL-API",
                                  "txn_type": "\u64a4\u5355\u89e3\u51bb",
                                  "amount": 50.00
                                }
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/external/trade/security-holding")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "sec_acc_no": "SA9401",
                                  "stock_code": "600036",
                                  "stock_name": "\u62db\u5546\u94f6\u884c",
                                  "ref_order_id": "ORD-CANCEL-HOLD",
                                  "change_type": "\u5356\u51fa\u51bb\u7ed3",
                                  "quantity": 40
                                }
                                """))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/external/trade/security-holding")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "sec_acc_no": "SA9401",
                                  "stock_code": "600036",
                                  "stock_name": "\u62db\u5546\u94f6\u884c",
                                  "ref_order_id": "ORD-CANCEL-HOLD",
                                  "change_type": "\u64a4\u5355\u91ca\u653e",
                                  "quantity": 40
                                }
                                """))
                .andExpect(status().isOk());

        JsonNode fundSnapshot = readJson(mockMvc.perform(get("/api/external/fund/snapshot")
                        .param("fund_acc_no", "FA9401")
                        .param("auth_token", authToken))
                .andExpect(status().isOk())
                .andReturn());
        JsonNode stockSnapshot = readJson(mockMvc.perform(get("/api/external/security/snapshot")
                        .param("sec_acc_no", "SA9401")
                        .param("auth_token", authToken)
                        .param("stock_code", "600036"))
                .andExpect(status().isOk())
                .andReturn());

        assertEquals(0, fundSnapshot.get("frozen_balance").decimalValue().compareTo(BigDecimal.ZERO));
        assertEquals(0, fundSnapshot.get("available_balance").decimalValue().compareTo(new BigDecimal("3500.00")));
        assertEquals(200, stockSnapshot.get("quantity").asInt());
        assertEquals(0, stockSnapshot.get("frozen_quantity").asInt());
        assertEquals(200, stockSnapshot.get("available_quantity").asInt());
    }

    @Test
    void validationMatrixRejectsMissingOrIllegalParameters() throws Exception {
        String staffToken = staffLoginAndGetToken("staff01", "staff-pass");

        JsonNode missingFundCreate = readJson(mockMvc.perform(post("/api/internal/fund/accounts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "sec_acc_no": "",
                                  "id_number": "",
                                  "trade_password": "",
                                  "withdraw_password": ""
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andReturn());
        assertEquals(4000, missingFundCreate.get("code").asInt());

        JsonNode invalidPasswordType = readJson(mockMvc.perform(put("/api/external/fund/password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fund_acc_no": "FA0001",
                                  "auth_token": "token",
                                  "password_type": "bad",
                                  "old_password": "a",
                                  "new_password": "b"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andReturn());
        assertEquals(4000, invalidPasswordType.get("code").asInt());

        JsonNode invalidDeposit = readJson(mockMvc.perform(post("/api/internal/fund/deposit")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "fund_acc_no": "FA0001",
                                  "amount": 0
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andReturn());
        assertEquals(4000, invalidDeposit.get("code").asInt());

        JsonNode invalidHoldingChange = readJson(mockMvc.perform(post("/api/external/trade/security-holding")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "sec_acc_no": "SA0001",
                                  "stock_code": "000001",
                                  "stock_name": "PingAn",
                                  "ref_order_id": "ORD-VAL-1",
                                  "change_type": "\u5356\u51fa\u51bb\u7ed3",
                                  "quantity": 0
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andReturn());
        assertEquals(4000, invalidHoldingChange.get("code").asInt());

        JsonNode missingSnapshotParam = readJson(mockMvc.perform(get("/api/external/security/snapshot")
                        .param("sec_acc_no", "SA0001"))
                .andExpect(status().isBadRequest())
                .andReturn());
        assertEquals(4000, missingSnapshotParam.get("code").asInt());
    }

    @Test
    void sqlInjectionPayloadsDoNotBypassAuthenticationOrOwnershipChecks() throws Exception {
        String staffToken = staffLoginAndGetToken("staff01", "staff-pass");
        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9501",
                "FA9501",
                "330101199001010091",
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );

        JsonNode injectedLogin = readJson(mockMvc.perform(post("/api/external/fund/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fund_acc_no": "FA9501' OR '1'='1",
                                  "trade_password": "trade123"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals(1010, injectedLogin.get("code").asInt());

        JsonNode injectedOwnership = readJson(mockMvc.perform(post("/api/internal/fund/accounts/close")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "fund_acc_no": "FA9501",
                                  "id_number": "330101199001010091' OR '1'='1"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals(1013, injectedOwnership.get("code").asInt());

        JsonNode injectedBinding = readJson(mockMvc.perform(post("/api/internal/fund/accounts/bind")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "fund_acc_no": "FA9501",
                                  "sec_acc_no": "SA9501' OR '1'='1"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals(1005, injectedBinding.get("code").asInt());
    }

    @Test
    void xssPayloadIsReturnedAsPlainJsonDataRatherThanServerRenderedContent() throws Exception {
        String staffToken = staffLoginAndGetToken("staff01", "staff-pass");
        String xssPayload = "<script>alert('xss')</script>";

        JsonNode created = readJson(mockMvc.perform(post("/api/internal/security/accounts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "investor_type": "\u4e2a\u4eba",
                                  "name": "%s",
                                  "gender": "\u7537",
                                  "id_type": "ID",
                                  "id_number": "330101199001010092",
                                  "work_unit": "%s"
                                }
                                """.formatted(xssPayload, xssPayload)))
                .andExpect(status().isOk())
                .andReturn());
        int investorId = created.get("investor_id").asInt();

        MvcResult updateResult = mockMvc.perform(put("/api/internal/security/investors")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "investor_id": %d,
                                  "name": "%s",
                                  "work_unit": "%s",
                                  "address": "%s"
                                }
                                """.formatted(investorId, xssPayload, xssPayload, xssPayload)))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode updateJson = readJson(updateResult);
        String rawBody = updateResult.getResponse().getContentAsString(StandardCharsets.UTF_8);
        String contentType = updateResult.getResponse().getContentType();

        assertTrue(contentType != null && contentType.contains("application/json"));
        assertTrue(rawBody.startsWith("{"));
        assertEquals(xssPayload, updateJson.get("name").asText());
        assertEquals(xssPayload, updateJson.get("work_unit").asText());
        assertEquals(xssPayload, updateJson.get("address").asText());
    }

    private String staffLoginAndGetToken(String username, String password) throws Exception {
        MvcResult loginResult = mockMvc.perform(post("/api/internal/staff/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "username": "%s",
                                  "password": "%s"
                                }
                                """.formatted(username, password)))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode loginJson = readJson(loginResult);
        assertEquals(0, loginJson.get("code").asInt());
        if (loginJson.hasNonNull("auth_token")) {
            return loginJson.get("auth_token").asText();
        }
        assertTrue(loginJson.get("requires_certificate").asBoolean());

        JsonNode certificateJson = readJson(mockMvc.perform(post("/api/internal/staff/complete-certificate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "subject_type": "%s",
                                  "subject_key": "%s",
                                  "certificate_code": "CERT-123456"
                                }
                                """.formatted(
                                        loginJson.get("certificate_subject_type").asText(),
                                        loginJson.get("certificate_subject_key").asText())))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals(0, certificateJson.get("code").asInt());
        return certificateJson.get("auth_token").asText();
    }

    private String clientLoginAndGetToken(String fundAccNo, String tradePassword) throws Exception {
        JsonNode loginJson = readJson(mockMvc.perform(post("/api/external/fund/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fund_acc_no": "%s",
                                  "trade_password": "%s"
                                }
                                """.formatted(fundAccNo, tradePassword)))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals(0, loginJson.get("code").asInt());
        if (loginJson.hasNonNull("auth_token")) {
            return loginJson.get("auth_token").asText();
        }
        assertTrue(loginJson.get("requires_certificate").asBoolean());

        JsonNode certificateJson = readJson(mockMvc.perform(post("/api/external/fund/complete-certificate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "subject_type": "%s",
                                  "subject_key": "%s",
                                  "certificate_code": "CERT-123456"
                                }
                                """.formatted(
                                        loginJson.get("certificate_subject_type").asText(),
                                        loginJson.get("certificate_subject_key").asText())))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals(0, certificateJson.get("code").asInt());
        return certificateJson.get("auth_token").asText();
    }

    private JsonNode readJson(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }
}
