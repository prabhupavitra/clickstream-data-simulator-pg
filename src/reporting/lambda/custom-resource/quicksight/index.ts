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

import crypto from 'crypto';
import { DASHBOARD_ADMIN_PERMISSION_ACTIONS, DATASET_ADMIN_PERMISSION_ACTIONS, DATASET_READER_PERMISSION_ACTIONS, DATA_SOURCE_OWNER_PERMISSION_ACTIONS, FOLDER_CONTRIBUTOR_PERMISSION_ACTIONS, FOLDER_OWNER_PERMISSION_ACTIONS, QUICKSIGHT_RESOURCE_NAME_PREFIX, aws_sdk_client_common_config, logger, sleep, timezoneJsonArrayToDict } from '@aws/clickstream-base-lib';
import {
  QuickSight,
  DashboardSourceEntity,
  CreateDataSetCommandOutput,
  CreateDashboardCommandOutput,
  ResourceNotFoundException,
  ColumnGroup,
  DataSetReference,
  TransformOperation,
  ColumnTag,
  DeleteDashboardCommandOutput,
  GeoSpatialDataRole,
  DeleteDataSetCommandOutput,
  UpdateDashboardCommandOutput,
  DeleteAnalysisCommandOutput,
  UpdateDataSetCommandOutput,
  ConflictException,
  paginateListTemplateVersions,
  TemplateVersionSummary,
  ParameterValueType,
  DatasetParameter,
  MemberType,
  FolderType,
  SharingModel,
  ResourceExistsException,
  ResourcePermission,
  DataSetImportMode,
  IngestionType,
  RefreshInterval,
  LookbackWindowSizeUnit,
  CreateDataSetCommandInput,
  InvalidParameterValueException,
  RefreshSchedule,
  RefreshFrequency,
} from '@aws-sdk/client-quicksight';
import { Context, CloudFormationCustomResourceEvent, CloudFormationCustomResourceUpdateEvent, CloudFormationCustomResourceCreateEvent, CloudFormationCustomResourceDeleteEvent, CdkCustomResourceResponse } from 'aws-lambda';
import Mustache from 'mustache';
import { v4 as uuidv4 } from 'uuid';
import { getQuickSightFolderId, getQuickSightFolderName } from '../../../../control-plane/backend/lambda/api/store/aws/quicksight';
import {
  QuicksightCustomResourceLambdaProps,
  waitForAnalysisDeleteCompleted,
  waitForDashboardChangeCompleted,
  waitForDashboardDeleteCompleted,
  waitForDataSetCreateCompleted,
  waitForDataSetDeleteCompleted,
  QuickSightDashboardDefProps,
  DataSetProps,
  truncateString,
  waitForTemplateChangeCompleted,
  existDashboard,
  existAnalysis,
  findAnalysisWithPrefix,
  findDashboardWithPrefix,
  waitForDataSourceChangeCompleted,
  DateTimeParameter,
  existFolder,
  existRefrshSchedule,
  waitForDataSetRefreshPropertySetCompleted,
} from '../../../private/dashboard';

type ResourceEvent = CloudFormationCustomResourceEvent;

type QuicksightCustomResourceLambdaPropsType = QuicksightCustomResourceLambdaProps & {
  readonly ServiceToken: string;
}

type ResourceCommonParams = {
  awsAccountId: string;
  databaseName: string;
  schema: string;
  sharePrincipalArn: string;
  ownerPrincipalArn: string;
  timezoneDict: { [key: string]: string };
}

export type MustacheParamType = {
  schema: string;
  timezone: string;
}

export const handler = async (event: ResourceEvent, _context: Context): Promise<CdkCustomResourceResponse|void> => {
  const props = event.ResourceProperties as QuicksightCustomResourceLambdaPropsType;
  const region = props.awsRegion;
  const quickSight = new QuickSight({
    region,
    ...aws_sdk_client_common_config,
  });

  const awsAccountId = props.awsAccountId;
  const sharePrincipalArn = props.quickSightSharePrincipalArn;
  const ownerPrincipalArn = props.quickSightOwnerPrincipalArn;

  let timezone = props.timezone;
  if (timezone === undefined || timezone === '') {
    timezone = '[]';
  }
  const timezoneDict = timezoneJsonArrayToDict(JSON.parse(timezone));

  logger.info('dataset info', {
    useSpice: props.useSpice,
    dataSets: props.dashboardDefProps.dataSets,
    timezoneDict: timezoneDict,
  });

  if (event.RequestType === 'Create') {
    return _onCreate(quickSight, awsAccountId, sharePrincipalArn, ownerPrincipalArn, event, timezoneDict);
  } else if (event.RequestType === 'Update' ) {
    return _onUpdate(quickSight, awsAccountId, sharePrincipalArn, ownerPrincipalArn, event, timezoneDict);
  } else if (event.RequestType === 'Delete' ) {
    return _onDelete(quickSight, awsAccountId, event);
  } else {
    logger.warn('Invalid request type.');
  }
};

const _onCreate = async (quickSight: QuickSight, awsAccountId: string, sharePrincipalArn: string, ownerPrincipalArn: string,
  event: CloudFormationCustomResourceCreateEvent,
  timezoneDict: { [key: string]: string },
): Promise<CdkCustomResourceResponse> => {

  const props = event.ResourceProperties as QuicksightCustomResourceLambdaPropsType;
  let dashboards = [];
  const databaseSchemaNames = props.schemas;
  if ( databaseSchemaNames.trim().length > 0 ) {
    try {

      const dashboardDefProps: QuickSightDashboardDefProps = props.dashboardDefProps;
      const databaseName = dashboardDefProps.databaseName;
      const commonParams: ResourceCommonParams = {
        awsAccountId: awsAccountId,
        ownerPrincipalArn,
        sharePrincipalArn,
        databaseName,
        schema: '',
        timezoneDict,
      };

      for (const schemaName of databaseSchemaNames.split(',')) {

        logger.info('creating quicksight dashboard with params', {
          schemaName: schemaName,
          dashboardDefProps: dashboardDefProps,
        });
        commonParams.schema = schemaName;
        const dashboard = await createQuickSightDashboard(quickSight, commonParams, dashboardDefProps, props.useSpice);

        dashboards.push({
          appId: schemaName,
          dashboardId: dashboard?.DashboardId,
        });
      };
    } catch (err: any) {
      logger.error('Create QuickSight dashboard failed', err);
      //remove created Quicksight resources
      for (const schemaName of databaseSchemaNames.split(',')) {
        await deleteQuickSightDashboard(quickSight, awsAccountId, props.dashboardDefProps.databaseName, schemaName, props.dashboardDefProps);
      }
      throw err;
    }
  } else {
    logger.info('empty database schema.');
  }

  return {
    Data: {
      dashboards: JSON.stringify(dashboards),
    },
  };
};

