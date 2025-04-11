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

import { logger } from '@aws/clickstream-base-lib';
import { AnalysisSummary, DashboardSummary, InputColumn, QuickSight, RefreshInterval, ResourceNotFoundException, ResourceStatus, TimeGranularity, paginateListAnalyses, paginateListDashboards } from '@aws-sdk/client-quicksight';

export interface RedShiftProps {
  databaseSchemaNames: string;
};

export interface QuickSightProps {
  namespace: string;
  userName: string;
  sharePrincipalArn: string;
  ownerPrincipalArn: string;
};

export interface QuicksightCustomResourceProps {
  readonly templateArn: string;
  readonly templateId: string;
  readonly dataSourceArn: string;
  readonly databaseName: string;
  readonly timezone: string;
  readonly quickSightProps: QuickSightProps;
  readonly redshiftProps: RedShiftProps;
  readonly useSpice: string;
};

export interface NetworkInterfaceCheckCustomResourceProps {
  readonly networkInterfaces: string;
  readonly vpcConnectionId: string;
};

export type NetworkInterfaceCheckCustomResourceLambdaProps = {
  readonly awsRegion: string;
  readonly awsAccountId: string;
  readonly networkInterfaces: any[];
  readonly vpcConnectionId: string;
};

export interface QuicksightCustomResourceLambdaProps {
  readonly awsAccountId: string;
  readonly awsRegion: string;
  readonly awsPartition: string;
  readonly timezone: string;
  readonly quickSightNamespace: string;
  readonly quickSightUser: string;
  readonly quickSightSharePrincipalArn: string;
  readonly quickSightOwnerPrincipalArn: string;
  readonly schemas: string;
  readonly dashboardDefProps: QuickSightDashboardDefProps;
  readonly useSpice: string;
};

export interface TagColumnOperationProps {
  columnName: string;
  columnGeographicRoles: string[];
};

export interface ColumnGroupsProps {
  geoSpatialColumnGroupName: string;
  geoSpatialColumnGroupColumns: string[];
};

export interface DateTimeParameter {
  name: string;
  timeGranularity: TimeGranularity;
  defaultValue: Date;
};

export interface DataSetProps {
  tableName: string;
  columns: InputColumn[];
  useSpice: string;
  lookbackColumn?: string;
  refreshInterval?: RefreshInterval;
  columnGroups?: ColumnGroupsProps[];
  projectedColumns?: string[];
  tagColumnOperations?: TagColumnOperationProps[];
  customSql: string;
  dateTimeDatasetParameter?: DateTimeParameter[];
};

export interface QuickSightDashboardDefProps {
  dashboardName: string;
  analysisName: string;
  templateArn: string;
  templateId: string;
  dataSourceArn: string;
  databaseName: string;
  dataSets: DataSetProps[];
  dataSetsSpice: DataSetProps[];
};

export function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(() => resolve(), ms));
};

export async function waitForDataSetCreateCompleted(quickSight: QuickSight, accountId: string, datasetId: string) {
  for (const _i of Array(60).keys()) {
    try {
      const dataset = await quickSight.describeDataSet({
        AwsAccountId: accountId,
        DataSetId: datasetId,
      });

      if ( dataset.DataSet !== undefined && dataset.DataSet?.DataSetId !== undefined) {
        return;
      }
      logger.info('DataSetCreate: sleep 1 second');
      await sleep(1000);

    } catch (err: any) {
      logger.error(`Date set create failed due to ${(err as Error).message}`);
      throw err;
    }
  }
};

export async function waitForDataSourceChangeCompleted(quickSight: QuickSight, accountId: string, dataSourceId: string) {
  for (const _i of Array(60).keys()) {
    try {
      const dataSource = await quickSight.describeDataSource({
        AwsAccountId: accountId,
        DataSourceId: dataSourceId,
      });

      if ( dataSource.DataSource?.Status === ResourceStatus.UPDATE_SUCCESSFUL
        || dataSource.DataSource?.Status === ResourceStatus.CREATION_SUCCESSFUL) {
        return;
      } else if ( dataSource.DataSource?.Status === ResourceStatus.UPDATE_FAILED ) {
        throw new Error('Data source update failed.');
      } else if ( dataSource.DataSource?.Status === ResourceStatus.CREATION_FAILED ) {
        throw new Error('Data source create failed.');
      }

      logger.info('waitForDataSourceChangeCompleted: sleep 1 second');
      await sleep(1000);


    } catch (err: any) {
      logger.error(`Data source create/update failed due to ${(err as Error).message}`);
      throw err;
    }
  }
};

