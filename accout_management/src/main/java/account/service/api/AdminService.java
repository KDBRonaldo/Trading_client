package account.service.api;

import account.dto.AdminCloseSecurityAccountRequest;
import account.dto.AdminFreezeRequest;
import account.dto.SettleAnnualInterestRequest;
import account.dto.AdminAccountDetailsResponse;
import account.dto.AnnualInterestSettlementResponse;

public interface AdminService {

    AnnualInterestSettlementResponse settleAnnualInterest(SettleAnnualInterestRequest request);

    void adminFreezeAccount(AdminFreezeRequest request);

    void adminUnfreezeAccount(AdminFreezeRequest request);

    AdminAccountDetailsResponse adminGetAccountDetails(String accountNo, String adminId);

    void adminCloseSecurityAccount(AdminCloseSecurityAccountRequest request);
}
