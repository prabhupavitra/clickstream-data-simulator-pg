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

import {
  MULTI_APP_ID_PATTERN,
  OUTPUT_SERVICE_CATALOG_APPREGISTRY_APPLICATION_TAG_KEY,
  OUTPUT_SERVICE_CATALOG_APPREGISTRY_APPLICATION_TAG_VALUE,
  PROJECT_ID_PATTERN,
  SECRETS_MANAGER_ARN_PATTERN,
  OUTPUT_DATA_MODELING_REDSHIFT_SQL_EXECUTION_STATE_MACHINE_ARN_SUFFIX,
  SolutionVersion,
  SolutionInfo,
} from '@aws/clickstream-base-lib';
import { Tag } from '@aws-sdk/client-cloudformation';
import { ExecutionStatus } from '@aws-sdk/client-sfn';
import { EditedPath, getDiff } from 'json-difference';
import { truncate } from 'lodash';
import { IDictionary } from './dictionary';
import { IPlugin } from './plugin';
import { IProject } from './project';
import {
  CAppRegistryStack,
  CAthenaStack,
  CDataModelingStack,
  CDataProcessingStack,
  CIngestionServerStack,
  CKafkaConnectorStack,
  CMetricsStack,
  CReportingStack,
  getStackParameters,
} from './stacks';
import {
  CFN_RULE_PREFIX,
  CFN_TOPIC_PREFIX,
  FULL_SOLUTION_VERSION,
  PIPELINE_STACKS,
  awsAccountId,
  awsPartition,
  awsRegion,
  listenStackQueueArn,
  stackWorkflowS3Bucket,
} from '../common/constants';
import {
  BuiltInTagKeys,
  ExecutionDetail,
  PipelineStackType,
  PipelineStatusDetail,
  PipelineStatusType,
} from '../common/model-ln';
import {
  validateIngestionServerNum,
  validatePattern,
  validatePipelineNetwork,
  validateSecretModel,
} from '../common/stack-params-valid';
import {
  ClickStreamBadRequestError,
  CreateApplicationSchemasStatus,
  DataCollectionSDK,
  ENetworkType,
  IngestionServerSinkBatchProps,
  IngestionServerSizeProps,
  IngestionType,
  KinesisStreamMode,
  PipelineServerProtocol,
  PipelineSinkType,
  PipelineStatus,
  RedshiftInfo,
  StackUpdateParameter,
  WorkflowParallelBranch,
  WorkflowState,
  WorkflowStateType,
  WorkflowTemplate,
  WorkflowVersion,
} from '../common/types';
import {
  getAppRegistryStackTags,
  getPipelineStatusType,
  getStackName,
  getStackOutputFromPipelineStatus,
  getStackPrefix,
  getStackTags,
  getStateMachineExecutionName,
  getTemplateUrl,
  getUpdateTags,
  isEmpty,
  mergeIntoPipelineTags,
  mergeIntoStackTags,
} from '../common/utils';
import { StackManager } from '../service/stack';
import { getStacksDetailsByNames } from '../store/aws/cloudformation';
import { createRuleAndAddTargets } from '../store/aws/events';
import { listMSKClusterBrokers } from '../store/aws/kafka';

import { QuickSightUserArns, getClickstreamUserArn, registerClickstreamUser } from '../store/aws/quicksight';
import { getRedshiftInfo } from '../store/aws/redshift';
import { isBucketExist } from '../store/aws/s3';
import { getExecutionDetail, listExecutions } from '../store/aws/sfn';
import { createTopicAndSubscribeSQSQueue } from '../store/aws/sns';
import { ClickStreamStore } from '../store/click-stream-store';
import { DynamoDbStore } from '../store/dynamodb/dynamodb-store';

const store: ClickStreamStore = new DynamoDbStore();

interface IngestionServerLoadBalancerProps {
  readonly serverEndpointPath: string;
  readonly serverCorsOrigin: string;
  readonly protocol: PipelineServerProtocol;
  readonly notificationsTopicArn?: string;
  readonly enableGlobalAccelerator: boolean;
  readonly enableApplicationLoadBalancerAccessLog: boolean;
  readonly logS3Bucket?: S3Bucket;
  readonly authenticationSecretArn?: string;
}

interface IngestionServerSinkS3Props {
  readonly sinkBucket: S3Bucket;
  readonly s3BufferSize?: number;
  readonly s3BufferInterval?: number;
}

interface IngestionServerSinkKafkaProps {
  readonly topic: string;
  readonly brokers: string[];
  readonly securityGroupId: string;
  readonly mskCluster?: MSKClusterProps;
  readonly kafkaConnector: KafkaS3Connector;
}

interface IngestionServerSinkKinesisProps {
  readonly kinesisStreamMode: KinesisStreamMode;
  readonly kinesisShardCount?: number;
  readonly kinesisDataRetentionHours?: number;
  readonly sinkBucket: S3Bucket;
}

interface IngestionServerDomainProps {
  readonly domainName: string;
  readonly certificateArn: string;
}

interface NetworkProps {
  readonly vpcId: string;
  readonly publicSubnetIds: string[];
  privateSubnetIds: string[];
  readonly type?: ENetworkType;
}

interface RedshiftNetworkProps {
  readonly vpcId: string;
  readonly securityGroups: string[];
  readonly subnetIds: string[];
}

interface IngestionServer {
  readonly ingestionType?: IngestionType;
  readonly size: IngestionServerSizeProps;
  readonly domain?: IngestionServerDomainProps;
  readonly loadBalancer: IngestionServerLoadBalancerProps;
  readonly sinkType: PipelineSinkType;
  readonly sinkBatch?: IngestionServerSinkBatchProps;
  readonly sinkS3?: IngestionServerSinkS3Props;
  readonly sinkKafka?: IngestionServerSinkKafkaProps;
  readonly sinkKinesis?: IngestionServerSinkKinesisProps;
}

export interface DataProcessing {
  readonly dataFreshnessInHour: number;
  readonly scheduleExpression: string;
  readonly sourceS3Bucket: S3Bucket;
  readonly sinkS3Bucket: S3Bucket;
  readonly pipelineBucket: S3Bucket;
  readonly outputFormat?: 'parquet' | 'json';
  readonly transformPlugin?: string;
  readonly enrichPlugin?: string[];
}

export interface KafkaS3Connector {
  readonly enable: boolean;
  readonly sinkBucket?: S3Bucket;
  readonly maxWorkerCount?: number;
  readonly minWorkerCount?: number;
  readonly workerMcuCount?: number;
  readonly pluginUrl?: string;
  readonly customConnectorConfiguration?: string;
}