export async function waitForAnalysisChangeCompleted(quickSight: QuickSight, accountId: string, analysisId: string) {
  for (const _i of Array(60).keys()) {
    try {
      const analysis = await quickSight.describeAnalysisDefinition({
        AwsAccountId: accountId,
        AnalysisId: analysisId,
      });

      if ( analysis.ResourceStatus === ResourceStatus.UPDATE_SUCCESSFUL
        || analysis.ResourceStatus === ResourceStatus.CREATION_SUCCESSFUL) {
        return;
      } else if ( analysis.ResourceStatus === ResourceStatus.UPDATE_FAILED ) {
        throw new Error('Analysis update failed.');
      } else if ( analysis.ResourceStatus === ResourceStatus.CREATION_FAILED ) {
        throw new Error('Analysis create failed.');
      }

      logger.info('AnalysisUpdate: sleep 1 second');
      await sleep(1000);


    } catch (err: any) {
      logger.error(`Analysis create/update failed due to ${(err as Error).message}`);
      throw err;
    }
  }
};

export async function waitForTemplateChangeCompleted(quickSight: QuickSight, accountId: string, templateId: string) {
  for (const _i of Array(300).keys()) {
    try {
      const analysis = await quickSight.describeTemplateDefinition({
        AwsAccountId: accountId,
        TemplateId: templateId,
      });

      if ( analysis.ResourceStatus === ResourceStatus.UPDATE_SUCCESSFUL
        || analysis.ResourceStatus === ResourceStatus.CREATION_SUCCESSFUL) {
        return;
      } else if ( analysis.ResourceStatus === ResourceStatus.UPDATE_FAILED ) {
        throw new Error('Template update failed.');
      } else if ( analysis.ResourceStatus === ResourceStatus.CREATION_FAILED ) {
        throw new Error('Template create failed.');
      }

      logger.info('Template change: sleep 1 second');
      await sleep(1000);

    } catch (err: any) {
      logger.error(`Template create/update failed due to ${(err as Error).message}`);
      throw err;
    }
  }
};

export async function waitForDashboardChangeCompleted(quickSight: QuickSight, accountId: string, dashboardId: string) {
  for (const _i of Array(60).keys()) {
    try {
      const dashboard = await quickSight.describeDashboardDefinition({
        AwsAccountId: accountId,
        DashboardId: dashboardId,
      });

      logger.info(`dashboard status: ${dashboard.ResourceStatus}`);

      if ( dashboard.ResourceStatus === ResourceStatus.UPDATE_SUCCESSFUL
        || dashboard.ResourceStatus === ResourceStatus.CREATION_SUCCESSFUL) {
        return;
      } else if ( dashboard.ResourceStatus === ResourceStatus.UPDATE_FAILED ) {
        throw new Error('Dashboard update failed.');
      } else if ( dashboard.ResourceStatus === ResourceStatus.CREATION_FAILED ) {
        throw new Error('Dashboard create failed.');
      }
      logger.info('DashboardUpdate: sleep 1 second');
      await sleep(1000);

    } catch (err: any) {
      logger.error(`Dashboard create/update failed due to ${err}`);
      throw err;
    }
  }
};

export async function waitForDataSetDeleteCompleted(quickSight: QuickSight, accountId: string, datasetId: string) {
  for (const _i of Array(180).keys()) {
    try {
      await quickSight.describeDataSet({
        AwsAccountId: accountId,
        DataSetId: datasetId,
      });
      logger.info('delete dataset: sleep 1 second');
      await sleep(1000);
    } catch (err: any) {
      if ((err as Error) instanceof ResourceNotFoundException) {
        logger.info('delete dataset: wait finished');
        return;
      }

      logger.error(`delete dataset failed due to ${err}`);
      throw err;
    }
  }
};

export async function waitForDataSetRefreshPropertySetCompleted(quickSight: QuickSight, accountId: string, datasetId: string) {
  for (const _i of Array(60).keys()) {
    try {
      const result = await quickSight.describeDataSetRefreshProperties({
        AwsAccountId: accountId,
        DataSetId: datasetId,
      });

      logger.info(`dashboard status: ${result.DataSetRefreshProperties}`);

      if (result.DataSetRefreshProperties !== undefined && result.DataSetRefreshProperties.RefreshConfiguration?.IncrementalRefresh !== undefined) {
        return;
      }
      logger.info('wait dataset refresh property put complete : sleep 1 second');
      await sleep(1000);

    } catch (err: any) {
      logger.error(`Dataset refresh property put failed due to ${err}`);
      throw err;
    }
  }
};

