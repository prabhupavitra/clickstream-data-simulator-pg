/**
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 *  Licensed under the Apache License, Version 2.0 (the "License"). You may not use this file except in compliance
 *  with the License. A copy of the License is located at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  or in the 'license' file accompanying this file. This file is distributed on an 'AS IS' BASIS, WITHOUT WARRANTIES
 *  OR CONDITIONS OF ANY KIND, express or implied. See the License for the specific language governing permissions
 *  and limitations under the License.
 */

package software.aws.solution.clickstream.common.enrich.ts.rule;

import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.Setter;
import lombok.ToString;
import software.aws.solution.clickstream.common.enrich.ts.TrafficSourceUtm;

@Getter
@Setter
@ToString
@EqualsAndHashCode
public class ChannelRuleEvaluatorInput {
    // traffic_source_category
    private String trafficSourceCategory; // NOSONAR
    // traffic_source_source
    private String trafficSourceSource;  // NOSONAR
    //traffic_source_medium
    private String trafficSourceMedium;  // NOSONAR
    // traffic_source_campaign
    private String trafficSourceCampaign;  // NOSONAR
    // traffic_source_content
    private String trafficSourceContent;  // NOSONAR
    // traffic_source_term
    private String trafficSourceTerm;  // NOSONAR
    // traffic_source_campaign_id
    private String trafficSourceCampaignId;  // NOSONAR
    // traffic_source_clid_platform
    private String trafficSourceClidPlatform;  // NOSONAR
    // traffic_source_clid
    private String trafficSourceClid;  // NOSONAR
    // page_view_latest_referrer
    private String pageViewLatestReferrer;  // NOSONAR
    // page_view_latest_referrer_host
    private String pageViewLatestReferrerHost;  // NOSONAR

    public static ChannelRuleEvaluatorInput from(final TrafficSourceUtm trafficSource,
                                                 final String trafficSourceCategory,
                                                 final String pageViewLatestReferrer,
                                                 final String pageViewLatestReferrerHost) {
        ChannelRuleEvaluatorInput evalInput = new ChannelRuleEvaluatorInput();
        evalInput.setTrafficSourceClidPlatform(trafficSource.getClidPlatform());
        evalInput.setTrafficSourceClid(trafficSource.getClid());
        evalInput.setTrafficSourceSource(trafficSource.getSource());
        evalInput.setTrafficSourceCampaign(trafficSource.getCampaign());
        evalInput.setTrafficSourceCampaignId(trafficSource.getCampaignId());
        evalInput.setTrafficSourceMedium(trafficSource.getMedium()==null? null:trafficSource.getMedium().replace("(", "").replace(")", ""));
        evalInput.setTrafficSourceContent(trafficSource.getContent());
        evalInput.setTrafficSourceTerm(trafficSource.getTerm());
        evalInput.setPageViewLatestReferrer(pageViewLatestReferrer);
        evalInput.setPageViewLatestReferrerHost(pageViewLatestReferrerHost);
        evalInput.setTrafficSourceCategory(trafficSourceCategory);
        return evalInput;
    }
}