export interface DataModeling {
  readonly ods?: {
    readonly bucket: S3Bucket;
    readonly fileSuffix: string;
  };
  readonly redshift?: {
    readonly dataRange: number;
    readonly newServerless?: {
      readonly baseCapacity: number;
      readonly network: RedshiftNetworkProps;
    };
    readonly existingServerless?: {
      readonly workgroupName: string;
      readonly iamRoleArn: string;
    };
    readonly provisioned?: {
      readonly clusterIdentifier: string;
      readonly dbUser: string;
    };
  };
  readonly athena: boolean;
  readonly loadWorkflow?: {
    readonly bucket?: S3Bucket;
    readonly maxFilesLimit?: number;
  };
}

export interface Reporting {
  readonly quickSight?: {
    readonly accountName: string;
    readonly user?: string;
    readonly namespace?: string;
    readonly vpcConnection?: string;
  };
}

export interface ITag {
  readonly key: string;
  readonly value: string;
}

interface S3Bucket {
  readonly name: string;
  readonly prefix: string;
}

interface MSKClusterProps {
  readonly name: string;
  readonly arn: string;
}

export interface IAppTimezone {
  readonly appId: string;
  readonly timezone: string;
}

export interface IPipeline {
  readonly id: string;
  readonly type: string;
  readonly prefix: string;

  readonly projectId: string;
  readonly pipelineId: string;
  readonly region: string;
  readonly dataCollectionSDK: DataCollectionSDK;
  tags: ITag[];

  readonly network: NetworkProps;
  readonly bucket: S3Bucket;
  readonly ingestionServer: IngestionServer;
  readonly dataProcessing?: DataProcessing;
  readonly dataModeling?: DataModeling;
  readonly reporting?: Reporting;
  readonly timezone?: IAppTimezone[];

  lastAction?: string;
  status?: PipelineStatus;
  workflow?: WorkflowTemplate;
  templateVersion?: string;
  statusType?: PipelineStatusType;
  stackDetails?: PipelineStatusDetail[];
  executionDetail?: ExecutionDetail;
  executionArn?: string;

  readonly version: string;
  readonly versionTag: string;
  readonly createAt: number;
  updateAt: number;
  readonly operator: string;
  readonly deleted: boolean;
}

export interface CPipelineResources {
  project?: IProject;
  mskBrokers?: string[];
  appIds?: string[];
  plugins?: IPlugin[];
  redshift?: RedshiftInfo;
  solution?: IDictionary;
  templates?: IDictionary;
  quickSightSubnetIds?: string[];
  quickSightUser?: QuickSightUserArns;
  stackTags?: Tag[];
}

export class CPipeline {
  private pipeline: IPipeline;
  private stackManager: StackManager;
  private resources?: CPipelineResources;
  private validateNetworkOnce: boolean;
  private stackTags?: Tag[];

  constructor(pipeline: IPipeline) {
    this.pipeline = pipeline;
    this.stackManager = new StackManager(pipeline);
    this.validateNetworkOnce = false;
  }

  private _setExecution(nameOrArn: string) {
    let arn = '';
    let name = '';
    if (nameOrArn.startsWith('arn:')) {
      arn = nameOrArn;
      name = nameOrArn.split(':').pop() ?? '';
    } else {
      name = nameOrArn;
    }
    if (this.pipeline.status?.executionDetail) {
      this.pipeline.executionArn = arn;
      this.pipeline.status = {
        ...this.pipeline.status,
        executionDetail: {
          ...this.pipeline.status.executionDetail,
          name,
        },
      };
    }
    this.pipeline.executionDetail = {
      name,
      executionArn: arn,
      status: ExecutionStatus.RUNNING,
    };
  }

  public async create(): Promise<void> {
    // create rule to listen CFN stack
    await this._createRules();
    this.pipeline.lastAction = 'Create';
    this.pipeline.statusType = PipelineStatusType.CREATING;
    this.pipeline.templateVersion = FULL_SOLUTION_VERSION;
    const executionName = getStateMachineExecutionName(this.pipeline.pipelineId);
    this._setExecution(executionName);
    this.pipeline.workflow = await this.generateWorkflow();
    const executionArn = await this.stackManager.execute(this.pipeline.workflow, executionName);
    this._setExecution(executionArn);
    this.pipeline.stackDetails = [];
    this.pipeline.statusType = PipelineStatusType.CREATING;
    // bind plugin
    const pluginIds: string[] = [];
    if (this.pipeline.dataProcessing?.transformPlugin && !this.pipeline.dataProcessing?.transformPlugin?.startsWith('BUILT-IN')) {
      pluginIds.push(this.pipeline.dataProcessing?.transformPlugin);
    }
    const enrichIds = this.pipeline.dataProcessing?.enrichPlugin?.filter(e => !e.startsWith('BUILT-IN'));
    const allPluginIds = pluginIds.concat(enrichIds ?? []);
    if (!isEmpty(allPluginIds)) {
      await store.bindPlugins(allPluginIds, 1);
    }
  }

  private async _createRules() {
    if (!listenStackQueueArn) {
      throw new ClickStreamBadRequestError('Queue ARN not found. Please check and try again.');
    }
    const topicName = truncate(`${CFN_TOPIC_PREFIX}-${this.pipeline.pipelineId}`, {
      length: 255,
      omission: '',
    });
    const topicArn = await createTopicAndSubscribeSQSQueue(
      this.pipeline.region,
      this.pipeline.projectId,
      topicName,
      listenStackQueueArn,
    );
    if (!topicArn) {
      throw new ClickStreamBadRequestError('Topic create failed. Please check and try again.');
    }
    const cfnRulePatternResourceArn = `arn:${awsPartition}:cloudformation:${this.pipeline.region}:${awsAccountId}:stack/${getStackPrefix()}*${this.pipeline.pipelineId}/*`;
    const ruleArn = await createRuleAndAddTargets(
      this.pipeline.region,
      this.pipeline.projectId,
      truncate(`${CFN_RULE_PREFIX}-${this.pipeline.id}`, {
        length: 64,
        omission: '',
      }),
      `{\"source\":[\"aws.cloudformation\"],\"resources\":[{\"wildcard\":\"${cfnRulePatternResourceArn}\"}],\"detail-type\":[\"CloudFormation Stack Status Change\"]}`,
      topicArn,
    );
    if (!ruleArn) {
      throw new ClickStreamBadRequestError('Rule create failed. Please check and try again.');
    }
  }

