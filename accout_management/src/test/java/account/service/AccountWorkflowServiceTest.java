package account.service;

import account.common.BusinessException;
import account.common.ErrorCode;
import account.dao.DaoRegistry;
import account.dao.model.DomainEnums;
import account.dao.model.DomainModels;
import account.dto.ClientChangeFundPasswordRequest;
import account.dto.CloseSecurityAccountRequest;
import account.dto.CloseFundAccountRequest;
import account.dto.DepositRequest;
import account.dto.ReissueFundAccountRequest;
import account.dto.UpdateFundBalanceRequest;
import account.dto.UpdateSecurityHoldingRequest;
import account.service.api.FundAccountService;
import account.service.api.SecurityAccountService;
import account.support.TestDatabaseSupport;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AccountWorkflowServiceTest {

    private DaoRegistry registry;
    private FundAccountService fundService;
    private SecurityAccountService securityService;
    private InMemoryClientAuthTokenService clientAuthTokenService;

    @BeforeEach
    void setUp() throws Exception {
        String jdbcUrl = "jdbc:h2:mem:workflow_" + UUID.randomUUID() + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
        TestDatabaseSupport.recreateSchema(jdbcUrl);
        registry = DaoRegistry.forDriverManager(jdbcUrl, "sa", "");
        TestDatabaseSupport.insertStaff(jdbcUrl, 1, "staff01", "staff-pass", "\u6b63\u5e38");

        clientAuthTokenService = new InMemoryClientAuthTokenService(
                7200,
                Clock.fixed(Instant.parse("2026-06-19T08:00:00Z"), ZoneId.of("Asia/Shanghai"))
        );
        fundService = new FundAccountServiceImpl(registry, userName -> false, clientAuthTokenService);
        securityService = new SecurityAccountServiceImpl(registry, userName -> false, clientAuthTokenService);
    }

    @Test
    void tradeCallbackWorkflowWritesCorrelatedLogsAndSupportsIdempotency() {
        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9001",
                "FA9001",
                "330101199001010011",
                new BigDecimal("10000.00"),
                BigDecimal.ZERO
        );

        UpdateFundBalanceRequest freezeRequest = new UpdateFundBalanceRequest();
        freezeRequest.setFundAccNo("FA9001");
        freezeRequest.setRefOrderId("ORD-9001");
        freezeRequest.setTxnType("\u4e70\u5165\u51bb\u7ed3");
        freezeRequest.setAmount(new BigDecimal("1200.00"));

        UpdateFundBalanceRequest debitRequest = new UpdateFundBalanceRequest();
        debitRequest.setFundAccNo("FA9001");
        debitRequest.setRefOrderId("ORD-9001");
        debitRequest.setTxnType("\u4e70\u5165\u6263\u6b3e");
        debitRequest.setAmount(new BigDecimal("1200.00"));

        UpdateSecurityHoldingRequest holdingRequest = new UpdateSecurityHoldingRequest();
        holdingRequest.setSecAccNo("SA9001");
        holdingRequest.setStockCode("600000");
        holdingRequest.setStockName("\u6d66\u53d1\u94f6\u884c");
        holdingRequest.setRefOrderId("ORD-9001");
        holdingRequest.setChangeType("\u4e70\u5165\u589e\u52a0");
        holdingRequest.setQuantity(100);
        holdingRequest.setPrice(new BigDecimal("12.0000"));

        var freezeResponse = fundService.updateFundBalance(freezeRequest);
        var freezeDuplicate = fundService.updateFundBalance(freezeRequest);
        var debitResponse = fundService.updateFundBalance(debitRequest);
        var holdingResponse = securityService.updateSecurityHolding(holdingRequest);
        var holdingDuplicate = securityService.updateSecurityHolding(holdingRequest);

        assertFalse(freezeResponse.getDuplicate());
        assertTrue(freezeDuplicate.getDuplicate());
        assertFalse(debitResponse.getDuplicate());
        assertFalse(holdingResponse.getDuplicate());
        assertTrue(holdingDuplicate.getDuplicate());

        var fundAccount = registry.fundAccountDao().findByAccountNo("FA9001").orElseThrow();
        var holding = registry.holdingDao().findByAccountAndStock("SA9001", "600000").orElseThrow();
        assertEquals(new BigDecimal("8800.00"), fundAccount.availableBalance());
        assertEquals(BigDecimal.ZERO.setScale(2), fundAccount.frozenBalance().setScale(2));
        assertEquals(100, holding.quantity());
        assertEquals(0, holding.frozenQuantity());

        assertEquals(2, registry.fundTransactionLogDao().listRecentByFundAccountNo("FA9001", 10).size());
        assertEquals(1, registry.holdingChangeLogDao().listByRefOrderId("ORD-9001").size());
    }

    @Test
    void reissueFundAccountInvalidatesOldClientToken() {
        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9002",
                "FA9002",
                "330101199001010012",
                new BigDecimal("300.00"),
                new BigDecimal("200.00")
        );
        registry.transactionManager().execute(connection -> {
            registry.holdingDao().saveOrUpdate(connection, new DomainModels.Holding(
                    null,
                    "SA9002",
                    "600001",
                    "邯郸钢铁",
                    0,
                    80,
                    new BigDecimal("8.0000"),
                    java.time.LocalDateTime.now()
            ));
            return null;
        });

        String oldToken = clientAuthTokenService.issueToken("FA9002", "SA9002");
        registry.transactionManager().execute(connection -> {
            registry.fundAccountDao().updateStatus(connection, "FA9002", DomainEnums.AccountStatus.LOSS_FROZEN);
            registry.securityAccountDao().updateStatus(connection, "SA9002", DomainEnums.AccountStatus.LOSS_FROZEN);
            return null;
        });

        ReissueFundAccountRequest request = new ReissueFundAccountRequest();
        request.setOldFundAccNo("FA9002");
        request.setIdNumber("330101199001010012");
        request.setNewTradePassword("trade456");
        request.setNewWithdrawPassword("withdraw456");
        request.setStaffId(1);

        var response = fundService.reissueFundAccount(request);

        assertThrows(BusinessException.class, () -> clientAuthTokenService.requireFundAccess(oldToken, "FA9002"));
        assertTrue(response.getNewFundAccNo() != null && !response.getNewFundAccNo().isBlank());
        assertEquals(DomainEnums.AccountStatus.CLOSED, registry.fundAccountDao().findByAccountNo("FA9002").orElseThrow().status());
        assertEquals(response.getNewFundAccNo(), registry.securityAccountDao().findByAccountNo("SA9002").orElseThrow().linkedFundAcc());
        assertEquals(BigDecimal.ZERO.setScale(2), registry.fundAccountDao().findByAccountNo("FA9002").orElseThrow().availableBalance().setScale(2));
        assertEquals(BigDecimal.ZERO.setScale(2), registry.fundAccountDao().findByAccountNo("FA9002").orElseThrow().frozenBalance().setScale(2));
        assertEquals(new BigDecimal("500.00"), registry.fundAccountDao().findByAccountNo(response.getNewFundAccNo()).orElseThrow().availableBalance());
        assertEquals(BigDecimal.ZERO.setScale(2), registry.fundAccountDao().findByAccountNo(response.getNewFundAccNo()).orElseThrow().frozenBalance().setScale(2));
        assertEquals(80, registry.holdingDao().findByAccountAndStock("SA9002", "600001").orElseThrow().quantity());
        assertEquals(0, registry.holdingDao().findByAccountAndStock("SA9002", "600001").orElseThrow().frozenQuantity());
    }

    @Test
    void reissueSecurityAccountMovesHoldingsAndClearsOldAccount() {
        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9010",
                "FA9010",
                "330101199001010022",
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );
        registry.transactionManager().execute(connection -> {
            registry.holdingDao().saveOrUpdate(connection, new DomainModels.Holding(
                    null,
                    "SA9010",
                    "600519",
                    "贵州茅台",
                    0,
                    60,
                    new BigDecimal("100.0000"),
                    java.time.LocalDateTime.now()
            ));
            registry.securityAccountDao().updateStatus(connection, "SA9010", DomainEnums.AccountStatus.LOSS_FROZEN);
            return null;
        });

        var request = new account.dto.ReissueSecurityAccountRequest();
        request.setOldSecAccNo("SA9010");
        request.setIdNumber("330101199001010022");
        request.setStaffId(1);

        var response = securityService.reissueSecurityAccount(request);

        assertEquals(DomainEnums.AccountStatus.CLOSED, registry.securityAccountDao().findByAccountNo("SA9010").orElseThrow().status());
        assertTrue(registry.holdingDao().listBySecurityAccountNo("SA9010").isEmpty());
        assertEquals(60, registry.holdingDao().findByAccountAndStock(response.getNewSecAccNo(), "600519").orElseThrow().quantity());
        assertEquals(0, registry.holdingDao().findByAccountAndStock(response.getNewSecAccNo(), "600519").orElseThrow().frozenQuantity());
    }

    @Test
    void closeFundAccountRequiresZeroBalanceAfterDeposit() {
        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9003",
                "FA9003",
                "330101199001010013",
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );

        DepositRequest depositRequest = new DepositRequest();
        depositRequest.setFundAccNo("FA9003");
        depositRequest.setAmount(new BigDecimal("100.00"));
        depositRequest.setStaffId(1);
        fundService.deposit(depositRequest);

        CloseFundAccountRequest closeRequest = new CloseFundAccountRequest();
        closeRequest.setFundAccNo("FA9003");
        closeRequest.setIdNumber("330101199001010013");
        closeRequest.setStaffId(1);

        BusinessException ex = assertThrows(BusinessException.class, () -> fundService.closeFundAccount(closeRequest));
        assertEquals(ErrorCode.ERR_007, ex.getErrorCode());
    }

    @Test
    void investorInfoUpdateRejectsDuplicateIdNumber() {
        int investorA = TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9101",
                "FA9101",
                "330101199001010021",
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );
        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9102",
                "FA9102",
                "330101199001010022",
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );

        var request = new account.dto.UpdateInvestorInfoRequest();
        request.setInvestorId(investorA);
        request.setIdNumber("330101199001010022");
        request.setStaffId(1);

        BusinessException ex = assertThrows(BusinessException.class, () -> securityService.updateInvestorInfo(request));
        assertEquals(ErrorCode.PARAM_INVALID, ex.getErrorCode());
    }

    @Test
    void sellWorkflowUpdatesFrozenAndAvailableQuantities() {
        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9201",
                "FA9201",
                "330101199001010061",
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );
        registry.transactionManager().execute(connection -> {
            registry.holdingDao().saveOrUpdate(connection, new DomainModels.Holding(
                    null,
                    "SA9201",
                    "000001",
                    "\u5e73\u5b89\u94f6\u884c",
                    300,
                    0,
                    new BigDecimal("10.5000"),
                    java.time.LocalDateTime.now()
            ));
            return null;
        });

        UpdateSecurityHoldingRequest freezeRequest = new UpdateSecurityHoldingRequest();
        freezeRequest.setSecAccNo("SA9201");
        freezeRequest.setStockCode("000001");
        freezeRequest.setStockName("\u5e73\u5b89\u94f6\u884c");
        freezeRequest.setRefOrderId("ORD-SELL-1");
        freezeRequest.setChangeType("\u5356\u51fa\u51bb\u7ed3");
        freezeRequest.setQuantity(120);

        UpdateSecurityHoldingRequest debitRequest = new UpdateSecurityHoldingRequest();
        debitRequest.setSecAccNo("SA9201");
        debitRequest.setStockCode("000001");
        debitRequest.setStockName("\u5e73\u5b89\u94f6\u884c");
        debitRequest.setRefOrderId("ORD-SELL-1");
        debitRequest.setChangeType("\u5356\u51fa\u6263\u51cf");
        debitRequest.setQuantity(120);

        var freezeResponse = securityService.updateSecurityHolding(freezeRequest);
        var debitResponse = securityService.updateSecurityHolding(debitRequest);

        assertEquals(120, freezeResponse.getFrozenQuantity());
        assertEquals(180, freezeResponse.getAvailableQuantity());
        assertEquals(180, debitResponse.getQuantity());
        assertEquals(0, debitResponse.getFrozenQuantity());
    }

    @Test
    void unbindSecurityAccountRequiresZeroBalance() {
        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9202",
                "FA9202",
                "330101199001010062",
                new BigDecimal("1.00"),
                BigDecimal.ZERO
        );

        BusinessException ex = assertThrows(
                BusinessException.class,
                () -> fundService.unbindSecurityAccount("FA9202", "SA9202", 1)
        );
        assertEquals(ErrorCode.ERR_007, ex.getErrorCode());
    }

    @Test
    void clientChangePasswordRejectsWrongOldPassword() {
        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9203",
                "FA9203",
                "330101199001010063",
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );
        String token = clientAuthTokenService.issueToken("FA9203", "SA9203");

        ClientChangeFundPasswordRequest request = new ClientChangeFundPasswordRequest();
        request.setFundAccNo("FA9203");
        request.setAuthToken(token);
        request.setPasswordType("trade");
        request.setOldPassword("wrong");
        request.setNewPassword("trade456");

        BusinessException ex = assertThrows(BusinessException.class, () -> fundService.clientChangeFundPassword(request));
        assertEquals(ErrorCode.ERR_004, ex.getErrorCode());
    }

    @Test
    void securitySnapshotRejectsWrongClientToken() {
        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9204",
                "FA9204",
                "330101199001010064",
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );
        String token = clientAuthTokenService.issueToken("FA9204", "SA9204");

        BusinessException ex = assertThrows(
                BusinessException.class,
                () -> securityService.getSecuritySnapshot("SA9204X", null, token)
        );
        assertEquals(ErrorCode.ERR_018, ex.getErrorCode());
    }

    @Test
    void closeSecurityAccountRejectsWhenHoldingsRemain() {
        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9205",
                "FA9205",
                "330101199001010065",
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );
        registry.transactionManager().execute(connection -> {
            registry.holdingDao().saveOrUpdate(connection, new DomainModels.Holding(
                    null,
                    "SA9205",
                    "600519",
                    "\u8d35\u5dde\u8305\u53f0",
                    10,
                    0,
                    new BigDecimal("1200.0000"),
                    java.time.LocalDateTime.now()
            ));
            return null;
        });

        CloseSecurityAccountRequest request = new CloseSecurityAccountRequest();
        request.setSecAccNo("SA9205");
        request.setIdNumber("330101199001010065");
        request.setStaffId(1);

        BusinessException ex = assertThrows(BusinessException.class, () -> securityService.closeSecurityAccount(request));
        assertEquals(ErrorCode.ERR_022, ex.getErrorCode());
    }

    @Test
    void closeFundAccountRejectsWhenFrozenBalanceRemains() {
        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9206",
                "FA9206",
                "330101199001010066",
                BigDecimal.ZERO,
                new BigDecimal("50.00")
        );

        CloseFundAccountRequest request = new CloseFundAccountRequest();
        request.setFundAccNo("FA9206");
        request.setIdNumber("330101199001010066");
        request.setStaffId(1);

        BusinessException ex = assertThrows(BusinessException.class, () -> fundService.closeFundAccount(request));
        assertEquals(ErrorCode.ERR_007, ex.getErrorCode());
    }

    @Test
    void bindSecurityAccountRejectsWhenFundAccountAlreadyBoundElsewhere() {
        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9207",
                "FA9207",
                "330101199001010067",
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );
        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9208",
                "FA9208",
                "330101199001010068",
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );
        registry.transactionManager().execute(connection -> {
            registry.securityAccountDao().unbindFundAccount(connection, "SA9208");
            registry.fundAccountDao().relinkSecurityAccount(connection, "FA9208", null);
            registry.securityAccountDao().updateStatus(connection, "SA9208", DomainEnums.AccountStatus.NO_FUND_FROZEN);
            return null;
        });

        BusinessException ex = assertThrows(
                BusinessException.class,
                () -> fundService.bindSecurityAccount("FA9207", "SA9208", 1)
        );
        assertEquals(ErrorCode.ERR_014, ex.getErrorCode());
    }

    @Test
    void sellFreezeRejectsWhenAvailableQuantityIsInsufficient() {
        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9209",
                "FA9209",
                "330101199001010069",
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );
        registry.transactionManager().execute(connection -> {
            registry.holdingDao().saveOrUpdate(connection, new DomainModels.Holding(
                    null,
                    "SA9209",
                    "000002",
                    "\u4e07\u79d1A",
                    100,
                    30,
                    new BigDecimal("8.8800"),
                    java.time.LocalDateTime.now()
            ));
            return null;
        });

        UpdateSecurityHoldingRequest request = new UpdateSecurityHoldingRequest();
        request.setSecAccNo("SA9209");
        request.setStockCode("000002");
        request.setStockName("\u4e07\u79d1A");
        request.setRefOrderId("ORD-SELL-FAIL");
        request.setChangeType("\u5356\u51fa\u51bb\u7ed3");
        request.setQuantity(80);

        BusinessException ex = assertThrows(BusinessException.class, () -> securityService.updateSecurityHolding(request));
        assertEquals(ErrorCode.ERR_002, ex.getErrorCode());
    }

    @Test
    void cancelReleaseRejectsWhenFrozenQuantityIsInsufficient() {
        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9210",
                "FA9210",
                "330101199001010070",
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );
        registry.transactionManager().execute(connection -> {
            registry.holdingDao().saveOrUpdate(connection, new DomainModels.Holding(
                    null,
                    "SA9210",
                    "000333",
                    "\u7f8e\u7684\u96c6\u56e2",
                    100,
                    10,
                    new BigDecimal("60.0000"),
                    java.time.LocalDateTime.now()
            ));
            return null;
        });

        UpdateSecurityHoldingRequest request = new UpdateSecurityHoldingRequest();
        request.setSecAccNo("SA9210");
        request.setStockCode("000333");
        request.setStockName("\u7f8e\u7684\u96c6\u56e2");
        request.setRefOrderId("ORD-CANCEL-FAIL");
        request.setChangeType("\u64a4\u5355\u91ca\u653e");
        request.setQuantity(20);

        BusinessException ex = assertThrows(BusinessException.class, () -> securityService.updateSecurityHolding(request));
        assertEquals(ErrorCode.ERR_002, ex.getErrorCode());
    }

    @Test
    void concurrentDuplicateFundCallbacksOnlyApplyOnce() throws Exception {
        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9211",
                "FA9211",
                "330101199001010071",
                new BigDecimal("1000.00"),
                BigDecimal.ZERO
        );

        ExecutorService executor = Executors.newFixedThreadPool(6);
        CountDownLatch ready = new CountDownLatch(6);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Boolean>> futures = new ArrayList<>();

        for (int i = 0; i < 6; i++) {
            futures.add(executor.submit(() -> {
                UpdateFundBalanceRequest request = new UpdateFundBalanceRequest();
                request.setFundAccNo("FA9211");
                request.setRefOrderId("ORD-CONCURRENT-FUND");
                request.setTxnType("\u4e70\u5165\u51bb\u7ed3");
                request.setAmount(new BigDecimal("100.00"));
                ready.countDown();
                start.await();
                return fundService.updateFundBalance(request).getDuplicate();
            }));
        }

        ready.await();
        start.countDown();

        int duplicateCount = 0;
        for (Future<Boolean> future : futures) {
            if (future.get()) {
                duplicateCount++;
            }
        }
        executor.shutdownNow();

        assertEquals(5, duplicateCount);
        assertEquals(new BigDecimal("900.00"), registry.fundAccountDao().findByAccountNo("FA9211").orElseThrow().availableBalance());
        assertEquals(1, registry.fundTransactionLogDao().listRecentByFundAccountNo("FA9211", 10).size());
    }

    @Test
    void concurrentDuplicateHoldingCallbacksOnlyApplyOnce() throws Exception {
        TestDatabaseSupport.seedInvestorSecurityFund(
                registry,
                "SA9212",
                "FA9212",
                "330101199001010072",
                BigDecimal.ZERO,
                BigDecimal.ZERO
        );
        registry.transactionManager().execute(connection -> {
            registry.holdingDao().saveOrUpdate(connection, new DomainModels.Holding(
                    null,
                    "SA9212",
                    "300750",
                    "\u5b81\u5fb7\u65f6\u4ee3",
                    200,
                    0,
                    new BigDecimal("200.0000"),
                    java.time.LocalDateTime.now()
            ));
            return null;
        });

        ExecutorService executor = Executors.newFixedThreadPool(6);
        CountDownLatch ready = new CountDownLatch(6);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Boolean>> futures = new ArrayList<>();

        for (int i = 0; i < 6; i++) {
            futures.add(executor.submit(() -> {
                UpdateSecurityHoldingRequest request = new UpdateSecurityHoldingRequest();
                request.setSecAccNo("SA9212");
                request.setStockCode("300750");
                request.setStockName("\u5b81\u5fb7\u65f6\u4ee3");
                request.setRefOrderId("ORD-CONCURRENT-HOLD");
                request.setChangeType("\u5356\u51fa\u51bb\u7ed3");
                request.setQuantity(50);
                ready.countDown();
                start.await();
                return securityService.updateSecurityHolding(request).getDuplicate();
            }));
        }

        ready.await();
        start.countDown();

        int duplicateCount = 0;
        for (Future<Boolean> future : futures) {
            if (future.get()) {
                duplicateCount++;
            }
        }
        executor.shutdownNow();

        var holding = registry.holdingDao().findByAccountAndStock("SA9212", "300750").orElseThrow();
        assertEquals(5, duplicateCount);
        assertEquals(200, holding.quantity());
        assertEquals(50, holding.frozenQuantity());
        assertEquals(1, registry.holdingChangeLogDao().listByRefOrderId("ORD-CONCURRENT-HOLD").size());
    }
}
