package account.dao;

import account.dao.core.DaoException;
import account.dao.model.DomainEnums.AccountStatus;
import account.dao.model.DomainEnums.FundTransactionType;
import account.dao.model.DomainEnums.InvestorType;
import account.dao.model.DomainModels.FundAccount;
import account.dao.model.DomainModels.FundTransactionLog;
import account.dao.model.DomainModels.Holding;
import account.dao.model.DomainModels.HoldingChangeLog;
import account.dao.model.DomainModels.Investor;
import account.dao.model.DomainModels.OperationLog;
import account.dao.model.DomainModels.OperationLogQuery;
import account.dao.model.DomainModels.SecurityAccount;
import account.dao.model.DomainModels.Staff;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DaoIntegrationTest {

    private static final String NORMAL = "正常";
    private static final String DISABLED = "禁用";

    private DaoRegistry registry;
    private String jdbcUrl;

    @BeforeEach
    void setUp() throws Exception {
        jdbcUrl = "jdbc:h2:mem:dao_" + UUID.randomUUID() + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
        registry = DaoRegistry.forDriverManager(jdbcUrl, "sa", "");
        try (Connection connection = openConnection()) {
            createSchema(connection);
        }
    }

    @Test
    void accountDaosCreateReadAndUpdateCoreTables() {
        int investorId = seedInvestorSecurityAndFund("SA2026000001", "FA2026000001");

        registry.transactionManager().execute(connection -> {
            assertTrue(registry.securityAccountDao().bindFundAccount(connection, "SA2026000001", "FA2026000001"));
            assertTrue(registry.fundAccountDao().updateBalances(
                    connection,
                    "FA2026000001",
                    new BigDecimal("900.00"),
                    new BigDecimal("100.00")
            ));
            assertTrue(registry.staffDao().update(connection, new Staff(1, "staff01", "hash2", DISABLED, null)));
            return null;
        });

        SecurityAccount securityAccount = registry.securityAccountDao().findByAccountNo("SA2026000001").orElseThrow();
        FundAccount fundAccount = registry.fundAccountDao().findByAccountNo("FA2026000001").orElseThrow();
        Staff staff = registry.staffDao().findByUsername("staff01").orElseThrow();
        Investor investor = registry.investorDao().findById(investorId).orElseThrow();

        assertAll(
                () -> assertEquals(investorId, securityAccount.investorId()),
                () -> assertEquals("FA2026000001", securityAccount.linkedFundAcc()),
                () -> assertEquals(new BigDecimal("900.00"), fundAccount.availableBalance()),
                () -> assertEquals(new BigDecimal("100.00"), fundAccount.frozenBalance()),
                () -> assertEquals(DISABLED, staff.status()),
                () -> assertEquals("女", investor.gender()),
                () -> assertEquals("ZJU", investor.workUnit())
        );
    }

    @Test
    void transactionLogOperationLogAndIdempotencyQueriesWork() {
        seedInvestorSecurityAndFund("SA2026000002", "FA2026000002");

        long fundLogId = registry.transactionManager().execute(connection -> registry.fundTransactionLogDao().create(
                connection,
                new FundTransactionLog(
                        null,
                        "FA2026000002",
                        FundTransactionType.BUY_FREEZE,
                        new BigDecimal("300.00"),
                        new BigDecimal("700.00"),
                        new BigDecimal("300.00"),
                        "ORD-001",
                        1,
                        LocalDateTime.of(2026, 6, 15, 9, 0)
                )
        ));

        long holdingLogId = registry.transactionManager().execute(connection -> registry.holdingChangeLogDao().create(
                connection,
                new HoldingChangeLog(
                        null,
                        "SA2026000002",
                        "600519",
                        "贵州茅台",
                        "ORD-001",
                        "买入增加",
                        100,
                        new BigDecimal("1500.0000"),
                        100,
                        0,
                        new BigDecimal("1500.0000"),
                        LocalDateTime.of(2026, 6, 15, 9, 1)
                )
        ));

        long opLogId = registry.transactionManager().execute(connection -> registry.operationLogDao().create(
                connection,
                new OperationLog(
                        null,
                        1,
                        "OPEN_FUND",
                        "fund_account",
                        "FA2026000002",
                        "create fund account",
                        LocalDateTime.of(2026, 6, 15, 10, 0)
                )
        ));

        List<OperationLog> logs = registry.operationLogDao().query(new OperationLogQuery(
                1,
                LocalDateTime.of(2026, 6, 15, 0, 0),
                LocalDateTime.of(2026, 6, 16, 0, 0),
                "OPEN_FUND",
                "fund_account",
                null,
                10,
                0
        ));

        boolean fundExistsInTx = registry.transactionManager().execute(connection ->
                registry.fundTransactionLogDao().existsByRefOrderIdAndTxnType(connection, "ORD-001", FundTransactionType.BUY_FREEZE));
        boolean holdingExistsInTx = registry.transactionManager().execute(connection ->
                registry.holdingChangeLogDao().existsByRefOrderIdAndChangeTypeAndAccountAndStock(
                        connection, "ORD-001", "买入增加", "SA2026000002", "600519"));

        assertAll(
                () -> assertTrue(fundLogId > 0),
                () -> assertTrue(holdingLogId > 0),
                () -> assertTrue(opLogId > 0),
                () -> assertTrue(registry.fundTransactionLogDao().existsByRefOrderIdAndTxnType("ORD-001", FundTransactionType.BUY_FREEZE)),
                () -> assertFalse(registry.fundTransactionLogDao().existsByRefOrderIdAndTxnType("", FundTransactionType.BUY_FREEZE)),
                () -> assertTrue(fundExistsInTx),
                () -> assertTrue(holdingExistsInTx),
                () -> assertEquals("贵州茅台", registry.holdingChangeLogDao().listByRefOrderId("ORD-001").get(0).stockName()),
                () -> assertEquals(1, registry.fundTransactionLogDao().listRecentByFundAccountNo("FA2026000002", 5).size()),
                () -> assertEquals(1, registry.holdingChangeLogDao().listRecentBySecurityAccountNo("SA2026000002", 5).size()),
                () -> assertEquals(1, logs.size()),
                () -> assertEquals("FA2026000002", logs.get(0).targetId())
        );
    }

    @Test
    void holdingDaoUpsertsAndRollsBackWithTransactionManager() {
        seedInvestorSecurityAndFund("SA2026000003", "FA2026000003");

        Holding inserted = registry.transactionManager().execute(connection -> registry.holdingDao().saveOrUpdate(
                connection,
                new Holding(null, "SA2026000003", "600519", "贵州茅台", 100, 20, new BigDecimal("1600.0000"), null)
        ));
        Holding updated = registry.transactionManager().execute(connection -> registry.holdingDao().saveOrUpdate(
                connection,
                new Holding(null, "SA2026000003", "600519", "贵州茅台", 120, 30, new BigDecimal("1590.0000"), null)
        ));

        assertAll(
                () -> assertNotNull(inserted.holdingId()),
                () -> assertEquals(inserted.holdingId(), updated.holdingId()),
                () -> assertEquals("贵州茅台", updated.stockName()),
                () -> assertEquals(90, updated.availableQuantity()),
                () -> assertEquals(120, registry.holdingDao().sumQuantityBySecurityAccountNo("SA2026000003")),
                () -> assertEquals(1, registry.holdingDao().listBySecurityAccountNo("SA2026000003").size())
        );

        assertThrows(DaoException.class, () -> registry.transactionManager().execute(connection -> {
            registry.holdingDao().saveOrUpdate(
                    connection,
                    new Holding(null, "SA2026000003", "000001", "平安银行", 10, 0, new BigDecimal("11.0000"), null)
            );
            throw new SQLException("force rollback");
        }));

        assertTrue(registry.holdingDao().findByAccountAndStock("SA2026000003", "000001").isEmpty());
    }

    @Test
    void databaseScriptsContainDaoSupportedObjects() throws Exception {
        String createTables = Files.readString(Path.of("scripts", "01_create_tables.sql"), StandardCharsets.UTF_8);
        String testData = Files.readString(Path.of("scripts", "03_test_data.sql"), StandardCharsets.UTF_8);

        assertAll(
                () -> assertFalse(createTables.contains("CREATE TABLE freeze_record")),
                () -> assertFalse(createTables.contains("CREATE TABLE blacklist")),
                () -> assertTrue(createTables.contains("CREATE TABLE holding_change_log")),
                () -> assertTrue(createTables.contains("stock_name VARCHAR(100) NOT NULL")),
                () -> assertTrue(createTables.contains("gender VARCHAR(10) NULL")),
                () -> assertTrue(createTables.contains("work_unit VARCHAR(100) NULL")),
                () -> assertTrue(createTables.contains("无资金账户冻结")),
                () -> assertTrue(createTables.contains("sec_acc_no VARCHAR(20) NULL")),
                () -> assertTrue(createTables.contains("status ENUM('正常', '禁用')")),
                () -> assertFalse(createTables.contains("permission_level")),
                () -> assertFalse(testData.contains("INSERT INTO freeze_record")),
                () -> assertFalse(testData.contains("INSERT INTO blacklist")),
                () -> assertFalse(testData.contains("permission_level"))
        );
    }

    private int seedInvestorSecurityAndFund(String secAccNo, String fundAccNo) {
        return registry.transactionManager().execute(connection -> {
            insertStaff(connection);
            int investorId = registry.investorDao().create(connection, new Investor(
                    null,
                    InvestorType.PERSONAL,
                    "Test User " + secAccNo,
                    "女",
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
                    null
            ));
            assertTrue(registry.securityAccountDao().create(connection, new SecurityAccount(
                    secAccNo,
                    investorId,
                    AccountStatus.NORMAL,
                    LocalDate.of(2026, 6, 15),
                    null
            )));
            assertTrue(registry.fundAccountDao().create(connection, new FundAccount(
                    fundAccNo,
                    secAccNo,
                    "trade-hash",
                    "withdraw-hash",
                    new BigDecimal("1000.00"),
                    BigDecimal.ZERO,
                    "CNY",
                    AccountStatus.NORMAL,
                    LocalDate.of(2026, 6, 15),
                    LocalDate.of(2025, 6, 30),
                    new BigDecimal("0.0035")
            )));
            return investorId;
        });
    }

    private void insertStaff(Connection connection) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                insert into staff (staff_id, username, password_hash, status, created_at)
                values (?, ?, ?, ?, ?)
                """)) {
            statement.setInt(1, 1);
            statement.setString(2, "staff01");
            statement.setString(3, "hash1");
            statement.setString(4, NORMAL);
            statement.setTimestamp(5, java.sql.Timestamp.valueOf(LocalDateTime.of(2026, 6, 15, 8, 0)));
            statement.executeUpdate();
        }
    }

    private Connection openConnection() throws SQLException {
        return DriverManager.getConnection(jdbcUrl, "sa", "");
    }

    private void createSchema(Connection connection) throws SQLException {
        List<String> statements = List.of(
                """
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
                """,
                """
                create table staff (
                    staff_id int auto_increment primary key,
                    username varchar(50) not null unique,
                    password_hash varchar(128) not null,
                    status varchar(20) not null default '正常',
                    created_at timestamp default current_timestamp not null
                )
                """,
                """
                create table security_account (
                    sec_acc_no varchar(20) primary key,
                    investor_id int not null,
                    status varchar(20) not null,
                    open_date date not null,
                    linked_fund_acc varchar(20) unique,
                    foreign key (investor_id) references investor(investor_id)
                )
                """,
                """
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
                """,
                "alter table security_account add constraint fk_security_linked_fund foreign key (linked_fund_acc) references fund_account(fund_acc_no)",
                """
                create table fund_transaction_log (
                    log_id bigint auto_increment primary key,
                    fund_acc_no varchar(20) not null,
                    txn_type varchar(20) not null,
                    amount decimal(15,2) not null,
                    available_after decimal(15,2) not null,
                    frozen_after decimal(15,2) not null,
                    ref_order_id varchar(50),
                    operator_id int,
                    txn_time timestamp default current_timestamp not null,
                    foreign key (fund_acc_no) references fund_account(fund_acc_no),
                    foreign key (operator_id) references staff(staff_id)
                )
                """,
                """
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
                """,
                """
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
                    txn_time timestamp default current_timestamp not null,
                    foreign key (sec_acc_no) references security_account(sec_acc_no)
                )
                """,
                """
                create table operation_log (
                    log_id bigint auto_increment primary key,
                    staff_id int not null,
                    operation_type varchar(50) not null,
                    target_type varchar(50),
                    target_id varchar(50),
                    detail varchar(500),
                    operation_time timestamp default current_timestamp not null,
                    foreign key (staff_id) references staff(staff_id)
                )
                """
        );
        try (Statement statement = connection.createStatement()) {
            for (String sql : statements) {
                statement.execute(sql);
            }
        }
    }
}