  public async update(oldPipeline: IPipeline): Promise<void> {
    if (isEmpty(oldPipeline.workflow) || isEmpty(oldPipeline.workflow?.Workflow)) {
      throw new ClickStreamBadRequestError('Pipeline Workflow can not empty.');
    }
    // create rule to listen CFN stack
    await this._createRules();
    this.pipeline.lastAction = 'Update';
    this.pipeline.templateVersion = oldPipeline.templateVersion;
    this.pipeline = {
      ...this.pipeline,
      timezone: oldPipeline.timezone,
    };
    validateIngestionServerNum(this.pipeline.ingestionServer.size);
    const executionName = getStateMachineExecutionName(this.pipeline.pipelineId);
    this._setExecution(executionName);
    // update parameters
    await this._mergeUpdateParameters(oldPipeline);
    // enable reporting
    await this._updateReporting(oldPipeline);
    // update tags
    this.pipeline.tags = getUpdateTags(this.pipeline, oldPipeline);
    if (this._editStackTags(oldPipeline)) {
      this.stackManager.updateWorkflowTags();
    }
    // update workflow callback
    this.stackManager.setPipelineWorkflowCallback(executionName);
    // create new execution
    const execWorkflow = this.stackManager.getExecWorkflow();
    const executionArn = await this.stackManager.execute(execWorkflow, executionName);
    this._setExecution(executionArn);
    this.pipeline.statusType = PipelineStatusType.UPDATING;
    this.pipeline.workflow = this.stackManager.getWorkflow();
    await store.updatePipeline(this.pipeline, oldPipeline);
  }

  private async _updateReporting(oldPipeline: IPipeline) {
    if (oldPipeline.reporting?.quickSight?.accountName === this.pipeline.reporting?.quickSight?.accountName) {
      return;
    }
    if (this.pipeline.reporting?.quickSight?.accountName) {
      const reportingState = await this.getReportingState();
      if (!reportingState) {
        return;
      }
      this.stackManager.updateWorkflowReporting(reportingState);
    }
  }

  private async _mergeUpdateParameters(oldPipeline: IPipeline): Promise<void> {
    // generate parameters according to current control plane version
    const newWorkflow = await this.generateWorkflow();
    const newStackParameters = this.stackManager.getWorkflowStackParametersMap(newWorkflow.Workflow);
    const oldStackParameters = this.stackManager.getWorkflowStackParametersMap(oldPipeline.workflow?.Workflow!);
    // get diff parameters
    const diffParameters = getDiff(oldStackParameters, newStackParameters);
    const editedParameters = diffParameters.edited;

    this._checkParametersAllowEdit(editedParameters);

    this._overwriteParameters(editedParameters);

  }

  private _overwriteParameters(editedParameters: EditedPath[]): void {
    const editKeys: string[] = editedParameters.map((p: EditedPath) => p[0]);
    const editStacks: string[] = [];
    const editParameters: StackUpdateParameter[] = [];
    for (let key of editKeys) {
      const stackName = key.split('.')[0];
      const paramName = key.split('.')[1];
      const parameterValue = editedParameters.find((p: EditedPath) => p[0] === key)?.[2];
      if (!editStacks.includes(stackName)) {
        editStacks.push(stackName);
      }
      editParameters.push({
        stackName: stackName,
        parameterKey: paramName,
        parameterValue: parameterValue,
      });
    }
    // update workflow
    this.stackManager.updateWorkflowParameters(editParameters);
    this.stackManager.updateWorkflowAction(editStacks);
  }

  private _checkParametersAllowEdit(editedParameters: EditedPath[]): void {
    // AllowedList
    const AllowedList: string[] = [
      ...CIngestionServerStack.editAllowedList(),
      ...CKafkaConnectorStack.editAllowedList(),
      ...CDataProcessingStack.editAllowedList(),
      ...CDataModelingStack.editAllowedList(),
      ...CReportingStack.editAllowedList(),
      ...CMetricsStack.editAllowedList(),
    ];

    const editKeys: string[] = editedParameters.map((p: EditedPath) => p[0]);
    // check editKeys all in AllowedList
    const notAllowEdit: string[] = [];
    for (let key of editKeys) {
      const paramName = key.split('.')[1];
      if (!AllowedList.includes(paramName)) {
        notAllowEdit.push(paramName);
      }
    }
    if (!isEmpty(notAllowEdit)) {
      throw new ClickStreamBadRequestError(`Property modification not allowed: ${notAllowEdit.join(',')}.`);
    }
  }

  private _editStackTags(oldPipeline: IPipeline): boolean {
    const newStackTags = [...this.pipeline.tags];
    const oldStackTags = [...oldPipeline.tags];
    newStackTags.sort((a, b) => a.key.localeCompare(b.key));
    oldStackTags.sort((a, b) => a.key.localeCompare(b.key));
    const diffTags = getDiff(newStackTags, oldStackTags);
    return !isEmpty(diffTags.edited) || !isEmpty(diffTags.added) || !isEmpty(diffTags.removed);
  }

  public async upgrade(oldPipeline: IPipeline): Promise<void> {
    // create rule to listen CFN stack
    await this._createRules();
    this.pipeline.lastAction = 'Upgrade';
    validateIngestionServerNum(this.pipeline.ingestionServer.size);
    const executionName = getStateMachineExecutionName(this.pipeline.pipelineId);
    this._setExecution(executionName);
    this.pipeline.templateVersion = FULL_SOLUTION_VERSION;
    this.pipeline.workflow = await this.generateWorkflow();
    this.stackManager.setExecWorkflow(this.pipeline.workflow);
    const oldStackNames = this.stackManager.getWorkflowStacks(oldPipeline.workflow?.Workflow!);
    // update workflow
    this.stackManager.upgradeWorkflow(oldStackNames);
    // update workflow callback
    this.stackManager.setPipelineWorkflowCallback(executionName);
    // create new execution
    const execWorkflow = this.stackManager.getExecWorkflow();
    const executionArn = await this.stackManager.execute(execWorkflow, executionName);
    this._setExecution(executionArn);
    this.pipeline.statusType = PipelineStatusType.UPDATING;
    // update pipeline metadata
    await store.updatePipeline(this.pipeline, oldPipeline);
  }

  public async refreshStatus(refresh?: string): Promise<void> {
    if (refresh && refresh === 'force') {
      await this._forceRefreshStatus();
    } else {
      if (!this.pipeline.executionDetail) {
        this.pipeline.executionDetail = {
          executionArn: this.pipeline.executionArn ?? '',
          name: this.pipeline.status?.executionDetail.name ?? '',
          status: this.pipeline.status?.executionDetail.status as ExecutionStatus ?? ExecutionStatus.SUCCEEDED,
        };
      }
      if (!this.pipeline.stackDetails) {
        this.pipeline.stackDetails = this.pipeline.status?.stackDetails ?? [];
      }
      this.pipeline.statusType = getPipelineStatusType(this.pipeline);
    }
    await store.updatePipelineAtCurrentVersion(this.pipeline);
  }

