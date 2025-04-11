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


import { join } from 'path';
import { SolutionInfo } from '@aws/clickstream-base-lib';
import { Arn, ArnFormat, Aws, CfnResource, CustomResource, Duration, Fn, Stack } from 'aws-cdk-lib';

import { Policy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Function } from 'aws-cdk-lib/aws-lambda';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { addCfnNagSuppressRules, rulesToSuppressForLambdaVPCAndReservedConcurrentExecutions } from '../../common/cfn-nag';
import { createLambdaRole } from '../../common/lambda';
import { attachListTagsPolicyForFunction } from '../../common/lambda/tags';
import { getShortIdOfStack } from '../../common/stack';
import { EmrApplicationArchitectureType } from '../../data-pipeline-stack';
import { SolutionNodejsFunction } from '../../private/function';


export interface CopyAssetsCustomResourceProps {
  readonly pipelineS3Bucket: IBucket;
  readonly pipelineS3Prefix: string;
  readonly projectId: string;
  readonly s3PathPluginJars: string;
  readonly s3PathPluginFiles?: string;
}

export function createCopyAssetsCustomResource(
  scope: Construct,
  props: CopyAssetsCustomResourceProps,
): CustomResource {

  const customPluginSourceBucketName = Fn.select(2, Fn.split('/', props.s3PathPluginJars));

  const fn = createCopyAssetsLambda(scope,
    {
      ...props,
      customPluginSourceBucketName,
    });

  const provider = new Provider(
    scope,
    'CopyAssetsCustomResourceProvider',
    {
      onEventHandler: fn,
      logRetention: RetentionDays.FIVE_DAYS,
    },
  );
  const cr = new CustomResource(scope, 'CopyAssetsCustomResource', {
    serviceToken: provider.serviceToken,
    properties: {
      s3PathPluginJars: props.s3PathPluginJars,
      s3PathPluginFiles: props.s3PathPluginFiles,
    },
  });

  return cr;
}

function createCopyAssetsLambda(
  scope: Construct,
  props: {
    projectId: string;
    pipelineS3Bucket: IBucket;
    pipelineS3Prefix: string;
    customPluginSourceBucketName: string;
  },
): SolutionNodejsFunction {

  const copySourceS3Arn = Arn.format(
    {
      resource: props.customPluginSourceBucketName,
      region: '',
      account: '',
      service: 's3',
      arnFormat: ArnFormat.COLON_RESOURCE_NAME,
    },
    Stack.of(scope),
  );

  const role = createLambdaRole(scope, 'CopyAssetsCustomResourceLambdaRole', false, [
    new PolicyStatement({
      actions: [
        's3:GetObject',
      ],
      resources: [`${copySourceS3Arn}/*`],
    }),
  ]);

  props.pipelineS3Bucket.grantReadWrite(role);

  const fn = new SolutionNodejsFunction(scope, 'CopyAssetsCustomResourceLambda', {
    entry: join(
      __dirname,
      '..',
      'lambda',
      'copy-assets',
      'index.ts',
    ),
    handler: 'handler',
    memorySize: 256,
    role,
    timeout: Duration.minutes(15),
    logConf: {
      retention: RetentionDays.ONE_WEEK,
    },
    environment: {
      STACK_ID: getShortIdOfStack(Stack.of(scope)),
      PROJECT_ID: props.projectId,
      PIPELINE_S3_BUCKET_NAME: props.pipelineS3Bucket.bucketName,
      PIPELINE_S3_PREFIX: props.pipelineS3Prefix,
    },
  });

  addCfnNagSuppressRules(fn.node.defaultChild as CfnResource,
    rulesToSuppressForLambdaVPCAndReservedConcurrentExecutions('CDK'));

  return fn;
}


export interface InitPartitionCustomResourceProps {
  sourceS3BucketName: string;
  sourceS3Prefix: string;
  sinkS3BucketName: string;
  sinkS3Prefix: string;
  pipelineS3BucketName: string;
  pipelineS3Prefix: string;
  projectId: string;
  appIds: string;
  databaseName: string;
  sourceTableName: string;
}

// Custom resource to create partitions during cloudformation deployment,
// so we do not wait the scheduled event to trigger create partitions once a day.
export function createInitPartitionCustomResource(
  scope: Construct,
  partitionSyncerLambda: Function,
  props: InitPartitionCustomResourceProps,
): CustomResource {
  const provider = new Provider(
    scope,
    'InitPartitionCustomResourceProvider',
    {
      onEventHandler: partitionSyncerLambda,
      logRetention: RetentionDays.FIVE_DAYS,
    },
  );
  const cr = new CustomResource(scope, 'InitPartitionCustomResource', {
    serviceToken: provider.serviceToken,
    properties: {
      ... props,
    },
  });

  return cr;
}

