package account.integration;

import account.dao.DaoRegistry;
import account.dao.model.DomainEnums.AccountStatus;
import account.dao.model.DomainEnums.InvestorType;
import account.dao.model.DomainModels.FundAccount;
import account.dao.model.DomainModels.Investor;
import account.dao.model.DomainModels.SecurityAccount;
import account.service.AccountBlacklistSupport;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BlacklistSupportTest {

    private DaoRegistry registry;
    private String jdbcUrl;
    private HttpServer server;
    private String blacklistBaseUrl;

    @BeforeEach
    void setUp() throws Exception {
        startServer();
        jdbcUrl = "jdbc:h2:mem:blacklist_" + UUID.randomUUID() + ";MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1";
        registry = DaoRegistry.forDriverManager(jdbcUrl, "sa", "");
        try (Connection connection = openConnection()) {
            createSchema(connection);
        }
        seedAccounts();
    }

    @AfterEach
    void tearDown() {
        if (server != null) {
            server.stop(0);
        }
    }

    @Test
    void httpBlacklistClientChecksBlockedAndUnblockedUsers() {
        BlacklistClient client = HttpBlacklistClient.forBaseUrl(blacklistBaseUrl);

        assertTrue(client.isBlocked("张三"));
        assertFalse(client.isBlocked("李四"));
    }

    @Test
    void accountBlacklistSupportResolvesNamesFromSecurityAndFundAccounts() {
        AccountBlacklistSupport support = registry.blacklistSupport(HttpBlacklistClient.forBaseUrl(blacklistBaseUrl));

        assertEquals(Optional.of("张三"), support.findUserNameBySecurityAccountNo("SA2026000001"));
        assertEquals(Optional.of("李四"), support.findUserNameByFundAccountNo("FA2026000002"));
        assertTrue(support.isBlockedBySecurityAccountNo("SA2026000001"));
        assertFalse(support.isBlockedByFundAccountNo("FA2026000002"));
    }

    @Test
    void httpBlacklistClientPropagatesRemoteFailureMessage() {
        BlacklistClient client = HttpBlacklistClient.forBaseUrl(blacklistBaseUrl);

        BlacklistClientException exception = assertThrows(
                BlacklistClientException.class,
                () -> client.isBlocked("系统故障")
        );

        assertEquals("交易管理系统暂时不可用", exception.getMessage());
    }

    private void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress(0), 0);
        server.createContext("/api/trade-management/blacklist/check", new BlacklistHandler());
        server.start();
        blacklistBaseUrl = "http://localhost:" + server.getAddress().getPort();
    }

    private void seedAccounts() {
        registry.transactionManager().execute(connection -> {
            int investorOneId = registry.investorDao().create(connection, new Investor(
                    null,
                    InvestorType.PERSONAL,
                    "张三",
                    "男",
                    "身份证",
                    "330101199001010011",
                    "13800000001",
                    "杭州",
                    "浙大",
                    "工程师",
                    "本科",
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
            int investorTwoId = registry.investorDao().create(connection, new Investor(
                    null,
                    InvestorType.PERSONAL,
                    "李四",
                    "女",
                    "身份证",
                    "330102199202020022",
                    "13800000002",
                    "杭州",
                    "学校",
                    "教师",
                    "硕士",
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
                    "SA2026000001",
                    investorOneId,
                    AccountStatus.NORMAL,
                    LocalDate.of(2026, 6, 18),
                    null
            ));
            registry.securityAccountDao().create(connection, new SecurityAccount(
                    "SA2026000002",
                    investorTwoId,
                    AccountStatus.NORMAL,
                    LocalDate.of(2026, 6, 18),
                    null
            ));

            registry.fundAccountDao().create(connection, new FundAccount(
                    "FA2026000001",
                    "SA2026000001",
                    "trade-hash-1",
                    "withdraw-hash-1",
                    new java.math.BigDecimal("1000.00"),
                    java.math.BigDecimal.ZERO,
                    "CNY",
                    AccountStatus.NORMAL,
                    LocalDate.of(2026, 6, 18),
                    LocalDate.of(2025, 6, 30),
                    new java.math.BigDecimal("0.0035")
            ));
            registry.fundAccountDao().create(connection, new FundAccount(
                    "FA2026000002",
                    "SA2026000002",
                    "trade-hash-2",
                    "withdraw-hash-2",
                    new java.math.BigDecimal("2000.00"),
                    java.math.BigDecimal.ZERO,
                    "CNY",
                    AccountStatus.NORMAL,
                    LocalDate.of(2026, 6, 18),
                    LocalDate.of(2025, 6, 30),
                    new java.math.BigDecimal("0.0035")
            ));
            return null;
        });
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
                """
        );
        try (Statement statement = connection.createStatement()) {
            for (String sql : statements) {
                statement.execute(sql);
            }
        }
    }

    private static final class BlacklistHandler implements HttpHandler {

        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String userName = readUserName(exchange.getRequestURI().getRawQuery());
            String body;
            if (userName == null || userName.isBlank()) {
                body = "{\"success\":false,\"data\":null,\"message\":\"缺少必填参数 userName\"}";
            } else if ("张三".equals(userName)) {
                body = "{\"success\":true,\"data\":true}";
            } else if ("系统故障".equals(userName)) {
                body = "{\"success\":false,\"data\":null,\"message\":\"交易管理系统暂时不可用\"}";
            } else {
                body = "{\"success\":true,\"data\":false}";
            }
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json; charset=UTF-8");
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        }

        private String readUserName(String rawQuery) {
            if (rawQuery == null || rawQuery.isBlank()) {
                return null;
            }
            for (String pair : rawQuery.split("&")) {
                String[] parts = pair.split("=", 2);
                if (parts.length == 2 && "userName".equals(parts[0])) {
                    return URLDecoder.decode(parts[1], StandardCharsets.UTF_8);
                }
            }
            return null;
        }
    }
}
