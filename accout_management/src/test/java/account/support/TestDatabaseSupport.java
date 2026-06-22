package account.support;

import account.dao.DaoRegistry;
import account.dao.model.DomainEnums;
import account.dao.model.DomainModels;
import account.service.PasswordUtil;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDate;
import java.time.LocalDateTime;

public final class TestDatabaseSupport {

    private static final String H2_USERNAME = "sa";
    private static final String H2_PASSWORD = "";

    private TestDatabaseSupport() {
    }

    public static void recreateSchema(String jdbcUrl) throws Exception {
        recreateSchema(jdbcUrl, H2_USERNAME, H2_PASSWORD);
    }

    public static void recreateSchema(String jdbcUrl, String username, String password) throws Exception {
        try (Connection connection = DriverManager.getConnection(jdbcUrl, username, password);
             Statement statement = connection.createStatement()) {
            boolean mysqlDialect = jdbcUrl.startsWith("jdbc:mysql:");
            if (mysqlDialect) {
                statement.execute("set foreign_key_checks = 0");
            }
            statement.execute("drop table if exists operation_log");
            statement.execute("drop table if exists holding_change_log");
            statement.execute("drop table if exists holding");
            statement.execute("drop table if exists fund_transaction_log");
            statement.execute("drop table if exists fund_account");
            statement.execute("drop table if exists login_certificate_state");
            statement.execute("drop table if exists security_account");
            statement.execute("drop table if exists staff");
            statement.execute("drop table if exists investor");

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
                    create table staff (
                        staff_id int primary key,
                        username varchar(50) not null unique,
                        password_hash varchar(128) not null,
                        status varchar(20) not null,
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
                    create table login_certificate_state (
                        state_id bigint auto_increment primary key,
                        subject_type varchar(20) not null,
                        subject_key varchar(50) not null,
                        certificate_verified boolean not null default false,
                        verified_at timestamp null,
                        created_at timestamp default current_timestamp not null,
                        updated_at timestamp default current_timestamp not null,
                        unique(subject_type, subject_key)
                    )
                    """);
            statement.execute("""
                    alter table security_account
                    add constraint fk_security_linked_fund
                    foreign key (linked_fund_acc) references fund_account(fund_acc_no)
                    """);
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
                        foreign key (fund_acc_no) references fund_account(fund_acc_no),
                        foreign key (operator_id) references staff(staff_id)
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
                        operation_time timestamp default current_timestamp not null,
                        foreign key (staff_id) references staff(staff_id)
                    )
                    """);
            if (mysqlDialect) {
                statement.execute("set foreign_key_checks = 1");
            }
        }
    }

    public static void insertStaff(String jdbcUrl, int staffId, String username, String password, String status) throws Exception {
        insertStaff(jdbcUrl, H2_USERNAME, H2_PASSWORD, staffId, username, password, status);
    }

    public static void insertStaff(
            String jdbcUrl,
            String jdbcUsername,
            String jdbcPassword,
            int staffId,
            String username,
            String password,
            String status
    ) throws Exception {
        try (Connection connection = DriverManager.getConnection(jdbcUrl, jdbcUsername, jdbcPassword);
             PreparedStatement statement = connection.prepareStatement("""
                     insert into staff (staff_id, username, password_hash, status, created_at)
                     values (?, ?, ?, ?, ?)
                     """)) {
            statement.setInt(1, staffId);
            statement.setString(2, username);
            statement.setString(3, PasswordUtil.hash(password));
            statement.setString(4, status);
            statement.setTimestamp(5, java.sql.Timestamp.valueOf(LocalDateTime.of(2026, 6, 19, 8, 0)));
            statement.executeUpdate();
        }
    }

    public static int seedInvestorSecurityFund(
            DaoRegistry registry,
            String secAccNo,
            String fundAccNo,
            String idNumber,
            BigDecimal availableBalance,
            BigDecimal frozenBalance
    ) {
        return registry.transactionManager().execute(connection -> {
            int investorId = registry.investorDao().create(connection, new DomainModels.Investor(
                    null,
                    DomainEnums.InvestorType.PERSONAL,
                    "Tester-" + secAccNo,
                    "\u7537",
                    "\u8eab\u4efd\u8bc1",
                    idNumber,
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
            registry.securityAccountDao().create(connection, new DomainModels.SecurityAccount(
                    secAccNo,
                    investorId,
                    DomainEnums.AccountStatus.NORMAL,
                    LocalDate.of(2026, 6, 19),
                    null
            ));
            registry.fundAccountDao().create(connection, new DomainModels.FundAccount(
                    fundAccNo,
                    secAccNo,
                    PasswordUtil.hash("trade123"),
                    PasswordUtil.hash("withdraw123"),
                    availableBalance,
                    frozenBalance,
                    "CNY",
                    DomainEnums.AccountStatus.NORMAL,
                    LocalDate.of(2026, 6, 19),
                    null,
                    new BigDecimal("0.0035")
            ));
            registry.securityAccountDao().bindFundAccount(connection, secAccNo, fundAccNo);
            return investorId;
        });
    }
}