//
//  EMRServerlessApplication
//
export interface EMRServerlessApplicationProps {
  projectId: string;
  name: string;
  version: string;
  securityGroupId: string;
  subnetIds: string;
  idleTimeoutMinutes: number;
  pipelineS3Bucket: IBucket;
  pipelineS3Prefix: string;
  architecture: EmrApplicationArchitectureType;
}

function createEMRServerlessApplicationLambda(
  scope: Construct,
  props: EMRServerlessApplicationProps,
): {fn: SolutionNodejsFunction; policy: Policy} {

  const ermAppArn = Arn.format(
    {
      resource: '*',
      region: Aws.REGION,
      account: Aws.ACCOUNT_ID,
      service: 'emr-serverless',
      arnFormat: ArnFormat.SLASH_RESOURCE_SLASH_RESOURCE_NAME,
    },
    Stack.of(scope),
  );

  const role = createLambdaRole(scope, 'CreateEMRServerlessApplicationLambdaRole', true, [
    new PolicyStatement({
      actions: [
        'emr-serverless:CreateApplication',
        'emr-serverless:DeleteApplication',
        'emr-serverless:TagResource',
        'emr-serverless:UntagResource',
      ],
      resources: [`${ermAppArn}`],
    }),

    new PolicyStatement({
      actions: [
        'iam:CreateServiceLinkedRole',
      ],
      resources: [
        `arn:${Aws.PARTITION}:iam::${Aws.ACCOUNT_ID}:role/aws-service-role/ops.emr-serverless.amazonaws.com/AWSServiceRoleForAmazonEMRServerless`,
      ],
    }),
  ]);

  props.pipelineS3Bucket.grantReadWrite(role);

  const fn = new SolutionNodejsFunction(scope, 'CreateEMRServerlessApplicationLambda', {
    entry: join(
      __dirname,
      '..',
      'lambda',
      'emr-serverless-app',
      'index.ts',
    ),
    handler: 'handler',
    memorySize: 256,
    role,
    timeout: Duration.minutes(15),
    logConf: {
      retention: RetentionDays.ONE_WEEK,
    },
    environment: {
      STACK_ID: getShortIdOfStack(Stack.of(scope)),
      PROJECT_ID: props.projectId,
      NAME: props.name,
      VERSION: props.version,
      ARCHITECTURE: props.architecture,
      SECURITYGROUPID: props.securityGroupId,
      SUBNETIDS: props.subnetIds,
      PIPELINE_S3_BUCKET_NAME: props.pipelineS3Bucket.bucketName,
      PIPELINE_S3_PREFIX: props.pipelineS3Prefix,
    },
  });

  addCfnNagSuppressRules(fn.node.defaultChild as CfnResource,
    rulesToSuppressForLambdaVPCAndReservedConcurrentExecutions('CDK'));
  const policy = attachListTagsPolicyForFunction(scope, 'CreateEMRServerlessApplicationLambdaFn', fn);

  return { fn, policy };
}


export function createEMRServerlessApplicationCustomResource(
  scope: Construct,
  props: EMRServerlessApplicationProps,
): CustomResource {

  const { fn, policy } = createEMRServerlessApplicationLambda(scope, props);

  const provider = new Provider(
    scope,
    'CreateEMRServelsssApplicationCustomResourceProvider',
    {
      onEventHandler: fn,
      logRetention: RetentionDays.FIVE_DAYS,
    },
  );
  const cr = new CustomResource(scope, 'CreateEMRServelsssApplicationCustomResource', {
    serviceToken: provider.serviceToken,
    properties: {
      projectId: props.projectId,
      name: props.name,
      version: props.version,
      securityGroupId: props.securityGroupId,
      subnetIds: props.subnetIds,
      idleTimeoutMinutes: props.idleTimeoutMinutes,
      pipelineS3BucketName: props.pipelineS3Bucket.bucketName,
      pipelineS3Prefix: props.pipelineS3Prefix,
      architecture: props.architecture,
      solutionVersion: SolutionInfo.SOLUTION_VERSION_DETAIL? SolutionInfo.SOLUTION_VERSION_DETAIL: 'build-' + new Date().getTime(),
    },
  });
  cr.node.addDependency(policy);
  return cr;
}