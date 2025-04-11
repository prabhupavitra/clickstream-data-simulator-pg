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

import { IVpc, SubnetSelection } from 'aws-cdk-lib/aws-ec2';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { RedshiftOdsTables } from '../analytics-on-redshift';

export interface LoadDataConfig {
  readonly maxFilesLimit: number;
}

interface BucketInfo {
  readonly s3Bucket: IBucket;
  readonly prefix: string;
}

export type ODSSource = BucketInfo & {
  readonly fileSuffix: string;
}

export interface TablesODSSource {
  readonly event_v2: ODSSource;
  readonly item_v2: ODSSource;
  readonly user_v2: ODSSource;
  readonly session: ODSSource;
}

export type WorkflowBucketInfo = BucketInfo;

export type ScanMetadataWorkflowData = {
  readonly clickstreamAnalyticsMetadataDdbArn: string;
  readonly topFrequentPropertiesLimit: string;
  readonly scanWorkflowMinInterval: string;
  readonly pipelineS3Bucket: string;
  readonly pipelineS3Prefix: string;
}

export type ClearExpiredEventsWorkflowData = {
  readonly scheduleExpression: string;
  readonly retentionRangeDays: number;
}

interface RedshiftProps {
  readonly databaseName: string;
}

export interface RedshiftServerlessProps extends RedshiftProps {
  readonly workgroupName: string;
}

export interface NewRedshiftServerlessProps extends RedshiftServerlessProps {
  readonly vpcId: string;
  readonly subnetIds: string;
  readonly securityGroupIds: string;
  readonly baseCapacity: number;
}

export interface BasicRedshiftServerlessProps extends RedshiftServerlessProps {
  readonly workgroupId?: string;
  readonly namespaceId?: string;
  readonly createdInStack: boolean;
}

export interface ExistingRedshiftServerlessProps extends BasicRedshiftServerlessProps {
  readonly dataAPIRoleArn: string;
}

export interface ProvisionedRedshiftProps extends RedshiftProps {
  readonly clusterIdentifier: string;
  readonly dbUser: string;
}

export type ExistingRedshiftServerlessCustomProps = Omit<ExistingRedshiftServerlessProps, 'createdInStack'>;
export interface CustomProperties {
  readonly serverlessRedshiftProps?: ExistingRedshiftServerlessCustomProps;
  readonly provisionedRedshiftProps?: ProvisionedRedshiftProps;
}

type SQLBasic = {
  readonly multipleLine?: 'true' | 'false';
  readonly type?: 'mv' | 'sp' | 'table' | 'view' | 'custom-mv';
  readonly scheduleRefresh?: 'true' | 'false';
  readonly timezoneSensitive?: 'true' | 'false';
}

export type SQLDef = SQLBasic & {
  readonly sqlFile: string;
}

export type SQLViewDef = SQLBasic & {
  readonly viewName: string;
  readonly spName?: string;
}

export type CreateDatabaseAndSchemas = CustomProperties & {
  readonly projectId: string;
  readonly appIds: string;
  readonly odsTableNames: RedshiftOdsTables;
  readonly databaseName: string;
  readonly dataAPIRole: string;
  readonly redshiftBIUserParameter: string;
  readonly redshiftBIUsernamePrefix: string;
  readonly reportingViewsDef: SQLViewDef[];
  readonly schemaDefs: SQLDef[];
  readonly schemaHash: string;
  readonly timezoneWithAppId: string;
}
export type CreateMappingRoleUser = Omit<CustomProperties, 'provisionedRedshiftProps'> & {
  readonly dataRoleName: string;
  readonly lambdaCodeHash: string;
}

export type AssociateIAMRoleToRedshift = CustomProperties & {
  readonly roleArn: string;
  readonly timeoutInSeconds: number;
}

export interface NewWorkgroupProperties {
  readonly workgroupName: string;
  readonly baseCapacity: number;
  readonly namespaceName: string;
  readonly securityGroupIds: string[];
  readonly subnetIds: string[];
  readonly publiclyAccessible: false;
}
export interface RedshiftServerlessWorkgroupProps {
  readonly vpc: IVpc;
  readonly subnetSelection: SubnetSelection;
  readonly securityGroupIds: string;
  readonly baseCapacity: number;
  readonly workgroupName: string;
  readonly databaseName: string;
  readonly projectId: string;
}
export type NewNamespaceCustomProperties = RedshiftProps & {
  readonly adminRoleArn: string;
  readonly namespaceName: string;
}

export interface ManifestItem {
  readonly url: string;
  readonly meta: {
    readonly content_length: number;
  };
}

export interface ManifestBody {
  readonly appId: string;
  readonly manifestFileName: string;
  readonly retryCount: number;
  readonly jobList: {
    readonly entries: Array<ManifestItem>;
  };
}

export interface UpsertUsersBody {
  readonly appId: string;
}

export interface StoreMetadataBody {
  readonly appId: string;
}

export type CheckUpsertStatusEventDetail = {
  id: string;
  appId: string;
  status: string;
}

export type CheckScanMetadataStatusEventDetail = {
  id: string;
  appId: string;
  status: string;
}

export interface ClearExpiredEventsBody {
  readonly appId: string;
  readonly retentionRangeDays: number;
}

export type ClearExpiredEventsEventDetail = {
  id: string;
  appId: string;
  status: string;
}

export type MustacheParamBaseType = {
  [key: string]: string;
}

export type MustacheParamType = {
  database_name: string;
  schema: string;
  sp_scan_metadata: string;
  sp_merge_event_v2: string;
  sp_merge_item_v2: string;
  sp_merge_session: string;
  sp_merge_user_v2: string;
  sp_clickstream_log: string;
  sp_clickstream_log_non_atomic: string;
  table_clickstream_log: string;
  table_refresh_mv_sp_status: string;
  table_event_v2: string;
  table_item_v2: string;
  table_user_v2: string;
  table_session: string;
  user_bi?: string;
  baseView?: string;
  timezone?: string;
  category_device: string;
  category_geo: string;
  category_traffic_source: string;
  category_app_info: string;
  category_event_outer: string;
  category_screen_view: string;
  category_page_view: string;
  category_upgrade: string;
  category_search: string;
  category_outbound: string;
  category_session: string;
  category_sdk: string;
}