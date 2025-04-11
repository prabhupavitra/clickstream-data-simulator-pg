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

import { PROJECT_CONFIG_JSON, ZH_LANGUAGE_LIST } from './const';

const CONSOLE_CHINA_DOMAIN = 'console.amazonaws.cn';
const CONSOLE_GLOBAL_DOMAIN = 'console.aws.amazon.com';

export const PIPELINE_QUICKSIGHT_GUIDE_LINK =
  'https://docs.aws.amazon.com/quicksight/latest/user/signing-up.html';

export const PIPELINE_SINK_CONNECTOR_LINK =
  'https://www.confluent.io/hub/confluentinc/kafka-connect-s3';
export const PIPELINE_SINK_CONNECTOR_GUIDE =
  'https://docs.aws.amazon.com/msk/latest/developerguide/mkc-S3sink-connector-example.html';

export const SOLUTION_DOCUMENTS_DOMAIN_EN =
  'https://docs.aws.amazon.com/solutions/latest/clickstream-analytics-on-aws';
export const SOLUTION_DOCUMENTS_DOMAIN_CN =
  'https://awslabs.github.io/clickstream-analytics-on-aws/';

export const SUBMMIT_ISSUE_LINK =
  'https://github.com/awslabs/clickstream-analytics-on-aws/issues';

export const getSolutionVersion = () => {
  const configJSONObj: ConfigType = JSON.parse(
    localStorage.getItem(PROJECT_CONFIG_JSON) || '{}'
  );
  const parts = configJSONObj?.solution_version
    ?.replace(/[^0-9.]/g, '')
    ?.split('.');
  let docVersion = 'latest';
  if (parts?.length >= 2) {
    const majorVersion = `${parts[0]}.${parts[1]}`;
    docVersion = majorVersion + '.x';
  }
  return docVersion;
};

export const buildDocumentLink = (lang: string, suffix: string) => {
  let urlLang = 'en';
  if (ZH_LANGUAGE_LIST.includes(lang)) {
    urlLang = 'zh';
  }
  return `${SOLUTION_DOCUMENTS_DOMAIN_CN}${urlLang}/${getSolutionVersion()}${suffix}`;
};

export const buildVPCLink = (region: string, vpcId: string): string => {
  if (region.startsWith('cn')) {
    return `https://${region}.${CONSOLE_CHINA_DOMAIN}/vpc/home?region=${region}#vpcs:VpcId=${vpcId}`;
  }
  return `https://${region}.${CONSOLE_GLOBAL_DOMAIN}/vpc/home?region=${region}#vpcs:VpcId=${vpcId}`;
};

const getDirPrefixByPrefixStr = (prefix: string) => {
  if (prefix && prefix.indexOf('/') >= 0) {
    const slashPos = prefix.lastIndexOf('/');
    prefix = prefix.slice(0, slashPos + 1);
  }
  return prefix;
};

export const buildS3Link = (
  region: string,
  bucketName: string,
  prefix?: string
): string => {
  if (region.startsWith('cn')) {
    if (prefix) {
      const resPrefix = getDirPrefixByPrefixStr(prefix);
      if (resPrefix.endsWith('/')) {
        return `https://${CONSOLE_CHINA_DOMAIN}/s3/buckets/${bucketName}?region=${region}&prefix=${resPrefix}`;
      }
    }
    return `https://${CONSOLE_CHINA_DOMAIN}/s3/buckets/${bucketName}`;
  }
  if (prefix) {
    const resPrefix = getDirPrefixByPrefixStr(prefix);
    if (resPrefix.endsWith('/')) {
      return `https://s3.${CONSOLE_GLOBAL_DOMAIN}/s3/buckets/${bucketName}?region=${region}&prefix=${resPrefix}`;
    }
  }
  return `https://s3.${CONSOLE_GLOBAL_DOMAIN}/s3/buckets/${bucketName}`;
};

export const buildSubnetLink = (region: string, subnetId: string): string => {
  if (region.startsWith('cn')) {
    return `https://${region}.${CONSOLE_CHINA_DOMAIN}/vpc/home?region=${region}#subnets:subnetId=${subnetId}`;
  }
  return `https://${region}.${CONSOLE_GLOBAL_DOMAIN}/vpc/home?region=${region}#subnets:subnetId=${subnetId}`;
};

export const buildRedshiftLink = (
  region: string,
  cluster: string,
  type: string
) => {
  let domainSuffix = CONSOLE_GLOBAL_DOMAIN;
  if (region.startsWith('cn')) {
    domainSuffix = CONSOLE_CHINA_DOMAIN;
  }
  let query = `region=${region}#cluster-details?cluster=${cluster}`;
  if (type === 'serverless') {
    query = `region=${region}#serverless-dashboard`;
  }
  return `https://${region}.${domainSuffix}/redshiftv2/home?${query}`;
};