const _onDelete = async (quickSight: QuickSight, awsAccountId: string, event: CloudFormationCustomResourceDeleteEvent): Promise<void> => {
  const props = event.ResourceProperties as QuicksightCustomResourceLambdaPropsType;
  const databaseSchemaNames = props.schemas;
  if ( databaseSchemaNames.trim().length > 0 ) {
    for (const schemaName of databaseSchemaNames.split(',')) {
      const dashboardDefProps: QuickSightDashboardDefProps = props.dashboardDefProps;

      logger.info('deleting quicksight dashboard with params', {
        schemaName: schemaName,
        dashboardDefProps: dashboardDefProps,
      });

      const dashboard = await deleteQuickSightDashboard(quickSight, awsAccountId, dashboardDefProps.databaseName, schemaName, dashboardDefProps);
      logger.info(`delete dashboard: ${dashboard?.DashboardId}`);
    };
  } else {
    logger.info('empty database schema, nothing need to delete.');
  }
};

const _onUpdate = async (quickSight: QuickSight, awsAccountId: string, sharePrincipalArn: string, ownerPrincipalArn: string,
  event: CloudFormationCustomResourceUpdateEvent,
  timezoneDict: { [key: string]: string },
): Promise<CdkCustomResourceResponse> => {
  const props = event.ResourceProperties as QuicksightCustomResourceLambdaPropsType;
  const oldProps = event.OldResourceProperties as QuicksightCustomResourceLambdaPropsType;

  let dashboards = [];
  let databaseSchemaNameArray: string[] = [];
  let oldDatabaseSchemaNameArray: string[] = [];
  let updateSchemas: string[] = [];
  let deleteSchemas: string[] = [];
  let createSchemas: string[] = [];

  const deleteDatabase = oldProps.dashboardDefProps.databaseName;
  logger.info('database:', {
    database: props.dashboardDefProps.databaseName,
    oldDatabase: oldProps.dashboardDefProps.databaseName,
  });

  if (props.dashboardDefProps.databaseName !== oldProps.dashboardDefProps.databaseName) {
    createSchemas.push(...props.schemas.trim().split(','));
    deleteSchemas.push(...oldProps.schemas.trim().split(','));
  } else {
    if ( props.schemas.trim().length > 0 ) {
      databaseSchemaNameArray.push(...props.schemas.trim().split(','));
    };

    if ( oldProps.schemas.trim().length > 0 ) {
      oldDatabaseSchemaNameArray.push(...oldProps.schemas.trim().split(','));
    };

    updateSchemas = databaseSchemaNameArray.filter(item => oldDatabaseSchemaNameArray.includes(item));
    deleteSchemas = oldDatabaseSchemaNameArray.filter(item => !databaseSchemaNameArray.includes(item));
    createSchemas = databaseSchemaNameArray.filter(item => !oldDatabaseSchemaNameArray.includes(item));

    logger.info('Filtering params:', {
      propsSchemas: props.schemas,
      oldPropsSchemas: oldProps.schemas,
      databaseSchemaNameArray: databaseSchemaNameArray,
      oldDatabaseSchemaNameArray: oldDatabaseSchemaNameArray,
    });
  }

  logger.info('schemas to process', {
    updateSchemas: updateSchemas,
    deleteSchemas: deleteSchemas,
    createSchemas: createSchemas,
  });

  const createdQuickSightResources: CreatedQuickSightResources = {
    createdSchemas: [],
    createdDataSets: [],
  };

  try {
    const dashboardDefProps: QuickSightDashboardDefProps = props.dashboardDefProps;
    const commonParams: ResourceCommonParams = {
      awsAccountId: awsAccountId,
      databaseName: dashboardDefProps.databaseName,
      schema: '',
      sharePrincipalArn: sharePrincipalArn,
      ownerPrincipalArn: ownerPrincipalArn,
      timezoneDict: timezoneDict,
    };

    for (const schemaName of updateSchemas) {
      const oldDashboardDefProps: QuickSightDashboardDefProps = oldProps.dashboardDefProps;
      logger.info('Updating schema', {
        schemaName: schemaName,
        dashboardDefProps: dashboardDefProps,
        oldDashboardDefProps: oldDashboardDefProps,
      });
      commonParams.schema = schemaName;
      logger.info('useSpice:', props.useSpice);

      const dashboard = await updateQuickSightDashboard(quickSight, commonParams,
        dashboardDefProps, oldDashboardDefProps,
        createdQuickSightResources, props.useSpice);

      dashboards.push({
        appId: schemaName,
        dashboardId: dashboard?.DashboardId,
      });
    };

    for (const schemaName of createSchemas) {
      createdQuickSightResources.createdSchemas.push({
        schema: schemaName,
        dashboardDefProps: dashboardDefProps,
      });

      commonParams.schema = schemaName;
      logger.info('useSpice:', props.useSpice);
      const dashboard = await createQuickSightDashboard(quickSight, commonParams, dashboardDefProps, props.useSpice);

      logger.info('Creating schema', {
        schemaName: schemaName,
        dashboardDefProps: dashboardDefProps,
        oldDashboardDefProps: dashboard?.DashboardId,
      });

      dashboards.push({
        appId: schemaName,
        dashboardId: dashboard?.DashboardId,
      });
    };

    for (const schemaName of deleteSchemas) {
      const dashboard = await deleteQuickSightDashboard(quickSight, awsAccountId,
        deleteDatabase,
        schemaName,
        dashboardDefProps);
      logger.info('Deleting schema', {
        schemaName: schemaName,
        dashboardDefProps: dashboardDefProps,
        oldDashboardDefProps: dashboard?.DashboardId,
      });

    };
  } catch (err: any) {
    logger.error('Update QuickSight dashboard failed', err);
    //remove created Quicksight resources
    await cleanQuickSightResource(createdQuickSightResources, quickSight, awsAccountId, props.dashboardDefProps.databaseName);

    throw err;
  }

  return {
    Data: {
      dashboards: JSON.stringify(dashboards),
    },
  };
};

