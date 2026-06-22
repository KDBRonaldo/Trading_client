package account.service;

import account.common.BusinessException;
import account.common.ErrorCode;
import account.dao.DaoRegistry;
import account.dao.model.DomainEnums.AccountStatus;
import account.dao.model.DomainEnums.InvestorType;
import account.dao.model.DomainModels.FundAccount;
import account.dao.model.DomainModels.Holding;
import account.dao.model.DomainModels.Investor;
import account.dao.model.DomainModels.SecurityAccount;
import account.dto.CloseFundAccountRequest;
import account.dto.CloseSecurityAccountRequest;
import account.dto.CreateFundAccountRequest;
import account.dto.CreateSecurityAccountRequest;
import account.dto.DeactivateStaffRequest;
import account.dto.AdminFreezeRequest;
import account.dto.ReportFundLossRequest;
import account.dto.UpdateInvestorInfoRequest;
import account.enums.AccountType;
import account.enums.FreezeType;
import account.integration.BlacklistClientException;
import account.service.api.AdminService;
import account.service.api.FundAccountService;
import account.service.api.SecurityAccountService;
import account.service.api.StaffService;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AccountBusinessRuleTest {

    private DaoRegistry registry;
    private SecurityAccountService securityService;
    private FundAccountService fundService;
    private StaffService staffService;
    private AdminService adminService;
    private InMemoryStaffAuthTokenService staffAuthTokenService;

    @BeforeEach
    void setUp() throws Exception {
        String jdbcUrl = "jdbc:h2:mem:rules_" + UUID.randomUUID() + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
        registry = DaoRegistry.forDriverManager(jdbcUrl, "sa", "");
        try (Connection connection = DriverManager.getConnection(jdbcUrl, "sa", "");
             Statement statement = connection.createStatement()) {
            statement.execute("""
                    create table investor (
                        investor_id int auto_increment primary key,
                        type varchar(20) not null,
                        name varchar(100) not null,
                        gender varchar(10),
                        id_type varchar(20) not null,
                        id_number varchar(50) not null unique,
                        phone varchar(20),
                        address varchar(200),
                        work_unit varchar(100),
                        occupation varchar(50),
                        education varchar(50),
                        legal_number varchar(20),
                        business_license varchar(20),
                        authorize_name varchar(20),
                        authorize_phone varchar(20),
                        authorize_address varchar(100),
                        executor_name varchar(50),
                        agent_name varchar(100),
                        agent_id_number varchar(50),
                        created_at timestamp default current_timestamp not null
                    )
                    """);
            statement.execute("""
                    create table security_account (
                        sec_acc_no varchar(20) primary key,
                        investor_id int not null,
                        status varchar(20) not null,
                        open_date date not null,
                        linked_fund_acc varchar(20) unique,
                        foreign key (investor_id) references investor(investor_id)
                    )
                    """);
            statement.execute("""
                    create table fund_account (
                        fund_acc_no varchar(20) primary key,
                        sec_acc_no varchar(20) unique,
                        trade_password varchar(128) not null,
                        withdraw_password varchar(128) not null,
                        available_balance decimal(15,2) not null default 0.00,
                        frozen_balance decimal(15,2) not null default 0.00,
                        currency char(3) not null default 'CNY',
                        status varchar(20) not null,
                        open_date date not null,
                        last_interest_date date,
                        annual_interest_rate decimal(5,4) not null default 0.0035,
                        foreign key (sec_acc_no) references security_account(sec_acc_no)
                    )
                    """);
            statement.execute("""
                    create table staff (
                        staff_id int primary key,
                        username varchar(50) not null unique,
                        password_hash varchar(128) not null,
                        status varchar(20) not null,
                        created_at timestamp default current_timestamp not null
                    )
                    """);
            statement.execute("alter table security_account add constraint fk_security_linked_fund foreign key (linked_fund_acc) references fund_account(fund_acc_no)");
            statement.execute("""
                    create table fund_transaction_log (
                        log_id bigint auto_increment primary key,
                        fund_acc_no varchar(20) not null,
                        txn_type varchar(20) not null,
                        amount decimal(15,2) not null,
                        available_after decimal(15,2) not null,
                        frozen_after decimal(15,2) not null,
                        ref_order_id varchar(50),
                        operator_id int,
                        txn_time timestamp default current_timestamp not null
                    )
                    """);
            statement.execute("""
                    create table holding (
                        holding_id bigint auto_increment primary key,
                        sec_acc_no varchar(20) not null,
                        stock_code varchar(10) not null,
                        stock_name varchar(100) not null,
                        quantity int not null default 0,
                        frozen_quantity int not null default 0,
                        avg_cost decimal(15,4),
                        updated_at timestamp default current_timestamp not null,
                        unique(sec_acc_no, stock_code),
                        foreign key (sec_acc_no) references security_account(sec_acc_no)
                    )
                    """);
            statement.execute("""
                    create table holding_change_log (
                        log_id bigint auto_increment primary key,
                        sec_acc_no varchar(20) not null,
                        stock_code varchar(10) not null,
                        stock_name varchar(100) not null,
                        ref_order_id varchar(50) not null,
                        change_type varchar(20) not null,
                        quantity int not null,
                        price decimal(15,4),
                        quantity_after int not null,
                        frozen_quantity_after int not null,
                        avg_cost_after decimal(15,4),
                        txn_time timestamp default current_timestamp not null
                    )
                    """);
            statement.execute("""
                    create table operation_log (
                        log_id bigint auto_increment primary key,
                        staff_id int,
                        operation_type varchar(50) not null,
                        target_type varchar(50),
                        target_id varchar(50),
                        detail varchar(500),
                        operation_time timestamp default current_timestamp not null
                    )
                    """);
        }

        securityService = new SecurityAccountServiceImpl(
                registry,
                userName -> false,
                new InMemoryClientAuthTokenService(
                        7200,
                        Clock.fixed(Instant.parse("2026-06-19T08:00:00Z"), ZoneId.of("Asia/Shanghai"))
                )
        );
        fundService = new FundAccountServiceImpl(
                registry,
                userName -> false,
                new InMemoryClientAuthTokenService(
                        7200,
                        Clock.fixed(Instant.parse("2026-06-19T08:00:00Z"), ZoneId.of("Asia/Shanghai"))
                )
        );
        staffAuthTokenService = new InMemoryStaffAuthTokenService(
                28800,
                Clock.fixed(Instant.parse("2026-06-19T08:00:00Z"), ZoneId.of("Asia/Shanghai"))
        );
        staffService = new StaffServiceImpl(registry, staffAuthTokenService);
        adminService = new AdminServiceImpl(registry);
    }

    @Test
    void createSecurityAccountRejectsMinor() {
        CreateSecurityAccountRequest request = new CreateSecurityAccountRequest();
        request.setInvestorType("个人");
        request.setName("Minor");
        request.setGender("男");
        request.setIdType("身份证");
        request.setIdNumber("330101201001010011");

        BusinessException ex = assertThrows(BusinessException.class, () -> securityService.createSecurityAccount(request));
        assertEquals(ErrorCode.ERR_019, ex.getErrorCode());
    }

    @Test
    void createSecurityAccountRejectsBlacklistedInvestor() {
        securityService = new SecurityAccountServiceImpl(
                registry,
                userName -> true,
                new InMemoryClientAuthTokenService(
                        7200,
                        Clock.fixed(Instant.parse("2026-06-19T08:00:00Z"), ZoneId.of("Asia/Shanghai"))
                )
        );

        CreateSecurityAccountRequest request = new CreateSecurityAccountRequest();
        request.setInvestorType("个人");
        request.setName("Blocked");
        request.setGender("男");
        request.setIdType("身份证");
        request.setIdNumber("330101199001010099");

        BusinessException ex = assertThrows(BusinessException.class, () -> securityService.createSecurityAccount(request));
        assertEquals(ErrorCode.ERR_012, ex.getErrorCode());
    }

    @Test
    void createSecurityAccountAllowsWhenBlacklistServiceFails() {
        securityService = new SecurityAccountServiceImpl(
                registry,
                userName -> {
                    throw new BlacklistClientException("blacklist unavailable");
                },
                new InMemoryClientAuthTokenService(
                        7200,
                        Clock.fixed(Instant.parse("2026-06-19T08:00:00Z"), ZoneId.of("Asia/Shanghai"))
                )
        );

        CreateSecurityAccountRequest request = new CreateSecurityAccountRequest();
        request.setInvestorType("个人");
        request.setName("ErrorUser");
        request.setGender("男");
        request.setIdType("身份证");
        request.setIdNumber("330101199001010098");
        request.setStaffId(1);

        var response = securityService.createSecurityAccount(request);
        assertEquals("NORMAL", response.getStatus());
    }

    @Test
    void createCorporateSecurityAccountSucceedsWithRequiredFields() {
        CreateSecurityAccountRequest request = new CreateSecurityAccountRequest();
        request.setInvestorType("法人");
        request.setName("法人甲");
        request.setIdType("营业执照");
        request.setIdNumber("CORP-20260620-01");
        request.setPhone("13800000000");
        request.setAddress("杭州市西湖区测试路 1 号");
        request.setLegalNumber("LEGAL-001");
        request.setBusinessLicense("BL-001");
        request.setAuthorizeName("授权人甲");
        request.setAuthorizePhone("13900000000");
        request.setAuthorizeAddress("杭州市滨江区测试路 2 号");
        request.setExecutorName("执行人甲");
        request.setStaffId(1);

        var response = securityService.createSecurityAccount(request);

        assertEquals("NORMAL", response.getStatus());
        var investor = registry.investorDao().findById(response.getInvestorId()).orElseThrow();
        assertEquals(InvestorType.LEGAL_ENTITY, investor.type());
        assertEquals("BL-001", investor.businessLicense());
        assertEquals("授权人甲", investor.authorizeName());
    }

    @Test
    void createPersonalSecurityAccountWithAgentPersistsAgentInfo() {
        CreateSecurityAccountRequest request = new CreateSecurityAccountRequest();
        request.setInvestorType("个人");
        request.setName("Agent User");
        request.setGender("女");
        request.setIdType("身份证");
        request.setIdNumber("330101199201010022");
        request.setAgentName("代办人甲");
        request.setAgentIdNumber("330101199501010033");
        request.setStaffId(1);

        var response = securityService.createSecurityAccount(request);

        assertEquals("NORMAL", response.getStatus());
        var investor = registry.investorDao().findById(response.getInvestorId()).orElseThrow();
        assertEquals("代办人甲", investor.agentName());
        assertEquals("330101199501010033", investor.agentIdNumber());
    }

    @Test
    void closeSecurityAccountRequiresZeroHoldings() {
        seedBoundAccounts("SA1001", "FA1001");
        registry.transactionManager().execute(connection -> {
            registry.holdingDao().saveOrUpdate(connection, new Holding(
                    null, "SA1001", "600519", "贵州茅台", 100, 0, new BigDecimal("1000.0000"), null
            ));
            return null;
        });

        CloseSecurityAccountRequest request = new CloseSecurityAccountRequest();
        request.setSecAccNo("SA1001");
        request.setIdNumber("330101199001010011");

        BusinessException ex = assertThrows(BusinessException.class, () -> securityService.closeSecurityAccount(request));
        assertEquals(ErrorCode.ERR_022, ex.getErrorCode());
    }

    @Test
    void closeSecurityAccountAlsoUnbindsFundAccount() {
        seedBoundAccounts("SA1010", "FA1010");

        CloseSecurityAccountRequest request = new CloseSecurityAccountRequest();
        request.setSecAccNo("SA1010");
        request.setIdNumber("330101199001010011");
        request.setStaffId(1);

        securityService.closeSecurityAccount(request);

        assertEquals(AccountStatus.CLOSED, registry.securityAccountDao().findByAccountNo("SA1010").orElseThrow().status());
        assertNull(registry.securityAccountDao().findByAccountNo("SA1010").orElseThrow().linkedFundAcc());
        assertNull(registry.fundAccountDao().findByAccountNo("FA1010").orElseThrow().secAccNo());
    }

    @Test
    void reportFundLossAlsoFreezesSecurityAccount() {
        seedBoundAccounts("SA1002", "FA1002");
        registry.transactionManager().execute(connection -> {
            registry.fundAccountDao().updateBalances(connection, "FA1002", new BigDecimal("200.00"), new BigDecimal("50.00"));
            registry.holdingDao().saveOrUpdate(connection, new Holding(
                    null,
                    "SA1002",
                    "600000",
                    "浦发银行",
                    120,
                    30,
                    new BigDecimal("10.0000"),
                    LocalDateTime.now()
            ));
            return null;
        });

        ReportFundLossRequest request = new ReportFundLossRequest();
        request.setFundAccNo("FA1002");
        request.setIdNumber("330101199001010011");
        request.setStaffId(1);

        fundService.reportFundLoss(request);

        assertEquals(AccountStatus.LOSS_FROZEN, registry.fundAccountDao().findByAccountNo("FA1002").orElseThrow().status());
        assertEquals(AccountStatus.LOSS_FROZEN, registry.securityAccountDao().findByAccountNo("SA1002").orElseThrow().status());
        assertEquals(BigDecimal.ZERO.setScale(2), registry.fundAccountDao().findByAccountNo("FA1002").orElseThrow().availableBalance().setScale(2));
        assertEquals(new BigDecimal("250.00"), registry.fundAccountDao().findByAccountNo("FA1002").orElseThrow().frozenBalance());
        assertEquals(0, registry.holdingDao().findByAccountAndStock("SA1002", "600000").orElseThrow().quantity());
        assertEquals(150, registry.holdingDao().findByAccountAndStock("SA1002", "600000").orElseThrow().frozenQuantity());
    }

    @Test
    void adminFreezeFundAccountAlsoFreezesBalancesAndLinkedHoldings() {
        seedBoundAccounts("SA3001", "FA3001");
        registry.transactionManager().execute(connection -> {
            registry.fundAccountDao().updateBalances(connection, "FA3001", new BigDecimal("600.00"), new BigDecimal("40.00"));
            registry.holdingDao().saveOrUpdate(connection, new Holding(
                    null,
                    "SA3001",
                    "000001",
                    "平安银行",
                    80,
                    20,
                    new BigDecimal("11.0000"),
                    LocalDateTime.now()
            ));
            return null;
        });

        AdminFreezeRequest request = new AdminFreezeRequest();
        request.setAdminId("1");
        request.setAccountType(AccountType.FUND);
        request.setAccountNo("FA3001");
        request.setFreezeType(FreezeType.VIOLATION);
        request.setReason("manual freeze");

        adminService.adminFreezeAccount(request);

        var fund = registry.fundAccountDao().findByAccountNo("FA3001").orElseThrow();
        var security = registry.securityAccountDao().findByAccountNo("SA3001").orElseThrow();
        var holding = registry.holdingDao().findByAccountAndStock("SA3001", "000001").orElseThrow();

        assertEquals(AccountStatus.VIOLATION_FROZEN, fund.status());
        assertEquals(AccountStatus.VIOLATION_FROZEN, security.status());
        assertEquals(BigDecimal.ZERO.setScale(2), fund.availableBalance().setScale(2));
        assertEquals(new BigDecimal("640.00"), fund.frozenBalance());
        assertEquals(0, holding.quantity());
        assertEquals(100, holding.frozenQuantity());
    }

    @Test
    void adminUnfreezeFundAccountRestoresBalancesAndLinkedHoldings() {
        seedBoundAccounts("SA3002", "FA3002");
        registry.transactionManager().execute(connection -> {
            registry.fundAccountDao().updateBalances(connection, "FA3002", BigDecimal.ZERO, new BigDecimal("520.00"));
            registry.fundAccountDao().updateStatus(connection, "FA3002", AccountStatus.VIOLATION_FROZEN);
            registry.holdingDao().saveOrUpdate(connection, new Holding(
                    null,
                    "SA3002",
                    "600519",
                    "贵州茅台",
                    0,
                    35,
                    new BigDecimal("1500.0000"),
                    LocalDateTime.now()
            ));
            registry.securityAccountDao().updateStatus(connection, "SA3002", AccountStatus.VIOLATION_FROZEN);
            return null;
        });

        AdminFreezeRequest request = new AdminFreezeRequest();
        request.setAdminId("1");
        request.setAccountType(AccountType.FUND);
        request.setAccountNo("FA3002");
        request.setFreezeType(FreezeType.VIOLATION);

        adminService.adminUnfreezeAccount(request);

        var fund = registry.fundAccountDao().findByAccountNo("FA3002").orElseThrow();
        var security = registry.securityAccountDao().findByAccountNo("SA3002").orElseThrow();
        var holding = registry.holdingDao().findByAccountAndStock("SA3002", "600519").orElseThrow();

        assertEquals(AccountStatus.NORMAL, fund.status());
        assertEquals(AccountStatus.NORMAL, security.status());
        assertEquals(new BigDecimal("520.00"), fund.availableBalance());
        assertEquals(BigDecimal.ZERO.setScale(2), fund.frozenBalance().setScale(2));
        assertEquals(35, holding.quantity());
        assertEquals(0, holding.frozenQuantity());
    }

    @Test
    void adminFreezeSecurityAccountAlsoFreezesHoldings() {
        seedSecurityOnlyAccount("SA3003");
        registry.transactionManager().execute(connection -> {
            registry.holdingDao().saveOrUpdate(connection, new Holding(
                    null,
                    "SA3003",
                    "600036",
                    "招商银行",
                    45,
                    5,
                    new BigDecimal("33.0000"),
                    LocalDateTime.now()
            ));
            return null;
        });

        AdminFreezeRequest request = new AdminFreezeRequest();
        request.setAdminId("1");
        request.setAccountType(AccountType.SECURITY);
        request.setAccountNo("SA3003");
        request.setFreezeType(FreezeType.VIOLATION);

        adminService.adminFreezeAccount(request);

        var security = registry.securityAccountDao().findByAccountNo("SA3003").orElseThrow();
        var holding = registry.holdingDao().findByAccountAndStock("SA3003", "600036").orElseThrow();

        assertEquals(AccountStatus.VIOLATION_FROZEN, security.status());
        assertEquals(0, holding.quantity());
        assertEquals(50, holding.frozenQuantity());
    }

    @Test
    void adminUnfreezeSecurityAccountRestoresHoldings() {
        seedSecurityOnlyAccount("SA3004");
        registry.transactionManager().execute(connection -> {
            registry.securityAccountDao().updateStatus(connection, "SA3004", AccountStatus.VIOLATION_FROZEN);
            registry.holdingDao().saveOrUpdate(connection, new Holding(
                    null,
                    "SA3004",
                    "601318",
                    "中国平安",
                    0,
                    60,
                    new BigDecimal("45.0000"),
                    LocalDateTime.now()
            ));
            return null;
        });

        AdminFreezeRequest request = new AdminFreezeRequest();
        request.setAdminId("1");
        request.setAccountType(AccountType.SECURITY);
        request.setAccountNo("SA3004");
        request.setFreezeType(FreezeType.VIOLATION);

        adminService.adminUnfreezeAccount(request);

        var security = registry.securityAccountDao().findByAccountNo("SA3004").orElseThrow();
        var holding = registry.holdingDao().findByAccountAndStock("SA3004", "601318").orElseThrow();

        assertEquals(AccountStatus.NORMAL, security.status());
        assertEquals(60, holding.quantity());
        assertEquals(0, holding.frozenQuantity());
    }

    @Test
    void createFundAccountRejectsBlacklistedInvestor() {
        fundService = new FundAccountServiceImpl(
                registry,
                userName -> true,
                new InMemoryClientAuthTokenService(
                        7200,
                        Clock.fixed(Instant.parse("2026-06-19T08:00:00Z"), ZoneId.of("Asia/Shanghai"))
                )
        );
        seedSecurityOnlyAccount("SA2001");

        CreateFundAccountRequest request = new CreateFundAccountRequest();
        request.setSecAccNo("SA2001");
        request.setIdNumber("330101199001010011");
        request.setTradePassword("trade123");
        request.setWithdrawPassword("withdraw123");
        request.setCurrency("CNY");
        request.setStaffId(1);

        BusinessException ex = assertThrows(BusinessException.class, () -> fundService.createFundAccount(request));
        assertEquals(ErrorCode.ERR_012, ex.getErrorCode());
    }

    @Test
    void createFundAccountAllowsWhenBlacklistServiceFails() {
        fundService = new FundAccountServiceImpl(
                registry,
                userName -> {
                    throw new BlacklistClientException("blacklist unavailable");
                },
                new InMemoryClientAuthTokenService(
                        7200,
                        Clock.fixed(Instant.parse("2026-06-19T08:00:00Z"), ZoneId.of("Asia/Shanghai"))
                )
        );
        seedSecurityOnlyAccount("SA2002");

        CreateFundAccountRequest request = new CreateFundAccountRequest();
        request.setSecAccNo("SA2002");
        request.setIdNumber("330101199001010011");
        request.setTradePassword("trade123");
        request.setWithdrawPassword("withdraw123");
        request.setCurrency("CNY");
        request.setStaffId(1);

        var response = fundService.createFundAccount(request);
        assertEquals("NORMAL", response.getStatus());
        assertEquals("SA2002", response.getSecAccNo());
    }

    @Test
    void closeFundAccountUnbindsAndFreezesSecurityAccountForNoFund() {
        seedBoundAccounts("SA1003", "FA1003");

        CloseFundAccountRequest request = new CloseFundAccountRequest();
        request.setFundAccNo("FA1003");
        request.setIdNumber("330101199001010011");
        request.setStaffId(1);

        fundService.closeFundAccount(request);

        assertEquals(AccountStatus.CLOSED, registry.fundAccountDao().findByAccountNo("FA1003").orElseThrow().status());
        assertEquals(AccountStatus.NO_FUND_FROZEN, registry.securityAccountDao().findByAccountNo("SA1003").orElseThrow().status());
        assertNull(registry.securityAccountDao().findByAccountNo("SA1003").orElseThrow().linkedFundAcc());
        assertNull(registry.fundAccountDao().findByAccountNo("FA1003").orElseThrow().secAccNo());
    }

    @Test
    void updateInvestorInfoPersistsChanges() {
        seedBoundAccounts("SA1004", "FA1004");
        int investorId = registry.securityAccountDao().findByAccountNo("SA1004").orElseThrow().investorId();

        UpdateInvestorInfoRequest request = new UpdateInvestorInfoRequest();
        request.setInvestorId(investorId);
        request.setName("Updated Tester");
        request.setPhone("13900000000");
        request.setAddress("Updated Address");
        request.setWorkUnit("Updated Unit");
        request.setStaffId(1);

        securityService.updateInvestorInfo(request);

        var investor = registry.investorDao().findById(investorId).orElseThrow();
        assertEquals("Updated Tester", investor.name());
        assertEquals("13900000000", investor.phone());
        assertEquals("Updated Address", investor.address());
        assertEquals("Updated Unit", investor.workUnit());
    }

    @Test
    void deactivateStaffDisablesAccountAndInvalidatesToken() {
        registry.transactionManager().execute(connection -> {
            insertStaff(connection, 1, "staff01");
            insertStaff(connection, 2, "staff02");
            return null;
        });

        String staffToken = staffAuthTokenService.issueToken(2, "staff02");

        DeactivateStaffRequest request = new DeactivateStaffRequest();
        request.setTargetStaffId(2);
        request.setOperatorStaffId(1);
        request.setReason("left");

        staffService.deactivateStaff(request);

        assertEquals("禁用", registry.staffDao().findById(2).orElseThrow().status());
        assertThrows(BusinessException.class, () -> staffAuthTokenService.requireAccess(staffToken));
    }

    private void seedBoundAccounts(String secAccNo, String fundAccNo) {
        registry.transactionManager().execute(connection -> {
            insertStaff(connection, 1, "staff01");
            int investorId = registry.investorDao().create(connection, new Investor(
                    null,
                    InvestorType.PERSONAL,
                    "Tester",
                    "男",
                    "身份证",
                    "330101199001010011",
                    "13800000000",
                    "Hangzhou",
                    "ZJU",
                    "Engineer",
                    "Bachelor",
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    LocalDateTime.now()
            ));
            registry.securityAccountDao().create(connection, new SecurityAccount(
                    secAccNo,
                    investorId,
                    AccountStatus.NORMAL,
                    LocalDate.of(2026, 6, 19),
                    null
            ));
            registry.fundAccountDao().create(connection, new FundAccount(
                    fundAccNo,
                    secAccNo,
                    PasswordUtil.hash("trade123"),
                    PasswordUtil.hash("withdraw123"),
                    BigDecimal.ZERO,
                    BigDecimal.ZERO,
                    "CNY",
                    AccountStatus.NORMAL,
                    LocalDate.of(2026, 6, 19),
                    null,
                    new BigDecimal("0.0035")
            ));
            registry.securityAccountDao().bindFundAccount(connection, secAccNo, fundAccNo);
            return null;
        });
    }

    private void seedSecurityOnlyAccount(String secAccNo) {
        registry.transactionManager().execute(connection -> {
            insertStaff(connection, 1, "staff01");
            int investorId = registry.investorDao().create(connection, new Investor(
                    null,
                    InvestorType.PERSONAL,
                    "Tester",
                    "男",
                    "身份证",
                    "330101199001010011",
                    "13800000000",
                    "Hangzhou",
                    "ZJU",
                    "Engineer",
                    "Bachelor",
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    LocalDateTime.now()
            ));
            registry.securityAccountDao().create(connection, new SecurityAccount(
                    secAccNo,
                    investorId,
                    AccountStatus.NORMAL,
                    LocalDate.of(2026, 6, 19),
                    null
            ));
            return null;
        });
    }

    private void insertStaff(Connection connection, int staffId, String username) {
        try (PreparedStatement statement = connection.prepareStatement("""
                insert into staff (staff_id, username, password_hash, status, created_at)
                values (?, ?, ?, ?, ?)
                """)) {
            statement.setInt(1, staffId);
            statement.setString(2, username);
            statement.setString(3, "hash");
            statement.setString(4, "正常");
            statement.setTimestamp(5, java.sql.Timestamp.valueOf(LocalDateTime.of(2026, 6, 19, 8, 0)));
            statement.executeUpdate();
        } catch (Exception ex) {
            throw new RuntimeException(ex);
        }
    }
}
