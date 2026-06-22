package account.service;

import account.dao.DaoRegistry;
import account.dao.model.DomainEnums.AccountStatus;
import account.dao.model.DomainEnums.FundTransactionType;
import account.dao.model.DomainEnums.InvestorType;
import account.dao.model.DomainModels.FundAccount;
import account.dao.model.DomainModels.FundTransactionLog;
import account.dao.model.DomainModels.HoldingChangeLog;
import account.dao.model.DomainModels.Investor;
import account.dao.model.DomainModels.SecurityAccount;
import account.dto.FundInfoResponse;
import account.dto.FundLogView;
import account.service.api.FundAccountService;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
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
import static org.junit.jupiter.api.Assertions.assertThrows;

class FundLogViewCompositionTest {

    private FundAccountService service;

    @BeforeEach
    void setUp() throws Exception {
        String jdbcUrl = "jdbc:h2:mem:fund_log_" + UUID.randomUUID() + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
        DaoRegistry registry = DaoRegistry.forDriverManager(jdbcUrl, "sa", "");
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
                        txn_time timestamp default current_timestamp not null,
                        foreign key (fund_acc_no) references fund_account(fund_acc_no)
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
                        txn_time timestamp default current_timestamp not null,
                        foreign key (sec_acc_no) references security_account(sec_acc_no)
                    )
                    """);
            statement.execute("""
                    create table operation_log (
                        log_id bigint auto_increment primary key,
                        staff_id int not null,
                        operation_type varchar(50) not null,
                        target_type varchar(50),
                        target_id varchar(50),
                        detail varchar(500),
                        operation_time timestamp default current_timestamp not null
                    )
                    """);
        }

        registry.transactionManager().execute(connection -> {
            int investorId = registry.investorDao().create(connection, new Investor(
                    null, InvestorType.PERSONAL, "Test User", "男", "身份证", "330101199001010011",
                    "13800000000", "Hangzhou", "ZJU", null, null,
                    null, null, null, null, null, null, null, null, LocalDateTime.now()
            ));
            registry.securityAccountDao().create(connection, new SecurityAccount(
                    "SA2026000099", investorId, AccountStatus.NORMAL, LocalDate.of(2026, 6, 19), null
            ));
            registry.fundAccountDao().create(connection, new FundAccount(
                    "FA2026000099", "SA2026000099", PasswordUtil.hash("trade123"), PasswordUtil.hash("withdraw123"),
                    new BigDecimal("1000.00"), BigDecimal.ZERO, "CNY",
                    AccountStatus.NORMAL, LocalDate.of(2026, 6, 19), null, new BigDecimal("0.0035")
            ));
            registry.securityAccountDao().bindFundAccount(connection, "SA2026000099", "FA2026000099");
            registry.fundTransactionLogDao().create(connection, new FundTransactionLog(
                    null, "FA2026000099", FundTransactionType.BUY_FREEZE,
                    new BigDecimal("500.00"), new BigDecimal("500.00"), new BigDecimal("500.00"),
                    "ORD-99", null, LocalDateTime.of(2026, 6, 19, 9, 0)
            ));
            registry.holdingChangeLogDao().create(connection, new HoldingChangeLog(
                    null, "SA2026000099", "600519", "贵州茅台", "ORD-99", "买入增加", 100,
                    new BigDecimal("1500.0000"), 100, 0, new BigDecimal("1500.0000"),
                    LocalDateTime.of(2026, 6, 19, 9, 1)
            ));
            return null;
        });

        service = new FundAccountServiceImpl(
                registry,
                userName -> false,
                new InMemoryClientAuthTokenService(
                        7200,
                        Clock.fixed(Instant.parse("2026-06-19T08:00:00Z"), ZoneId.of("Asia/Shanghai"))
                )
        );
    }

    @Test
    void queryFundInfoIncludesHoldingFieldsInUnifiedLogs() {
        FundInfoResponse response = service.queryFundInfo("FA2026000099", "330101199001010011", true, null);

        FundLogView view = response.getLogs().get(0);
        assertEquals("ORD-99", view.getRefOrderId());
        assertEquals("600519", view.getStockCode());
        assertEquals("贵州茅台", view.getStockName());
        assertEquals("买入增加", view.getHoldingChangeType());
        assertEquals(100, view.getShareQuantity());
        assertEquals(new BigDecimal("1500.0000"), view.getPrice());
        assertEquals(100, view.getHoldingQuantityAfter());
        assertEquals(0, view.getHoldingFrozenQuantityAfter());
    }

    @Test
    void queryFundLogsReturnsRecentLogs() {
        var logs = service.queryFundLogs("FA2026000099", "330101199001010011", 20, null);

        assertEquals(1, logs.size());
        FundLogView view = logs.get(0);
        assertEquals("ORD-99", view.getRefOrderId());
        assertEquals("600519", view.getStockCode());
        assertEquals("贵州茅台", view.getStockName());
    }

    @Test
    void queryFundLogsRejectsMismatchedIdentity() {
        assertThrows(
                account.common.BusinessException.class,
                () -> service.queryFundLogs("FA2026000099", "330101199001010099", 20, null)
        );
    }
}