const cleanQuickSightResource = async (createdQuickSightResources: CreatedQuickSightResources, quickSight: QuickSight,
  awsAccountId: string, databaseName: string) => {
  if (createdQuickSightResources.createdSchemas.length > 0) {
    for (const schema of createdQuickSightResources.createdSchemas) {
      await deleteQuickSightDashboard(quickSight, awsAccountId, schema.dashboardDefProps.databaseName, schema.schema, schema.dashboardDefProps);
    }
  }
  if (createdQuickSightResources.createdDataSets.length > 0) {
    for (const dataSet of createdQuickSightResources.createdDataSets) {
      await deleteDataSet(quickSight, awsAccountId, dataSet.schema, databaseName, dataSet.dataSetProps);
    }
  }
};

const getFolderPermission = (sharePrincipalArn: string, ownerPrincipalArn: string): ResourcePermission[] => {
  if (sharePrincipalArn === ownerPrincipalArn) {
    return [
      {
        Principal: sharePrincipalArn,
        Actions: FOLDER_OWNER_PERMISSION_ACTIONS,
      },
    ];
  }
  return [
    {
      Principal: sharePrincipalArn,
      Actions: FOLDER_CONTRIBUTOR_PERMISSION_ACTIONS,
    },
    {
      Principal: ownerPrincipalArn,
      Actions: FOLDER_OWNER_PERMISSION_ACTIONS,
    },
  ];
};

const getDataSetPermission = (sharePrincipalArn: string, ownerPrincipalArn: string): ResourcePermission[] => {
  if (sharePrincipalArn === ownerPrincipalArn) {
    return [
      {
        Principal: sharePrincipalArn,
        Actions: DATASET_ADMIN_PERMISSION_ACTIONS,
      },
    ];
  }
  return [
    {
      Principal: ownerPrincipalArn,
      Actions: DATASET_ADMIN_PERMISSION_ACTIONS,
    },
    {
      Principal: sharePrincipalArn,
      Actions: DATASET_READER_PERMISSION_ACTIONS,
    },
  ];
};

const getDataSourcePermission = (sharePrincipalArn: string, ownerPrincipalArn: string): ResourcePermission[] => {
  if (sharePrincipalArn === ownerPrincipalArn) {
    return [
      {
        Principal: sharePrincipalArn,
        Actions: DATA_SOURCE_OWNER_PERMISSION_ACTIONS,
      },
    ];
  }
  return [
    {
      Principal: ownerPrincipalArn,
      Actions: DATA_SOURCE_OWNER_PERMISSION_ACTIONS,
    },
    {
      Principal: sharePrincipalArn,
      Actions: DATA_SOURCE_OWNER_PERMISSION_ACTIONS,
    },
  ];
};

const getDashboardPermission = (sharePrincipalArn: string, ownerPrincipalArn: string): ResourcePermission[] => {
  if (sharePrincipalArn === ownerPrincipalArn) {
    return [
      {
        Principal: sharePrincipalArn,
        Actions: DASHBOARD_ADMIN_PERMISSION_ACTIONS,
      },
    ];
  }
  return [
    {
      Principal: ownerPrincipalArn,
      Actions: DASHBOARD_ADMIN_PERMISSION_ACTIONS,
    },
    {
      Principal: sharePrincipalArn,
      Actions: DASHBOARD_ADMIN_PERMISSION_ACTIONS,
    },
  ];
};

const createQuickSightDashboard = async (quickSight: QuickSight,
  commonParams: ResourceCommonParams,
  dashboardDef: QuickSightDashboardDefProps,
  useSpice: string,
)
: Promise<CreateDashboardCommandOutput|undefined> => {

  const datasetRefs: DataSetReference[] = [];
  const dataSets = dashboardDef.dataSets;
  const dataSetsSpice = dashboardDef.dataSetsSpice;

  await grantDataSourcePermission(quickSight, dashboardDef.dataSourceArn, commonParams.awsAccountId,
    commonParams.ownerPrincipalArn, commonParams.sharePrincipalArn);

  const targetDataSet = useSpice === 'yes' ? dataSetsSpice : dataSets;
  for ( const dataSet of targetDataSet) {
    const createdDataset = await createDataSet(quickSight, commonParams, dashboardDef.dataSourceArn, dataSet);
    logger.info(`data set id: ${createdDataset?.DataSetId}`);

    datasetRefs.push({
      DataSetPlaceholder: dataSet.tableName,
      DataSetArn: createdDataset?.Arn!,
    });
  }

  const sourceEntity = {
    SourceTemplate: {
      Arn: dashboardDef.templateArn,
      DataSetReferences: datasetRefs,
    },
  };

  const folderId = getQuickSightFolderId(commonParams.databaseName, commonParams.schema);
  const folderExist = await existFolder(quickSight, commonParams.awsAccountId, folderId);
  if (!folderExist) {
    await quickSight.createFolder({
      AwsAccountId: commonParams.awsAccountId,
      FolderId: folderId,
      Name: getQuickSightFolderName(commonParams.databaseName, commonParams.schema),
      FolderType: FolderType.SHARED,
      SharingModel: SharingModel.ACCOUNT,
      Permissions: getFolderPermission(commonParams.sharePrincipalArn, commonParams.ownerPrincipalArn),
    });
  }

  const dashboard = await createDashboard(quickSight, commonParams, sourceEntity, dashboardDef);
  logger.info(`Dashboard ${dashboard?.DashboardId} creation completed.`);

  try {
    await quickSight.createFolderMembership({
      AwsAccountId: commonParams.awsAccountId,
      FolderId: folderId,
      MemberId: dashboard?.DashboardId!,
      MemberType: MemberType.DASHBOARD,
    });
  } catch (e) {
    if (e instanceof ResourceExistsException) {
      logger.warn('folder membership already exist. skip create operation.');
    } else {
      throw e;
    }
  }

  return dashboard;

};

const deleteQuickSightDashboard = async (quickSight: QuickSight,
  accountId: string,
  deleteDatabase: string,
  schema: string,
  dashboardDef: QuickSightDashboardDefProps)
: Promise<DeleteDashboardCommandOutput|undefined> => {

  try {
    // Delete Folder
    await deleteFolder(quickSight, accountId, deleteDatabase, schema);

    // Delete Dashboard
    const dashboardId = buildDashBoardId(deleteDatabase, schema);
    const result = await deleteDashboardById(quickSight, accountId, dashboardId.id);

    //delete Analysis
    const analysisId = buildAnalysisId(deleteDatabase, schema);
    await deleteAnalysisById(quickSight, accountId, analysisId.id);

    //delete DataSets
    const dataSets = dashboardDef.dataSets;
    const databaseName = deleteDatabase;
    for ( const dataSet of dataSets) {
      await deleteDataSet(quickSight, accountId, schema, databaseName, dataSet);
    }
    return result;

  } catch (err: any) {
    logger.error('Delete QuickSight dashboard failed, skip retry. Manually delete it if necessary.', err);
    logger.error('Delete fail at:', {
      deleteDatabase,
      schema,
    });

    return {
      $metadata: {},
      DashboardId: 'NULL',
    };
  }
};