  private async _forceRefreshStatus(): Promise<void> {
    let executionDetail;
    if (this.pipeline.executionDetail?.executionArn) {
      executionDetail = await getExecutionDetail(awsRegion, this.pipeline.executionDetail?.executionArn);
      if (executionDetail) {
        this.pipeline.executionDetail = {
          executionArn: executionDetail.executionArn ?? '',
          name: executionDetail.name ?? '',
          status: executionDetail.status,
        };
      }
    }
    if (!executionDetail) {
      this.pipeline.executionDetail = {
        executionArn: this.pipeline.executionDetail?.executionArn ?? '',
        name: this.pipeline.executionDetail?.name ?? '',
        status: ExecutionStatus.SUCCEEDED,
      };
    }
    await this._forceRefreshStacksById();
  }

  private async _forceRefreshStacksByName(): Promise<void> {
    const stackNames = this.stackManager.getWorkflowStacks(this.pipeline.workflow?.Workflow!);
    const stackStatusDetails: PipelineStatusDetail[] = await getStacksDetailsByNames(this.pipeline.region, stackNames);
    if (stackStatusDetails.length > 0) {
      this.pipeline.stackDetails = stackStatusDetails;
    }
  }

  private async _forceRefreshStacksById(): Promise<void> {
    const stackNames = this.stackManager.getWorkflowStacks(this.pipeline.workflow?.Workflow!);
    const stackDetails = this.pipeline.stackDetails ?? [];
    const stackIds: string[] = [];
    for (let stackName of stackNames) {
      const detail = stackDetails.find(s => s.stackName === stackName);
      if (detail?.stackId) {
        stackIds.push(detail?.stackId);
      } else {
        stackIds.push(stackName);
      }
    }

    const stackStatusDetails: PipelineStatusDetail[] = await getStacksDetailsByNames(this.pipeline.region, stackIds);
    if (stackStatusDetails.length > 0) {
      this.pipeline.stackDetails = stackStatusDetails;
      this.pipeline.statusType = getPipelineStatusType(this.pipeline);
    }
  }

  public async updateApp(appIds: string[]): Promise<void> {
    // create rule to listen CFN stack
    await this._createRules();
    this.pipeline.lastAction = 'Update';
    const executionName = getStateMachineExecutionName(this.pipeline.pipelineId);
    this._setExecution(executionName);
    // update appIds and timezone
    const updateList: { stackType: PipelineStackType; parameterKey: string; parameterValue: string }[] = [];
    updateList.push({
      stackType: PipelineStackType.INGESTION,
      parameterKey: 'AppIds',
      parameterValue: appIds.join(','),
    });
    updateList.push({
      stackType: PipelineStackType.DATA_PROCESSING,
      parameterKey: 'AppIds',
      parameterValue: appIds.join(','),
    });
    updateList.push({
      stackType: PipelineStackType.DATA_MODELING_REDSHIFT,
      parameterKey: 'AppIds',
      parameterValue: appIds.join(','),
    });
    updateList.push({
      stackType: PipelineStackType.DATA_MODELING_REDSHIFT,
      parameterKey: 'TimeZoneWithAppId',
      parameterValue: this.pipeline.timezone ? JSON.stringify(this.pipeline.timezone) : '',
    });
    updateList.push({
      stackType: PipelineStackType.REPORTING,
      parameterKey: 'RedShiftDBSchemaParam',
      parameterValue: appIds.join(','),
    });
    updateList.push({
      stackType: PipelineStackType.REPORTING,
      parameterKey: 'QuickSightTimezoneParam',
      parameterValue: this.pipeline.timezone ? JSON.stringify(this.pipeline.timezone) : '',
    });
    // update workflow
    this.stackManager.updateWorkflowForApp(updateList);
    // create new execution
    const execWorkflow = this.stackManager.getExecWorkflow();
    const executionArn = await this.stackManager.execute(execWorkflow, executionName);
    this._setExecution(executionArn);
    this.pipeline.statusType = PipelineStatusType.UPDATING;
    // update pipeline metadata
    this.pipeline.workflow = this.stackManager.getWorkflow();
    this.pipeline.updateAt = Date.now();
    await store.updatePipelineAtCurrentVersion(this.pipeline);
  }

  public async updateAppTimezone(): Promise<void> {
    this.pipeline.updateAt = Date.now();
    await store.updatePipelineAtCurrentVersion(this.pipeline);
  }

  public async delete(): Promise<void> {
    // create rule to listen CFN stack
    await this._createRules();
    await this._forceRefreshStacksByName();
    this.pipeline.lastAction = 'Delete';
    const executionName = getStateMachineExecutionName(this.pipeline.pipelineId);
    this._setExecution(executionName);
    // update workflow
    this.stackManager.deleteWorkflow();
    // update workflow callback
    this.stackManager.setPipelineWorkflowCallback(executionName);
    // create new execution
    const execWorkflow = this.stackManager.getExecWorkflow();
    const executionArn = await this.stackManager.execute(execWorkflow, executionName);
    this._setExecution(executionArn);
    this.pipeline.statusType = PipelineStatusType.DELETING;
    // update pipeline metadata
    this.pipeline.updateAt = Date.now();
    await store.updatePipelineAtCurrentVersion(this.pipeline);

    // bind plugin
    const pluginIds: string[] = [];
    if (this.pipeline.dataProcessing?.transformPlugin && !this.pipeline.dataProcessing?.transformPlugin?.startsWith('BUILT-IN')) {
      pluginIds.push(this.pipeline.dataProcessing?.transformPlugin);
    }
    const enrichIds = this.pipeline.dataProcessing?.enrichPlugin?.filter(e => !e.startsWith('BUILT-IN'));
    const allPluginIds = pluginIds.concat(enrichIds ?? []);
    if (!isEmpty(allPluginIds)) {
      await store.bindPlugins(allPluginIds, -1);
    }
  }

  public async retry(): Promise<void> {
    if (this.pipeline.lastAction === 'Delete') {
      await this.delete();
      return;
    }
    // create rule to listen CFN stack
    await this._createRules();
    const executionName = getStateMachineExecutionName(this.pipeline.pipelineId);
    this._setExecution(executionName);
    this.stackManager.retryWorkflow();
    // update workflow callback
    this.stackManager.setPipelineWorkflowCallback(executionName);
    // create new execution
    const execWorkflow = this.stackManager.getExecWorkflow();
    const executionArn = await this.stackManager.execute(execWorkflow, executionName);
    this._setExecution(executionArn);
    this.pipeline.statusType = PipelineStatusType.UPDATING;
    // update pipeline metadata
    await store.updatePipelineAtCurrentVersion(this.pipeline);
  }

