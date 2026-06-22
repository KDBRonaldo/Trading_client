package account.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import lombok.Data;

@Data
public class ClientDepositRequest {
    @NotBlank @JsonProperty("fund_acc_no") private String fundAccNo;
    @NotBlank @JsonProperty("auth_token") private String authToken;
    @NotNull @DecimalMin(value = "0.01") @JsonProperty("amount") private BigDecimal amount;
}