export const buildSFNExecutionLink = (region: string, executionArn: string) => {
  if (region.startsWith('cn')) {
    return `https://${region}.${CONSOLE_CHINA_DOMAIN}/states/home?region=${region}#/v2/executions/details/${executionArn}`;
  }
  return `https://${region}.${CONSOLE_GLOBAL_DOMAIN}/states/home?region=${region}#/v2/executions/details/${executionArn}`;
};

export const buildQuickSightDashboardLink = (
  region: string,
  dashboardId: string
): string => {
  return `https://${region}.quicksight.aws.amazon.com/sn/dashboards/${dashboardId}`;
};

export const buildMetricsDashboardLink = (
  region: string,
  dashboardName: string
): string => {
  if (region.startsWith('cn')) {
    return `https://${region}.${CONSOLE_CHINA_DOMAIN}/cloudwatch/home?region=${region}#dashboards:name=${dashboardName}`;
  }
  return `https://${region}.${CONSOLE_GLOBAL_DOMAIN}/cloudwatch/home?region=${region}#dashboards:name=${dashboardName}`;
};

export const buildQuickSightSubscriptionLink = (): string => {
  return 'https://us-east-1.quicksight.aws.amazon.com/sn/start';
};

export const buildAlarmsLink = (region: string, projectId: string): string => {
  if (region.startsWith('cn')) {
    return `https://${region}.${CONSOLE_CHINA_DOMAIN}/cloudwatch/home?region=${region}#alarmsV2:?~(search~'Clickstream*7c${projectId})`;
  }
  return `https://${region}.${CONSOLE_GLOBAL_DOMAIN}/cloudwatch/home?region=${region}#alarmsV2:?~(search~'Clickstream*7c${projectId})`;
};

export const buildCloudFormationStackLink = (
  region: string,
  stackId: string
) => {
  if (region.startsWith('cn')) {
    return `https://${region}.${CONSOLE_CHINA_DOMAIN}/cloudformation/home?region=${region}#/stacks/stackinfo?stackId=${stackId}`;
  }
  return `https://${region}.${CONSOLE_GLOBAL_DOMAIN}/cloudformation/home?region=${region}#/stacks/stackinfo?stackId=${stackId}`;
};

export const buildUpdateCloudFormationStackLink = (
  region: string,
  stackId: string,
  newUrl: string
) => {
  let domainSuffix = CONSOLE_GLOBAL_DOMAIN;
  if (region.startsWith('cn')) domainSuffix = CONSOLE_CHINA_DOMAIN;

  return `https://${region}.${domainSuffix}/cloudformation/home?region=${region}#/stacks/update?stackId=${encodeURIComponent(
    stackId
  )}&templateURL=${encodeURIComponent(newUrl)}`;
};

export const buildMSKLink = (region: string, arn: string) => {
  if (region.startsWith('cn')) {
    return `https://${region}.${CONSOLE_CHINA_DOMAIN}/msk/home?region=${region}#/cluster/${arn}/view`;
  }
  return `https://${region}.${CONSOLE_GLOBAL_DOMAIN}/msk/home?region=${region}#/cluster/${arn}/view`;
};

export const buildSecurityGroupLink = (region: string, sgId: string) => {
  if (region.startsWith('cn')) {
    return `https://${region}.${CONSOLE_CHINA_DOMAIN}/ec2/home?region=${region}#SecurityGroup:securityGroupId=${sgId}`;
  }
  return `https://${region}.${CONSOLE_GLOBAL_DOMAIN}/ec2/home?region=${region}#SecurityGroup:securityGroupId=${sgId}`;
};

// Getting started link
export const getWorkshopLink = (lang: string) => {
  if (ZH_LANGUAGE_LIST.includes(lang)) {
    return `https://catalog.workshops.aws/clickstream/zh-CN`;
  }
  return `https://catalog.workshops.aws/clickstream/en-US`;
};

export const getWorkingWithRedshiftLink = (lang: string) => {
  if (ZH_LANGUAGE_LIST.includes(lang)) {
    return `https://docs.aws.amazon.com/zh_cn/redshift/latest/mgmt/working-with-serverless.html`;
  }
  return `https://docs.aws.amazon.com/redshift/latest/mgmt/working-with-serverless.html`;
};

export const getWorkingWithQuickSightLink = (lang: string) => {
  if (ZH_LANGUAGE_LIST.includes(lang)) {
    return `https://docs.aws.amazon.com/zh_cn/quicksight/latest/user/welcome.html`;
  }
  return `https://docs.aws.amazon.com/quicksight/latest/user/welcome.html`;
};