  private async resourcesCheck(): Promise<void> {
    // Check project resources that in DDB
    validatePattern('ProjectId', PROJECT_ID_PATTERN, this.pipeline.projectId);

    await this._fillResources();

    await this._checkExistenceS3Bucket();

    if (!this.stackTags || this.stackTags?.length === 0) {
      this.patchBuiltInTags();
      this.stackTags = getStackTags(this.pipeline);
    }

    if (!this.validateNetworkOnce) {
      this.validateNetworkOnce = true;
      await validatePipelineNetwork(this.pipeline, this.resources!);
    }

    if (this.pipeline.ingestionServer.loadBalancer.authenticationSecretArn) {
      if (this.pipeline.ingestionServer.loadBalancer.protocol === PipelineServerProtocol.HTTP) {
        throw new ClickStreamBadRequestError(
          'Validation error: you must select protocol as HTTPS if open the authentication for ingestion server.',
        );
      }
      await validateSecretModel(this.pipeline.region, 'AuthenticationSecretArn',
        this.pipeline.ingestionServer.loadBalancer.authenticationSecretArn, SECRETS_MANAGER_ARN_PATTERN);
    }

    if (this.pipeline.reporting) {
      await registerClickstreamUser();
      const quickSightUser = await getClickstreamUserArn(
        SolutionVersion.Of(this.pipeline.templateVersion ?? FULL_SOLUTION_VERSION),
        this.pipeline.reporting.quickSight?.user ?? '',
      );
      this.resources = {
        ...this.resources,
        quickSightUser: quickSightUser,
      };
    }
  }

  private async _checkExistenceS3Bucket() {
    const isExisted = await isBucketExist(this.pipeline.region, this.pipeline.bucket.name);
    if (!isExisted) {
      throw new ClickStreamBadRequestError(`Validation error: bucket ${this.pipeline.bucket.name} not found. Please check and try again.`);
    }
  }

  private async _fillResources() {
    if (!this.resources?.project) {
      this.resources = {
        ...this.resources,
        project: await this._getProject(this.pipeline),
      };
    }

    if (!this.resources.appIds) {
      this.resources = {
        ...this.resources,
        appIds: await this._getAppIds(this.pipeline),
      };
    }

    if (!this.resources.plugins) {
      this.resources = {
        ...this.resources,
        plugins: await store.listPlugin('', 'asc'),
      };
    }

    if (!this.resources.solution || !this.resources.templates) {
      this.resources = {
        ...this.resources,
        solution: await store.getDictionary('Solution'),
        templates: await store.getDictionary('Templates'),
      };
    }

    // Check AWS account resources
    if (!this.resources.mskBrokers && this.pipeline.ingestionServer.sinkKafka?.mskCluster?.arn) {
      this.resources = {
        ...this.resources,
        mskBrokers: await listMSKClusterBrokers(this.pipeline.region,
          this.pipeline.ingestionServer.sinkKafka?.mskCluster?.arn),
      };
    }

    const workgroupName = this.pipeline.dataModeling?.redshift?.existingServerless?.workgroupName;
    const clusterIdentifier = this.pipeline.dataModeling?.redshift?.provisioned?.clusterIdentifier;
    if (!this.resources.redshift && (workgroupName || clusterIdentifier)) {
      const redshift = await getRedshiftInfo(this.pipeline.region, workgroupName, clusterIdentifier);
      if (!redshift) {
        throw new ClickStreamBadRequestError('Redshift info no found. Please check and try again.');
      }
      this.resources = {
        ...this.resources,
        redshift,
      };
    }
  }

  private async _getProject(pipeline: IPipeline) {
    const project = await store.getProject(pipeline.projectId);
    if (!project) {
      throw new ClickStreamBadRequestError('Project no found. Please check and try again.');
    }
    return project;
  }

  private async _getAppIds(pipeline: IPipeline) {
    const apps = await store.listApplication(pipeline.projectId, 'asc');
    const appIds = apps.map(a => a.appId);
    if (!isEmpty(appIds)) {
      validatePattern('AppId', MULTI_APP_ID_PATTERN, appIds.join(','));
    }

    return appIds;
  }

  public async getStackTemplateNameUrlMap() {
    const stackNames = this.stackManager.getWorkflowStacks(this.pipeline.workflow?.Workflow!);
    const stackTemplateMap = new Map();
    for (let stackName of stackNames) {
      const cutPrefixName = stackName.substring(getStackPrefix().length);
      const stackType = cutPrefixName.split('-')[1] as PipelineStackType;
      let templateName: string = stackType;
      if (stackType === PipelineStackType.INGESTION) {
        templateName = `${stackType}_${this.pipeline.ingestionServer.sinkType}`;
      }
      const templateURL = await this.getTemplateUrl(templateName);
      stackTemplateMap.set(stackName, templateURL);
    }
    return stackTemplateMap;
  };

  public async getTemplateUrl(name: string) {
    if (!this.resources?.solution || !this.resources?.templates) {
      const solution = await store.getDictionary('Solution');
      const templates = await store.getDictionary('Templates');
      this.resources = {
        ...this.resources,
        solution,
        templates,
      };
    }
    if (isEmpty(this.resources?.templates?.data[name])) {
      return undefined;
    }
    const templateName = this.resources?.templates?.data[name] as string;
    return getTemplateUrl(templateName, this.resources?.solution);
  };

  private patchBuiltInTags() {
    const version = SolutionVersion.Of(this.pipeline.templateVersion ?? FULL_SOLUTION_VERSION);
    if (this.resources?.solution) {
      const builtInTagKeys = [
        BuiltInTagKeys.AWS_SOLUTION,
        BuiltInTagKeys.AWS_SOLUTION_VERSION,
        BuiltInTagKeys.CLICKSTREAM_PROJECT,
      ];
      const keys = this.pipeline.tags.map(tag => tag.key);
      for (let builtInTagKey of builtInTagKeys) {
        if (keys.includes(builtInTagKey)) {
          const index = keys.indexOf(builtInTagKey);
          this.pipeline.tags.splice(index, 1);
          keys.splice(index, 1);
        }
      }

      // Add preset tags to the beginning of the tags array
      this.pipeline.tags.unshift({
        key: BuiltInTagKeys.AWS_SOLUTION,
        value: SolutionInfo.SOLUTION_SHORT_NAME,
      }, {
        key: BuiltInTagKeys.AWS_SOLUTION_VERSION,
        value: version.fullVersion,
      }, {
        key: BuiltInTagKeys.CLICKSTREAM_PROJECT,
        value: this.pipeline.projectId,
      });
    }
  };

  public async generateWorkflow(): Promise<WorkflowTemplate> {
    await this.resourcesCheck();

    return {
      Version: WorkflowVersion.V20220315,
      Workflow: await this.generateAppRegistryWorkflow(),
    };
  }

  private async generatePipelineStacksWorkflow(): Promise<WorkflowState> {
    const state: WorkflowState = {
      Type: WorkflowStateType.PARALLEL,
      End: true,
      Branches: [],
    };

    if (!isEmpty(this.pipeline.ingestionServer)) {
      const branch = await this.getWorkflowStack(PipelineStackType.INGESTION);
      if (branch) {
        state.Branches?.push(branch);
      }
    }

    if (!isEmpty(this.pipeline.dataProcessing)) {
      const branch = await this.getWorkflowStack(PipelineStackType.DATA_PROCESSING);
      if (branch) {
        state.Branches?.push(branch);
      }
    }

    const metricsBranch = await this.getWorkflowStack(PipelineStackType.METRICS);
    if (metricsBranch) {
      state.Branches?.push(metricsBranch);
    }

    return state;
  }