const getMemberType = function(memberArn: string, memberId: string): MemberType | undefined {
  let memberType = undefined;

  if (memberArn.includes(`:dashboard/${memberId}`)) {
    memberType = MemberType.DASHBOARD;
  } else if (memberArn.includes(`:analysis/${memberId}`)) {
    memberType = MemberType.ANALYSIS;
  } else if (memberArn.includes(`:dataset/${memberId}`)) {
    memberType = MemberType.DATASET;
  } else if (memberArn.includes(`:datasource/${memberId}`)) {
    memberType = MemberType.DATASOURCE;
  } else if (memberArn.includes(`:topic/${memberId}`)) {
    memberType = MemberType.TOPIC;
  }
  return memberType;
};

const getLatestTemplateVersion = async (quickSight: QuickSight,
  accountId: string, templateId: string): Promise<number> => {
  await waitForTemplateChangeCompleted(quickSight, accountId, templateId);

  const templateVersionSummaries: TemplateVersionSummary[] = [];
  for await (const page of paginateListTemplateVersions({ client: quickSight }, {
    TemplateId: templateId,
    AwsAccountId: accountId,
  })) {
    if (page.TemplateVersionSummaryList !== undefined) {
      templateVersionSummaries.push(...page.TemplateVersionSummaryList);
    }
  }

  let maxNumber = 1;
  for (const version of templateVersionSummaries) {
    const number = version.VersionNumber ?? 1;
    if (number > maxNumber) {
      maxNumber = number;
    }
  }

  return maxNumber;
};

export type CreatedQuickSightDataSets = {
  schema: string;
  dataSetProps: DataSetProps;
}

export type CreatedQuickSightDashboards = {
  schema: string;
  dashboardDefProps: QuickSightDashboardDefProps;
}

export type CreatedQuickSightResources = {
  createdSchemas: CreatedQuickSightDashboards[];
  createdDataSets: CreatedQuickSightDataSets[];
}

const updateQuickSightDashboard = async (quickSight: QuickSight, commonParams: ResourceCommonParams,
  dashboardDef: QuickSightDashboardDefProps,
  oldDashboardDef: QuickSightDashboardDefProps,
  createdQuickSightResources: CreatedQuickSightResources,
  useSpice: string,
)
: Promise<UpdateDashboardCommandOutput|undefined> => {

  const datasetRefs: DataSetReference[] = [];
  const dataSets = dashboardDef.dataSets;
  const oldDataSets = oldDashboardDef.dataSets;
  const dataSetsSpice = dashboardDef.dataSetsSpice;
  const databaseName = dashboardDef.databaseName;

  await grantDataSourcePermission(quickSight, dashboardDef.dataSourceArn,
    commonParams.awsAccountId,
    commonParams.ownerPrincipalArn,
    commonParams.sharePrincipalArn,
  );

  const oldDataSetTableNames: string[] = [];
  const dataSetTableNames: string[] = [];
  for (const dataset of dataSets) {
    dataSetTableNames.push(dataset.tableName);
  }
  for (const dataset of oldDataSets) {
    oldDataSetTableNames.push(dataset.tableName);
  }

  const needDeleteDataSets = oldDataSets.filter(item => !dataSetTableNames.includes(item.tableName));
  const needUpdateDataSetTableNames = dataSetTableNames.filter(item => oldDataSetTableNames.includes(item));

  logger.info('Delete and update dataset and table names', {
    needDeleteDataSets: needDeleteDataSets,
    needUpdateDataSetTableNames: needUpdateDataSetTableNames,
  });

  const targetDataSet = useSpice === 'yes' ? dataSetsSpice : dataSets;
  for ( const dataSet of targetDataSet) {
    let createdDataset;
    if (needUpdateDataSetTableNames.includes(dataSet.tableName)) {
      logger.info(`update data set : ${dataSet.tableName}`);
      createdDataset = await updateDataSet(quickSight, commonParams, dashboardDef.dataSourceArn, dataSet);
    } else {
      logger.info(`create data set : ${dataSet.tableName}`);
      createdQuickSightResources.createdDataSets.push({
        schema: commonParams.schema,
        dataSetProps: dataSet,
      });
      createdDataset = await createDataSet(quickSight, commonParams, dashboardDef.dataSourceArn, dataSet);
    }
    datasetRefs.push({
      DataSetPlaceholder: dataSet.tableName,
      DataSetArn: createdDataset?.Arn!,
    });
  }

  //remove unused datasets
  for (const dataSet of needDeleteDataSets) {
    logger.info(`delete data set : ${dataSet.tableName}`);
    await deleteDataSet(quickSight, commonParams.awsAccountId, commonParams.schema, databaseName, dataSet);
  }

  const latestVersion = await getLatestTemplateVersion(quickSight, commonParams.awsAccountId, dashboardDef.templateId);

  logger.info('template info', {
    templateId: dashboardDef.templateId,
    templateArn: dashboardDef.templateArn,
    latestVersion: latestVersion,
  });

  const sourceEntity = {
    SourceTemplate: {
      Arn: dashboardDef.templateArn + `/version/${latestVersion}`,
      DataSetReferences: datasetRefs,
    },
  };

  const analysisId = buildAnalysisId(commonParams.databaseName, commonParams.schema);

  const analysisExist = await existAnalysis(quickSight, commonParams.awsAccountId, analysisId.id);
  if (analysisExist) {
    await deleteAnalysisById(quickSight, commonParams.awsAccountId, analysisId.id);
    logger.info(`Analysis ${analysisId.id} delete completed.`);
  } else {
    const prefix = analysisId.id.replace(analysisId.idSuffix, '');
    const foundAnalysisId = await findAnalysisWithPrefix(quickSight, commonParams.awsAccountId, prefix, analysisId.id);
    if (foundAnalysisId !== undefined) {
      await deleteAnalysisById(quickSight, commonParams.awsAccountId, foundAnalysisId);
      logger.info(`Analysis ${analysisId.id} (old version) delete completed.`);
    }
  }

  let dashboard = undefined;
  const dashboardId = buildDashBoardId(commonParams.databaseName, commonParams.schema);
  const dashboardExist = await existDashboard(quickSight, commonParams.awsAccountId, dashboardId.id);
  if (dashboardExist) {
    dashboard = await updateDashboard(quickSight, commonParams, sourceEntity, dashboardDef);
    logger.info(`Dashboard ${dashboard?.DashboardId} update completed.`);
  } else {
    createdQuickSightResources.createdSchemas.push({
      schema: commonParams.schema,
      dashboardDefProps: dashboardDef,
    });
    dashboard = await createDashboard(quickSight, commonParams, sourceEntity, dashboardDef);
    logger.info(`Dashboard ${dashboard?.DashboardId} create completed.`);

    //due to dashboardId changed in version v1.1, need to delete old dashboard
    const foundDashboardId = await findDashboardWithPrefix(quickSight, commonParams.awsAccountId, dashboardId.id.replace(`/${dashboardId.idSuffix}/g`, ''), dashboard?.DashboardId);
    if (foundDashboardId !== undefined) {
      await deleteDashboardById(quickSight, commonParams.awsAccountId, foundDashboardId);
    }
  }

  const folderId = `clickstream_${commonParams.databaseName}_${commonParams.schema}`;
  await updateFolderMembership(quickSight, commonParams, folderId, dashboard?.DashboardId!);

  return dashboard;
};

