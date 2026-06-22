package account.service;

import account.common.BusinessException;
import account.common.ErrorCode;
import account.service.api.ClientAuthTokenService;
import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ClientAuthTokenServiceTest {

    @Test
    void issuedTokenAllowsMatchingFundAndSecurityAccess() {
        InMemoryClientAuthTokenService service = new InMemoryClientAuthTokenService(
                7200,
                Clock.fixed(Instant.parse("2026-06-18T08:00:00Z"), ZoneId.of("Asia/Shanghai"))
        );

        String token = service.issueToken("FA2026000001", "SA2026000001");

        ClientAuthTokenService.AuthSession fundSession = service.requireFundAccess(token, "FA2026000001");
        ClientAuthTokenService.AuthSession secSession = service.requireSecurityAccess(token, "SA2026000001");

        assertNotNull(token);
        assertEquals("FA2026000001", fundSession.fundAccNo());
        assertEquals("SA2026000001", secSession.secAccNo());
    }

    @Test
    void wrongBindingOrMissingTokenIsRejected() {
        InMemoryClientAuthTokenService service = new InMemoryClientAuthTokenService(
                7200,
                Clock.fixed(Instant.parse("2026-06-18T08:00:00Z"), ZoneId.of("Asia/Shanghai"))
        );
        String token = service.issueToken("FA2026000001", "SA2026000001");

        BusinessException wrongFund = assertThrows(
                BusinessException.class,
                () -> service.requireFundAccess(token, "FA2026000002")
        );
        BusinessException missing = assertThrows(
                BusinessException.class,
                () -> service.requireSecurityAccess("", "SA2026000001")
        );

        assertEquals(ErrorCode.ERR_018, wrongFund.getErrorCode());
        assertEquals(ErrorCode.ERR_018, missing.getErrorCode());
    }

    @Test
    void invalidatingFundAccountRemovesOldSessions() {
        InMemoryClientAuthTokenService service = new InMemoryClientAuthTokenService(
                7200,
                Clock.fixed(Instant.parse("2026-06-18T08:00:00Z"), ZoneId.of("Asia/Shanghai"))
        );
        String token = service.issueToken("FA2026000001", "SA2026000001");

        service.invalidateByFundAccount("FA2026000001");

        BusinessException ex = assertThrows(
                BusinessException.class,
                () -> service.requireFundAccess(token, "FA2026000001")
        );
        assertEquals(ErrorCode.ERR_018, ex.getErrorCode());
    }
}
