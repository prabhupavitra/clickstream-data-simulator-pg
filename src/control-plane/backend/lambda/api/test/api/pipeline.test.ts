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

import { OUTPUT_DATA_MODELING_REDSHIFT_SQL_EXECUTION_STATE_MACHINE_ARN_SUFFIX, SolutionVersion } from '@aws/clickstream-base-lib';
import { DescribeStacksCommand, CloudFormationClient, StackStatus } from '@aws-sdk/client-cloudformation';
import { CloudWatchEventsClient, PutRuleCommand, TagResourceCommand as EventTagResourceCommand } from '@aws-sdk/client-cloudwatch-events';
import { TransactWriteItemsCommand } from '@aws-sdk/client-dynamodb';
import {
  EC2Client,
  DescribeSubnetsCommand,
  DescribeRouteTablesCommand,
  DescribeVpcEndpointsCommand,
  DescribeSecurityGroupRulesCommand,
} from '@aws-sdk/client-ec2';
import {
  IAMClient,
} from '@aws-sdk/client-iam';
import { KafkaClient } from '@aws-sdk/client-kafka';
import {
  DescribeAccountSubscriptionCommand,
  QuickSightClient,
} from '@aws-sdk/client-quicksight';
import {
  RedshiftClient,
} from '@aws-sdk/client-redshift';
import {
  RedshiftServerlessClient,
} from '@aws-sdk/client-redshift-serverless';
import {
  BucketLocationConstraint,
  GetBucketPolicyCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
import { DescribeExecutionCommand, ExecutionStatus, ListExecutionsCommand, SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { CreateTopicCommand, SNSClient, TagResourceCommand as SNSTagResourceCommand } from '@aws-sdk/client-sns';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import request from 'supertest';
import {
  createEventRuleMock,
  createPipelineMock,
  createPipelineMockForBJSRegion,
  createSNSTopicMock,
  dictionaryMock,
  MOCK_APP_ID,
  MOCK_EXECUTION_ID,
  MOCK_PIPELINE_ID,
  MOCK_PLUGIN_ID,
  MOCK_PROJECT_ID,
  MOCK_SOLUTION_VERSION,
  MOCK_TOKEN,
  pipelineExistedMock,
  projectExistedMock,
  tokenMock,
} from './ddb-mock';
import {
  KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE,
  KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW,
  S3_INGESTION_PIPELINE,
  KINESIS_DATA_PROCESSING_NEW_REDSHIFT_QUICKSIGHT_PIPELINE,
  KINESIS_DATA_PROCESSING_PROVISIONED_REDSHIFT_EMPTY_DBUSER_QUICKSIGHT_PIPELINE,
  KINESIS_DATA_PROCESSING_NEW_REDSHIFT_UPDATE_PIPELINE_WITH_WORKFLOW,
  KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW_FOR_UPGRADE,
  KINESIS_DATA_PROCESSING_PROVISIONED_REDSHIFT_QUICKSIGHT_PIPELINE,
  S3_INGESTION_HTTP_AUTHENTICATION_PIPELINE,
  KINESIS_DATA_PROCESSING_NEW_REDSHIFT_WITH_ERROR_RPU_PIPELINE,
  KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW_AND_EXPRESSION_UPDATE,
  KINESIS_DATA_PROCESSING_PROVISIONED_REDSHIFT_ERROR_DBUSER_QUICKSIGHT_PIPELINE,
  BASE_STATUS,
  S3_DATA_PROCESSING_WITH_ERROR_PREFIX_PIPELINE,
  RETRY_PIPELINE_WITH_WORKFLOW_AND_ROLLBACK_COMPLETE,
  MSK_DATA_PROCESSING_NEW_SERVERLESS_PIPELINE_WITH_WORKFLOW,
  stackDetailsWithOutputs,
  KINESIS_DATA_PROCESSING_PROVISIONED_REDSHIFT_THIRDPARTY_PIPELINE,
} from './pipeline-mock';
import { FULL_SOLUTION_VERSION, clickStreamTableName, dictionaryTableName, prefixTimeGSIName } from '../../common/constants';
import { BuiltInTagKeys, PipelineStatusType } from '../../common/model-ln';
import { PipelineServerProtocol } from '../../common/types';
import { getDefaultTags, getStackPrefix } from '../../common/utils';
import { app, server } from '../../index';
import 'aws-sdk-client-mock-jest';

const ddbMock = mockClient(DynamoDBDocumentClient);
const sfnMock = mockClient(SFNClient);
const cloudFormationMock = mockClient(CloudFormationClient);
const kafkaMock = mockClient(KafkaClient);
const redshiftMock = mockClient(RedshiftClient);
const redshiftServerlessMock = mockClient(RedshiftServerlessClient);
const secretsManagerMock = mockClient(SecretsManagerClient);
const ec2Mock = mockClient(EC2Client);
const quickSightMock = mockClient(QuickSightClient);
const s3Mock = mockClient(S3Client);
const iamMock = mockClient(IAMClient);
const cloudWatchEventsMock = mockClient(CloudWatchEventsClient);
const snsMock = mockClient(SNSClient);

const mockClients = {
  ddbMock,
  sfnMock,
  cloudFormationMock,
  kafkaMock,
  redshiftMock,
  redshiftServerlessMock,
  secretsManagerMock,
  ec2Mock,
  quickSightMock,
  s3Mock,
  iamMock,
  cloudWatchEventsMock,
  snsMock,
};

describe('Pipeline test', () => {
  beforeEach(() => {
    ddbMock.reset();
    sfnMock.reset();
    cloudFormationMock.reset();
    kafkaMock.reset();
    redshiftMock.reset();
    redshiftServerlessMock.reset();
    secretsManagerMock.reset();
    ec2Mock.reset();
    quickSightMock.reset();
    s3Mock.reset();
    iamMock.reset();
    cloudWatchEventsMock.reset();
    snsMock.reset();
  });
  it('Create pipeline', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
    });
    ddbMock.on(PutCommand).resolves({});
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_QUICKSIGHT_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.message).toEqual('Pipeline added.');
    expect(res.body.success).toEqual(true);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeVpcEndpointsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSecurityGroupRulesCommand, 2);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSubnetsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeRouteTablesCommand, 1);
    expect(ddbMock).toHaveReceivedCommandTimes(PutCommand, 1);
  });
  it('Create rule with rule name too long', async () => {
    tokenMock(ddbMock, false);
    const longId = Array(25).join('long');
    ddbMock.on(GetCommand, {
      TableName: clickStreamTableName,
      Key: {
        id: longId,
        type: `METADATA#${longId}`,
      },
    }).resolves({
      Item: {
        id: longId,
        deleted: false,
      },
    });
    ddbMock.on(GetCommand, {
      TableName: clickStreamTableName,
      Key: {
        id: longId,
        type: `PIPELINE#${MOCK_PIPELINE_ID}#latest`,
      },
    }).resolves({
      Item: {
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW,
        id: longId,
        statusType: PipelineStatusType.ACTIVE,
        executionDetail: {
          name: MOCK_EXECUTION_ID,
          status: ExecutionStatus.FAILED,
        },
      },
    });
    snsMock.on(CreateTopicCommand).resolves({
      TopicArn: 'arn:aws:sns:us-west-2:123456789012:ClickstreamTopicForCFN',
    });
    cloudWatchEventsMock.on(PutRuleCommand).resolves({
      RuleArn: 'arn:aws:events:us-west-2:123456789012:rule/ClickstreamTopicForCFN',
    });
    sfnMock.on(StartExecutionCommand).resolves({ executionArn: 'xxx' });
    ddbMock.on(UpdateCommand).resolves({});
    const res = await request(app)
      .post(`/api/pipeline/${MOCK_PIPELINE_ID}/retry?pid=${longId}`)
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(201);
    expect(res.body.success).toEqual(true);
    expect(cloudWatchEventsMock).toHaveReceivedCommandWith(PutRuleCommand, {
      EventPattern: '{"source":["aws.cloudformation"],"resources":[{"wildcard":"arn:undefined:cloudformation:ap-southeast-1:555555555555:stack/test-prefix-Clickstream*6666-6666/*"}],"detail-type":["CloudFormation Stack Status Change"]}',
      Name: 'ClickstreamRuleForCFN-longlonglonglonglonglonglonglonglonglonglo',
    });
    expect(snsMock).toHaveReceivedCommandWith(CreateTopicCommand, {
      Name: `ClickstreamTopicForCFN-${MOCK_PIPELINE_ID}`,
    });
  });
  it('Check callback bucket when create pipeline without execution info', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
    });
    jest
      .useFakeTimers()
      .setSystemTime(new Date('2023-03-02'));
    ddbMock.on(PutCommand).resolves({});
    ddbMock.on(TransactWriteItemsCommand).callsFake(input => {
      const workflow = input.TransactItems[1].Put.Item.workflow.M.Workflow.M;
      const serviceCatalogAppRegistry = workflow.Branches.L[0].M.States.M.ServiceCatalogAppRegistry.M;
      const callback = serviceCatalogAppRegistry.Data.M.Callback.M;
      expect(
        callback.BucketName.S === 'TEST_EXAMPLE_BUCKET' &&
        callback.BucketPrefix.S.startsWith('clickstream/workflow/main-') &&
        callback.BucketPrefix.S.endsWith('-1677715200000'),
      ).toBeTruthy();
    });
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_QUICKSIGHT_PIPELINE,
        status: undefined,
        executionDetail: undefined,
        executionArn: undefined,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.message).toEqual('Pipeline added.');
    expect(res.body.success).toEqual(true);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeVpcEndpointsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSecurityGroupRulesCommand, 2);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSubnetsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeRouteTablesCommand, 1);
    expect(ddbMock).toHaveReceivedCommandTimes(PutCommand, 1);
    expect(ddbMock).toHaveReceivedCommandTimes(TransactWriteItemsCommand, 1);
  });
  it('Create pipeline with error bucket', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
      bucket: {
        notExist: true,
      },
    });
    ddbMock.on(PutCommand).resolves({});
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_QUICKSIGHT_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toEqual('Validation error: bucket EXAMPLE_BUCKET not found. Please check and try again.');
  });
  it('Create pipeline with error region', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
    });
    ddbMock.on(PutCommand).resolves({});
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_QUICKSIGHT_PIPELINE,
        network: {
          publicSubnetIds: [
            'subnet-10000000000000021',
            'subnet-10000000000000022',
            'subnet-10000000000000023',
          ],
          vpcId: 'vpc-10000000000000001',
          privateSubnetIds: [
            'subnet-10000000000000011',
            'subnet-10000000000000012',
            'subnet-10000000000000013',
          ],
        },
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toEqual('Validation error: region does not match VPC or subnets, please check parameters.');
  });
  it('Create pipeline with error prefix', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
    });
    ddbMock.on(PutCommand).resolves({});
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...S3_DATA_PROCESSING_WITH_ERROR_PREFIX_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toEqual('Validation error: S3DataPrefix: EXAMPLE_PREFIX_ERROR not match ^(|[^/].*/)$. Please check and try again.');
  });
  it('Create pipeline only ingestion', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
    });
    ddbMock.on(PutCommand).resolves({});
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...S3_INGESTION_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.message).toEqual('Pipeline added.');
    expect(res.body.success).toEqual(true);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeVpcEndpointsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSecurityGroupRulesCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSubnetsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeRouteTablesCommand, 1);
    expect(ddbMock).toHaveReceivedCommandTimes(PutCommand, 1);
  });
  it('Create pipeline in the region where Service Catalog service is not available', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      noVpcEndpoint: true,
      bucket: {
        location: BucketLocationConstraint.cn_north_1,
      },
    });
    ddbMock.on(PutCommand).resolves({});
    createPipelineMockForBJSRegion(s3Mock);
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...S3_INGESTION_PIPELINE,
        region: 'cn-north-1',
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.message).toEqual('Pipeline added.');
    expect(res.body.success).toEqual(true);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeVpcEndpointsCommand, 1);
    expect(ddbMock).toHaveReceivedCommandTimes(PutCommand, 1);
  });
  it('Create pipeline with error RPU not increments of 8', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
    });
    ddbMock.on(PutCommand).resolves({});
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_WITH_ERROR_RPU_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toEqual('Validation error: RPU range must be 8-512 in increments of 8.');
  });
  it('Create pipeline with error RPU not match region RPU range', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      noVpcEndpoint: true,
      bucket: {
        location: BucketLocationConstraint.us_west_1,
      },
    });
    ddbMock.on(PutCommand).resolves({});
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_QUICKSIGHT_PIPELINE,
        region: 'us-west-1',
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toEqual('Validation error: RPU range must be 32-512 in increments of 8.');
  });
  it('Create pipeline with ingestion authentication and HTTP protocol', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
    });
    ddbMock.on(PutCommand).resolves({});
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...S3_INGESTION_HTTP_AUTHENTICATION_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toEqual('Validation error: you must select protocol as HTTPS if open the authentication for ingestion server.');
  });
  it('Create pipeline without isolated subnet', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: false,
      noVpcEndpoint: true,
    });
    ddbMock.on(PutCommand).resolves({});
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_QUICKSIGHT_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.message).toEqual('Pipeline added.');
    expect(res.body.success).toEqual(true);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeVpcEndpointsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSecurityGroupRulesCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSubnetsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeRouteTablesCommand, 1);
    expect(ddbMock).toHaveReceivedCommandTimes(PutCommand, 1);
  });
  it('Create pipeline in private subnet with vpc endpoint not required for our solution', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: false,
      noVpcEndpoint: false,
      missVpcEndpoint: false,
    });
    ddbMock.on(PutCommand).resolves({});
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_QUICKSIGHT_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.message).toEqual('Pipeline added.');
    expect(res.body.success).toEqual(true);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeVpcEndpointsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSecurityGroupRulesCommand, 2);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSubnetsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeRouteTablesCommand, 1);
    expect(ddbMock).toHaveReceivedCommandTimes(PutCommand, 1);
  });
  it('Create pipeline with ALB policy disable ', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
      albPolicyDisable: true,
    });
    ddbMock.on(PutCommand).resolves({});
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_QUICKSIGHT_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toEqual('Validation error: your S3 bucket must have a bucket policy that grants Elastic Load Balancing permission to write the access logs to the bucket.');
    expect(s3Mock).toHaveReceivedCommandTimes(GetBucketPolicyCommand, 1);
  });
  it('Create pipeline with standard QuickSight', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
      quickSightStandard: true,
    });
    ddbMock.on(PutCommand).resolves({});
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_QUICKSIGHT_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toEqual('Validation error: QuickSight edition is not enterprise in your account.');
    expect(quickSightMock).toHaveReceivedCommandTimes(DescribeAccountSubscriptionCommand, 1);
  });
  it('Create pipeline subnets not cross two AZ', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: false,
    });


    ec2Mock.on(DescribeSubnetsCommand)
      .resolves({
        Subnets: [
          {
            SubnetId: 'subnet-00000000000000010',
            AvailabilityZone: 'us-east-1a',
            CidrBlock: '10.0.16.0/20',
          },
          {
            SubnetId: 'subnet-00000000000000011',
            AvailabilityZone: 'us-east-1a',
            CidrBlock: '10.0.32.0/20',
          },
          {
            SubnetId: 'subnet-00000000000000012',
            AvailabilityZone: 'us-east-1a',
            CidrBlock: '10.0.48.0/20',
          },
          {
            SubnetId: 'subnet-00000000000000013',
            AvailabilityZone: 'us-east-1a',
            CidrBlock: '10.0.64.0/20',
          },
          {
            SubnetId: 'subnet-00000000000000021',
            AvailabilityZone: 'us-east-1a',
            CidrBlock: '10.0.64.0/20',
          },
          {
            SubnetId: 'subnet-00000000000000022',
            AvailabilityZone: 'us-east-1a',
            CidrBlock: '10.0.64.0/20',
          },
          {
            SubnetId: 'subnet-00000000000000023',
            AvailabilityZone: 'us-east-1a',
            CidrBlock: '10.0.64.0/20',
          },
        ],
      });
    ddbMock.on(PutCommand).resolves({});
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toEqual('Validation error: the public and private subnets for the ingestion endpoint must locate in at least two Availability Zones (AZ).');
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSubnetsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeRouteTablesCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeVpcEndpointsCommand, 0);
  });
  it('Create pipeline subnets AZ can not meeting conditions', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: false,
    });


    ec2Mock.on(DescribeSubnetsCommand)
      .resolves({
        Subnets: [
          {
            SubnetId: 'subnet-00000000000000010',
            AvailabilityZone: 'us-east-1a',
            CidrBlock: '10.0.16.0/20',
          },
          {
            SubnetId: 'subnet-00000000000000011',
            AvailabilityZone: 'us-east-1b',
            CidrBlock: '10.0.32.0/20',
          },
          {
            SubnetId: 'subnet-00000000000000012',
            AvailabilityZone: 'us-east-1c',
            CidrBlock: '10.0.48.0/20',
          },
          {
            SubnetId: 'subnet-00000000000000013',
            AvailabilityZone: 'us-east-1d',
            CidrBlock: '10.0.64.0/20',
          },
          {
            SubnetId: 'subnet-00000000000000021',
            AvailabilityZone: 'us-east-1c',
            CidrBlock: '10.0.64.0/20',
          },
          {
            SubnetId: 'subnet-00000000000000022',
            AvailabilityZone: 'us-east-1d',
            CidrBlock: '10.0.64.0/20',
          },
          {
            SubnetId: 'subnet-00000000000000023',
            AvailabilityZone: 'us-east-1e',
            CidrBlock: '10.0.64.0/20',
          },
        ],
      });
    ddbMock.on(PutCommand).resolves({});
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toEqual('Validation error: the public subnets and private subnets for ingestion endpoint must be in the same Availability Zones (AZ). For example, you can not select public subnets in AZ (a, b), while select private subnets in AZ (b, c).');
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSubnetsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeRouteTablesCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeVpcEndpointsCommand, 0);
  });
  it('Create pipeline with new Redshift serverless subnets not cross three AZ', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: false,
      subnetsIsolated: true,
    });
    ddbMock.on(PutCommand).resolves({});

    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toEqual('Validation error: the network for deploying New_Serverless Redshift at least three subnets that cross three AZs. Please check and try again.');
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeVpcEndpointsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSecurityGroupRulesCommand, 2);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSubnetsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeRouteTablesCommand, 1);
  });
  it('Create pipeline with new Redshift serverless in us-west-1', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      twoAZsInRegion: true,
      noVpcEndpoint: true,
    });
    ddbMock.on(PutCommand).resolves({});

    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE,
        dataModeling: {
          ods: {
            bucket: {
              name: 'EXAMPLE_BUCKET',
              prefix: '',
            },
            fileSuffix: '.snappy.parquet',
          },
          athena: false,
          redshift: {
            dataRange: 259200,
            newServerless: {
              network: {
                vpcId: 'vpc-00000000000000001',
                subnetIds: [
                  'subnet-00000000000000010',
                  'subnet-00000000000000011',
                  'subnet-00000000000000021',
                ],
                securityGroups: [
                  'sg-00000000000000030',
                  'sg-00000000000000031',
                ],
              },
              baseCapacity: 8,
            },
          },
          loadWorkflow: {
            bucket: {
              name: 'EXAMPLE_BUCKET',
              prefix: '',
            },
            loadJobScheduleIntervalExpression: 'rate(5 minutes)',
            maxFilesLimit: 50,
          },
        },
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.message).toEqual('Pipeline added.');
    expect(res.body.success).toEqual(true);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeVpcEndpointsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSecurityGroupRulesCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSubnetsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeRouteTablesCommand, 1);
    expect(ddbMock).toHaveReceivedCommandTimes(PutCommand, 1);
  });
  it('Create pipeline with new Redshift serverless two subnets in us-west-1', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      twoAZsInRegion: true,
      noVpcEndpoint: true,
    });
    ddbMock.on(PutCommand).resolves({});

    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE,
        dataModeling: {
          ods: {
            bucket: {
              name: 'EXAMPLE_BUCKET',
              prefix: '',
            },
            fileSuffix: '.snappy.parquet',
          },
          athena: false,
          redshift: {
            dataRange: 259200,
            newServerless: {
              network: {
                vpcId: 'vpc-00000000000000001',
                subnetIds: [
                  'subnet-00000000000000010',
                  'subnet-00000000000000011',
                ],
                securityGroups: [
                  'sg-00000000000000030',
                  'sg-00000000000000031',
                ],
              },
              baseCapacity: 8,
            },
          },
          loadWorkflow: {
            bucket: {
              name: 'EXAMPLE_BUCKET',
              prefix: '',
            },
            loadJobScheduleIntervalExpression: 'rate(5 minutes)',
            maxFilesLimit: 50,
          },
        },
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toEqual('Validation error: the network for deploying New_Serverless Redshift at least three subnets that cross two AZs. Please check and try again.');
  });
  it('Create pipeline with vpc endpoint SG error', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsIsolated: true,
      subnetsCross3AZ: true,
      sgError: true,
    });
    ddbMock.on(PutCommand).resolves({});

    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toEqual('Validation error: vpc endpoint error in subnet: subnet-00000000000000011, detail: [{\"service\":\"com.amazonaws.ap-southeast-1.logs\",\"reason\":\"The traffic is not allowed by security group rules\"}].');
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeVpcEndpointsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSecurityGroupRulesCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSubnetsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeRouteTablesCommand, 1);
  });
  it('Create pipeline with vpc endpoint subnets error', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsIsolated: true,
      subnetsCross3AZ: true,
      vpcEndpointSubnetErr: true,
    });
    ddbMock.on(PutCommand).resolves({});

    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toEqual('Validation error: vpc endpoint error in subnet: subnet-00000000000000011, detail: [{\"service\":\"com.amazonaws.ap-southeast-1.glue\",\"reason\":\"The Availability Zones (AZ) of VPC Endpoint (com.amazonaws.ap-southeast-1.glue) subnets must contain Availability Zones (AZ) of isolated subnets.\"}].');
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeVpcEndpointsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSecurityGroupRulesCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSubnetsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeRouteTablesCommand, 1);
  });
  it('Create pipeline skip Redshift SG validation when reporting is disabled', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      sgError: true,
      noVpcEndpoint: true,
    });
    ddbMock.on(PutCommand).resolves({});

    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(201);
    expect(quickSightMock).toHaveReceivedCommandTimes(DescribeAccountSubscriptionCommand, 0);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeVpcEndpointsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSecurityGroupRulesCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSubnetsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeRouteTablesCommand, 1);
  });
  it('Create pipeline with new Redshift serverless SG error', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      sgError: true,
      noVpcEndpoint: true,
    });
    ddbMock.on(PutCommand).resolves({});

    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_PROVISIONED_REDSHIFT_QUICKSIGHT_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toEqual('Validation error: Provisioned Redshift security groups missing rule for QuickSight access.');
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeVpcEndpointsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSecurityGroupRulesCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSubnetsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeRouteTablesCommand, 1);
  });
  it('Create pipeline in the isolated subnets', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
    });
    ddbMock.on(PutCommand).resolves({});
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(201);
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.message).toEqual('Pipeline added.');
    expect(res.body.success).toEqual(true);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeVpcEndpointsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSecurityGroupRulesCommand, 2);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSubnetsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeRouteTablesCommand, 1);
  });
  it('Create pipeline in the isolated subnets with s3 endpoint route table error', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
      s3EndpointRouteError: true,
    });
    ddbMock.on(PutCommand).resolves({});
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toEqual('Validation error: vpc endpoint error in subnet: subnet-00000000000000011, detail: [{\"service\":\"com.amazonaws.ap-southeast-1.s3\",\"reason\":\"The route of vpc endpoint need attached in the route table\"}].');
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeVpcEndpointsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSecurityGroupRulesCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSubnetsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeRouteTablesCommand, 1);
  });
  it('Create pipeline in the isolated subnets with glue endpoint sg error', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
      glueEndpointSGError: true,
    });
    ddbMock.on(PutCommand).resolves({});
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toEqual('Validation error: vpc endpoint error in subnet: subnet-00000000000000011, detail: [{\"service\":\"com.amazonaws.ap-southeast-1.glue\",\"reason\":\"The traffic is not allowed by security group rules\"}].');
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeVpcEndpointsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSecurityGroupRulesCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSubnetsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeRouteTablesCommand, 1);
  });
  it('Create pipeline in the isolated subnets with inbound rules only allow one of subnet cidr', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
      ecsEndpointSGAllowOneSubnet: true,
    });
    ddbMock.on(PutCommand).resolves({});
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toEqual('Validation error: vpc endpoint error in subnet: subnet-00000000000000012, detail: [{\"service\":\"com.amazonaws.ap-southeast-1.ecs\",\"reason\":\"The traffic is not allowed by security group rules\"}].');
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeVpcEndpointsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSecurityGroupRulesCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSubnetsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeRouteTablesCommand, 1);
  });
  it('Create pipeline in the isolated subnets with inbound rules allow all subnet cidr', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
      ecsEndpointSGAllowAllSubnets: true,
    });
    ddbMock.on(PutCommand).resolves({});
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(201);
    expect(res.body.message).toEqual('Pipeline added.');
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeVpcEndpointsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSecurityGroupRulesCommand, 2);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSubnetsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeRouteTablesCommand, 1);
  });
  it('Create pipeline in the isolated subnets miss vpc endpoint', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
      missVpcEndpoint: true,
    });
    ddbMock.on(PutCommand).resolves({});
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toEqual('Validation error: vpc endpoint error in subnet: subnet-00000000000000011, detail: [{\"service\":\"com.amazonaws.ap-southeast-1.s3\",\"reason\":\"Miss vpc endpoint\"}].');
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeSubnetsCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeRouteTablesCommand, 1);
    expect(ec2Mock).toHaveReceivedCommandTimes(DescribeVpcEndpointsCommand, 1);
  });
  it('Create pipeline with provisioned redshift empty dbuser', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      noVpcEndpoint: true,
    });
    ddbMock.on(PutCommand).resolves({});
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_PROVISIONED_REDSHIFT_EMPTY_DBUSER_QUICKSIGHT_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toEqual('Cluster Identifier and DbUser are required when using Redshift Provisioned cluster.');
  });
  it('Create pipeline with provisioned redshift error dbuser', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      noVpcEndpoint: true,
    });
    ddbMock.on(PutCommand).resolves({});
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...KINESIS_DATA_PROCESSING_PROVISIONED_REDSHIFT_ERROR_DBUSER_QUICKSIGHT_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body.message).toEqual('Validation error: RedshiftDbUser: HGF%$#@BHHGF not match ^([a-zA-Z][a-zA-Z0-9-_]{1,63})?$. Please check and try again.');
  });
  it('Create pipeline with dictionary no found', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock, 'BuiltInPlugins');
    ddbMock.on(GetCommand, {
      TableName: dictionaryTableName,
      Key: {
        name: 'Solution',
      },
    }).resolves({
      Item: undefined,
    });
    ddbMock.on(GetCommand, {
      TableName: dictionaryTableName,
      Key: {
        name: 'Templates',
      },
    }).resolves({
      Item: undefined,
    });
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      noVpcEndpoint: true,
    });
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...S3_INGESTION_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      message: 'Template: AppRegistry not found in dictionary.',
      success: false,
    });
    expect(ddbMock).toHaveReceivedCommandTimes(PutCommand, 1);
  });
  it('Create pipeline with mock error', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      noVpcEndpoint: true,
    });
    // Mock DynamoDB error
    ddbMock.on(TransactWriteItemsCommand).rejects(new Error('Mock DynamoDB error'));
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...S3_INGESTION_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      success: false,
      message: 'Unexpected error occurred at server.',
      error: 'Error',
    });
    expect(ddbMock).toHaveReceivedCommandTimes(PutCommand, 1);
  });
  it('Create pipeline 400', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    const res = await request(app)
      .post('/api/pipeline');
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: 'Parameter verification failed.',
      error: [
        {
          msg: 'Value is empty.',
          param: 'projectId',
          location: 'body',
        },
        {
          msg: 'Value is empty.',
          param: 'x-click-stream-request-id',
          location: 'headers',
        },
        {
          value: {},
          msg: 'Value is empty.',
          param: '',
          location: 'body',
        },
      ],
    });
    expect(ddbMock).toHaveReceivedCommandTimes(PutCommand, 0);
  });
  it('Create pipeline Not Modified', async () => {
    tokenMock(ddbMock, true);
    projectExistedMock(ddbMock, true);
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...S3_INGESTION_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: 'Parameter verification failed.',
      error: [
        {
          location: 'headers',
          msg: 'Not Modified.',
          param: 'x-click-stream-request-id',
          value: '0000-0000',
        },
      ],
    });
    expect(ddbMock).toHaveReceivedCommandTimes(PutCommand, 1);
  });
  it('Create pipeline with non-existent project', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, false);
    const res = await request(app)
      .post('/api/pipeline')
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN)
      .send({
        ...S3_INGESTION_PIPELINE,
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: 'Parameter verification failed.',
      error: [
        {
          location: 'body',
          msg: 'Project resource does not exist.',
          param: 'projectId',
          value: MOCK_PROJECT_ID,
        },
      ],
    });
    expect(ddbMock).toHaveReceivedCommandTimes(PutCommand, 1);
  });
  it('Get pipeline by ID', async () => {
    projectExistedMock(ddbMock, true);
    const stackDetails = [
      stackDetailsWithOutputs[0],
      stackDetailsWithOutputs[1],
      stackDetailsWithOutputs[2],
      stackDetailsWithOutputs[3],
      stackDetailsWithOutputs[4],
      {
        ...stackDetailsWithOutputs[5],
        stackTemplateVersion: FULL_SOLUTION_VERSION,
      },
    ];

    ddbMock.on(QueryCommand).resolves({
      Items: [{
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW,
        stackDetails: stackDetails,
      }],
    });
    dictionaryMock(ddbMock);
    ddbMock.on(QueryCommand, {
      ExclusiveStartKey: undefined,
      ExpressionAttributeNames:
        { '#prefix': 'prefix' },
      ExpressionAttributeValues: {
        ':d': false,
        ':prefix': 'PLUGIN',
      },
      FilterExpression: 'deleted = :d',
      KeyConditionExpression:
    '#prefix= :prefix',
      Limit: undefined,
      ScanIndexForward: true,
      TableName: clickStreamTableName,
      IndexName: prefixTimeGSIName,
    }).resolves({
      Items: [
        { id: `${MOCK_PLUGIN_ID}_2`, name: `${MOCK_PLUGIN_ID}_2` },
      ],
    });
    let res = await request(app)
      .get(`/api/pipeline/${MOCK_PIPELINE_ID}?pid=${MOCK_PROJECT_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: '',
      data: {
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW,
        status: {
          ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW.status,
          status: PipelineStatusType.ACTIVE,
        },
        stackDetails: stackDetails,
        statusType: PipelineStatusType.WARNING,
        dataProcessing: {
          ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW.dataProcessing,
          enrichPlugin: [
            {
              bindCount: 0,
              builtIn: true,
              createAt: 1667355960000,
              deleted: false,
              dependencyFiles: [],
              description: {
                'en-US': 'Derive OS, device, browser information from User Agent string from the HTTP request header',
                'zh-CN': '从 HTTP 请求标头的用户代理（User Agent)字符串中获取操作系统、设备和浏览器信息',
              },
              id: 'BUILT-IN-2',
              jarFile: '',
              mainFunction: 'software.aws.solution.clickstream.UAEnrichmentV2',
              name: 'UAEnrichment',
              operator: '',
              pluginType: 'Enrich',
              prefix: 'PLUGIN',
              type: 'PLUGIN#BUILT-IN-2',
              updateAt: 1667355960000,
            },
            {
              bindCount: 0,
              builtIn: true,
              createAt: 1667355960000,
              deleted: false,
              dependencyFiles: [],
              description: {
                'en-US': 'Derive location information (e.g., city, country, region) based on the request source IP',
                'zh-CN': '根据请求源 IP 获取位置信息（例如，城市、国家、地区）',
              },
              id: 'BUILT-IN-3',
              jarFile: '',
              mainFunction: 'software.aws.solution.clickstream.IPEnrichmentV2',
              name: 'IPEnrichment',
              operator: '',
              pluginType: 'Enrich',
              prefix: 'PLUGIN',
              type: 'PLUGIN#BUILT-IN-3',
              updateAt: 1667355960000,
            },
            {
              id: `${MOCK_PLUGIN_ID}_2`, name: `${MOCK_PLUGIN_ID}_2`,
            },
          ],
          transformPlugin: {
            bindCount: 0,
            builtIn: true,
            createAt: 1667355960000,
            deleted: false,
            dependencyFiles: [],
            description: {
              'en-US': 'Convert the data format reported by SDK into the data format in the data warehouse',
              'zh-CN': '把SDK上报的数据格式，转换成数据仓库中的数据格式',
            },
            id: 'BUILT-IN-1',
            jarFile: '',
            mainFunction: 'software.aws.solution.clickstream.TransformerV3',
            name: 'Transformer',
            operator: '',
            pluginType: 'Transform',
            prefix: 'PLUGIN',
            type: 'PLUGIN#BUILT-IN-1',
            updateAt: 1667355960000,
          },
        },
        dns: 'yyy/yyy',
        endpoint: 'http://xxx/xxx',
        dashboards: [
          {
            appId: 'app1',
            dashboardId: 'clickstream_dashboard_v1_notepad_mtzfsocy_app1',
          },
          {
            appId: 'app2',
            dashboardId: 'clickstream_dashboard_v1_notepad_mtzfsocy_app2',
          },
        ],
        templateInfo: {
          isLatest: false,
          pipelineVersion: MOCK_SOLUTION_VERSION,
          solutionVersion: FULL_SOLUTION_VERSION,
        },
        metricsDashboardName: 'clickstream_dashboard_notepad_mtzfsocy',
        analysisStudioEnabled: false,
      },
    });
  });
  it('Get pipeline by ID and refresh force', async () => {
    projectExistedMock(ddbMock, true);
    const stackDetails = [
      stackDetailsWithOutputs[0],
      stackDetailsWithOutputs[1],
      stackDetailsWithOutputs[2],
      stackDetailsWithOutputs[3],
      stackDetailsWithOutputs[4],
      {
        ...stackDetailsWithOutputs[5],
        stackTemplateVersion: FULL_SOLUTION_VERSION,
      },
    ];

    ddbMock.on(QueryCommand).resolves({
      Items: [{
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW,
        stackDetails: stackDetails,
      }],
    });
    dictionaryMock(ddbMock);
    ddbMock.on(QueryCommand, {
      ExclusiveStartKey: undefined,
      ExpressionAttributeNames:
        { '#prefix': 'prefix' },
      ExpressionAttributeValues: {
        ':d': false,
        ':prefix': 'PLUGIN',
      },
      FilterExpression: 'deleted = :d',
      KeyConditionExpression:
    '#prefix= :prefix',
      Limit: undefined,
      ScanIndexForward: true,
      TableName: clickStreamTableName,
      IndexName: prefixTimeGSIName,
    }).resolves({
      Items: [
        { id: `${MOCK_PLUGIN_ID}_2`, name: `${MOCK_PLUGIN_ID}_2` },
      ],
    });

    sfnMock.on(DescribeExecutionCommand).resolves({
      executionArn: 'arn:aws:states:ap-southeast-1:123456789012:execution:ForceExecutionName:12345678-1234-1234-1234-123456789012',
      name: MOCK_EXECUTION_ID,
      status: ExecutionStatus.FAILED,
      startDate: new Date(),
    });
    cloudFormationMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          StackName: 'ForceStackName',
          StackId: 'arn:aws:cloudformation:ap-southeast-1:123456789012:stack/ForceStackName/12345678-1234-1234-1234-123456789012',
          Tags: [{ Key: BuiltInTagKeys.AWS_SOLUTION_VERSION, Value: MOCK_SOLUTION_VERSION }],
          StackStatus: StackStatus.CREATE_FAILED,
          StackStatusReason: 'MockForceStackStatusReason',
          CreationTime: new Date(),
        },
      ],
    });
    let res = await request(app)
      .get(`/api/pipeline/${MOCK_PIPELINE_ID}?pid=${MOCK_PROJECT_ID}&refresh=force`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.statusType).toEqual(PipelineStatusType.FAILED);
    expect(res.body.data.stackDetails).toContainEqual(
      {
        outputs: [],
        stackId: 'arn:aws:cloudformation:ap-southeast-1:123456789012:stack/ForceStackName/12345678-1234-1234-1234-123456789012',
        stackName: 'ForceStackName',
        stackStatus: StackStatus.CREATE_FAILED,
        stackStatusReason: 'MockForceStackStatusReason',
        stackTemplateVersion: MOCK_SOLUTION_VERSION,
      },
    );
    expect(res.body.data.executionDetail).toEqual({
      executionArn: 'arn:aws:states:ap-southeast-1:123456789012:execution:ForceExecutionName:12345678-1234-1234-1234-123456789012',
      name: MOCK_EXECUTION_ID,
      status: ExecutionStatus.FAILED,
    });
  });
  it('Get pipeline when no found Execution history and stack details', async () => {
    projectExistedMock(ddbMock, true);
    ddbMock.on(QueryCommand).resolves({
      Items: [{
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW,
        status: {
          ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW.status,
          stackDetails: stackDetailsWithOutputs,
          executionDetail: {
            name: MOCK_EXECUTION_ID,
            status: undefined,
          },
        },
        stackDetails: undefined,
        executionDetail: undefined,
      }],
    });
    dictionaryMock(ddbMock);
    ddbMock.on(QueryCommand, {
      ExclusiveStartKey: undefined,
      ExpressionAttributeNames:
        { '#prefix': 'prefix' },
      ExpressionAttributeValues: {
        ':d': false,
        ':prefix': 'PLUGIN',
      },
      FilterExpression: 'deleted = :d',
      KeyConditionExpression:
    '#prefix= :prefix',
      Limit: undefined,
      ScanIndexForward: true,
      TableName: clickStreamTableName,
      IndexName: prefixTimeGSIName,
    }).resolves({
      Items: [
        { id: `${MOCK_PLUGIN_ID}_2`, name: `${MOCK_PLUGIN_ID}_2` },
      ],
    });
    let res = await request(app)
      .get(`/api/pipeline/${MOCK_PIPELINE_ID}?pid=${MOCK_PROJECT_ID}`);
    expect(sfnMock).toHaveReceivedCommandTimes(DescribeExecutionCommand, 0);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: '',
      data: {
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW,
        status: {
          ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW.status,
          stackDetails: stackDetailsWithOutputs,
          executionDetail: {
            name: MOCK_EXECUTION_ID,
          },
        },
        executionDetail: {
          name: MOCK_EXECUTION_ID,
          executionArn: 'arn:aws:states:us-east-1:111122223333:execution:MyPipelineStateMachine:main-5ab07c6e-b6ac-47ea-bf3a-02ede7391807',
          status: 'SUCCEEDED',
        },
        statusType: PipelineStatusType.ACTIVE,
        dataProcessing: {
          ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW.dataProcessing,
          enrichPlugin: [
            {
              bindCount: 0,
              builtIn: true,
              createAt: 1667355960000,
              deleted: false,
              dependencyFiles: [],
              description: {
                'en-US': 'Derive OS, device, browser information from User Agent string from the HTTP request header',
                'zh-CN': '从 HTTP 请求标头的用户代理（User Agent)字符串中获取操作系统、设备和浏览器信息',
              },
              id: 'BUILT-IN-2',
              jarFile: '',
              mainFunction: 'software.aws.solution.clickstream.UAEnrichmentV2',
              name: 'UAEnrichment',
              operator: '',
              pluginType: 'Enrich',
              prefix: 'PLUGIN',
              type: 'PLUGIN#BUILT-IN-2',
              updateAt: 1667355960000,
            },
            {
              bindCount: 0,
              builtIn: true,
              createAt: 1667355960000,
              deleted: false,
              dependencyFiles: [],
              description: {
                'en-US': 'Derive location information (e.g., city, country, region) based on the request source IP',
                'zh-CN': '根据请求源 IP 获取位置信息（例如，城市、国家、地区）',
              },
              id: 'BUILT-IN-3',
              jarFile: '',
              mainFunction: 'software.aws.solution.clickstream.IPEnrichmentV2',
              name: 'IPEnrichment',
              operator: '',
              pluginType: 'Enrich',
              prefix: 'PLUGIN',
              type: 'PLUGIN#BUILT-IN-3',
              updateAt: 1667355960000,
            },
            {
              id: `${MOCK_PLUGIN_ID}_2`, name: `${MOCK_PLUGIN_ID}_2`,
            },
          ],
          transformPlugin: {
            bindCount: 0,
            builtIn: true,
            createAt: 1667355960000,
            deleted: false,
            dependencyFiles: [],
            description: {
              'en-US': 'Convert the data format reported by SDK into the data format in the data warehouse',
              'zh-CN': '把SDK上报的数据格式，转换成数据仓库中的数据格式',
            },
            id: 'BUILT-IN-1',
            jarFile: '',
            mainFunction: 'software.aws.solution.clickstream.TransformerV3',
            name: 'Transformer',
            operator: '',
            pluginType: 'Transform',
            prefix: 'PLUGIN',
            type: 'PLUGIN#BUILT-IN-1',
            updateAt: 1667355960000,
          },
        },
        dns: 'yyy/yyy',
        endpoint: 'http://xxx/xxx',
        dashboards: [
          {
            appId: 'app1',
            dashboardId: 'clickstream_dashboard_v1_notepad_mtzfsocy_app1',
          },
          {
            appId: 'app2',
            dashboardId: 'clickstream_dashboard_v1_notepad_mtzfsocy_app2',
          },
        ],
        templateInfo: {
          isLatest: false,
          pipelineVersion: MOCK_SOLUTION_VERSION,
          solutionVersion: FULL_SOLUTION_VERSION,
        },
        metricsDashboardName: 'clickstream_dashboard_notepad_mtzfsocy',
        analysisStudioEnabled: false,
      },
    });
  });
  it('Get pipeline that analysis studio enabled', async () => {
    projectExistedMock(ddbMock, true);
    ddbMock.on(QueryCommand).resolves({
      Items: [{
        ...RETRY_PIPELINE_WITH_WORKFLOW_AND_ROLLBACK_COMPLETE,
        templateVersion: FULL_SOLUTION_VERSION,
        stackDetails: [
          {
            ...stackDetailsWithOutputs[0],
            stackTemplateVersion: FULL_SOLUTION_VERSION,
          },
          {
            ...stackDetailsWithOutputs[1],
            stackTemplateVersion: FULL_SOLUTION_VERSION,
          },
          {
            ...stackDetailsWithOutputs[2],
            stackTemplateVersion: FULL_SOLUTION_VERSION,
          },
          {
            ...stackDetailsWithOutputs[3],
            stackTemplateVersion: FULL_SOLUTION_VERSION,
          },
          {
            ...stackDetailsWithOutputs[4],
            stackTemplateVersion: FULL_SOLUTION_VERSION,
          },
          {
            ...stackDetailsWithOutputs[5],
            stackTemplateVersion: FULL_SOLUTION_VERSION,
          },
        ],
      }],
    });
    dictionaryMock(ddbMock);
    ddbMock.on(QueryCommand, {
      ExclusiveStartKey: undefined,
      ExpressionAttributeNames:
        { '#prefix': 'prefix' },
      ExpressionAttributeValues: {
        ':d': false,
        ':prefix': 'PLUGIN',
      },
      FilterExpression: 'deleted = :d',
      KeyConditionExpression:
    '#prefix= :prefix',
      Limit: undefined,
      ScanIndexForward: true,
      TableName: clickStreamTableName,
      IndexName: prefixTimeGSIName,
    }).resolves({
      Items: [
        { id: `${MOCK_PLUGIN_ID}_2`, name: `${MOCK_PLUGIN_ID}_2` },
      ],
    });
    let res = await request(app)
      .get(`/api/pipeline/${MOCK_PIPELINE_ID}?pid=${MOCK_PROJECT_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: '',
      data: {
        ...RETRY_PIPELINE_WITH_WORKFLOW_AND_ROLLBACK_COMPLETE,
        dataProcessing: {
          ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW.dataProcessing,
          enrichPlugin: [
            {
              bindCount: 0,
              builtIn: true,
              createAt: 1667355960000,
              deleted: false,
              dependencyFiles: [],
              description: {
                'en-US': 'Derive OS, device, browser information from User Agent string from the HTTP request header',
                'zh-CN': '从 HTTP 请求标头的用户代理（User Agent)字符串中获取操作系统、设备和浏览器信息',
              },
              id: 'BUILT-IN-2',
              jarFile: '',
              mainFunction: 'software.aws.solution.clickstream.UAEnrichmentV2',
              name: 'UAEnrichment',
              operator: '',
              pluginType: 'Enrich',
              prefix: 'PLUGIN',
              type: 'PLUGIN#BUILT-IN-2',
              updateAt: 1667355960000,
            },
            {
              bindCount: 0,
              builtIn: true,
              createAt: 1667355960000,
              deleted: false,
              dependencyFiles: [],
              description: {
                'en-US': 'Derive location information (e.g., city, country, region) based on the request source IP',
                'zh-CN': '根据请求源 IP 获取位置信息（例如，城市、国家、地区）',
              },
              id: 'BUILT-IN-3',
              jarFile: '',
              mainFunction: 'software.aws.solution.clickstream.IPEnrichmentV2',
              name: 'IPEnrichment',
              operator: '',
              pluginType: 'Enrich',
              prefix: 'PLUGIN',
              type: 'PLUGIN#BUILT-IN-3',
              updateAt: 1667355960000,
            },
            {
              id: `${MOCK_PLUGIN_ID}_2`, name: `${MOCK_PLUGIN_ID}_2`,
            },
          ],
          transformPlugin: {
            bindCount: 0,
            builtIn: true,
            createAt: 1667355960000,
            deleted: false,
            dependencyFiles: [],
            description: {
              'en-US': 'Convert the data format reported by SDK into the data format in the data warehouse',
              'zh-CN': '把SDK上报的数据格式，转换成数据仓库中的数据格式',
            },
            id: 'BUILT-IN-1',
            jarFile: '',
            mainFunction: 'software.aws.solution.clickstream.TransformerV3',
            name: 'Transformer',
            operator: '',
            pluginType: 'Transform',
            prefix: 'PLUGIN',
            type: 'PLUGIN#BUILT-IN-1',
            updateAt: 1667355960000,
          },
        },
        statusType: PipelineStatusType.WARNING,
        stackDetails: [
          {
            ...stackDetailsWithOutputs[0],
            stackTemplateVersion: FULL_SOLUTION_VERSION,
          },
          {
            ...stackDetailsWithOutputs[1],
            stackTemplateVersion: FULL_SOLUTION_VERSION,
          },
          {
            ...stackDetailsWithOutputs[2],
            stackTemplateVersion: FULL_SOLUTION_VERSION,
          },
          {
            ...stackDetailsWithOutputs[3],
            stackTemplateVersion: FULL_SOLUTION_VERSION,
          },
          {
            ...stackDetailsWithOutputs[4],
            stackTemplateVersion: FULL_SOLUTION_VERSION,
          },
          {
            ...stackDetailsWithOutputs[5],
            stackTemplateVersion: FULL_SOLUTION_VERSION,
          },
        ],
        dns: 'yyy/yyy',
        endpoint: 'http://xxx/xxx',
        dashboards: [
          {
            appId: 'app1',
            dashboardId: 'clickstream_dashboard_v1_notepad_mtzfsocy_app1',
          },
          {
            appId: 'app2',
            dashboardId: 'clickstream_dashboard_v1_notepad_mtzfsocy_app2',
          },
        ],
        templateInfo: {
          isLatest: true,
          pipelineVersion: FULL_SOLUTION_VERSION,
          solutionVersion: FULL_SOLUTION_VERSION,
        },
        templateVersion: FULL_SOLUTION_VERSION,
        metricsDashboardName: 'clickstream_dashboard_notepad_mtzfsocy',
        analysisStudioEnabled: true,
      },
    });
  });
  it('Get pipeline by ID with stack no outputs', async () => {
    projectExistedMock(ddbMock, true);
    ddbMock.on(QueryCommand).resolves({
      Items: [{
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW,
        stackDetails: BASE_STATUS.stackDetails,
        templateVersion: 'v1.1.0',
        reporting: {
          quickSight: {
            accountName: 'clickstream-acc-xxx',
          },
        },
      }],
    });
    dictionaryMock(ddbMock);
    ddbMock.on(QueryCommand, {
      ExclusiveStartKey: undefined,
      ExpressionAttributeNames:
        { '#prefix': 'prefix' },
      ExpressionAttributeValues: {
        ':d': false,
        ':prefix': 'PLUGIN',
      },
      FilterExpression: 'deleted = :d',
      KeyConditionExpression:
        '#prefix= :prefix',
      Limit: undefined,
      ScanIndexForward: true,
      TableName: clickStreamTableName,
      IndexName: prefixTimeGSIName,
    }).resolves({
      Items: [
        { id: `${MOCK_PLUGIN_ID}_2`, name: `${MOCK_PLUGIN_ID}_2` },
      ],
    });
    let res = await request(app)
      .get(`/api/pipeline/${MOCK_PIPELINE_ID}?pid=${MOCK_PROJECT_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: '',
      data: {
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW,
        stackDetails: BASE_STATUS.stackDetails,
        statusType: PipelineStatusType.WARNING,
        dataProcessing: {
          ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW.dataProcessing,
          enrichPlugin: [
            {
              bindCount: 0,
              builtIn: true,
              createAt: 1667355960000,
              deleted: false,
              dependencyFiles: [],
              description: {
                'en-US': 'Derive OS, device, browser information from User Agent string from the HTTP request header',
                'zh-CN': '从 HTTP 请求标头的用户代理（User Agent)字符串中获取操作系统、设备和浏览器信息',
              },
              id: 'BUILT-IN-2',
              jarFile: '',
              mainFunction: 'software.aws.solution.clickstream.UAEnrichmentV2',
              name: 'UAEnrichment',
              operator: '',
              pluginType: 'Enrich',
              prefix: 'PLUGIN',
              type: 'PLUGIN#BUILT-IN-2',
              updateAt: 1667355960000,
            },
            {
              bindCount: 0,
              builtIn: true,
              createAt: 1667355960000,
              deleted: false,
              dependencyFiles: [],
              description: {
                'en-US': 'Derive location information (e.g., city, country, region) based on the request source IP',
                'zh-CN': '根据请求源 IP 获取位置信息（例如，城市、国家、地区）',
              },
              id: 'BUILT-IN-3',
              jarFile: '',
              mainFunction: 'software.aws.solution.clickstream.IPEnrichmentV2',
              name: 'IPEnrichment',
              operator: '',
              pluginType: 'Enrich',
              prefix: 'PLUGIN',
              type: 'PLUGIN#BUILT-IN-3',
              updateAt: 1667355960000,
            },
            {
              id: `${MOCK_PLUGIN_ID}_2`, name: `${MOCK_PLUGIN_ID}_2`,
            },
          ],
          transformPlugin: {
            bindCount: 0,
            builtIn: true,
            createAt: 1667355960000,
            deleted: false,
            dependencyFiles: [],
            description: {
              'en-US': 'Convert the data format reported by SDK into the data format in the data warehouse',
              'zh-CN': '把SDK上报的数据格式，转换成数据仓库中的数据格式',
            },
            id: 'BUILT-IN-1',
            jarFile: '',
            mainFunction: 'software.aws.solution.clickstream.TransformerV3',
            name: 'Transformer',
            operator: '',
            pluginType: 'Transform',
            prefix: 'PLUGIN',
            type: 'PLUGIN#BUILT-IN-1',
            updateAt: 1667355960000,
          },
        },
        reporting: {
          quickSight: {
            accountName: 'clickstream-acc-xxx',
          },
        },
        dns: '',
        endpoint: '',
        dashboards: [
          {
            appId: 'app1',
            dashboardId: 'clickstream_dashboard_v1_notepad_mtzfsocy_app1',
          },
          {
            appId: 'app2',
            dashboardId: 'clickstream_dashboard_v1_notepad_mtzfsocy_app2',
          },
        ],
        metricsDashboardName: '',
        templateInfo: {
          isLatest: false,
          pipelineVersion: 'v1.1.0',
          solutionVersion: FULL_SOLUTION_VERSION,
        },
        templateVersion: 'v1.1.0',
        analysisStudioEnabled: true,
      },
    });
  });
  it('Get pipeline by ID with mock error', async () => {
    projectExistedMock(ddbMock, true);
    // Mock DynamoDB error
    ddbMock.on(QueryCommand).rejects(new Error('Mock DynamoDB error'));
    const res = await request(app)
      .get(`/api/pipeline/${MOCK_PIPELINE_ID}?pid=${MOCK_PROJECT_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      success: false,
      message: 'Unexpected error occurred at server.',
      error: 'Error',
    });
  });
  it('Get pipeline by with ingestion server endpoint', async () => {
    projectExistedMock(ddbMock, true);
    ddbMock.on(QueryCommand, {
      ExclusiveStartKey: undefined,
      ExpressionAttributeNames:
        { '#prefix': 'prefix' },
      ExpressionAttributeValues: {
        ':d': false,
        ':prefix': 'PIPELINE',
        ':vt': 'latest',
        ':p': MOCK_PROJECT_ID,
      },
      FilterExpression: 'deleted = :d AND versionTag=:vt AND id = :p',
      KeyConditionExpression: '#prefix= :prefix',
      Limit: undefined,
      ScanIndexForward: true,
      TableName: clickStreamTableName,
      IndexName: prefixTimeGSIName,
    }).resolves({
      Items: [{
        ...S3_INGESTION_PIPELINE,
      }],
    });
    dictionaryMock(ddbMock);
    ddbMock.on(QueryCommand, {
      ExclusiveStartKey: undefined,
      ExpressionAttributeNames:
        { '#prefix': 'prefix' },
      ExpressionAttributeValues: {
        ':d': false,
        ':prefix': 'PLUGIN',
      },
      FilterExpression: 'deleted = :d',
      KeyConditionExpression:
        '#prefix= :prefix',
      Limit: undefined,
      ScanIndexForward: true,
      TableName: clickStreamTableName,
      IndexName: prefixTimeGSIName,
    }).resolves({
      Items: [
        { id: `${MOCK_PLUGIN_ID}_2`, name: `${MOCK_PLUGIN_ID}_2` },
      ],
    });
    let res = await request(app)
      .get(`/api/pipeline/${MOCK_PIPELINE_ID}?pid=${MOCK_PROJECT_ID}`);
    expect(ddbMock).toHaveReceivedCommandTimes(QueryCommand, 2);
    expect(cloudFormationMock).toHaveReceivedCommandTimes(DescribeStacksCommand, 0);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: '',
      data: {
        ...S3_INGESTION_PIPELINE,
        stackDetails: [],
        statusType: 'Active',
        dataProcessing: {},
        dns: '',
        endpoint: '',
        dashboards: [],
        metricsDashboardName: '',
        templateInfo: {
          isLatest: false,
          pipelineVersion: MOCK_SOLUTION_VERSION,
          solutionVersion: FULL_SOLUTION_VERSION,
        },
        analysisStudioEnabled: false,
      },
    });
  });
  it('Get pipeline with no pid', async () => {
    projectExistedMock(ddbMock, true);
    ddbMock.on(QueryCommand).resolves({});
    const res = await request(app)
      .get(`/api/pipeline/${MOCK_PIPELINE_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: 'Parameter verification failed.',
      error: [
        {
          location: 'query',
          msg: 'Value is empty.',
          param: 'pid',
        },
      ],
    });
  });
  it('Get non-existent project', async () => {
    projectExistedMock(ddbMock, false);
    pipelineExistedMock(ddbMock, true);
    const res = await request(app)
      .get(`/api/pipeline/${MOCK_PIPELINE_ID}?pid=${MOCK_PROJECT_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: 'Parameter verification failed.',
      error: [
        {
          location: 'query',
          msg: 'Project resource does not exist.',
          param: 'pid',
          value: MOCK_PROJECT_ID,
        },
      ],
    });
  });
  it('Get non-existent pipeline', async () => {
    projectExistedMock(ddbMock, true);
    ddbMock.on(QueryCommand, {
      ExclusiveStartKey: undefined,
      ExpressionAttributeNames:
        { '#prefix': 'prefix' },
      ExpressionAttributeValues: {
        ':d': false,
        ':prefix': 'PIPELINE',
        ':vt': 'latest',
        ':p': MOCK_PROJECT_ID,
      },
      FilterExpression: 'deleted = :d AND versionTag=:vt AND id = :p',
      KeyConditionExpression: '#prefix= :prefix',
      Limit: undefined,
      ScanIndexForward: true,
      TableName: clickStreamTableName,
      IndexName: prefixTimeGSIName,
    }).resolves({
      Items: [],
    });
    const res = await request(app)
      .get(`/api/pipeline/${MOCK_PIPELINE_ID}?pid=${MOCK_PROJECT_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      success: false,
      message: 'Pipeline not found',
    });
  });
  it('Get pipeline extend information', async () => {
    projectExistedMock(ddbMock, true);
    const stackDetails = [
      stackDetailsWithOutputs[0],
      stackDetailsWithOutputs[1],
      stackDetailsWithOutputs[2],
      {
        ...stackDetailsWithOutputs[3],
        outputs: [
          {
            OutputKey: `xxxxxxxx-xxxx-${OUTPUT_DATA_MODELING_REDSHIFT_SQL_EXECUTION_STATE_MACHINE_ARN_SUFFIX}`,
            OutputValue: 'mock-data-modeling-redshift-sql-execution-state-machine-arn',
          },
        ],
      },
      stackDetailsWithOutputs[4],
      stackDetailsWithOutputs[5],
    ];
    ddbMock.on(QueryCommand).resolvesOnce({
      Items: [{
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW,
        stackDetails: stackDetails,
      }],
    }).resolves({
      Items: [
        { appId: 'Application01' },
        { appId: 'Application02' },
        { appId: 'Application03' },
      ],
    });
    sfnMock.on(ListExecutionsCommand).resolves({
      executions: [
        {
          name: 'Application01-20240301T071531482Z-55',
          status: ExecutionStatus.SUCCEEDED,
          startDate: new Date(),
          executionArn: 'mockExecutionArn1',
          stateMachineArn: 'mockStateMachineArn',
        },
        {
          name: 'Application01-20240301T071531482Z-55',
          status: ExecutionStatus.FAILED,
          startDate: new Date(),
          executionArn: 'mockExecutionArn2',
          stateMachineArn: 'mockStateMachineArn',
        },
        {
          name: '12345678-1234-1234-1234-123456789012',
          status: ExecutionStatus.ABORTED,
          startDate: new Date(),
          executionArn: 'mockExecutionArn3',
          stateMachineArn: 'mockStateMachineArn',
        },
      ],
    });
    sfnMock.on(DescribeExecutionCommand).resolves({
      executionArn: 'arn:aws:states:ap-southeast-1:123456789012:execution:ForceExecutionName:12345678-1234-1234-1234-123456789012',
      name: '12345678-1234-1234-1234-123456789012',
      status: ExecutionStatus.FAILED,
      startDate: new Date(),
      input: JSON.stringify({
        sqls: [
          's3://EXAMPLE_BUCKET/clickstream/new1203_mggt/data/load-workflow/tmp/new1203_mggt/sqls/Application03-20240301T071531482Z/0.sql',
        ],
      }),
    });
    const res = await request(app)
      .get(`/api/pipeline/${MOCK_PIPELINE_ID}/extend?pid=${MOCK_PROJECT_ID}`);
    expect(ddbMock).toHaveReceivedCommandTimes(QueryCommand, 2);
    expect(sfnMock).toHaveReceivedCommandTimes(ListExecutionsCommand, 1);
    expect(sfnMock).toHaveReceivedCommandTimes(DescribeExecutionCommand, 1);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      data: {
        createApplicationSchemasStatus: [
          {
            appId: 'Application01',
            executionArn: 'mockExecutionArn1',
            status: 'SUCCEEDED',
          },
          {
            appId: 'Application02',
          },
          {
            appId: 'Application03',
            executionArn: 'mockExecutionArn3',
            status: 'ABORTED',
          },
        ],
      },
      message: '',
      success: true,
    });
  });
  it('Get pipeline list', async () => {
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { name: 'Pipeline-01' },
        { name: 'Pipeline-02' },
        { name: 'Pipeline-03' },
        { name: 'Pipeline-04' },
        { name: 'Pipeline-05' },
      ],
    });
    ddbMock.on(UpdateCommand).resolves({});
    let res = await request(app)
      .get('/api/pipeline');
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: '',
      data: {
        items: [
          {
            name: 'Pipeline-01',
            stackDetails: [],
            statusType: 'Active',
            executionDetail: {
              name: '',
              executionArn: '',
              status: ExecutionStatus.SUCCEEDED,
            },
          },
          {
            name: 'Pipeline-02',
            stackDetails: [],
            statusType: 'Active',
            executionDetail: {
              name: '',
              executionArn: '',
              status: ExecutionStatus.SUCCEEDED,
            },
          },
          {
            name: 'Pipeline-03',
            stackDetails: [],
            statusType: 'Active',
            executionDetail: {
              name: '',
              executionArn: '',
              status: ExecutionStatus.SUCCEEDED,
            },
          },
          {
            name: 'Pipeline-04',
            stackDetails: [],
            statusType: 'Active',
            executionDetail: {
              name: '',
              executionArn: '',
              status: ExecutionStatus.SUCCEEDED,
            },
          },
          {
            name: 'Pipeline-05',
            stackDetails: [],
            statusType: 'Active',
            executionDetail: {
              name: '',
              executionArn: '',
              status: ExecutionStatus.SUCCEEDED,
            },
          },
        ],
        totalCount: 5,
      },
    });

    // Mock DynamoDB error
    ddbMock.on(QueryCommand).rejects(new Error('Mock DynamoDB error'));
    res = await request(app)
      .get(`/api/pipeline?pid=${MOCK_PROJECT_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      success: false,
      message: 'Unexpected error occurred at server.',
      error: 'Error',
    });
  });
  it('Get pipeline list with pid', async () => {
    projectExistedMock(ddbMock, true);
    pipelineExistedMock(ddbMock, true);
    ddbMock.on(QueryCommand).resolves({
      Items: [{
        ...S3_INGESTION_PIPELINE,
      }],
    });
    ddbMock.on(UpdateCommand).resolves({});
    let res = await request(app)
      .get(`/api/pipeline?pid=${MOCK_PROJECT_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: '',
      data: {
        items: [{
          ...S3_INGESTION_PIPELINE,
        }],
        totalCount: 1,
      },
    });

    // Mock DynamoDB error
    ddbMock.on(QueryCommand).rejects(new Error('Mock DynamoDB error'));
    res = await request(app)
      .get(`/api/pipeline?pid=${MOCK_PROJECT_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      success: false,
      message: 'Unexpected error occurred at server.',
      error: 'Error',
    });
  });
  it('Get pipeline list with version', async () => {
    projectExistedMock(ddbMock, true);
    pipelineExistedMock(ddbMock, true);
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { name: 'Pipeline-01' },
        { name: 'Pipeline-02' },
        { name: 'Pipeline-03' },
        { name: 'Pipeline-04' },
        { name: 'Pipeline-05' },
      ],
    });
    ddbMock.on(UpdateCommand).resolves({});
    let res = await request(app)
      .get(`/api/pipeline?pid=${MOCK_PROJECT_ID}&version=latest`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: '',
      data: {
        items: [
          {
            name: 'Pipeline-01',
            stackDetails: [],
            statusType: 'Active',
            executionDetail: {
              name: '',
              executionArn: '',
              status: ExecutionStatus.SUCCEEDED,
            },
          },
          {
            name: 'Pipeline-02',
            stackDetails: [],
            statusType: 'Active',
            executionDetail: {
              name: '',
              executionArn: '',
              status: ExecutionStatus.SUCCEEDED,
            },
          },
          {
            name: 'Pipeline-03',
            stackDetails: [],
            statusType: 'Active',
            executionDetail: {
              name: '',
              executionArn: '',
              status: ExecutionStatus.SUCCEEDED,
            },
          },
          {
            name: 'Pipeline-04',
            stackDetails: [],
            statusType: 'Active',
            executionDetail: {
              name: '',
              executionArn: '',
              status: ExecutionStatus.SUCCEEDED,
            },
          },
          {
            name: 'Pipeline-05',
            stackDetails: [],
            statusType: 'Active',
            executionDetail: {
              name: '',
              executionArn: '',
              status: ExecutionStatus.SUCCEEDED,
            },
          },
        ],
        totalCount: 5,
      },
    });

    // Mock DynamoDB error
    ddbMock.on(QueryCommand).rejects(new Error('Mock DynamoDB error'));
    res = await request(app)
      .get(`/api/pipeline?pid=${MOCK_PROJECT_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      success: false,
      message: 'Unexpected error occurred at server.',
      error: 'Error',
    });
  });
  it('Get pipeline list with page', async () => {
    projectExistedMock(ddbMock, true);
    pipelineExistedMock(ddbMock, true);
    ddbMock.on(QueryCommand).resolves({
      Items: [
        { name: 'Pipeline-01' },
        { name: 'Pipeline-02' },
        { name: 'Pipeline-03' },
        { name: 'Pipeline-04' },
        { name: 'Pipeline-05' },
      ],
    });
    ddbMock.on(UpdateCommand).resolves({});
    const res = await request(app)
      .get(`/api/pipeline?pid=${MOCK_PROJECT_ID}&pageNumber=2&pageSize=2`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: '',
      data: {
        items: [
          {
            name: 'Pipeline-03',
            stackDetails: [],
            statusType: 'Active',
            executionDetail: {
              name: '',
              executionArn: '',
              status: ExecutionStatus.SUCCEEDED,
            },
          },
          {
            name: 'Pipeline-04',
            stackDetails: [],
            statusType: 'Active',
            executionDetail: {
              name: '',
              executionArn: '',
              status: ExecutionStatus.SUCCEEDED,
            },
          },
        ],
        totalCount: 5,
      },
    });
  });
  it('Get pipeline list with stack create fail', async () => {
    projectExistedMock(ddbMock, true);
    pipelineExistedMock(ddbMock, true);
    ddbMock.on(QueryCommand).resolves({
      Items: [{
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW,
        stackDetails: [
          {
            ...stackDetailsWithOutputs[0],
            stackStatus: StackStatus.CREATE_FAILED,
          },
          stackDetailsWithOutputs[1],
          stackDetailsWithOutputs[2],
          stackDetailsWithOutputs[3],
          stackDetailsWithOutputs[4],
          stackDetailsWithOutputs[5],
        ],
      }],
    });
    const res = await request(app)
      .get(`/api/pipeline?pid=${MOCK_PROJECT_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.items[0].statusType).toEqual('Failed');
  });
  it('Get pipeline list with stack update fail', async () => {
    projectExistedMock(ddbMock, true);
    pipelineExistedMock(ddbMock, true);
    ddbMock.on(QueryCommand).resolves({
      Items: [{
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW,
        stackDetails: [
          {
            ...stackDetailsWithOutputs[0],
            stackStatus: StackStatus.UPDATE_FAILED,
          },
          stackDetailsWithOutputs[1],
          stackDetailsWithOutputs[2],
          stackDetailsWithOutputs[3],
          stackDetailsWithOutputs[4],
          stackDetailsWithOutputs[5],
        ],
      }],
    });
    const res = await request(app)
      .get(`/api/pipeline?pid=${MOCK_PROJECT_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.items[0].statusType).toEqual('Warning');
  });
  it('Get pipeline list with stack creating', async () => {
    projectExistedMock(ddbMock, true);
    pipelineExistedMock(ddbMock, true);
    ddbMock.on(QueryCommand).resolves({
      Items: [{
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW,
        executionDetail: {
          name: MOCK_EXECUTION_ID,
          executionArn: 'arn:aws:states:us-east-1:111122223333:execution:MyPipelineStateMachine:main-5ab07c6e-b6ac-47ea-bf3a-02ede7391807',
          status: ExecutionStatus.RUNNING,
        },
        stackDetails: [
          {
            ...stackDetailsWithOutputs[0],
            stackStatus: StackStatus.CREATE_IN_PROGRESS,
          },
          stackDetailsWithOutputs[1],
          stackDetailsWithOutputs[2],
          stackDetailsWithOutputs[3],
          stackDetailsWithOutputs[4],
          stackDetailsWithOutputs[5],
        ],
      }],
    });
    const res = await request(app)
      .get(`/api/pipeline?pid=${MOCK_PROJECT_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.items[0].statusType).toEqual('Creating');
  });
  it('Get pipeline list with stack updating', async () => {
    projectExistedMock(ddbMock, true);
    pipelineExistedMock(ddbMock, true);
    ddbMock.on(QueryCommand).resolves({
      Items: [{
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW,
        executionDetail: {
          name: MOCK_EXECUTION_ID,
          executionArn: 'arn:aws:states:us-east-1:111122223333:execution:MyPipelineStateMachine:main-5ab07c6e-b6ac-47ea-bf3a-02ede7391807',
          status: ExecutionStatus.RUNNING,
        },
        stackDetails: [
          {
            ...stackDetailsWithOutputs[0],
            stackStatus: StackStatus.UPDATE_IN_PROGRESS,
          },
          stackDetailsWithOutputs[1],
          stackDetailsWithOutputs[2],
          stackDetailsWithOutputs[3],
          stackDetailsWithOutputs[4],
          stackDetailsWithOutputs[5],
        ],
      }],
    });
    const res = await request(app)
      .get(`/api/pipeline?pid=${MOCK_PROJECT_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.items[0].statusType).toEqual('Updating');
  });
  it('Get pipeline list with report stack updating', async () => {
    projectExistedMock(ddbMock, true);
    pipelineExistedMock(ddbMock, true);
    ddbMock.on(QueryCommand).resolves({
      Items: [{
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW,
        stackDetails: [
          stackDetailsWithOutputs[0],
          stackDetailsWithOutputs[1],
          stackDetailsWithOutputs[2],
          stackDetailsWithOutputs[3],
          {
            ...stackDetailsWithOutputs[4],
            stackStatus: StackStatus.UPDATE_IN_PROGRESS,
          },
          stackDetailsWithOutputs[5],
        ],
        executionDetail: {
          name: MOCK_EXECUTION_ID,
          executionArn: 'arn:aws:states:us-east-1:111122223333:execution:MyPipelineStateMachine:main-5ab07c6e-b6ac-47ea-bf3a-02ede7391807',
          status: ExecutionStatus.RUNNING,
        },
      }],
    });
    const res = await request(app)
      .get(`/api/pipeline?pid=${MOCK_PROJECT_ID}`);
    expect(cloudFormationMock).toHaveReceivedCommandTimes(DescribeStacksCommand, 0);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.items[0].statusType).toEqual('Updating');
  });
  it('Get pipeline list with step function execution interval ', async () => {
    projectExistedMock(ddbMock, true);
    pipelineExistedMock(ddbMock, true);
    ddbMock.on(QueryCommand).resolves({
      Items: [{
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW,
        stackDetails: [
          {
            ...stackDetailsWithOutputs[0],
            stackStatus: undefined,
          },
          stackDetailsWithOutputs[1],
          stackDetailsWithOutputs[2],
          stackDetailsWithOutputs[3],
          stackDetailsWithOutputs[4],
          stackDetailsWithOutputs[5],
        ],
        executionDetail: {
          name: MOCK_EXECUTION_ID,
          executionArn: 'arn:aws:states:us-east-1:111122223333:execution:MyPipelineStateMachine:main-5ab07c6e-b6ac-47ea-bf3a-02ede7391807',
          status: ExecutionStatus.RUNNING,
        },
      }],
    });
    ddbMock.on(UpdateCommand).resolves({});
    const res = await request(app)
      .get(`/api/pipeline?pid=${MOCK_PROJECT_ID}`);
    expect(cloudFormationMock).toHaveReceivedCommandTimes(DescribeStacksCommand, 0);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.items[0].statusType).toEqual('Creating');
  });
  it('Get pipeline list with stack deleting', async () => {
    projectExistedMock(ddbMock, true);
    pipelineExistedMock(ddbMock, true);
    ddbMock.on(QueryCommand).resolves({
      Items: [{
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW,
        stackDetails: [
          {
            ...stackDetailsWithOutputs[0],
            stackStatus: StackStatus.DELETE_IN_PROGRESS,
          },
          stackDetailsWithOutputs[1],
          stackDetailsWithOutputs[2],
          stackDetailsWithOutputs[3],
          stackDetailsWithOutputs[4],
          stackDetailsWithOutputs[5],
        ],
      }],
    });
    ddbMock.on(UpdateCommand).resolves({});
    const res = await request(app)
      .get(`/api/pipeline?pid=${MOCK_PROJECT_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.items[0].statusType).toEqual('Deleting');
  });
  it('Get pipeline list with stack active', async () => {
    projectExistedMock(ddbMock, true);
    pipelineExistedMock(ddbMock, true);
    ddbMock.on(QueryCommand).resolves({
      Items: [{ ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW }],
    });
    ddbMock.on(UpdateCommand).resolves({});
    const res = await request(app)
      .get(`/api/pipeline?pid=${MOCK_PROJECT_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.items[0].statusType).toEqual('Active');
  });
  it('Get pipeline list with execution fail status and all stack complete', async () => {
    projectExistedMock(ddbMock, true);
    pipelineExistedMock(ddbMock, true);
    ddbMock.on(QueryCommand).resolves({
      Items: [{
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW,
        executionDetail: {
          name: MOCK_EXECUTION_ID,
          executionArn: 'arn:aws:states:us-east-1:111122223333:execution:MyPipelineStateMachine:main-5ab07c6e-b6ac-47ea-bf3a-02ede7391807',
          status: ExecutionStatus.FAILED,
        },
      }],
    });
    ddbMock.on(UpdateCommand).resolves({});
    const res = await request(app)
      .get(`/api/pipeline?pid=${MOCK_PROJECT_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.items[0].statusType).toEqual('Failed');
  });
  it('Get pipeline list with execution fail status and miss stack', async () => {
    projectExistedMock(ddbMock, true);
    pipelineExistedMock(ddbMock, true);
    ddbMock.on(QueryCommand).resolves({
      Items: [{
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW,
        stackDetails: [
          {
            ...stackDetailsWithOutputs[0],
            stackStatus: undefined,
          },
          stackDetailsWithOutputs[1],
          stackDetailsWithOutputs[2],
          stackDetailsWithOutputs[3],
          stackDetailsWithOutputs[4],
          stackDetailsWithOutputs[5],
        ],
        executionDetail: {
          name: MOCK_EXECUTION_ID,
          executionArn: 'arn:aws:states:us-east-1:111122223333:execution:MyPipelineStateMachine:main-5ab07c6e-b6ac-47ea-bf3a-02ede7391807',
          status: ExecutionStatus.FAILED,
        },
      }],
    });
    ddbMock.on(UpdateCommand).resolves({});
    const res = await request(app)
      .get(`/api/pipeline?pid=${MOCK_PROJECT_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.items[0].statusType).toEqual('Failed');
  });
  it('Get pipeline list with stack fail status', async () => {
    projectExistedMock(ddbMock, true);
    pipelineExistedMock(ddbMock, true);
    ddbMock.on(QueryCommand).resolves({
      Items: [{
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW,
        stackDetails: [
          {
            ...stackDetailsWithOutputs[0],
            stackStatus: StackStatus.UPDATE_FAILED,
          },
          stackDetailsWithOutputs[1],
          stackDetailsWithOutputs[2],
          stackDetailsWithOutputs[3],
          stackDetailsWithOutputs[4],
          stackDetailsWithOutputs[5],
        ],
      }],
    });
    ddbMock.on(UpdateCommand).resolves({});
    const res = await request(app)
      .get(`/api/pipeline?pid=${MOCK_PROJECT_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.items[0].statusType).toEqual('Warning');
  });
  it('Get pipeline list with stack rollback complete status', async () => {
    projectExistedMock(ddbMock, true);
    pipelineExistedMock(ddbMock, true);
    ddbMock.on(QueryCommand).resolves({
      Items: [{
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW,
        stackDetails: [
          {
            ...stackDetailsWithOutputs[0],
            stackStatus: StackStatus.UPDATE_ROLLBACK_COMPLETE,
          },
          stackDetailsWithOutputs[1],
          stackDetailsWithOutputs[2],
          stackDetailsWithOutputs[3],
          stackDetailsWithOutputs[4],
          stackDetailsWithOutputs[5],
        ],
      }],
    });
    ddbMock.on(UpdateCommand).resolves({});
    const res = await request(app)
      .get(`/api/pipeline?pid=${MOCK_PROJECT_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body.data.items[0].statusType).toEqual('Warning');
  });
  it('Update pipeline', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
      update: true,
      updatePipeline: {
        ...MSK_DATA_PROCESSING_NEW_SERVERLESS_PIPELINE_WITH_WORKFLOW,
      },
    });
    cloudFormationMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          StackName: 'xxx',
          Outputs: [
            {
              OutputKey: 'IngestionServerC000IngestionServerURL',
              OutputValue: 'http://xxx/xxx',
            },
            {
              OutputKey: 'IngestionServerC000IngestionServerDNS',
              OutputValue: 'yyy/yyy',
            },
            {
              OutputKey: 'Dashboards',
              OutputValue: '[{"appId":"app1","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app1"},{"appId":"app2","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app2"}]',
            },
            {
              OutputKey: 'ObservabilityDashboardName',
              OutputValue: 'clickstream_dashboard_notepad_mtzfsocy',
            },
          ],
          StackStatus: StackStatus.CREATE_COMPLETE,
          CreationTime: new Date(),
        },
      ],
    });

    ddbMock.on(TransactWriteItemsCommand).resolves({});
    let res = await request(app)
      .put(`/api/pipeline/${MOCK_PIPELINE_ID}`)
      .send({
        ...MSK_DATA_PROCESSING_NEW_SERVERLESS_PIPELINE_WITH_WORKFLOW,
        ingestionServer: {
          ...MSK_DATA_PROCESSING_NEW_SERVERLESS_PIPELINE_WITH_WORKFLOW.ingestionServer,
          loadBalancer: {
            ...MSK_DATA_PROCESSING_NEW_SERVERLESS_PIPELINE_WITH_WORKFLOW.ingestionServer.loadBalancer,
            protocol: PipelineServerProtocol.HTTP,
            enableApplicationLoadBalancerAccessLog: false,
            notificationsTopicArn: 'arn:aws:sns:us-east-1:111122223333:test-modify',
            enableGlobalAccelerator: false,
            serverCorsOrigin: '*',
            serverEndpointPath: '/collect-modify',
          },
        },
      });
    expect(ddbMock).toHaveReceivedCommandTimes(GetCommand, 6);
    expect(ddbMock).toHaveReceivedCommandTimes(TransactWriteItemsCommand, 1);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      data: {
        id: MOCK_PIPELINE_ID,
      },
      success: true,
      message: 'Pipeline updated.',
    });

    // Mock DynamoDB error
    ddbMock.on(TransactWriteItemsCommand).rejects(new Error('Mock DynamoDB error'));
    res = await request(app)
      .put(`/api/pipeline/${MOCK_PIPELINE_ID}`)
      .send({ ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      success: false,
      message: 'Unexpected error occurred at server.',
      error: 'Error',
    });
  });
  it('Update pipeline add reporting', async () => {
    jest
      .useFakeTimers()
      .setSystemTime(new Date('2023-03-02'));
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
      update: true,
      updatePipeline: {
        ...MSK_DATA_PROCESSING_NEW_SERVERLESS_PIPELINE_WITH_WORKFLOW,
        reporting: undefined,
      },
    });
    cloudFormationMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          StackName: 'xxx',
          Outputs: [
            {
              OutputKey: 'IngestionServerC000IngestionServerURL',
              OutputValue: 'http://xxx/xxx',
            },
            {
              OutputKey: 'IngestionServerC000IngestionServerDNS',
              OutputValue: 'yyy/yyy',
            },
            {
              OutputKey: 'Dashboards',
              OutputValue: '[{"appId":"app1","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app1"},{"appId":"app2","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app2"}]',
            },
            {
              OutputKey: 'ObservabilityDashboardName',
              OutputValue: 'clickstream_dashboard_notepad_mtzfsocy',
            },
          ],
          StackStatus: StackStatus.CREATE_COMPLETE,
          CreationTime: new Date(),
        },
      ],
    });

    ddbMock.on(TransactWriteItemsCommand).callsFake(input => {
      const branches = input.TransactItems[1].Update.ExpressionAttributeValues[':workflow'].M.Workflow.M.Branches;
      const reportingState = branches.L[1].M.States.M.Reporting;
      const redshiftState = branches.L[1].M.States.M.DataModelingRedshift;
      expect(
        reportingState.M.End.BOOL === true &&
        reportingState.M.Data.M.Callback.M.BucketName.S === 'TEST_EXAMPLE_BUCKET' &&
        reportingState.M.Data.M.Callback.M.BucketPrefix.S === 'clickstream/workflow/main-6666-6666-1677715200000' &&
        redshiftState.M.Data.M.Callback.M.BucketName.S === 'TEST_EXAMPLE_BUCKET' &&
        redshiftState.M.Data.M.Callback.M.BucketPrefix.S === 'clickstream/workflow/main-6666-6666-1677715200000',
      ).toBeTruthy();
    });
    const res = await request(app)
      .put(`/api/pipeline/${MOCK_PIPELINE_ID}`)
      .send({
        ...MSK_DATA_PROCESSING_NEW_SERVERLESS_PIPELINE_WITH_WORKFLOW,
        reporting: {
          ...MSK_DATA_PROCESSING_NEW_SERVERLESS_PIPELINE_WITH_WORKFLOW.reporting,
        },
      });
    expect(ddbMock).toHaveReceivedCommandTimes(GetCommand, 6);
    expect(ddbMock).toHaveReceivedCommandTimes(TransactWriteItemsCommand, 1);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      data: {
        id: MOCK_PIPELINE_ID,
      },
      success: true,
      message: 'Pipeline updated.',
    });
  });
  it('Update pipeline when QuickSight user already existed', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
      update: true,
      quickSightUserExisted: true,
      updatePipeline: {
        ...MSK_DATA_PROCESSING_NEW_SERVERLESS_PIPELINE_WITH_WORKFLOW,
      },
    });
    cloudFormationMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          StackName: 'xxx',
          Outputs: [
            {
              OutputKey: 'IngestionServerC000IngestionServerURL',
              OutputValue: 'http://xxx/xxx',
            },
            {
              OutputKey: 'IngestionServerC000IngestionServerDNS',
              OutputValue: 'yyy/yyy',
            },
            {
              OutputKey: 'Dashboards',
              OutputValue: '[{"appId":"app1","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app1"},{"appId":"app2","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app2"}]',
            },
            {
              OutputKey: 'ObservabilityDashboardName',
              OutputValue: 'clickstream_dashboard_notepad_mtzfsocy',
            },
          ],
          StackStatus: StackStatus.CREATE_COMPLETE,
          CreationTime: new Date(),
        },
      ],
    });

    ddbMock.on(TransactWriteItemsCommand).resolves({});
    let res = await request(app)
      .put(`/api/pipeline/${MOCK_PIPELINE_ID}`)
      .send({
        ...MSK_DATA_PROCESSING_NEW_SERVERLESS_PIPELINE_WITH_WORKFLOW,
        ingestionServer: {
          ...MSK_DATA_PROCESSING_NEW_SERVERLESS_PIPELINE_WITH_WORKFLOW.ingestionServer,
          loadBalancer: {
            ...MSK_DATA_PROCESSING_NEW_SERVERLESS_PIPELINE_WITH_WORKFLOW.ingestionServer.loadBalancer,
            protocol: PipelineServerProtocol.HTTP,
            enableApplicationLoadBalancerAccessLog: false,
            notificationsTopicArn: 'arn:aws:sns:us-east-1:111122223333:test-modify',
            enableGlobalAccelerator: false,
            serverCorsOrigin: '*',
            serverEndpointPath: '/collect-modify',
          },
        },
      });
    expect(ddbMock).toHaveReceivedCommandTimes(GetCommand, 6);
    expect(ddbMock).toHaveReceivedCommandTimes(TransactWriteItemsCommand, 1);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      data: {
        id: MOCK_PIPELINE_ID,
      },
      success: true,
      message: 'Pipeline updated.',
    });

    // Mock DynamoDB error
    ddbMock.on(TransactWriteItemsCommand).rejects(new Error('Mock DynamoDB error'));
    res = await request(app)
      .put(`/api/pipeline/${MOCK_PIPELINE_ID}`)
      .send({ ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({
      success: false,
      message: 'Unexpected error occurred at server.',
      error: 'Error',
    });
  });
  it('Update pipeline not change pipeline version', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
      update: true,
      updatePipeline: {
        ...S3_INGESTION_PIPELINE,
        templateVersion: 'v0.0.0',
      },
    });
    cloudFormationMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          StackName: 'xxx',
          Outputs: [
            {
              OutputKey: 'IngestionServerC000IngestionServerURL',
              OutputValue: 'http://xxx/xxx',
            },
            {
              OutputKey: 'IngestionServerC000IngestionServerDNS',
              OutputValue: 'yyy/yyy',
            },
            {
              OutputKey: 'Dashboards',
              OutputValue: '[{"appId":"app1","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app1"},{"appId":"app2","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app2"}]',
            },
            {
              OutputKey: 'ObservabilityDashboardName',
              OutputValue: 'clickstream_dashboard_notepad_mtzfsocy',
            },
          ],
          StackStatus: StackStatus.CREATE_COMPLETE,
          CreationTime: new Date(),
        },
      ],
    });

    ddbMock.on(TransactWriteItemsCommand).callsFake(input => {
      expect(
        input.TransactItems[0].Put.Item.templateVersion.S === 'v0.0.0' &&
        input.TransactItems[1].Update.ExpressionAttributeValues[':templateVersion'].S === 'v0.0.0' &&
        input.TransactItems[1].Update.ExpressionAttributeValues[':tags'].L[0].M.value.S === MOCK_SOLUTION_VERSION,
      ).toBeTruthy();
    });
    const res = await request(app)
      .put(`/api/pipeline/${MOCK_PIPELINE_ID}`)
      .send({
        ...S3_INGESTION_PIPELINE,
        templateVersion: 'v0.0.0',
      });
    expect(ddbMock).toHaveReceivedCommandTimes(GetCommand, 6);
    expect(ddbMock).toHaveReceivedCommandTimes(TransactWriteItemsCommand, 1);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      data: {
        id: MOCK_PIPELINE_ID,
      },
      success: true,
      message: 'Pipeline updated.',
    });
  });
  it('Update pipeline with data procession expression changed', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
      update: true,
      updatePipeline: {
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW_AND_EXPRESSION_UPDATE,
      },
    });
    cloudFormationMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          StackName: 'xxx',
          Outputs: [
            {
              OutputKey: 'IngestionServerC000IngestionServerURL',
              OutputValue: 'http://xxx/xxx',
            },
            {
              OutputKey: 'IngestionServerC000IngestionServerDNS',
              OutputValue: 'yyy/yyy',
            },
            {
              OutputKey: 'Dashboards',
              OutputValue: '[{"appId":"app1","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app1"},{"appId":"app2","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app2"}]',
            },
            {
              OutputKey: 'ObservabilityDashboardName',
              OutputValue: 'clickstream_dashboard_notepad_mtzfsocy',
            },
          ],
          StackStatus: StackStatus.CREATE_COMPLETE,
          CreationTime: new Date(),
        },
      ],
    });

    ddbMock.on(TransactWriteItemsCommand).resolves({});
    const res = await request(app)
      .put(`/api/pipeline/${MOCK_PIPELINE_ID}`)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW_AND_EXPRESSION_UPDATE,
      });
    expect(ddbMock).toHaveReceivedCommandTimes(GetCommand, 6);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      data: {
        id: MOCK_PIPELINE_ID,
      },
      success: true,
      message: 'Pipeline updated.',
    });
  });
  it('Update pipeline with emails changed', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
      update: true,
      updatePipeline: {
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_UPDATE_PIPELINE_WITH_WORKFLOW,
      },
    });
    cloudFormationMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          StackName: 'xxx',
          Outputs: [
            {
              OutputKey: 'IngestionServerC000IngestionServerURL',
              OutputValue: 'http://xxx/xxx',
            },
            {
              OutputKey: 'IngestionServerC000IngestionServerDNS',
              OutputValue: 'yyy/yyy',
            },
            {
              OutputKey: 'Dashboards',
              OutputValue: '[{"appId":"app1","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app1"},{"appId":"app2","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app2"}]',
            },
            {
              OutputKey: 'ObservabilityDashboardName',
              OutputValue: 'clickstream_dashboard_notepad_mtzfsocy',
            },
          ],
          StackStatus: StackStatus.CREATE_COMPLETE,
          CreationTime: new Date(),
        },
      ],
    });

    ddbMock.on(TransactWriteItemsCommand).resolves({});
    const res = await request(app)
      .put(`/api/pipeline/${MOCK_PIPELINE_ID}`)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_UPDATE_PIPELINE_WITH_WORKFLOW,
      });
    expect(ddbMock).toHaveReceivedCommandTimes(GetCommand, 6);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      data: {
        id: MOCK_PIPELINE_ID,
      },
      success: true,
      message: 'Pipeline updated.',
    });
  });
  it('Update pipeline with tags changed', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
      update: true,
      updatePipeline: {
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_UPDATE_PIPELINE_WITH_WORKFLOW,
        tags: [
          { key: 'customerKey1', value: 'tagValue1' },
          { key: 'customerKey2', value: 'tagValue2' },
          { key: BuiltInTagKeys.AWS_SOLUTION_VERSION, value: MOCK_SOLUTION_VERSION },
        ],
      },
    });
    cloudFormationMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          StackName: 'xxx',
          Outputs: [
            {
              OutputKey: 'IngestionServerC000IngestionServerURL',
              OutputValue: 'http://xxx/xxx',
            },
            {
              OutputKey: 'IngestionServerC000IngestionServerDNS',
              OutputValue: 'http://yyy/yyy',
            },
            {
              OutputKey: 'Dashboards',
              OutputValue: '[{"appId":"app1","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app1"},{"appId":"app2","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app2"}]',
            },
            {
              OutputKey: 'ObservabilityDashboardName',
              OutputValue: 'clickstream_dashboard_notepad_mtzfsocy',
            },
          ],
          StackStatus: StackStatus.CREATE_COMPLETE,
          CreationTime: new Date(),
        },
      ],
    });

    ddbMock.on(TransactWriteItemsCommand).callsFake(input => {
      const expressionAttributeValues = input.TransactItems[1].Update.ExpressionAttributeValues;
      const dataProcessingInput = expressionAttributeValues[':workflow'].M.Workflow.M.Branches.L[1].M.States.M.DataProcessing.M.Data.M.Input;
      const reportInput = expressionAttributeValues[':workflow'].M.Workflow.M.Branches.L[1].M.States.M.Reporting.M.Data.M.Input;
      expect(
        dataProcessingInput.M.Tags.L[5].M.Key.S === 'customerKey3' &&
        reportInput.M.Tags.L[5].M.Key.S === 'customerKey3',
      ).toBeTruthy();
    });
    const res = await request(app)
      .put(`/api/pipeline/${MOCK_PIPELINE_ID}`)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_UPDATE_PIPELINE_WITH_WORKFLOW,
        tags: [
          { key: 'customerKey1', value: 'tagValue1' },
          { key: 'customerKey2', value: 'tagValue2' },
          { key: BuiltInTagKeys.AWS_SOLUTION_VERSION, value: MOCK_SOLUTION_VERSION },
          { key: 'customerKey3', value: 'tagValue3' },
        ],
      });
    expect(ddbMock).toHaveReceivedCommandTimes(GetCommand, 6);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      data: {
        id: MOCK_PIPELINE_ID,
      },
      success: true,
      message: 'Pipeline updated.',
    });
  });
  it('Update pipeline remain reporting parameters in global region', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: false,
      update: true,
      updatePipeline: {
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_UPDATE_PIPELINE_WITH_WORKFLOW,
        templateVersion: 'v1.0.0',
        tags: [
          { key: BuiltInTagKeys.AWS_SOLUTION_VERSION, value: 'v1.0.0' },
        ],
      },
    });
    cloudFormationMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          StackName: 'xxx',
          Outputs: [
            {
              OutputKey: 'IngestionServerC000IngestionServerURL',
              OutputValue: 'http://xxx/xxx',
            },
            {
              OutputKey: 'IngestionServerC000IngestionServerDNS',
              OutputValue: 'yyy/yyy',
            },
            {
              OutputKey: 'Dashboards',
              OutputValue: '[{"appId":"app1","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app1"},{"appId":"app2","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app2"}]',
            },
            {
              OutputKey: 'ObservabilityDashboardName',
              OutputValue: 'clickstream_dashboard_notepad_mtzfsocy',
            },
          ],
          StackStatus: StackStatus.CREATE_COMPLETE,
          CreationTime: new Date(),
        },
      ],
    });

    ddbMock.on(TransactWriteItemsCommand).callsFake(input => {
      const expressionAttributeValues = input.TransactItems[1].Update.ExpressionAttributeValues;
      const reportInput = expressionAttributeValues[':workflow'].M.Workflow.M.Branches.L[1].M.States.M.Reporting.M.Data.M.Input;
      expect(
        expressionAttributeValues[':templateVersion'].S === 'v1.0.0' &&
        expressionAttributeValues[':tags'].L[0].M.value.S === 'v1.0.0' &&
        reportInput.M.Parameters.L[0].M.ParameterValue.S === 'Admin/fakeUser' &&
        reportInput.M.Parameters.L[1].M.ParameterValue.S === 'arn:aws:quicksight:us-west-2:555555555555:user/default/Admin/fakeUser',
      ).toBeTruthy();
    });
    const res = await request(app)
      .put(`/api/pipeline/${MOCK_PIPELINE_ID}`)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_UPDATE_PIPELINE_WITH_WORKFLOW,
        ingestionServer: {
          ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_UPDATE_PIPELINE_WITH_WORKFLOW.ingestionServer,
          loadBalancer: {
            ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_UPDATE_PIPELINE_WITH_WORKFLOW.ingestionServer.loadBalancer,
            enableApplicationLoadBalancerAccessLog: false,
          },
        },
        reporting: {
          ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_UPDATE_PIPELINE_WITH_WORKFLOW.reporting,
        },
      });
    expect(ddbMock).toHaveReceivedCommandTimes(GetCommand, 6);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      data: {
        id: MOCK_PIPELINE_ID,
      },
      success: true,
      message: 'Pipeline updated.',
    });
  });
  it('Update pipeline reporting user in GCR region', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: false,
      update: true,
      updatePipeline: {
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_UPDATE_PIPELINE_WITH_WORKFLOW,
        region: 'cn-north-1',
        templateVersion: SolutionVersion.V_1_1_4.fullVersion,
        tags: [
          { key: BuiltInTagKeys.AWS_SOLUTION_VERSION, value: SolutionVersion.V_1_1_4.fullVersion },
        ],
      },
      bucket: {
        location: BucketLocationConstraint.cn_north_1,
      },
    });
    cloudFormationMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          StackName: 'xxx',
          Outputs: [
            {
              OutputKey: 'IngestionServerC000IngestionServerURL',
              OutputValue: 'http://xxx/xxx',
            },
            {
              OutputKey: 'IngestionServerC000IngestionServerDNS',
              OutputValue: 'yyy/yyy',
            },
            {
              OutputKey: 'Dashboards',
              OutputValue: '[{"appId":"app1","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app1"},{"appId":"app2","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app2"}]',
            },
            {
              OutputKey: 'ObservabilityDashboardName',
              OutputValue: 'clickstream_dashboard_notepad_mtzfsocy',
            },
          ],
          StackStatus: StackStatus.CREATE_COMPLETE,
          CreationTime: new Date(),
        },
      ],
    });

    ddbMock.on(TransactWriteItemsCommand).callsFake(input => {
      const expressionAttributeValues = input.TransactItems[1].Update.ExpressionAttributeValues;
      const reportInput = expressionAttributeValues[':workflow'].M.Workflow.M.Branches.L[1].M.States.M.Reporting.M.Data.M.Input;
      expect(
        expressionAttributeValues[':templateVersion'].S === SolutionVersion.V_1_1_4.fullVersion &&
        expressionAttributeValues[':tags'].L[0].M.value.S === SolutionVersion.V_1_1_4.fullVersion &&
        reportInput.M.Parameters.L[0].M.ParameterValue.S === 'GCRUser' &&
        reportInput.M.Parameters.L[1].M.ParameterValue.S === 'default' &&
        reportInput.M.Parameters.L[2].M.ParameterValue.S === 'arn:aws:quicksight:us-east-1:555555555555:user/default/QuickSightEmbeddingRole/GCRUser',
      ).toBeTruthy();
    });
    process.env.AWS_REGION = 'cn-north-1';
    const res = await request(app)
      .put(`/api/pipeline/${MOCK_PIPELINE_ID}`)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_UPDATE_PIPELINE_WITH_WORKFLOW,
        ingestionServer: {
          ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_UPDATE_PIPELINE_WITH_WORKFLOW.ingestionServer,
          loadBalancer: {
            ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_UPDATE_PIPELINE_WITH_WORKFLOW.ingestionServer.loadBalancer,
            enableApplicationLoadBalancerAccessLog: false,
          },
        },
        templateVersion: SolutionVersion.V_1_1_4.fullVersion,
        region: 'cn-north-1',
        reporting: {
          ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_UPDATE_PIPELINE_WITH_WORKFLOW.reporting,
          quickSight: {
            accountName: 'mockAccount',
            user: 'arn:aws:quicksight:us-east-1:555555555555:user/default/QuickSightEmbeddingRole/GCRUser',
          },
        },
      });
    expect(ddbMock).toHaveReceivedCommandTimes(GetCommand, 6);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      data: {
        id: MOCK_PIPELINE_ID,
      },
      success: true,
      message: 'Pipeline updated.',
    });
    process.env.AWS_REGION = undefined;
  });
  it('Update old pipeline on new control plane', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
      update: true,
      updatePipeline: {
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_UPDATE_PIPELINE_WITH_WORKFLOW,
        templateVersion: 'v1.0.0',
        tags: [
          { key: BuiltInTagKeys.AWS_SOLUTION_VERSION, value: 'v1.0.0' },
        ],
        timezone: undefined,
      },
    });
    cloudFormationMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          StackName: 'xxx',
          Outputs: [
            {
              OutputKey: 'IngestionServerC000IngestionServerURL',
              OutputValue: 'http://xxx/xxx',
            },
            {
              OutputKey: 'IngestionServerC000IngestionServerDNS',
              OutputValue: 'yyy/yyy',
            },
            {
              OutputKey: 'Dashboards',
              OutputValue: '[{"appId":"app1","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app1"},{"appId":"app2","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app2"}]',
            },
            {
              OutputKey: 'ObservabilityDashboardName',
              OutputValue: 'clickstream_dashboard_notepad_mtzfsocy',
            },
          ],
          StackStatus: StackStatus.CREATE_COMPLETE,
          CreationTime: new Date(),
        },
      ],
    });

    ddbMock.on(TransactWriteItemsCommand).callsFake(input => {
      const expressionAttributeValues = input.TransactItems[1].Update.ExpressionAttributeValues;
      const dataProcessingInput = expressionAttributeValues[':workflow'].M.Workflow.M.Branches.L[1].M.States.M.DataProcessing.M.Data.M.Input;
      const reportInput = expressionAttributeValues[':workflow'].M.Workflow.M.Branches.L[1].M.States.M.Reporting.M.Data.M.Input;
      expect(
        expressionAttributeValues[':timezone'].L.length === 0 &&
        expressionAttributeValues[':templateVersion'].S === 'v1.0.0' &&
        expressionAttributeValues[':tags'].L[0].M.value.S === 'v1.0.0' &&
        dataProcessingInput.M.Tags.L[1].M.Value.S === 'v1.0.0' &&
        dataProcessingInput.M.Parameters.L[0].M.ParameterValue.S === 'software.aws.solution.clickstream.Transformer,software.aws.solution.clickstream.UAEnrichment,software.aws.solution.clickstream.IPEnrichment,test.aws.solution.main' &&
        reportInput.M.Parameters.L[0].M.ParameterValue.S === 'Admin/fakeUser' &&
        reportInput.M.Parameters.L[1].M.ParameterValue.S === 'arn:aws:quicksight:us-west-2:555555555555:user/default/Admin/fakeUser',
      ).toBeTruthy();
    });
    const res = await request(app)
      .put(`/api/pipeline/${MOCK_PIPELINE_ID}`)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_UPDATE_PIPELINE_WITH_WORKFLOW,
        templateVersion: 'v1.0.0',
        tags: [
          { key: BuiltInTagKeys.AWS_SOLUTION_VERSION, value: 'v1.0.0' },
          { key: 'test-key', value: 'test-value' },
        ],
        timezone: undefined,
      });
    expect(ddbMock).toHaveReceivedCommandTimes(GetCommand, 6);
    expect(ddbMock).toHaveReceivedCommandTimes(TransactWriteItemsCommand, 1);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      data: {
        id: MOCK_PIPELINE_ID,
      },
      success: true,
      message: 'Pipeline updated.',
    });
  });
  it('Update old pipeline plugin on new control plane', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
      update: true,
      updatePipeline: {
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_UPDATE_PIPELINE_WITH_WORKFLOW,
        templateVersion: 'v1.0.0',
        tags: [
          { key: BuiltInTagKeys.AWS_SOLUTION_VERSION, value: 'v1.0.0' },
        ],
      },
    });
    cloudFormationMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          StackName: 'xxx',
          Outputs: [
            {
              OutputKey: 'IngestionServerC000IngestionServerURL',
              OutputValue: 'http://xxx/xxx',
            },
            {
              OutputKey: 'IngestionServerC000IngestionServerDNS',
              OutputValue: 'yyy/yyy',
            },
            {
              OutputKey: 'Dashboards',
              OutputValue: '[{"appId":"app1","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app1"},{"appId":"app2","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app2"}]',
            },
            {
              OutputKey: 'ObservabilityDashboardName',
              OutputValue: 'clickstream_dashboard_notepad_mtzfsocy',
            },
          ],
          StackStatus: StackStatus.CREATE_COMPLETE,
          CreationTime: new Date(),
        },
      ],
    });

    ddbMock.on(TransactWriteItemsCommand).callsFake(input => {
      const expressionAttributeValues = input.TransactItems[1].Update.ExpressionAttributeValues;
      const dataProcessingInput = expressionAttributeValues[':workflow'].M.Workflow.M.Branches.L[1].M.States.M.DataProcessing.M.Data.M.Input;
      expect(
        expressionAttributeValues[':templateVersion'].S === 'v1.0.0' &&
        expressionAttributeValues[':tags'].L[0].M.value.S === 'v1.0.0' &&
        dataProcessingInput.M.Parameters.L[0].M.ParameterValue.S === 'software.aws.solution.clickstream.Transformer,software.aws.solution.clickstream.UAEnrichment',
      ).toBeTruthy();
    });
    const res = await request(app)
      .put(`/api/pipeline/${MOCK_PIPELINE_ID}`)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_UPDATE_PIPELINE_WITH_WORKFLOW,
        dataProcessing: {
          ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_UPDATE_PIPELINE_WITH_WORKFLOW.dataProcessing,
          enrichPlugin: ['BUILT-IN-2'],
        },
      });
    expect(ddbMock).toHaveReceivedCommandTimes(GetCommand, 6);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      data: {
        id: MOCK_PIPELINE_ID,
      },
      success: true,
      message: 'Pipeline updated.',
    });
  });
  it('Update new pipeline plugin on new control plane', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
      update: true,
      updatePipeline: {
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_UPDATE_PIPELINE_WITH_WORKFLOW,
        templateVersion: FULL_SOLUTION_VERSION,
        tags: [
          { key: BuiltInTagKeys.AWS_SOLUTION_VERSION, value: FULL_SOLUTION_VERSION },
        ],
      },
    });
    cloudFormationMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          StackName: 'xxx',
          Outputs: [
            {
              OutputKey: 'IngestionServerC000IngestionServerURL',
              OutputValue: 'http://xxx/xxx',
            },
            {
              OutputKey: 'IngestionServerC000IngestionServerDNS',
              OutputValue: 'yyy/yyy',
            },
            {
              OutputKey: 'Dashboards',
              OutputValue: '[{"appId":"app1","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app1"},{"appId":"app2","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app2"}]',
            },
            {
              OutputKey: 'ObservabilityDashboardName',
              OutputValue: 'clickstream_dashboard_notepad_mtzfsocy',
            },
          ],
          StackStatus: StackStatus.CREATE_COMPLETE,
          CreationTime: new Date(),
        },
      ],
    });

    ddbMock.on(TransactWriteItemsCommand).callsFake(input => {
      const expressionAttributeValues = input.TransactItems[1].Update.ExpressionAttributeValues;
      const dataProcessingInput = expressionAttributeValues[':workflow'].M.Workflow.M.Branches.L[1].M.States.M.DataProcessing.M.Data.M.Input;
      expect(
        expressionAttributeValues[':timezone'].L.length === 1 &&
        expressionAttributeValues[':templateVersion'].S === FULL_SOLUTION_VERSION &&
        expressionAttributeValues[':tags'].L[0].M.value.S === FULL_SOLUTION_VERSION &&
        dataProcessingInput.M.Parameters.L[0].M.ParameterValue.S === 'software.aws.solution.clickstream.TransformerV3,software.aws.solution.clickstream.UAEnrichmentV2',
      ).toBeTruthy();
    });
    const res = await request(app)
      .put(`/api/pipeline/${MOCK_PIPELINE_ID}`)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_UPDATE_PIPELINE_WITH_WORKFLOW,
        dataProcessing: {
          ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_UPDATE_PIPELINE_WITH_WORKFLOW.dataProcessing,
          enrichPlugin: ['BUILT-IN-2'],
        },
        templateVersion: FULL_SOLUTION_VERSION,
        tags: [
          { key: BuiltInTagKeys.AWS_SOLUTION_VERSION, value: FULL_SOLUTION_VERSION },
        ],
      });
    expect(ddbMock).toHaveReceivedCommandTimes(GetCommand, 6);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      data: {
        id: MOCK_PIPELINE_ID,
      },
      success: true,
      message: 'Pipeline updated.',
    });
  });
  it('Update pipeline with not match id', async () => {
    projectExistedMock(ddbMock, true);
    pipelineExistedMock(ddbMock, true);
    const res = await request(app)
      .put(`/api/pipeline/${MOCK_PIPELINE_ID}1`)
      .send({ ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: 'Parameter verification failed.',
      error: [
        {
          location: 'body',
          msg: 'ID in path does not match ID in body.',
          param: 'pipelineId',
          value: MOCK_PIPELINE_ID,
        },
      ],
    });
  });
  it('Update pipeline with not body', async () => {
    projectExistedMock(ddbMock, true);
    pipelineExistedMock(ddbMock, true);
    const res = await request(app)
      .put(`/api/pipeline/${MOCK_PIPELINE_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: 'Parameter verification failed.',
      error: [
        {
          msg: 'Value is empty.',
          param: 'projectId',
          location: 'body',
        },
        {
          msg: 'Value is empty.',
          param: 'version',
          location: 'body',
        },
        {
          msg: 'Value is empty.',
          param: 'pipelineId',
          location: 'body',
        },
        {
          msg: 'ID in path does not match ID in body.',
          param: 'pipelineId',
          location: 'body',
        },
      ],
    });

  });
  it('Update pipeline with project no existed', async () => {
    projectExistedMock(ddbMock, false);
    pipelineExistedMock(ddbMock, true);
    const res = await request(app)
      .put(`/api/pipeline/${MOCK_PIPELINE_ID}`)
      .send({ ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: 'Parameter verification failed.',
      error: [
        {
          location: 'body',
          msg: 'Project resource does not exist.',
          param: 'projectId',
          value: MOCK_PROJECT_ID,
        },
      ],
    });
  });
  it('Update pipeline with no existed', async () => {
    projectExistedMock(ddbMock, true);
    pipelineExistedMock(ddbMock, false);
    const res = await request(app)
      .put(`/api/pipeline/${MOCK_PIPELINE_ID}`)
      .send({ ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({
      success: false,
      message: 'Pipeline resource does not exist.',
    });
  });
  it('Update pipeline with error version', async () => {

    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
      update: true,
      updatePipeline: { ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW },
    });
    cloudFormationMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          StackName: 'xxx',
          Outputs: [
            {
              OutputKey: 'IngestionServerC000IngestionServerURL',
              OutputValue: 'http://xxx/xxx',
            },
            {
              OutputKey: 'IngestionServerC000IngestionServerDNS',
              OutputValue: 'yyy/yyy',
            },
            {
              OutputKey: 'Dashboards',
              OutputValue: '[{"appId":"app1","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app1"},{"appId":"app2","dashboardId":"clickstream_dashboard_v1_notepad_mtzfsocy_app2"}]',
            },
            {
              OutputKey: 'ObservabilityDashboardName',
              OutputValue: 'clickstream_dashboard_notepad_mtzfsocy',
            },
          ],
          StackStatus: StackStatus.CREATE_COMPLETE,
          CreationTime: new Date(),
        },
      ],
    });
    const mockError = new Error('TransactionCanceledException');
    mockError.name = 'TransactionCanceledException';
    ddbMock.on(TransactWriteItemsCommand).rejects(mockError);
    const res = await request(app)
      .put(`/api/pipeline/${MOCK_PIPELINE_ID}`)
      .send({
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW,
        version: '0',
      });
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: 'Update error, check version and retry.',
    });
  });
  it('Upgrade pipeline', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
      update: true,
      updatePipeline: {
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_UPDATE_PIPELINE_WITH_WORKFLOW,
        timezone: [
          {
            appId: `${MOCK_APP_ID}_1`,
            timezone: 'Asia/Shanghai',
          },
          {
            appId: `${MOCK_APP_ID}_2`,
            timezone: 'Asia/Shanghai',
          },
        ],
      },
    });
    ddbMock.on(TransactWriteItemsCommand).callsFake(input => {
      const expressionAttributeValues = input.TransactItems[1].Update.ExpressionAttributeValues;
      const pipelineStacks = expressionAttributeValues[':workflow'].M.Workflow.M.Branches.L[0].M.States.M.PipelineStacks.M;
      const dataProcessingInput = pipelineStacks.Branches.L[1].M.States.M.DataProcessing.M.Data.M.Input;
      expect(
        expressionAttributeValues[':templateVersion'].S === FULL_SOLUTION_VERSION &&
        expressionAttributeValues[':tags'].L[1].M.value.S === FULL_SOLUTION_VERSION &&
        dataProcessingInput.M.Parameters.L[12].M.ParameterValue.S === 'software.aws.solution.clickstream.TransformerV3,software.aws.solution.clickstream.UAEnrichmentV2,software.aws.solution.clickstream.IPEnrichmentV2,test.aws.solution.main',
      ).toBeTruthy();
    });
    const res = await request(app)
      .post(`/api/pipeline/${MOCK_PIPELINE_ID}/upgrade?pid=${MOCK_PROJECT_ID}`)
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.body).toEqual({
      data: {
        id: MOCK_PIPELINE_ID,
      },
      success: true,
      message: 'Pipeline upgraded.',
    });
    expect(snsMock).toHaveReceivedCommandTimes(CreateTopicCommand, 1);
    expect(snsMock).toHaveReceivedCommandTimes(SNSTagResourceCommand, 1);
    expect(cloudWatchEventsMock).toHaveReceivedCommandTimes(PutRuleCommand, 1);
    expect(cloudWatchEventsMock).toHaveReceivedCommandTimes(EventTagResourceCommand, 1);
    expect(snsMock).toHaveReceivedCommandWith(CreateTopicCommand, {
      Name: `ClickstreamTopicForCFN-${MOCK_PIPELINE_ID}`,
    });
    expect(snsMock).toHaveReceivedCommandWith(SNSTagResourceCommand, {
      ResourceArn: 'arn:aws:sns:ap-southeast-1:111122223333:ck-clickstream-branch-main',
      Tags: getDefaultTags(MOCK_PROJECT_ID),
    });
    expect(cloudWatchEventsMock).toHaveReceivedCommandWith(PutRuleCommand, {
      Name: `ClickstreamRuleForCFN-${MOCK_PROJECT_ID}`,
      EventPattern: `{"source":["aws.cloudformation"],"resources":[{"wildcard":"arn:undefined:cloudformation:ap-southeast-1:555555555555:stack/${getStackPrefix()}*6666-6666/*"}],"detail-type":["CloudFormation Stack Status Change"]}`,
    });
    expect(cloudWatchEventsMock).toHaveReceivedCommandWith(EventTagResourceCommand, {
      ResourceARN: 'arn:aws:events:ap-southeast-1:111122223333:rule/ck-clickstream-branch-main',
      Tags: getDefaultTags(MOCK_PROJECT_ID),
    });
  });
  it('Upgrade pipeline with third-party plugin', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
      update: true,
      updatePipeline: {
        ...KINESIS_DATA_PROCESSING_PROVISIONED_REDSHIFT_THIRDPARTY_PIPELINE,
        templateVersion: 'v1.0.0',
        tags: [
          { key: BuiltInTagKeys.AWS_SOLUTION_VERSION, value: 'v1.0.0' },
        ],
        timezone: [
          {
            appId: `${MOCK_APP_ID}_1`,
            timezone: 'Asia/Shanghai',
          },
          {
            appId: `${MOCK_APP_ID}_2`,
            timezone: 'Asia/Shanghai',
          },
        ],
      },
    });
    ddbMock.on(TransactWriteItemsCommand).callsFake(input => {
      const expressionAttributeValues = input.TransactItems[1].Update.ExpressionAttributeValues;
      const pipelineStacks = expressionAttributeValues[':workflow'].M.Workflow.M.Branches.L[0].M.States.M.PipelineStacks.M;
      const dataProcessingInput = pipelineStacks.Branches.L[1].M.States.M.DataProcessing.M.Data.M.Input;
      expect(
        expressionAttributeValues[':templateVersion'].S === FULL_SOLUTION_VERSION &&
        expressionAttributeValues[':tags'].L[1].M.value.S === FULL_SOLUTION_VERSION &&
        dataProcessingInput.M.Parameters.L[12].M.ParameterValue.S === 'software.aws.solution.clickstream.gtm.GTMServerDataTransformerV2,software.aws.solution.clickstream.UAEnrichmentV2,software.aws.solution.clickstream.IPEnrichmentV2,test.aws.solution.main',
      ).toBeTruthy();
    });
    const res = await request(app)
      .post(`/api/pipeline/${MOCK_PIPELINE_ID}/upgrade?pid=${MOCK_PROJECT_ID}`)
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.body).toEqual({
      data: {
        id: MOCK_PIPELINE_ID,
      },
      success: true,
      message: 'Pipeline upgraded.',
    });
    expect(snsMock).toHaveReceivedCommandTimes(CreateTopicCommand, 1);
    expect(snsMock).toHaveReceivedCommandTimes(SNSTagResourceCommand, 1);
    expect(cloudWatchEventsMock).toHaveReceivedCommandTimes(PutRuleCommand, 1);
    expect(cloudWatchEventsMock).toHaveReceivedCommandTimes(EventTagResourceCommand, 1);
    expect(snsMock).toHaveReceivedCommandWith(CreateTopicCommand, {
      Name: `ClickstreamTopicForCFN-${MOCK_PIPELINE_ID}`,
    });
    expect(snsMock).toHaveReceivedCommandWith(SNSTagResourceCommand, {
      ResourceArn: 'arn:aws:sns:ap-southeast-1:111122223333:ck-clickstream-branch-main',
      Tags: getDefaultTags(MOCK_PROJECT_ID),
    });
    expect(cloudWatchEventsMock).toHaveReceivedCommandWith(PutRuleCommand, {
      Name: `ClickstreamRuleForCFN-${MOCK_PROJECT_ID}`,
      EventPattern: `{"source":["aws.cloudformation"],"resources":[{"wildcard":"arn:undefined:cloudformation:ap-southeast-1:555555555555:stack/${getStackPrefix()}*6666-6666/*"}],"detail-type":["CloudFormation Stack Status Change"]}`,
    });
    expect(cloudWatchEventsMock).toHaveReceivedCommandWith(EventTagResourceCommand, {
      ResourceARN: 'arn:aws:events:ap-southeast-1:111122223333:rule/ck-clickstream-branch-main',
      Tags: getDefaultTags(MOCK_PROJECT_ID),
    });
  });
  it('Upgrade pipeline with error server size', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
      update: true,
      updatePipeline: {
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW_FOR_UPGRADE,
        ingestionServer: {
          ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW_FOR_UPGRADE.ingestionServer,
          size: {
            serverMax: 1,
            warmPoolSize: 1,
            serverMin: 1,
            scaleOnCpuUtilizationPercent: 50,
          },
        },
        templateVersion: 'v2.0.0',
        timezone: [
          {
            appId: `${MOCK_APP_ID}_1`,
            timezone: 'Asia/Shanghai',
          },
          {
            appId: `${MOCK_APP_ID}_2`,
            timezone: 'Asia/Shanghai',
          },
        ],
      },
    });
    cloudFormationMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          StackName: 'xxx',
          StackStatus: StackStatus.CREATE_COMPLETE,
          CreationTime: new Date(),
        },
      ],
    });
    sfnMock.on(StartExecutionCommand).resolves({ executionArn: 'xxx' });
    ddbMock.on(TransactWriteItemsCommand).resolves({});
    const res = await request(app)
      .post(`/api/pipeline/${MOCK_PIPELINE_ID}/upgrade?pid=${MOCK_PROJECT_ID}`)
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.body).toEqual({
      success: false,
      message: 'Validation error: this pipeline not allow to update with the server size minimum and maximum are 1.',
    });
  });
  it('Upgrade pipeline with empty reporting object', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
      update: true,
      updatePipeline: {
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW_FOR_UPGRADE,
        reporting: {},
        timezone: [
          {
            appId: `${MOCK_APP_ID}_1`,
            timezone: 'Asia/Shanghai',
          },
          {
            appId: `${MOCK_APP_ID}_2`,
            timezone: 'Asia/Shanghai',
          },
        ],
      },
    });
    cloudFormationMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          StackName: 'xxx',
          StackStatus: StackStatus.CREATE_COMPLETE,
          CreationTime: new Date(),
        },
      ],
    });
    sfnMock.on(StartExecutionCommand).resolves({ executionArn: 'xxx' });
    ddbMock.on(TransactWriteItemsCommand).resolves({});
    quickSightMock.on(DescribeAccountSubscriptionCommand).resolves({});
    let res = await request(app)
      .post(`/api/pipeline/${MOCK_PIPELINE_ID}/upgrade?pid=${MOCK_PROJECT_ID}`)
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.body).toEqual({
      data: {
        id: MOCK_PIPELINE_ID,
      },
      success: true,
      message: 'Pipeline upgraded.',
    });
    expect(quickSightMock).toHaveReceivedCommandTimes(DescribeAccountSubscriptionCommand, 0);
  });
  it('Upgrade pipeline without some app timezone', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
      update: true,
      updatePipeline: {
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW_FOR_UPGRADE,
        reporting: {},
      },
    });
    cloudFormationMock.on(DescribeStacksCommand).resolves({
      Stacks: [
        {
          StackName: 'xxx',
          StackStatus: StackStatus.CREATE_COMPLETE,
          CreationTime: new Date(),
        },
      ],
    });
    sfnMock.on(StartExecutionCommand).resolves({ executionArn: 'xxx' });
    ddbMock.on(TransactWriteItemsCommand).resolves({});
    quickSightMock.on(DescribeAccountSubscriptionCommand).resolves({});
    let res = await request(app)
      .post(`/api/pipeline/${MOCK_PIPELINE_ID}/upgrade?pid=${MOCK_PROJECT_ID}`)
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.body).toEqual({
      success: false,
      message: 'To upgrade the pipeline, please specify a reporting time zone for the app(s): app_7777_7777_1,app_7777_7777_2 registered in this pipeline.',
    });
    expect(quickSightMock).toHaveReceivedCommandTimes(DescribeAccountSubscriptionCommand, 0);
  });
  it('Upgrade pipeline with error status', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    dictionaryMock(ddbMock);
    createPipelineMock(mockClients, {
      publicAZContainPrivateAZ: true,
      subnetsCross3AZ: true,
      subnetsIsolated: true,
      update: true,
      updatePipeline: {
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW,
        executionDetail: {
          name: MOCK_EXECUTION_ID,
          executionArn: 'arn:aws:states:us-east-1:111122223333:execution:MyPipelineStateMachine:main-5ab07c6e-b6ac-47ea-bf3a-02ede7391807',
          status: ExecutionStatus.FAILED,
        },
      },
    });
    ddbMock.on(TransactWriteItemsCommand).resolves({});
    const res = await request(app)
      .post(`/api/pipeline/${MOCK_PIPELINE_ID}/upgrade?pid=${MOCK_PROJECT_ID}`)
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.body).toEqual({
      success: false,
      message: 'The pipeline current status does not allow upgrade.',
    });
  });
  it('Retry pipeline when failed', async () => {
    tokenMock(ddbMock, false);
    projectExistedMock(ddbMock, true);
    pipelineExistedMock(ddbMock, true);
    createEventRuleMock(cloudWatchEventsMock);
    createSNSTopicMock(snsMock);
    ddbMock.on(GetCommand).resolves({
      Item: {
        ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW,
        lastAction: 'Delete',
        stackDetails: [
          {
            ...stackDetailsWithOutputs[0],
            stackStatus: StackStatus.DELETE_FAILED,
          },
          {
            ...stackDetailsWithOutputs[1],
          },
          {
            ...stackDetailsWithOutputs[2],
          },
          stackDetailsWithOutputs[3],
          stackDetailsWithOutputs[4],
          stackDetailsWithOutputs[5],
        ],
      },
    });
    sfnMock.on(StartExecutionCommand).resolves({ executionArn: 'xxx' });
    ddbMock.on(UpdateCommand).resolves({});
    const res = await request(app)
      .post(`/api/pipeline/${MOCK_PIPELINE_ID}/retry?pid=${MOCK_PROJECT_ID}`)
      .set('X-Click-Stream-Request-Id', MOCK_TOKEN);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      data: null,
      success: true,
      message: 'Pipeline retry.',
    });
    expect(sfnMock).toHaveReceivedCommandTimes(StartExecutionCommand, 1);
    expect(ddbMock).toHaveReceivedCommandTimes(UpdateCommand, 2);
  });
  it('Delete pipeline', async () => {
    projectExistedMock(ddbMock, true);
    pipelineExistedMock(ddbMock, true);
    createEventRuleMock(cloudWatchEventsMock);
    createSNSTopicMock(snsMock);
    ddbMock.on(GetCommand).resolves({
      Item: { ...KINESIS_DATA_PROCESSING_NEW_REDSHIFT_PIPELINE_WITH_WORKFLOW },
    });
    sfnMock.on(StartExecutionCommand).resolves({ executionArn: 'xxx' });
    ddbMock.on(ScanCommand).resolves({
      Items: [],
    });
    ddbMock.on(UpdateCommand).resolves({});
    const res = await request(app)
      .delete(`/api/pipeline/${MOCK_PIPELINE_ID}?pid=${MOCK_PROJECT_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      data: null,
      success: true,
      message: 'Pipeline deleted.',
    });
  });
  it('Delete pipeline with no pid', async () => {
    projectExistedMock(ddbMock, true);
    pipelineExistedMock(ddbMock, true);
    const res = await request(app)
      .delete(`/api/pipeline/${MOCK_PIPELINE_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: 'Parameter verification failed.',
      error: [
        {
          location: 'params',
          msg: 'query.pid value is empty.',
          param: 'id',
          value: MOCK_PIPELINE_ID,
        },
        {
          location: 'query',
          msg: 'Value is empty.',
          param: 'pid',
        },
      ],
    });
  });
  it('Delete pipeline with no project existed', async () => {
    projectExistedMock(ddbMock, false);
    pipelineExistedMock(ddbMock, true);
    const res = await request(app)
      .delete(`/api/pipeline/${MOCK_PIPELINE_ID}?pid=${MOCK_PROJECT_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: 'Parameter verification failed.',
      error: [
        {
          location: 'query',
          msg: 'Project resource does not exist.',
          param: 'pid',
          value: MOCK_PROJECT_ID,
        },
      ],
    });
  });
  it('Delete pipeline with no existed', async () => {
    projectExistedMock(ddbMock, true);
    pipelineExistedMock(ddbMock, false);
    const res = await request(app)
      .delete(`/api/pipeline/${MOCK_PIPELINE_ID}?pid=${MOCK_PROJECT_ID}`);
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: 'Parameter verification failed.',
      error: [
        {
          location: 'params',
          msg: 'Pipeline resource does not exist.',
          param: 'id',
          value: MOCK_PIPELINE_ID,
        },
      ],
    });
  });
  afterAll((done) => {
    server.close();
    done();
  });
});