const updateFolderMembership = async (quickSight: QuickSight, commonParams: ResourceCommonParams, folderId: string, dashboardId: string)
: Promise<void> => {
  let folderExist = await existFolder(quickSight, commonParams.awsAccountId, folderId);
  if (!folderExist) {
    await quickSight.createFolder({
      AwsAccountId: commonParams.awsAccountId,
      FolderId: folderId,
      Name: `${commonParams.databaseName}_${commonParams.schema}`,
      FolderType: FolderType.SHARED,
      SharingModel: SharingModel.ACCOUNT,
    });
  }

  try {
    await quickSight.createFolderMembership({
      AwsAccountId: commonParams.awsAccountId,
      FolderId: folderId,
      MemberId: dashboardId,
      MemberType: MemberType.DASHBOARD,
    });
  } catch (e) {
    if (e instanceof ResourceExistsException) {
      logger.warn('folder membership already exist. skip create operation.');
    } else {
      throw e;
    }
  }

  //update folder permissions
  await quickSight.updateFolderPermissions({
    AwsAccountId: commonParams.awsAccountId,
    FolderId: folderId,
    GrantPermissions: getFolderPermission(commonParams.sharePrincipalArn, commonParams.ownerPrincipalArn),
  });

};

const buildDataSetParameter = function (dateTimeDatasetParameter: DateTimeParameter[] | undefined): DatasetParameter[] | undefined {

  let datasetParameters: DatasetParameter[] | undefined = undefined;
  if (dateTimeDatasetParameter !== undefined) {
    datasetParameters = [];
    for (const param of dateTimeDatasetParameter) {
      datasetParameters.push({
        DateTimeDatasetParameter: {
          Id: uuidv4(),
          Name: param.name,
          ValueType: ParameterValueType.SINGLE_VALUED,
          TimeGranularity: param.timeGranularity,
          DefaultValues: {
            StaticValues: [new Date(param.defaultValue)],
          },
        },
      });
    }
  }

  return datasetParameters;
};

const createDataSet = async (quickSight: QuickSight, commonParams: ResourceCommonParams,
  dataSourceArn: string,
  props: DataSetProps)
: Promise<CreateDataSetCommandOutput|undefined> => {
  try {
    const identifier = buildDataSetId(commonParams.databaseName, commonParams.schema, props.tableName);
    const datasetId = identifier.id;

    const timezone = commonParams.timezoneDict[commonParams.schema] ?? 'UTC';

    const mustacheParam: MustacheParamType = {
      schema: commonParams.databaseName.concat('.').concat(commonParams.schema),
      timezone,
    };

    logger.info('SQL to run:', Mustache.render(props.customSql, mustacheParam));

    let colGroups: ColumnGroup[] = [];
    if (props.columnGroups !== undefined) {
      for (const columnsGroup of props.columnGroups ) {
        colGroups.push({
          GeoSpatialColumnGroup: {
            Name: columnsGroup.geoSpatialColumnGroupName,
            Columns: columnsGroup.geoSpatialColumnGroupColumns,
          },
        });
      }
    }

    let dataTransforms: TransformOperation[] = [];
    let needLogicalMap = false;
    if (props.tagColumnOperations !== undefined) {
      needLogicalMap = true;
      for (const tagColOperation of props.tagColumnOperations ) {
        const tags: ColumnTag[] = [];
        for (const role of tagColOperation.columnGeographicRoles) {
          tags.push({
            ColumnGeographicRole: role as GeoSpatialDataRole,
          });
        }
        dataTransforms.push({
          TagColumnOperation: {
            ColumnName: tagColOperation.columnName,
            Tags: tags,
          },
        });
      }
    }

    if (props.projectedColumns !== undefined) {
      needLogicalMap = true;
      dataTransforms.push({
        ProjectOperation: {
          ProjectedColumns: props.projectedColumns,
        },
      });
    }

    let logicalMap = undefined;
    if (needLogicalMap) {
      logicalMap = {
        LogicalTable1: {
          Alias: 'Alias_LogicalTable1',
          Source: {
            PhysicalTableId: 'PhyTable1',
          },
          DataTransforms: dataTransforms,
        },
      };
    }

    const datasetParameters = buildDataSetParameter(props.dateTimeDatasetParameter);
    logger.info('datasetParameters: ', { datasetParameters });

    logger.info('start to create dataset');
    logger.info('useSpice:', {
      useSpice: props.useSpice,
      datasetId: datasetId,
    });
    const datasetParams: CreateDataSetCommandInput = {
      AwsAccountId: commonParams.awsAccountId,
      DataSetId: datasetId,
      Name: `${identifier.tableNameIdentifier}-${identifier.schemaIdentifier}-${identifier.databaseIdentifier}`,
      Permissions: getDataSetPermission(commonParams.sharePrincipalArn, commonParams.ownerPrincipalArn),
      DatasetParameters: datasetParameters,
      ImportMode: props.useSpice === 'yes' ? DataSetImportMode.SPICE : DataSetImportMode.DIRECT_QUERY,
      PhysicalTableMap: {
        PhyTable1: {
          CustomSql: {
            DataSourceArn: dataSourceArn,
            Name: props.tableName,
            SqlQuery: Mustache.render(props.customSql, mustacheParam),
            Columns: props.columns,
          },
        },
      },
      LogicalTableMap: needLogicalMap ? logicalMap : undefined,
      ColumnGroups: colGroups.length > 0 ? colGroups : undefined,
      DataSetUsageConfiguration: {
        DisableUseAsDirectQuerySource: false,
        DisableUseAsImportedSource: false,
      },

    };
    logger.info('dataset params', { datasetParams });
    const dataset = await quickSight.createDataSet(datasetParams);

    await waitForDataSetCreateCompleted(quickSight, commonParams.awsAccountId, datasetId);
    logger.info('create dataset finished', { datasetId });

    if (props.useSpice === 'yes') {
      await createOrUpdateRefreshSchedule(quickSight, commonParams, datasetId, props.refreshInterval, props.lookbackColumn);
    }

    return dataset;

  } catch (err: any) {
    logger.error('Create QuickSight dataset failed', err);
    throw err;
  }
};