  private async generateAppRegistryWorkflow(): Promise<WorkflowState> {
    if (!stackWorkflowS3Bucket) {
      throw new ClickStreamBadRequestError('Stack Workflow S3Bucket can not empty.');
    }

    const appRegistryTemplateURL = await this.getTemplateUrl(PipelineStackType.APP_REGISTRY);
    if (!appRegistryTemplateURL) {
      throw new ClickStreamBadRequestError('Template: AppRegistry not found in dictionary.');
    }

    const appRegistryStack = new CAppRegistryStack(this.pipeline);
    const appRegistryParameters = getStackParameters(appRegistryStack, SolutionVersion.Of(this.pipeline.templateVersion ?? FULL_SOLUTION_VERSION));
    const appRegistryStackName = getStackName(this.pipeline.pipelineId, PipelineStackType.APP_REGISTRY, this.pipeline.ingestionServer.sinkType);

    const appRegistryState: WorkflowState = {
      Type: WorkflowStateType.STACK,
      Data: {
        Input: {
          Action: 'Create',
          Region: this.pipeline.region,
          StackName: appRegistryStackName,
          TemplateURL: appRegistryTemplateURL,
          Parameters: appRegistryParameters,
          Tags: getAppRegistryStackTags(this.stackTags),
        },
        Callback: {
          BucketName: stackWorkflowS3Bucket,
          BucketPrefix: `clickstream/workflow/${this.pipeline.executionDetail?.name ?? this.pipeline.status?.executionDetail?.name}`,
        },
      },
      Next: PIPELINE_STACKS,
    };

    // Add awsApplication tag to start viewing the cost, security, and operational metrics for the application
    if (this.pipeline.templateVersion === FULL_SOLUTION_VERSION) {
      const awsApplicationTag: Tag = {
        Key: `#.${appRegistryStackName}.${OUTPUT_SERVICE_CATALOG_APPREGISTRY_APPLICATION_TAG_KEY}`,
        Value: `#.${appRegistryStackName}.${OUTPUT_SERVICE_CATALOG_APPREGISTRY_APPLICATION_TAG_VALUE}`,
      };
      mergeIntoStackTags(this.stackTags, awsApplicationTag);
      mergeIntoPipelineTags(this.pipeline.tags, awsApplicationTag); // Save tag to pipeline tags for persistence
    }
    return {
      Type: WorkflowStateType.PARALLEL,
      End: true,
      Branches: [
        {
          StartAt: PipelineStackType.APP_REGISTRY,
          States: {
            [PipelineStackType.APP_REGISTRY]: appRegistryState,
            [PIPELINE_STACKS]: await this.generatePipelineStacksWorkflow(),
          },
        },
      ],
    };
  }

  private async getWorkflowStack(type: PipelineStackType): Promise<WorkflowParallelBranch | undefined> {
    if (!stackWorkflowS3Bucket) {
      throw new ClickStreamBadRequestError('Stack Workflow S3Bucket can not empty.');
    }
    switch (type) {
      case PipelineStackType.INGESTION:
        return this._getIngestionWorkflow(stackWorkflowS3Bucket);
      case PipelineStackType.DATA_PROCESSING:
        if (this.pipeline.ingestionServer.sinkType === PipelineSinkType.KAFKA && !this.pipeline.ingestionServer.sinkKafka?.kafkaConnector.enable) {
          return undefined;
        }
        return this._getDataProcessingWorkflow(stackWorkflowS3Bucket);
      case PipelineStackType.METRICS:
        return this._getMetricsWorkflow(stackWorkflowS3Bucket);
      default:
        return undefined;
    }
  }

  private async _getMetricsWorkflow(bucketName: string): Promise<WorkflowParallelBranch> {
    const metricsTemplateURL = await this.getTemplateUrl(PipelineStackType.METRICS);
    if (!metricsTemplateURL) {
      throw new ClickStreamBadRequestError('Template: metrics not found in dictionary.');
    }

    const metricsStack = new CMetricsStack(this.pipeline, this.resources!);
    const metricsStackParameters = getStackParameters(metricsStack, SolutionVersion.Of(this.pipeline.templateVersion ?? FULL_SOLUTION_VERSION));
    const metricsStackStackName = getStackName(this.pipeline.pipelineId, PipelineStackType.METRICS, this.pipeline.ingestionServer.sinkType);
    const metricsState: WorkflowState = {
      Type: WorkflowStateType.STACK,
      Data: {
        Input: {
          Action: 'Create',
          Region: this.pipeline.region,
          StackName: metricsStackStackName,
          TemplateURL: metricsTemplateURL,
          Parameters: metricsStackParameters,
          Tags: this.stackTags,
        },
        Callback: {
          BucketName: bucketName,
          BucketPrefix: `clickstream/workflow/${this.pipeline.executionDetail?.name ?? this.pipeline.status?.executionDetail?.name}`,
        },
      },
      End: true,
    };
    return {
      StartAt: PipelineStackType.METRICS,
      States: {
        [PipelineStackType.METRICS]: metricsState,
      },
    };
  }

