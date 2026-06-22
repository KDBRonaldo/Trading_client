package account.controller.internal;

import account.common.AuthHeaders;
import account.common.Result;
import account.dao.DaoRegistry;
import account.dao.model.DomainModels;
import account.dto.DashboardStatsResponse;
import account.dto.OperationLogView;
import account.service.OperationLogViewMapper;
import account.service.api.FundAccountService;
import account.service.api.SecurityAccountService;
import account.service.api.StaffAuthTokenService;
import java.time.LocalDate;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Slf4j
@RestController
@RequestMapping("/api/internal/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final DaoRegistry dao;
    private final SecurityAccountService securityAccountService;
    private final FundAccountService fundAccountService;
    private final StaffAuthTokenService staffAuthTokenService;
    private final OperationLogViewMapper operationLogViewMapper;

    @GetMapping("/stats")
    public Result<DashboardStatsResponse> getStats(
            @RequestHeader(AuthHeaders.STAFF_AUTH_TOKEN) String authToken) {
        Integer staffId = requireStaffId(authToken);
        log.info("[getStats] staff_id={}", staffId);

        var securityAccounts = securityAccountService.listAllSecurityAccounts();
        var fundAccounts = fundAccountService.listAllFundAccounts();
        String today = LocalDate.now().toString();

        long securityCount = securityAccounts.stream()
                .filter(account -> !"closed".equals(account.getStatus()))
                .count();
        long fundCount = fundAccounts.stream()
                .filter(account -> !"closed".equals(account.getStatus()))
                .count();
        long todayNewSec = securityAccounts.stream()
                .filter(account -> !"closed".equals(account.getStatus()))
                .filter(account -> today.equals(account.getOpenDate()))
                .count();
        long todayNewFund = fundAccounts.stream()
                .filter(account -> !"closed".equals(account.getStatus()))
                .filter(account -> today.equals(account.getOpenDate()))
                .count();
        long abnormalCount = securityAccounts.stream()
                .filter(account -> "frozen".equals(account.getStatus()))
                .count()
                + fundAccounts.stream()
                .filter(account -> "frozen".equals(account.getStatus()))
                .count();

        return Result.success(DashboardStatsResponse.builder()
                .securityAccountCount(securityCount)
                .fundAccountCount(fundCount)
                .todayNewAccounts(todayNewSec + todayNewFund)
                .abnormalAccountCount(abnormalCount)
                .build());
    }

    @GetMapping("/recent-logs")
    public Result<List<OperationLogView>> getRecentLogs(
            @RequestHeader(AuthHeaders.STAFF_AUTH_TOKEN) String authToken,
            @RequestParam(defaultValue = "10") int limit) {
        Integer staffId = requireStaffId(authToken);
        log.info("[getRecentLogs] staff_id={} limit={}", staffId, limit);

        int safeLimit = Math.max(1, Math.min(limit, 50));
        List<DomainModels.OperationLog> logs = dao.operationLogDao().query(
                new DomainModels.OperationLogQuery(staffId, null, null, null, null, null, safeLimit, 0)
        );
        List<OperationLogView> views = logs.stream()
                .map(operationLogViewMapper::toView)
                .toList();

        return Result.success(views);
    }

    private Integer requireStaffId(String authToken) {
        return staffAuthTokenService.requireAccess(authToken).staffId();
    }
}
