package account.support;

import account.dao.DaoRegistry;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Assumptions;

public final class RealMySqlTestSupport {

    private static final String DEFAULT_HOST = "localhost";
    private static final String DEFAULT_PORT = "3306";
    private static final String DEFAULT_DATABASE = "account_db_it";
    private static final String DEFAULT_USERNAME = "";
    private static final String DEFAULT_PASSWORD = "";
    private static final String URL_SUFFIX = "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=utf-8";
    private static final AtomicLong DATABASE_SEQUENCE = new AtomicLong(System.nanoTime());
    private static final ThreadLocal<String> CURRENT_DATABASE = new ThreadLocal<>();

    private RealMySqlTestSupport() {
    }

    public static void assumeAvailable() {
        Assumptions.assumeTrue(isAvailable(), "Local MySQL is unavailable for real integration tests");
    }

    public static boolean isAvailable() {
        try (Connection ignored = DriverManager.getConnection(jdbcUrl(), username(), password())) {
            return true;
        } catch (Exception ignored) {
            try (Connection serverConnection = DriverManager.getConnection(serverJdbcUrl(), username(), password())) {
                return true;
            } catch (Exception secondIgnored) {
                return false;
            }
        }
    }

    public static void recreateDatabase() throws Exception {
        String database = nextDatabaseName();
        validateDatabaseName(database);
        try (Connection connection = DriverManager.getConnection(serverJdbcUrl(), username(), password());
             Statement statement = connection.createStatement()) {
            statement.execute("drop database if exists `" + database + "`");
            statement.execute("create database if not exists `" + database + "` character set utf8mb4 collate utf8mb4_unicode_ci");
        }
        CURRENT_DATABASE.set(database);
        TestDatabaseSupport.recreateSchema(jdbcUrl(), username(), password());
    }

    public static DaoRegistry createRegistry() {
        return DaoRegistry.forDriverManager(jdbcUrl(), username(), password());
    }

    public static void insertStaff(int staffId, String username, String password, String status) throws Exception {
        TestDatabaseSupport.insertStaff(jdbcUrl(), username(), password(), staffId, username, password, status);
    }

    public static String jdbcUrl() {
        return "jdbc:mysql://" + host() + ":" + port() + "/" + currentDatabaseName() + URL_SUFFIX;
    }

    private static String serverJdbcUrl() {
        return "jdbc:mysql://" + host() + ":" + port() + "/" + URL_SUFFIX;
    }

    private static String host() {
        return System.getProperty("account.test.mysql.host", DEFAULT_HOST);
    }

    private static String port() {
        return System.getProperty("account.test.mysql.port", DEFAULT_PORT);
    }

    private static String databaseName() {
        return System.getProperty("account.test.mysql.database", DEFAULT_DATABASE);
    }

    private static String currentDatabaseName() {
        String currentDatabase = CURRENT_DATABASE.get();
        return currentDatabase == null ? databaseName() : currentDatabase;
    }

    private static String nextDatabaseName() {
        return databaseName() + "_" + DATABASE_SEQUENCE.incrementAndGet();
    }

    private static String username() {
        return System.getProperty("account.test.mysql.username", DEFAULT_USERNAME);
    }

    private static String password() {
        return System.getProperty("account.test.mysql.password", DEFAULT_PASSWORD);
    }

    private static void validateDatabaseName(String databaseName) {
        String normalized = databaseName.toLowerCase(Locale.ROOT);
        if (!normalized.matches("[a-z0-9_]+")) {
            throw new IllegalArgumentException("Unsupported MySQL test database name: " + databaseName);
        }
    }
}