const createDashboard = async (quickSight: QuickSight, commonParams: ResourceCommonParams,
  sourceEntity: DashboardSourceEntity, props: QuickSightDashboardDefProps)
: Promise<CreateDashboardCommandOutput|undefined> => {
  try {
    const identifier = buildDashBoardId(commonParams.databaseName, commonParams.schema);
    const dashboardId = identifier.id;

    logger.info(`start to create dashboard ${dashboardId}`);
    logger.info(`dashboard source entity:', ${sourceEntity}`);

    const dashboard = await quickSight.createDashboard({
      AwsAccountId: commonParams.awsAccountId,
      DashboardId: dashboardId,
      Name: `${props.dashboardName} - ${identifier.schemaIdentifier} - ${identifier.databaseIdentifier} `,
      Permissions: getDashboardPermission(commonParams.sharePrincipalArn, commonParams.ownerPrincipalArn),
      SourceEntity: sourceEntity,
    });
    await waitForDashboardChangeCompleted(quickSight, commonParams.awsAccountId, dashboardId);
    logger.info(`Create dashboard finished. Id: ${dashboardId}`);

    return dashboard;

  } catch (err: any) {
    logger.error(`Create QuickSight dashboard failed due to: ${(err as Error).message}`);
    throw err;
  }
};

const deleteFolder = async (quickSight: QuickSight, awsAccountId: string, databaseName: string, schema: string): Promise<void> => {
  let needDeleteFolder: boolean = true;
  const res = await quickSight.listFolderMembers({
    AwsAccountId: awsAccountId,
    FolderId: getQuickSightFolderId(databaseName, schema),
  });
  if (res && res.FolderMemberList) {
    for (const member of res.FolderMemberList) {
      if (!member.MemberId?.startsWith(QUICKSIGHT_RESOURCE_NAME_PREFIX)) {
        needDeleteFolder = false;
        continue;
      }
      await deleteFolderMembership(quickSight, awsAccountId, member.MemberArn!, member.MemberId, databaseName, schema);
    }
  }

  //delete folder
  if (needDeleteFolder) {

    try {
      await quickSight.deleteFolder({
        AwsAccountId: awsAccountId,
        FolderId: getQuickSightFolderId(databaseName, schema),
      });
    } catch (err: any) {
      if ((err as Error) instanceof ResourceNotFoundException) {
        logger.info('Folder not exist. skip delete operation.');
        return;
      }
      logger.error(`Delete QuickSight folder failed due to: ${(err as Error).message}`);
      throw err;
    }
  }
};

const deleteFolderMembership = async (quickSight: QuickSight, awsAccountId: string,
  memberArn: string, memberId: string,
  databaseName: string, schema: string): Promise<void> => {
  try {
    const memberType = getMemberType(memberArn, memberId);
    await quickSight.deleteFolderMembership({
      AwsAccountId: awsAccountId,
      FolderId: getQuickSightFolderId(databaseName, schema),
      MemberId: memberId,
      MemberType: memberType,
    });
  } catch (err: any) {
    if ((err as Error) instanceof ResourceNotFoundException) {
      logger.info('Folder membership not exist. skip delete operation.');
      return;
    }
    logger.error(`Delete QuickSight folder membership failed due to: ${(err as Error).message}`);
    throw err;
  }
};

const deleteDashboardById = async (quickSight: QuickSight, awsAccountId: string, dashboardId: string)
: Promise<DeleteDashboardCommandOutput|undefined> => {

  let deleteResult = undefined;
  try {
    deleteResult = await quickSight.deleteDashboard({
      AwsAccountId: awsAccountId,
      DashboardId: dashboardId,
    });

    await waitForDashboardDeleteCompleted(quickSight, awsAccountId, dashboardId);
  } catch (err: any) {
    if ((err as Error) instanceof ResourceNotFoundException) {
      logger.info('Dashboard not exist. skip delete operation.');
    } else {
      logger.error(`Delete QuickSight dashboard failed due to: ${(err as Error).message}`);
      throw err;
    }
  }

  logger.info(`Delete dashboard finished. dashboard id : ${dashboardId}`);

  return deleteResult;

};

const deleteAnalysisById = async (quickSight: QuickSight, awsAccountId: string, analysisId: string)
: Promise<DeleteAnalysisCommandOutput|undefined> => {

  let result = undefined;
  try {
    result = await quickSight.deleteAnalysis({
      AwsAccountId: awsAccountId,
      AnalysisId: analysisId,
      ForceDeleteWithoutRecovery: true,
    });
    await waitForAnalysisDeleteCompleted(quickSight, awsAccountId, analysisId);
  } catch (err: any) {
    if ((err as Error) instanceof ResourceNotFoundException) {
      logger.info('Analysis not exist. skip delete operation.');
    } else {
      logger.error(`Delete QuickSight analysis failed due to: ${(err as Error).message}`);
      throw err;
    }
  }

  logger.info('Delete analysis finished. Id: ', analysisId);

  return result;

};

const deleteDataSet = async (quickSight: QuickSight, awsAccountId: string,
  schema: string,
  databaseName: string,
  props: DataSetProps)
: Promise<DeleteDataSetCommandOutput|undefined> => {

  let result = undefined;
  const identifier = buildDataSetId(databaseName, schema, props.tableName);
  const datasetId = identifier.id;
  try {

    if (props.useSpice === 'yes') {
      await deleteRefreshSchedule(quickSight, awsAccountId, datasetId);
    }

    result = await quickSight.deleteDataSet({
      AwsAccountId: awsAccountId,
      DataSetId: datasetId,
    });
    await waitForDataSetDeleteCompleted(quickSight, awsAccountId, datasetId);
  } catch (err: any) {
    if ((err as Error) instanceof ResourceNotFoundException) {
      logger.info('Dataset not exist. skip delete operation.');
    } else {
      logger.error(`Delete QuickSight dataset failed due to: ${(err as Error).message}`);
      throw err;
    }
  }

  return result;

};