  private async _getDataProcessingWorkflow(bucketName: string): Promise<WorkflowParallelBranch> {
    const dataPipelineTemplateURL = await this.getTemplateUrl(PipelineStackType.DATA_PROCESSING);
    if (!dataPipelineTemplateURL) {
      throw new ClickStreamBadRequestError('Template: data-pipeline not found in dictionary.');
    }

    const dataProcessingStack = new CDataProcessingStack(this.pipeline, this.resources!);
    const dataProcessingStackParameters = getStackParameters(
      dataProcessingStack, SolutionVersion.Of(this.pipeline.templateVersion ?? FULL_SOLUTION_VERSION));
    const dataProcessingStackName = getStackName(
      this.pipeline.pipelineId, PipelineStackType.DATA_PROCESSING, this.pipeline.ingestionServer.sinkType);
    const dataProcessingState: WorkflowState = {
      Type: WorkflowStateType.STACK,
      Data: {
        Input: {
          Action: 'Create',
          Region: this.pipeline.region,
          StackName: dataProcessingStackName,
          TemplateURL: dataPipelineTemplateURL,
          Parameters: dataProcessingStackParameters,
          Tags: this.stackTags,
        },
        Callback: {
          BucketName: bucketName,
          BucketPrefix: `clickstream/workflow/${this.pipeline.executionDetail?.name ?? this.pipeline.status?.executionDetail?.name}`,
        },
      },
      End: true,
    };
    const branch: WorkflowParallelBranch = {
      StartAt: PipelineStackType.DATA_PROCESSING,
      States: {
        [PipelineStackType.DATA_PROCESSING]: dataProcessingState,
      },
    };
    const athenaState = await this.getAthenaState();
    if (athenaState) {
      branch.States[PipelineStackType.ATHENA] = athenaState;
      branch.States[PipelineStackType.DATA_PROCESSING].Next = PipelineStackType.ATHENA;
      delete branch.States[PipelineStackType.DATA_PROCESSING].End;
    }
    const dataModelingState = await this.getDataModelingState();
    if (dataModelingState) {
      if (athenaState) {
        branch.States[PipelineStackType.DATA_MODELING_REDSHIFT] = dataModelingState;
        branch.States[PipelineStackType.ATHENA].Next = PipelineStackType.DATA_MODELING_REDSHIFT;
        delete branch.States[PipelineStackType.ATHENA].End;
      } else {
        branch.States[PipelineStackType.DATA_MODELING_REDSHIFT] = dataModelingState;
        branch.States[PipelineStackType.DATA_PROCESSING].Next = PipelineStackType.DATA_MODELING_REDSHIFT;
        delete branch.States[PipelineStackType.DATA_PROCESSING].End;
      }
    }
    const reportingState = await this.getReportingState();
    if (reportingState && dataModelingState) {
      branch.States[PipelineStackType.REPORTING] = reportingState;
      branch.States[PipelineStackType.DATA_MODELING_REDSHIFT].Next = PipelineStackType.REPORTING;
      delete branch.States[PipelineStackType.DATA_MODELING_REDSHIFT].End;
    }
    return branch;
  }

  private async _getIngestionWorkflow(bucketName: string): Promise<WorkflowParallelBranch> {
    const ingestionTemplateKey = `${PipelineStackType.INGESTION}_${this.pipeline.ingestionServer.sinkType}`;
    const ingestionTemplateURL = await this.getTemplateUrl(ingestionTemplateKey);
    if (!ingestionTemplateURL) {
      throw new ClickStreamBadRequestError(`Template: ${ingestionTemplateKey} not found in dictionary.`);
    }
    const ingestionStack = new CIngestionServerStack(this.pipeline, this.resources!);
    const ingestionStackParameters = getStackParameters(ingestionStack, SolutionVersion.Of(this.pipeline.templateVersion ?? FULL_SOLUTION_VERSION));
    const ingestionStackName = getStackName(this.pipeline.pipelineId, PipelineStackType.INGESTION, this.pipeline.ingestionServer.sinkType);
    const ingestionState: WorkflowState = {
      Type: WorkflowStateType.STACK,
      Data: {
        Input: {
          Action: 'Create',
          Region: this.pipeline.region,
          StackName: ingestionStackName,
          TemplateURL: ingestionTemplateURL,
          Parameters: ingestionStackParameters,
          Tags: this.stackTags,
        },
        Callback: {
          BucketName: bucketName,
          BucketPrefix: `clickstream/workflow/${this.pipeline.executionDetail?.name ?? this.pipeline.status?.executionDetail?.name}`,
        },
      },
    };

    if (this.pipeline.ingestionServer.sinkType === PipelineSinkType.KAFKA && this.pipeline.ingestionServer.sinkKafka?.kafkaConnector.enable) {
      const kafkaConnectorTemplateURL = await this.getTemplateUrl(PipelineStackType.KAFKA_CONNECTOR);
      if (!kafkaConnectorTemplateURL) {
        throw new ClickStreamBadRequestError('Template: kafka-s3-sink not found in dictionary.');
      }
      const kafkaConnectorStack = new CKafkaConnectorStack(this.pipeline, this.resources!);
      const kafkaConnectorStackParameters = getStackParameters(
        kafkaConnectorStack, SolutionVersion.Of(this.pipeline.templateVersion ?? FULL_SOLUTION_VERSION));
      const kafkaConnectorStackName = getStackName(
        this.pipeline.pipelineId, PipelineStackType.KAFKA_CONNECTOR, this.pipeline.ingestionServer.sinkType);
      const kafkaConnectorState: WorkflowState = {
        Type: WorkflowStateType.STACK,
        Data: {
          Input: {
            Action: 'Create',
            Region: this.pipeline.region,
            StackName: kafkaConnectorStackName,
            TemplateURL: kafkaConnectorTemplateURL,
            Parameters: kafkaConnectorStackParameters,
            Tags: this.stackTags,
          },
          Callback: {
            BucketName: bucketName,
            BucketPrefix: `clickstream/workflow/${this.pipeline.executionDetail?.name ?? this.pipeline.status?.executionDetail?.name}`,
          },
        },
        End: true,
      };
      ingestionState.Next = PipelineStackType.KAFKA_CONNECTOR;
      return {
        StartAt: PipelineStackType.INGESTION,
        States: {
          [PipelineStackType.INGESTION]: ingestionState,
          [PipelineStackType.KAFKA_CONNECTOR]: kafkaConnectorState,
        },
      };
    }
    ingestionState.End = true;
    return {
      StartAt: PipelineStackType.INGESTION,
      States: {
        [PipelineStackType.INGESTION]: ingestionState,
      },
    };
  }

  private async getDataModelingState(): Promise<WorkflowState | undefined> {
    if (isEmpty(this.pipeline.dataModeling?.redshift)) {
      return undefined;
    }
    if (this.pipeline.ingestionServer.sinkType === 'kafka' && !this.pipeline.ingestionServer.sinkKafka?.kafkaConnector.enable) {
      return undefined;
    }
    const dataModelingTemplateURL = await this.getTemplateUrl(PipelineStackType.DATA_MODELING_REDSHIFT);
    if (!dataModelingTemplateURL) {
      throw new ClickStreamBadRequestError('Template: data-analytics not found in dictionary.');
    }

    const dataModelingStack = new CDataModelingStack(this.pipeline, this.resources!);
    const dataModelingStackParameters = getStackParameters(
      dataModelingStack, SolutionVersion.Of(this.pipeline.templateVersion ?? FULL_SOLUTION_VERSION));
    const dataModelingStackName = getStackName(
      this.pipeline.pipelineId, PipelineStackType.DATA_MODELING_REDSHIFT, this.pipeline.ingestionServer.sinkType);
    const dataModelingState: WorkflowState = {
      Type: WorkflowStateType.STACK,
      Data: {
        Input: {
          Action: 'Create',
          Region: this.pipeline.region,
          StackName: dataModelingStackName,
          TemplateURL: dataModelingTemplateURL,
          Parameters: dataModelingStackParameters,
          Tags: this.stackTags,
        },
        Callback: {
          BucketName: stackWorkflowS3Bucket ?? '',
          BucketPrefix: `clickstream/workflow/${this.pipeline.executionDetail?.name ?? this.pipeline.status?.executionDetail?.name}`,
        },
      },
      End: true,
    };
    return dataModelingState;
  }

