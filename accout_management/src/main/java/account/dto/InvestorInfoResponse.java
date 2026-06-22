package account.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class InvestorInfoResponse {

    @JsonProperty("investor_id")
    private Integer investorId;

    @JsonProperty("name")
    private String name;

    @JsonProperty("gender")
    private String gender;

    @JsonProperty("id_type")
    private String idType;

    @JsonProperty("id_number")
    private String idNumber;

    @JsonProperty("phone")
    private String phone;

    @JsonProperty("address")
    private String address;

    @JsonProperty("work_unit")
    private String workUnit;

    @JsonProperty("occupation")
    private String occupation;

    @JsonProperty("education")
    private String education;

    @JsonProperty("legal_number")
    private String legalNumber;

    @JsonProperty("business_license")
    private String businessLicense;

    @JsonProperty("authorize_name")
    private String authorizeName;

    @JsonProperty("authorize_phone")
    private String authorizePhone;

    @JsonProperty("authorize_address")
    private String authorizeAddress;

    @JsonProperty("executor_name")
    private String executorName;

    @JsonProperty("agent_name")
    private String agentName;

    @JsonProperty("agent_id_number")
    private String agentIdNumber;
}