const createOrUpdateRefreshSchedule = async (quickSight: QuickSight, commonParams: ResourceCommonParams,
  datasetId: string, refreshInterval: RefreshInterval | undefined, lookbackColumn: string | undefined) => {
  const scheduleId = `schedule-${datasetId}`;
  const exist = await existRefrshSchedule(quickSight, commonParams.awsAccountId, datasetId, scheduleId);
  if (!exist) {
    logger.info('Start to put QuickSight refresh properties', {
      datasetId,
      lookbackColumn,
    });

    try {
      await quickSight.putDataSetRefreshProperties({
        AwsAccountId: commonParams.awsAccountId,
        DataSetId: datasetId,
        DataSetRefreshProperties: {
          RefreshConfiguration: {
            IncrementalRefresh: {
              LookbackWindow: {
                ColumnName: lookbackColumn ?? 'event_date',
                Size: 1,
                SizeUnit: LookbackWindowSizeUnit.DAY,
              },
            },
          },
        },
      });
    } catch (err: any) {
      if ((err as Error) instanceof InvalidParameterValueException) {
        logger.info('RefreshProperties exist, skip put operation.');
      } else {
        logger.error(`Put QuickSight refresh properties failed due to: ${(err as Error).message}`);
        throw err;
      }
    }

    await waitForDataSetRefreshPropertySetCompleted(quickSight, commonParams.awsAccountId, datasetId);
    logger.info('Put QuickSight refresh properties finished.');

    logger.info('Start to create QuickSight refresh schedule', {
      datasetId,
      scheduleId,
    });

    let scheduleFrequency: RefreshFrequency = {
      Interval: refreshInterval ?? RefreshInterval.DAILY,
      Timezone: commonParams.timezoneDict[commonParams.schema] ?? 'UTC',
    };

    if (refreshInterval !== RefreshInterval.HOURLY) {
      scheduleFrequency = {
        ...scheduleFrequency,
        TimeOfTheDay: '06:00',
      };
    }

    const schedule: RefreshSchedule ={
      ScheduleId: scheduleId,
      ScheduleFrequency: scheduleFrequency,
      RefreshType: IngestionType.INCREMENTAL_REFRESH,
    };

    await quickSight.createRefreshSchedule({
      AwsAccountId: commonParams.awsAccountId,
      DataSetId: datasetId,
      Schedule: schedule,
    });

    logger.info('end to create QuickSight refresh schedule', {
      datasetId,
      scheduleId,
    });
  }
};

const deleteRefreshSchedule = async (quickSight: QuickSight, awsAccountId: string, datasetId: string) => {
  const scheduleId = `schedule-${datasetId}`;
  try {
    await quickSight.deleteRefreshSchedule({
      AwsAccountId: awsAccountId,
      DataSetId: datasetId,
      ScheduleId: scheduleId,
    });
  } catch (err: any) {
    if ((err as Error) instanceof ResourceNotFoundException) {
      logger.info('Refresh schedule not exist. skip delete operation.');
    } else {
      logger.error(`Delete QuickSight refresh schedule failed due to: ${(err as Error).message}`);
      throw err;
    }
  }
};

const updateDataSet = async (quickSight: QuickSight, commonParams: ResourceCommonParams,
  dataSourceArn: string,
  props: DataSetProps,
)
: Promise<UpdateDataSetCommandOutput|undefined> => {

  try {
    const identifier = buildDataSetId(commonParams.databaseName, commonParams.schema, props.tableName);
    const datasetId = identifier.id;

    const timezone = commonParams.timezoneDict[commonParams.schema] ?? 'UTC';

    const mustacheParam: MustacheParamType = {
      schema: commonParams.databaseName.concat('.').concat(commonParams.schema),
      timezone,
    };

    logger.info('SQL to run:', Mustache.render(props.customSql, mustacheParam));

    let colGroups: ColumnGroup[] = [];
    if (props.columnGroups !== undefined) {
      for (const columnsGroup of props.columnGroups ) {
        colGroups.push({
          GeoSpatialColumnGroup: {
            Name: columnsGroup.geoSpatialColumnGroupName,
            Columns: columnsGroup.geoSpatialColumnGroupColumns,
          },
        });
      }
    }

    let dataTransforms: TransformOperation[] = [];
    let needLogicalMap = false;
    if (props.tagColumnOperations !== undefined) {
      needLogicalMap = true;
      for (const tagColOperation of props.tagColumnOperations ) {
        const tags: ColumnTag[] = [];
        for (const role of tagColOperation.columnGeographicRoles) {
          tags.push({
            ColumnGeographicRole: role as GeoSpatialDataRole,
          });
        }
        dataTransforms.push({
          TagColumnOperation: {
            ColumnName: tagColOperation.columnName,
            Tags: tags,
          },
        });
      }
    }

    if (props.projectedColumns !== undefined) {
      needLogicalMap = true;
      dataTransforms.push({
        ProjectOperation: {
          ProjectedColumns: props.projectedColumns,
        },
      });
    }

    let logicalMap = undefined;
    if (needLogicalMap) {
      logicalMap = {
        LogicalTable1: {
          Alias: 'Alias_LogicalTable1',
          Source: {
            PhysicalTableId: 'PhyTable1',
          },
          DataTransforms: dataTransforms,
        },
      };
    }

    const datasetParameters = buildDataSetParameter(props.dateTimeDatasetParameter);
    logger.info('datasetParameters: ', { datasetParameters });

    logger.info('start to update dataset');
    let dataset: UpdateDataSetCommandOutput | undefined = undefined;
    dataset = await quickSight.updateDataSet({
      AwsAccountId: commonParams.awsAccountId,
      DataSetId: datasetId,
      Name: `${identifier.tableNameIdentifier}-${identifier.schemaIdentifier}-${identifier.databaseIdentifier}`,
      ImportMode: props.useSpice === 'yes' ? DataSetImportMode.SPICE : DataSetImportMode.DIRECT_QUERY,
      PhysicalTableMap: {
        PhyTable1: {
          CustomSql: {
            DataSourceArn: dataSourceArn,
            Name: props.tableName,
            SqlQuery: Mustache.render(props.customSql, mustacheParam),
            Columns: props.columns,
          },
        },
      },
      DatasetParameters: datasetParameters,
      LogicalTableMap: needLogicalMap ? logicalMap : undefined,
      ColumnGroups: colGroups.length > 0 ? colGroups : undefined,
      DataSetUsageConfiguration: {
        DisableUseAsDirectQuerySource: false,
        DisableUseAsImportedSource: false,
      },
    });
    logger.info(`update dataset finished. Id: ${dataset?.DataSetId}`);

    await waitForDataSetCreateCompleted(quickSight, commonParams.awsAccountId, datasetId);

    await quickSight.updateDataSetPermissions({
      AwsAccountId: commonParams.awsAccountId,
      DataSetId: datasetId,
      GrantPermissions: getDataSetPermission(commonParams.sharePrincipalArn, commonParams.ownerPrincipalArn),
    });

    logger.info(`grant dataset permissions to new principal ${commonParams.ownerPrincipalArn}, ${commonParams.sharePrincipalArn}`);

    if (props.useSpice === 'yes') {
      await createOrUpdateRefreshSchedule(quickSight, commonParams, datasetId, props.refreshInterval, props.lookbackColumn);
    }

    return dataset;

  } catch (err: any) {
    logger.error(`update QuickSight dataset failed due to: ${(err as Error).message}`);
    throw err;
  }
};

