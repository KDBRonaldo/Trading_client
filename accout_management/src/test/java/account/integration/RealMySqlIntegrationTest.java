package account.integration;

import account.common.AuthHeaders;
import account.controller.external.ExternalFundController;
import account.controller.external.ExternalSecurityController;
import account.controller.external.ExternalTradeController;
import account.controller.internal.FundAccountController;
import account.controller.internal.SecurityAccountController;
import account.controller.internal.StaffController;
import account.dao.DaoRegistry;
import account.dao.model.DomainEnums;
import account.dao.model.DomainModels;
import account.dto.DepositRequest;
import account.dto.UpdateFundBalanceRequest;
import account.dto.UpdateSecurityHoldingRequest;
import account.exception.GlobalExceptionHandler;
import account.service.FundAccountServiceImpl;
import account.service.InMemoryClientAuthTokenService;
import account.service.InMemoryStaffAuthTokenService;
import account.service.SecurityAccountServiceImpl;
import account.service.StaffServiceImpl;
import account.service.api.ClientAuthTokenService;
import account.service.api.FundAccountService;
import account.service.api.SecurityAccountService;
import account.service.api.StaffAuthTokenService;
import account.service.api.StaffService;
import account.support.RealMySqlTestSupport;
import account.support.TestDatabaseSupport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class RealMySqlIntegrationTest {

    private DaoRegistry registry;
    private FundAccountService fundService;
    private SecurityAccountService securityService;
    private MockMvc mockMvc;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() throws Exception {
        RealMySqlTestSupport.assumeAvailable();
        RealMySqlTestSupport.recreateDatabase();
        RealMySqlTestSupport.insertStaff(1, "staff01", "staff-pass", "正常");
        RealMySqlTestSupport.insertStaff(2, "staff02", "staff-pass", "正常");

        registry = RealMySqlTestSupport.createRegistry();
        objectMapper = new ObjectMapper().findAndRegisterModules();

        StaffAuthTokenService staffAuthTokenService = new InMemoryStaffAuthTokenService(28800L);
        ClientAuthTokenService clientAuthTokenService = new InMemoryClientAuthTokenService(7200L);

        StaffService staffService = new StaffServiceImpl(registry, staffAuthTokenService);
        fundService = new FundAccountServiceImpl(registry, userName -> false, clientAuthTokenService);
        securityService = new SecurityAccountServiceImpl(registry, userName -> false, clientAuthTokenService);

        mockMvc = MockMvcBuilders.standaloneSetup(
                        new StaffController(staffService, staffAuthTokenService, objectMapper),
                        new SecurityAccountController(securityService, staffAuthTokenService, objectMapper),
                        new FundAccountController(fundService, staffAuthTokenService, objectMapper),
                        new ExternalFundController(fundService, objectMapper),
                        new ExternalSecurityController(securityService, objectMapper),
                        new ExternalTradeController(fundService, securityService, objectMapper)
                )
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void daoRoundTripWorksOnRealMySql() {
        int investorId = TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA_MYSQL_001",
                "FA_MYSQL_001",
                "330101199001010301",
                new BigDecimal("1234.56"),
                new BigDecimal("78.90")
        );

        var investor = registry.investorDao().findById(investorId).orElseThrow();
        var securityAccount = registry.securityAccountDao().findByAccountNo("SA_MYSQL_001").orElseThrow();
        var fundAccount = registry.fundAccountDao().findByAccountNo("FA_MYSQL_001").orElseThrow();

        assertEquals("Tester-SA_MYSQL_001", investor.name());
        assertEquals("FA_MYSQL_001", securityAccount.linkedFundAcc());
        assertEquals(0, fundAccount.availableBalance().compareTo(new BigDecimal("1234.56")));
        assertEquals(0, fundAccount.frozenBalance().compareTo(new BigDecimal("78.90")));
    }

    @Test
    void mainApiWorkflowWorksEndToEndOnRealMySql() throws Exception {
        String staffToken = staffLoginAndGetToken("staff01", "staff-pass");

        JsonNode securityJson = readJson(mockMvc.perform(post("/api/internal/security/accounts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "investor_type": "个人",
                                  "name": "Mysql Investor",
                                  "gender": "男",
                                  "id_type": "ID",
                                  "id_number": "330101199001010303",
                                  "phone": "13800000001",
                                  "address": "Hangzhou",
                                  "work_unit": "ZJU",
                                  "occupation": "Engineer",
                                  "education": "Bachelor"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals(0, securityJson.get("code").asInt());
        String secAccNo = securityJson.get("sec_acc_no").asText();
        int investorId = securityJson.get("investor_id").asInt();

        JsonNode fundJson = readJson(mockMvc.perform(post("/api/internal/fund/accounts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "sec_acc_no": "%s",
                                  "id_number": "330101199001010303",
                                  "trade_password": "trade123",
                                  "withdraw_password": "withdraw123",
                                  "currency": "CNY"
                                }
                                """.formatted(secAccNo)))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals(0, fundJson.get("code").asInt());
        String fundAccNo = fundJson.get("fund_acc_no").asText();

        JsonNode investorUpdateJson = readJson(mockMvc.perform(put("/api/internal/security/investors")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "investor_id": %d,
                                  "name": "Mysql Investor Updated",
                                  "work_unit": "ZJU-FSE",
                                  "address": "Yuquan"
                                }
                                """.formatted(investorId)))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals("Mysql Investor Updated", investorUpdateJson.get("name").asText());
        assertEquals("ZJU-FSE", investorUpdateJson.get("work_unit").asText());

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

        String clientToken = clientLoginAndGetToken(fundAccNo, "trade123");
        assertNotNull(clientToken);

        JsonNode tradeFreezeJson = readJson(mockMvc.perform(post("/api/external/trade/fund-balance")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fund_acc_no": "%s",
                                  "ref_order_id": "ORD-MYSQL-API-1",
                                  "txn_type": "买入冻结",
                                  "amount": 300.00
                                }
                                """.formatted(fundAccNo)))
                .andExpect(status().isOk())
                .andReturn());
        assertFalse(tradeFreezeJson.get("duplicate").asBoolean());

        mockMvc.perform(post("/api/external/trade/security-holding")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "sec_acc_no": "%s",
                                  "stock_code": "000001",
                                  "stock_name": "平安银行",
                                  "ref_order_id": "ORD-MYSQL-API-1",
                                  "change_type": "买入增加",
                                  "quantity": 20,
                                  "price": 10.5000
                                }
                                """.formatted(secAccNo)))
                .andExpect(status().isOk());

        JsonNode fundSnapshotJson = readJson(mockMvc.perform(get("/api/external/fund/snapshot")
                        .param("fund_acc_no", fundAccNo)
                        .param("auth_token", clientToken))
                .andExpect(status().isOk())
                .andReturn());
        JsonNode securitySnapshotJson = readJson(mockMvc.perform(get("/api/external/security/snapshot")
                        .param("sec_acc_no", secAccNo)
                        .param("auth_token", clientToken)
                        .param("stock_code", "000001"))
                .andExpect(status().isOk())
                .andReturn());

        assertEquals(0, fundSnapshotJson.get("available_balance").decimalValue().compareTo(new BigDecimal("700.00")));
        assertEquals(0, fundSnapshotJson.get("frozen_balance").decimalValue().compareTo(new BigDecimal("300.00")));
        assertEquals("平安银行", securitySnapshotJson.get("stock_name").asText());
        assertEquals(20, securitySnapshotJson.get("quantity").asInt());

        JsonNode fundInfoJson = readJson(mockMvc.perform(get("/api/internal/fund/accounts")
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .param("fund_acc_no", fundAccNo)
                        .param("id_number", "330101199001010303")
                        .param("include_logs", "true"))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals(fundAccNo, fundInfoJson.get("fund_acc_no").asText());
        assertTrue(fundInfoJson.get("logs").size() >= 2);
    }

    @Test
    void lossReissueAndCloseFundWorkflowsRunOnRealMySql() throws Exception {
        String staffToken = staffLoginAndGetToken("staff01", "staff-pass");

        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA_MYSQL_010",
                "FA_MYSQL_010",
                "330101199001010310",
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );

        JsonNode fundLossJson = readJson(mockMvc.perform(post("/api/internal/fund/accounts/loss")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "fund_acc_no": "FA_MYSQL_010",
                                  "id_number": "330101199001010310",
                                  "reason": "card lost"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals(0, fundLossJson.get("code").asInt());
        assertEquals(DomainEnums.AccountStatus.LOSS_FROZEN, registry.fundAccountDao().findByAccountNo("FA_MYSQL_010").orElseThrow().status());
        assertEquals(DomainEnums.AccountStatus.LOSS_FROZEN, registry.securityAccountDao().findByAccountNo("SA_MYSQL_010").orElseThrow().status());

        JsonNode reissueFundJson = readJson(mockMvc.perform(post("/api/internal/fund/accounts/reissue")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "old_fund_acc_no": "FA_MYSQL_010",
                                  "id_number": "330101199001010310",
                                  "new_trade_password": "trade456",
                                  "new_withdraw_password": "withdraw456"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn());
        String newFundAccNo = reissueFundJson.get("new_fund_acc_no").asText();
        assertEquals(DomainEnums.AccountStatus.CLOSED, registry.fundAccountDao().findByAccountNo("FA_MYSQL_010").orElseThrow().status());
        assertEquals(newFundAccNo, registry.securityAccountDao().findByAccountNo("SA_MYSQL_010").orElseThrow().linkedFundAcc());

        JsonNode securityLossJson = readJson(mockMvc.perform(post("/api/internal/security/accounts/loss")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "sec_acc_no": "SA_MYSQL_010",
                                  "id_number": "330101199001010310",
                                  "reason": "card lost again"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals(0, securityLossJson.get("code").asInt());
        assertEquals(DomainEnums.AccountStatus.LOSS_FROZEN, registry.securityAccountDao().findByAccountNo("SA_MYSQL_010").orElseThrow().status());

        registry.transactionManager().execute(connection -> {
            registry.holdingDao().saveOrUpdate(connection, new DomainModels.Holding(
                    null,
                    "SA_MYSQL_010",
                    "600519",
                    "贵州茅台",
                    12,
                    0,
                    new BigDecimal("100.0000"),
                    LocalDateTime.now()
            ));
            return null;
        });

        JsonNode reissueSecurityJson = readJson(mockMvc.perform(post("/api/internal/security/accounts/reissue")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "old_sec_acc_no": "SA_MYSQL_010",
                                  "id_number": "330101199001010310"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn());
        String newSecAccNo = reissueSecurityJson.get("new_sec_acc_no").asText();
        assertEquals(DomainEnums.AccountStatus.CLOSED, registry.securityAccountDao().findByAccountNo("SA_MYSQL_010").orElseThrow().status());
        assertEquals(newSecAccNo, registry.fundAccountDao().findByAccountNo(newFundAccNo).orElseThrow().secAccNo());
        assertTrue(registry.holdingDao().findByAccountAndStock(newSecAccNo, "600519").isPresent());

        registry.transactionManager().execute(connection -> {
            registry.holdingDao().saveOrUpdate(connection, new DomainModels.Holding(
                    registry.holdingDao().findByAccountAndStock(newSecAccNo, "600519").orElseThrow().holdingId(),
                    newSecAccNo,
                    "600519",
                    "贵州茅台",
                    0,
                    0,
                    new BigDecimal("100.0000"),
                    LocalDateTime.now()
            ));
            return null;
        });

        JsonNode closeFundJson = readJson(mockMvc.perform(post("/api/internal/fund/accounts/close")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "fund_acc_no": "%s",
                                  "id_number": "330101199001010310",
                                  "reason": "final close"
                                }
                                """.formatted(newFundAccNo)))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals(0, closeFundJson.get("code").asInt());
        assertEquals(DomainEnums.AccountStatus.CLOSED, registry.fundAccountDao().findByAccountNo(newFundAccNo).orElseThrow().status());
        assertEquals(DomainEnums.AccountStatus.NO_FUND_FROZEN, registry.securityAccountDao().findByAccountNo(newSecAccNo).orElseThrow().status());
        assertNull(registry.fundAccountDao().findByAccountNo(newFundAccNo).orElseThrow().secAccNo());
    }

    @Test
    void bindUnbindPasswordAndSnapshotFlowsWorkOnRealMySql() throws Exception {
        String staffToken = staffLoginAndGetToken("staff01", "staff-pass");

        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA_MYSQL_020",
                "FA_MYSQL_020",
                "330101199001010320",
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );
        registry.transactionManager().execute(connection -> {
            registry.securityAccountDao().unbindFundAccount(connection, "SA_MYSQL_020");
            registry.fundAccountDao().relinkSecurityAccount(connection, "FA_MYSQL_020", null);
            registry.securityAccountDao().updateStatus(connection, "SA_MYSQL_020", DomainEnums.AccountStatus.NO_FUND_FROZEN);
            return null;
        });

        JsonNode bindJson = readJson(mockMvc.perform(post("/api/internal/fund/accounts/bind")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "fund_acc_no": "FA_MYSQL_020",
                                  "sec_acc_no": "SA_MYSQL_020"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals(0, bindJson.get("code").asInt());
        assertEquals("FA_MYSQL_020", registry.securityAccountDao().findByAccountNo("SA_MYSQL_020").orElseThrow().linkedFundAcc());
        assertEquals("SA_MYSQL_020", registry.fundAccountDao().findByAccountNo("FA_MYSQL_020").orElseThrow().secAccNo());

        JsonNode staffPasswordChange = readJson(mockMvc.perform(put("/api/internal/fund/password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "fund_acc_no": "FA_MYSQL_020",
                                  "password_type": "trade",
                                  "old_password": "trade123",
                                  "new_password": "trade999"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals(0, staffPasswordChange.get("code").asInt());

        String clientToken = clientLoginAndGetToken("FA_MYSQL_020", "trade999");

        JsonNode clientPasswordChange = readJson(mockMvc.perform(put("/api/external/fund/password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fund_acc_no": "FA_MYSQL_020",
                                  "auth_token": "%s",
                                  "password_type": "withdraw",
                                  "old_password": "withdraw123",
                                  "new_password": "withdraw999"
                                }
                                """.formatted(clientToken)))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals(0, clientPasswordChange.get("code").asInt());

        JsonNode singleSnapshotJson = readJson(mockMvc.perform(get("/api/external/security/snapshot")
                        .param("sec_acc_no", "SA_MYSQL_020")
                        .param("auth_token", clientToken)
                        .param("stock_code", "000001"))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals(0, singleSnapshotJson.get("quantity").asInt());
        assertEquals("000001", singleSnapshotJson.get("stock_code").asText());

        JsonNode unbindJson = readJson(mockMvc.perform(post("/api/internal/fund/accounts/unbind")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "fund_acc_no": "FA_MYSQL_020",
                                  "sec_acc_no": "SA_MYSQL_020"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals(0, unbindJson.get("code").asInt());
        assertEquals(DomainEnums.AccountStatus.NO_FUND_FROZEN, registry.securityAccountDao().findByAccountNo("SA_MYSQL_020").orElseThrow().status());
        assertNull(registry.fundAccountDao().findByAccountNo("FA_MYSQL_020").orElseThrow().secAccNo());
    }

    @Test
    void staffDeactivationAndClientAuthFailuresAreEnforcedOnRealMySql() throws Exception {
        String adminToken = staffLoginAndGetToken("staff01", "staff-pass");
        String targetToken = staffLoginAndGetToken("staff02", "staff-pass");

        JsonNode deactivateJson = readJson(mockMvc.perform(post("/api/internal/staff/deactivate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, adminToken)
                        .content("""
                                {
                                  "target_staff_id": 2,
                                  "reason": "left"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals(0, deactivateJson.get("code").asInt());

        JsonNode blockedStaffJson = readJson(mockMvc.perform(post("/api/internal/security/accounts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, targetToken)
                        .content("""
                                {
                                  "investor_type": "个人",
                                  "name": "Blocked",
                                  "gender": "男",
                                  "id_type": "ID",
                                  "id_number": "330101199001010399"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals(1018, blockedStaffJson.get("code").asInt());

        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA_MYSQL_030",
                "FA_MYSQL_030",
                "330101199001010330",
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );

        JsonNode wrongClientTokenJson = readJson(mockMvc.perform(get("/api/external/fund/snapshot")
                        .param("fund_acc_no", "FA_MYSQL_030")
                        .param("auth_token", "bad-token"))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals(1018, wrongClientTokenJson.get("code").asInt());
    }

    @Test
    void validationAndFailureResponsesRemainCorrectOnRealMySql() throws Exception {
        String staffToken = staffLoginAndGetToken("staff01", "staff-pass");

        JsonNode invalidCreateFund = readJson(mockMvc.perform(post("/api/internal/fund/accounts")
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
        assertEquals(4000, invalidCreateFund.get("code").asInt());

        JsonNode invalidMinor = readJson(mockMvc.perform(post("/api/internal/security/accounts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "investor_type": "个人",
                                  "name": "Minor",
                                  "gender": "男",
                                  "id_type": "ID",
                                  "id_number": "330101201201010011"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals(1019, invalidMinor.get("code").asInt());

        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA_MYSQL_040",
                "FA_MYSQL_040",
                "330101199001010340",
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );

        JsonNode wrongPasswordJson = readJson(mockMvc.perform(post("/api/internal/fund/withdraw")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "fund_acc_no": "FA_MYSQL_040",
                                  "amount": 1.00,
                                  "withdraw_password": "wrong"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals(1004, wrongPasswordJson.get("code").asInt());

        JsonNode invalidTradeTypeJson = readJson(mockMvc.perform(post("/api/external/trade/fund-balance")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fund_acc_no": "FA_MYSQL_040",
                                  "ref_order_id": "ORD-BAD-040",
                                  "txn_type": "BAD_TYPE",
                                  "amount": 10.00
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andReturn());
        assertEquals(4000, invalidTradeTypeJson.get("code").asInt());
    }

    @Test
    void sqlInjectionAndXssPayloadsDoNotBypassBusinessChecksOnRealMySql() throws Exception {
        String staffToken = staffLoginAndGetToken("staff01", "staff-pass");
        String xssPayload = "<script>alert('xss')</script>";

        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA_MYSQL_050",
                "FA_MYSQL_050",
                "330101199001010350",
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );

        JsonNode injectedLoginJson = readJson(mockMvc.perform(post("/api/external/fund/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "fund_acc_no": "FA_MYSQL_050' OR '1'='1",
                                  "trade_password": "trade123"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals(1010, injectedLoginJson.get("code").asInt());

        JsonNode injectedBindJson = readJson(mockMvc.perform(post("/api/internal/fund/accounts/bind")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "fund_acc_no": "FA_MYSQL_050",
                                  "sec_acc_no": "SA_MYSQL_050' OR '1'='1"
                                }
                                """))
                .andExpect(status().isOk())
                .andReturn());
        assertEquals(1005, injectedBindJson.get("code").asInt());

        JsonNode createdJson = readJson(mockMvc.perform(post("/api/internal/security/accounts")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header(AuthHeaders.STAFF_AUTH_TOKEN, staffToken)
                        .content("""
                                {
                                  "investor_type": "个人",
                                  "name": "%s",
                                  "gender": "男",
                                  "id_type": "ID",
                                  "id_number": "330101199001010351",
                                  "work_unit": "%s"
                                }
                                """.formatted(xssPayload, xssPayload)))
                .andExpect(status().isOk())
                .andReturn());
        int investorId = createdJson.get("investor_id").asInt();

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

        assertEquals(xssPayload, updateJson.get("name").asText());
        assertEquals(xssPayload, updateJson.get("work_unit").asText());
        assertTrue(updateResult.getResponse().getContentType().contains("application/json"));
    }

    @Test
    void concurrentDuplicateCallbacksRemainIdempotentOnRealMySql() throws Exception {
        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA_MYSQL_060",
                "FA_MYSQL_060",
                "330101199001010360",
                new BigDecimal("1000.00"),
                BigDecimal.ZERO
        );
        registry.transactionManager().execute(connection -> {
            registry.holdingDao().saveOrUpdate(connection, new DomainModels.Holding(
                    null,
                    "SA_MYSQL_060",
                    "300750",
                    "宁德时代",
                    200,
                    0,
                    new BigDecimal("200.0000"),
                    LocalDateTime.now()
            ));
            return null;
        });

        ExecutorService executor = Executors.newFixedThreadPool(12);
        CountDownLatch fundReady = new CountDownLatch(6);
        CountDownLatch holdReady = new CountDownLatch(6);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Boolean>> fundFutures = new ArrayList<>();
        List<Future<Boolean>> holdFutures = new ArrayList<>();

        for (int i = 0; i < 6; i++) {
            fundFutures.add(executor.submit(() -> {
                UpdateFundBalanceRequest request = new UpdateFundBalanceRequest();
                request.setFundAccNo("FA_MYSQL_060");
                request.setRefOrderId("ORD-MYSQL-CONCURRENT-FUND");
                request.setTxnType("买入冻结");
                request.setAmount(new BigDecimal("100.00"));
                fundReady.countDown();
                start.await();
                return fundService.updateFundBalance(request).getDuplicate();
            }));
            holdFutures.add(executor.submit(() -> {
                UpdateSecurityHoldingRequest request = new UpdateSecurityHoldingRequest();
                request.setSecAccNo("SA_MYSQL_060");
                request.setStockCode("300750");
                request.setStockName("宁德时代");
                request.setRefOrderId("ORD-MYSQL-CONCURRENT-HOLD");
                request.setChangeType("卖出冻结");
                request.setQuantity(50);
                holdReady.countDown();
                start.await();
                return securityService.updateSecurityHolding(request).getDuplicate();
            }));
        }

        fundReady.await();
        holdReady.await();
        start.countDown();

        int fundDuplicateCount = 0;
        int holdDuplicateCount = 0;
        for (Future<Boolean> future : fundFutures) {
            if (future.get()) {
                fundDuplicateCount++;
            }
        }
        for (Future<Boolean> future : holdFutures) {
            if (future.get()) {
                holdDuplicateCount++;
            }
        }
        executor.shutdownNow();

        var fundAccount = registry.fundAccountDao().findByAccountNo("FA_MYSQL_060").orElseThrow();
        var holding = registry.holdingDao().findByAccountAndStock("SA_MYSQL_060", "300750").orElseThrow();

        assertEquals(5, fundDuplicateCount);
        assertEquals(5, holdDuplicateCount);
        assertEquals(0, fundAccount.availableBalance().compareTo(new BigDecimal("900.00")));
        assertEquals(1, registry.fundTransactionLogDao().listRecentByFundAccountNo("FA_MYSQL_060", 10).size());
        assertEquals(200, holding.quantity());
        assertEquals(50, holding.frozenQuantity());
        assertEquals(1, registry.holdingChangeLogDao().listByRefOrderId("ORD-MYSQL-CONCURRENT-HOLD").size());
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
