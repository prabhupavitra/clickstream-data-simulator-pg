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

import path from 'path';
import { logger } from '@aws/clickstream-base-lib';
import { CloudFormationCustomResourceEvent, Context } from 'aws-lambda';
import { copyS3Object, deleteObjectsByPrefix } from '../../../common/s3';
import { getPluginS3Prefix } from '../../utils/utils-common';

const pipelineS3BucketName = process.env.PIPELINE_S3_BUCKET_NAME!;
const pipelineS3Prefix = process.env.PIPELINE_S3_PREFIX!;
const stackId = process.env.STACK_ID!;
const projectId = process.env.PROJECT_ID!;

type ResourceEvent = CloudFormationCustomResourceEvent;

interface ResourceProperties {
  ServiceToken: string;
  s3PathPluginJars: string;
  s3PathPluginFiles: string;
  entryPointJar: string;
}

export const handler = async (event: ResourceEvent, context: Context) => {
  logger.info('event', { event });

  try {
    const data = await _handler(event, context);
    logger.info('=== complete ===');
    return data;
  } catch (e: any) {
    logger.error(e);
    throw e;
  }
};

async function _handler(event: ResourceEvent, context: Context) {
  let requestType = event.RequestType;
  logger.info('functionName: ' + context.functionName);

  logger.info('RequestType: ' + requestType);

  const properties = event.ResourceProperties as ResourceProperties;

  logger.info('ResourceProperties', { properties });

  if (requestType != 'Delete') {
    return onCreateAndUpdate(properties);
  }

  if (requestType === 'Delete') {
    return onDelete();
  }
}


async function onCreateAndUpdate(properties: ResourceProperties) {
  logger.info('onCreateAndUpdate()');
  const s3PathPluginJars = properties.s3PathPluginJars;
  const s3PathPluginFiles = properties.s3PathPluginFiles;

  const destS3Dir = `s3://${pipelineS3BucketName}/${getPluginS3Prefix(pipelineS3Prefix, stackId, projectId)}`;

  // copy s3PathPluginJars
  const destJarFiles = [];
  if (s3PathPluginJars) {
    for ( const srcJarFile of s3PathPluginJars.split(',')) {
      const destJarFile = `${destS3Dir}jars/${path.basename(srcJarFile)}`;
      await copyS3Object(srcJarFile, destJarFile);
      destJarFiles.push(destJarFile);
    }
  }

  // copy s3PathPluginFiles
  const destFiles = [];
  if (s3PathPluginFiles) {
    for ( const srcFile of s3PathPluginFiles.split(',')) {
      const destFile = `${destS3Dir}files/${path.basename(srcFile)}`;
      await copyS3Object(srcFile, destFile);
      destFiles.push(destFile);
    }
  }

  const rtValue = {
    Data: {
      s3PathPluginJars: destJarFiles.join(','),
      s3PathPluginFiles: destFiles.join(','),
    },
  };

  logger.info('rtValue', { rtValue });
  return rtValue;
}

async function onDelete() {
  logger.info('onDelete()');
  const destS3Dir = getPluginS3Prefix(pipelineS3Prefix, stackId, projectId);

  const s3Dirs = [
    `${destS3Dir}jars`,
    `${destS3Dir}files`,
  ];

  for (const s3Prefix of s3Dirs) {
    await deleteObjectsByPrefix(pipelineS3BucketName, s3Prefix);
  }
}