const publishNewVersionDashboard = async(quickSight: QuickSight, dashboardId: string,
  versionNumber: string, awsAccountId: string) => {
  let cnt = 0;
  for (const _i of Array(100).keys()) {
    cnt += 1;
    try {
      const response = await quickSight.updateDashboardPublishedVersion({
        AwsAccountId: awsAccountId,
        DashboardId: dashboardId,
        VersionNumber: Number.parseInt(versionNumber),
      });

      if (response.DashboardId) {
        break;
      }
    } catch (err: any) {
      if (err instanceof ConflictException ) {
        logger.warn('sleep 100ms to wait publish new dashboard version finish');
        await sleep(100);
      } else {
        throw err;
      }
    }
  }
  if (cnt >= 100) {
    throw new Error(`publish dashboard new version failed after try ${cnt} times`);
  }
};

const updateDashboard = async (quickSight: QuickSight, commonParams: ResourceCommonParams,
  sourceEntity: DashboardSourceEntity, props: QuickSightDashboardDefProps)
: Promise<UpdateDashboardCommandOutput|undefined> => {
  try {
    const identifier = buildDashBoardId(commonParams.databaseName, commonParams.schema);
    const dashboardId = identifier.id;

    logger.info('start to update dashboard', { sourceEntity });
    const dashboard = await quickSight.updateDashboard({
      AwsAccountId: commonParams.awsAccountId,
      DashboardId: dashboardId,
      Name: `${props.dashboardName} - ${identifier.schemaIdentifier} - ${identifier.databaseIdentifier}`,

      SourceEntity: sourceEntity,

    });
    logger.info('update dashboard finished.', { id: dashboardId });

    await waitForDashboardChangeCompleted(quickSight, commonParams.awsAccountId, dashboardId);

    const versionNumber = dashboard.VersionArn?.substring(dashboard.VersionArn?.lastIndexOf('/') + 1);
    logger.info(`quicksight versionNumber: ${versionNumber}`);
    await publishNewVersionDashboard(quickSight, dashboardId, versionNumber ?? '1', commonParams.awsAccountId);
    logger.info('Publish new dashboard version finished.');

    await quickSight.updateDashboardPermissions({
      AwsAccountId: commonParams.awsAccountId,
      DashboardId: dashboardId,
      GrantPermissions: getDashboardPermission(commonParams.sharePrincipalArn, commonParams.ownerPrincipalArn),
    });

    logger.info(`grant dashboard permissions to new principal ${commonParams.ownerPrincipalArn} and ${commonParams.sharePrincipalArn}`);

    return dashboard;

  } catch (err: any) {
    logger.error(`update QuickSight dashboard failed due to: ${(err as Error).message}`);
    throw err;
  }
};

const grantDataSourcePermission = async (quickSight: QuickSight, dataSourceArn: string, awsAccountId: string,
  ownerPrincipalArn: string, sharePrincipalArn: string) => {
  const arnSplits = dataSourceArn.split('/');
  const dataSourceId = arnSplits[arnSplits.length - 1];
  await waitForDataSourceChangeCompleted(quickSight, awsAccountId, dataSourceId);
  await quickSight.updateDataSourcePermissions({
    AwsAccountId: awsAccountId,
    DataSourceId: dataSourceId,
    GrantPermissions: getDataSourcePermission(sharePrincipalArn, ownerPrincipalArn),
  });
};

const buildDashBoardId = function (databaseName: string, schema: string): Identifier {
  const schemaIdentifier = truncateString(schema, 40);
  const databaseIdentifier = truncateString(databaseName, 40);
  const suffix = crypto.createHash('sha256').update(`${databaseName}${schema}`).digest('hex').substring(0, 8);
  return {
    id: `clickstream_dashboard_${databaseIdentifier}_${schemaIdentifier}_${suffix}`,
    idSuffix: suffix,
    databaseIdentifier,
    schemaIdentifier,
  };
};

const buildAnalysisId = function (databaseName: string, schema: string): Identifier {
  const schemaIdentifier = truncateString(schema, 40);
  const databaseIdentifier = truncateString(databaseName, 40);
  const suffix = crypto.createHash('sha256').update(`${databaseName}${schema}`).digest('hex').substring(0, 8);
  return {
    id: `clickstream_analysis_${databaseIdentifier}_${schemaIdentifier}_${suffix}`,
    idSuffix: suffix,
    databaseIdentifier,
    schemaIdentifier,
  };
};

const buildDataSetId = function (databaseName: string, schema: string, tableName: string): Identifier {
  const tableNameIdentifier = truncateString(tableName.replace(/clickstream_/g, ''), 40);
  const schemaIdentifier = truncateString(schema, 15);
  const databaseIdentifier = truncateString(databaseName, 15);
  const suffix = crypto.createHash('sha256').update(`${databaseName}${schema}${tableName}`).digest('hex').substring(0, 8);
  return {
    id: `clickstream_dataset_${databaseIdentifier}_${schemaIdentifier}_${tableNameIdentifier}_${suffix}`,
    idSuffix: suffix,
    databaseIdentifier,
    schemaIdentifier,
    tableNameIdentifier,
  };

};

interface Identifier {
  id: string;
  idSuffix: string;
  databaseIdentifier: string;
  schemaIdentifier?: string;
  tableNameIdentifier?: string;
}