  private async getReportingState(): Promise<WorkflowState | undefined> {
    if (isEmpty(this.pipeline.reporting)) {
      return undefined;
    }
    const reportTemplateURL = await this.getTemplateUrl(PipelineStackType.REPORTING);
    if (!reportTemplateURL) {
      throw new ClickStreamBadRequestError('Template: quicksight not found in dictionary.');
    }
    const reportStack = new CReportingStack(this.pipeline, this.resources!);
    const reportStackParameters = getStackParameters(reportStack, SolutionVersion.Of(this.pipeline.templateVersion ?? FULL_SOLUTION_VERSION));
    const reportStackName = getStackName(this.pipeline.pipelineId, PipelineStackType.REPORTING, this.pipeline.ingestionServer.sinkType);
    const reportState: WorkflowState = {
      Type: WorkflowStateType.STACK,
      Data: {
        Input: {
          Action: 'Create',
          Region: this.pipeline.region,
          StackName: reportStackName,
          TemplateURL: reportTemplateURL,
          Parameters: reportStackParameters,
          Tags: this.stackTags,
        },
        Callback: {
          BucketName: stackWorkflowS3Bucket ?? '',
          BucketPrefix: `clickstream/workflow/${this.pipeline.executionDetail?.name ?? this.pipeline.status?.executionDetail?.name}`,
        },
      },
      End: true,
    };

    return reportState;
  }

  private async getAthenaState(): Promise<WorkflowState | undefined> {
    if (!this.pipeline.dataModeling?.athena) {
      return undefined;
    }
    const athenaTemplateURL = await this.getTemplateUrl(PipelineStackType.ATHENA);
    if (!athenaTemplateURL) {
      throw new ClickStreamBadRequestError('Template: Athena not found in dictionary.');
    }
    const athenaStack = new CAthenaStack(this.pipeline);
    const athenaStackParameters = getStackParameters(athenaStack, SolutionVersion.Of(this.pipeline.templateVersion ?? FULL_SOLUTION_VERSION));
    const athenaStackName = getStackName(this.pipeline.pipelineId, PipelineStackType.ATHENA, this.pipeline.ingestionServer.sinkType);
    const athenaState: WorkflowState = {
      Type: WorkflowStateType.STACK,
      Data: {
        Input: {
          Action: 'Create',
          Region: this.pipeline.region,
          StackName: athenaStackName,
          TemplateURL: athenaTemplateURL,
          Parameters: athenaStackParameters,
          Tags: this.stackTags,
        },
        Callback: {
          BucketName: stackWorkflowS3Bucket ?? '',
          BucketPrefix: `clickstream/workflow/${this.pipeline.executionDetail?.name ?? this.pipeline.status?.executionDetail?.name}`,
        },
      },
      End: true,
    };

    return athenaState;
  }

  public getStackOutputBySuffixes(stackType: PipelineStackType, outputKeySuffixes: string[]): Map<string, string> {
    const res: Map<string, string> = new Map<string, string>();
    const stackDetails = this.pipeline.stackDetails ?? this.pipeline.status?.stackDetails;
    const stack = stackDetails?.filter(s => s.stackType === stackType);
    if (!stack) {
      return res;
    }
    for (let suffix of outputKeySuffixes) {
      if (stack[0].outputs) {
        for (let out of stack[0].outputs) {
          if (out.OutputKey?.endsWith(suffix)) {
            res.set(suffix, out.OutputValue ?? '');
            break;
          }
        }
      }
    }
    return res;
  }

  public async getPluginsInfo() {
    if (!this.resources?.plugins) {
      const plugins = await store.listPlugin('', 'asc');
      this.resources = {
        ...this.resources,
        plugins: plugins,
      };
    }
    let transformPlugin = this.resources.plugins?.find(plugin => plugin.id === 'BUILT-IN-1');
    if (this.pipeline.dataProcessing?.transformPlugin) {
      transformPlugin = this.resources.plugins?.find(plugin => plugin.id === this.pipeline.dataProcessing?.transformPlugin);
    }
    const enrichPlugin = this.resources.plugins?.filter(plugin => this.pipeline.dataProcessing?.enrichPlugin?.includes(plugin.id));
    return {
      transformPlugin,
      enrichPlugin,
    };
  };

  public getTemplateInfo() {
    return {
      isLatest: this.pipeline.templateVersion === FULL_SOLUTION_VERSION,
      pipelineVersion: this.pipeline.templateVersion,
      solutionVersion: FULL_SOLUTION_VERSION,
    };
  };

  public async getCreateApplicationSchemasStatus(appIds: string[]) {
    const schemasStatus: CreateApplicationSchemasStatus[] = [];
    for (let appId of appIds) {
      schemasStatus.push({
        appId: appId,
        status: undefined,
      });
    }
    const createApplicationSchemasStateMachine = getStackOutputFromPipelineStatus(
      this.pipeline.stackDetails ?? this.pipeline.status?.stackDetails,
      PipelineStackType.DATA_MODELING_REDSHIFT,
      OUTPUT_DATA_MODELING_REDSHIFT_SQL_EXECUTION_STATE_MACHINE_ARN_SUFFIX);
    if (!createApplicationSchemasStateMachine) {
      return schemasStatus;
    }
    const executions = await listExecutions(this.pipeline.region, createApplicationSchemasStateMachine);
    const editedAppIds: string[] = [];
    for (let execution of executions) {
      const nameStr = execution.name?.split('-');
      let appId = '';
      if (nameStr && nameStr.length === 3 && nameStr[1].length === 19) {
        appId = nameStr[0];
      } else if (execution.executionArn) {
        const executionDetail = await getExecutionDetail(this.pipeline.region, execution.executionArn);
        appId = this._getAppIdFromInputStr(executionDetail?.input);
      }
      const status = schemasStatus.find(s => s.appId === appId);
      if (appId && status && !editedAppIds.includes(appId)) {
        status.status = execution.status;
        status.executionArn = execution.executionArn;
        editedAppIds.push(appId);
      }
      if (editedAppIds.length === appIds.length) {
        break;
      }
    }
    return schemasStatus;
  };

  private _getAppIdFromInputStr(input?: string): string {
    try {
      if (!input) {
        return '';
      }
      const inputJson = JSON.parse(input);
      const sqls = inputJson.sqls;
      if (sqls && sqls.length > 0) {
        const sql = sqls[0];
        const paths = sql.split('/sqls/');
        if (paths.length === 2) {
          const appStr = paths[1].split('-');
          if (appStr.length === 2) {
            return appStr[0];
          }
        }
      }
      return '';
    } catch (e) {
      return '';
    }
  }
}