export async function waitForAnalysisDeleteCompleted(quickSight: QuickSight, accountId: string, analysisId: string) {
  for (const _i of Array(60).keys()) {
    try {
      const analysis = await quickSight.describeAnalysisDefinition({
        AwsAccountId: accountId,
        AnalysisId: analysisId,
      });

      if (analysis.ResourceStatus === ResourceStatus.DELETED) {
        return;
      }

      logger.info('AnalysisDelete: sleep 1 second');
      await sleep(1000);

    } catch (err: any) {
      if ((err as Error) instanceof ResourceNotFoundException) {
        return;
      }

      logger.error(`delete analysis failed due to ${err}`);
      throw err;
    }
  }
};

export async function waitForDashboardDeleteCompleted(quickSight: QuickSight, accountId: string, dashboardId: string) {
  for (const _i of Array(60).keys()) {
    try {
      const dashboard = await quickSight.describeDashboardDefinition({
        AwsAccountId: accountId,
        DashboardId: dashboardId,
      });

      if (dashboard.ResourceStatus === ResourceStatus.DELETED) {
        return;
      }

      logger.info('DashboardDelete: sleep 1 second');
      await sleep(1000);

    } catch (err: any) {
      if ((err as Error) instanceof ResourceNotFoundException) {
        return;
      }

      logger.error(`delete dashboard failed due to ${err}`);
      throw err;
    }
  }
};

export function truncateString(source: string, length: number): string {
  if (source.length > length) {
    return source.substring(0, length);
  }
  return source;
};

export const existAnalysis = async (quickSight: QuickSight, accountId: string, analysisId: string) => {

  try {
    await quickSight.describeAnalysis({
      AwsAccountId: accountId,
      AnalysisId: analysisId,
    });
    return true;
  } catch (err: any) {
    if ((err as Error) instanceof ResourceNotFoundException) {
      return false;
    } else {
      throw err;
    }
  }
};

export const existDashboard = async (quickSight: QuickSight, accountId: string, dashboardId: string) => {

  try {
    await quickSight.describeDashboard({
      AwsAccountId: accountId,
      DashboardId: dashboardId,
    });
    return true;
  } catch (err: any) {
    if ((err as Error) instanceof ResourceNotFoundException) {
      return false;
    } else {
      throw err;
    }
  }
};

export const existFolder = async (quickSight: QuickSight, accountId: string, folderId: string) => {

  try {
    await quickSight.describeFolder({
      AwsAccountId: accountId,
      FolderId: folderId,
    });
    return true;
  } catch (err: any) {
    if ((err as Error) instanceof ResourceNotFoundException) {
      return false;
    } else {
      throw err;
    }
  }
};

export const existRefrshSchedule = async (quickSight: QuickSight, accountId: string, datasetId: string, scheduleId: string) => {

  try {
    await quickSight.describeRefreshSchedule({
      AwsAccountId: accountId,
      DataSetId: datasetId,
      ScheduleId: scheduleId,

    });
    logger.info('found refresh schedule:', scheduleId);
    return true;
  } catch (err: any) {
    if ((err as Error) instanceof ResourceNotFoundException) {
      logger.info('not found refresh schedule:', scheduleId);
      return false;
    } else {
      throw err;
    }
  }
};

export const findDashboardWithPrefix = async (quickSight: QuickSight, accountId: string, prefix: string, excludeDashboardId: string|undefined) => {
  try {
    const dashboardSummaries: DashboardSummary[] = [];
    for await (const page of paginateListDashboards({ client: quickSight }, {
      AwsAccountId: accountId,
    })) {
      if (page.DashboardSummaryList !== undefined) {
        dashboardSummaries.push(...page.DashboardSummaryList);
      }
    }

    for (const dashboardSummary of dashboardSummaries) {
      if (dashboardSummary.DashboardId?.startsWith(prefix) && dashboardSummary.DashboardId !== excludeDashboardId ) {
        return dashboardSummary.DashboardId;
      }
    }

    return undefined;
  } catch (err: any) {
    logger.warn('find dashboard failed.');
    return undefined;
  }
};

export const findAnalysisWithPrefix = async (quickSight: QuickSight, accountId: string, prefix: string, excludeAnalysisId: string|undefined) => {
  try {

    const analysisSummaries: AnalysisSummary[] = [];
    for await (const page of paginateListAnalyses({ client: quickSight }, {
      AwsAccountId: accountId,
    })) {
      if (page.AnalysisSummaryList !== undefined) {
        analysisSummaries.push(...page.AnalysisSummaryList);
      }
    }

    for (const analysisSummary of analysisSummaries) {
      if (analysisSummary.AnalysisId?.startsWith(prefix) && analysisSummary.AnalysisId !== excludeAnalysisId ) {
        logger.info('found old version analysis:', analysisSummary.AnalysisId);
        return analysisSummary.AnalysisId;
      }
    }

    return undefined;
  } catch (err: any) {
    logger.warn('find analysis failed.');
    return undefined;
  }
};