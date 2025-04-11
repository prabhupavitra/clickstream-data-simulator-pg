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
import { Context } from 'aws-lambda';
import { queryItems } from './create-load-manifest';
import { composeJobStatus } from './put-ods-source-to-store';
import { JobStatus, REDSHIFT_TABLE_NAMES } from '../../private/constant';

const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME!;
const DYNAMODB_TABLE_INDEX_NAME = process.env.DYNAMODB_TABLE_INDEX_NAME!;

export interface HasMoreWorkEvent {
  odsTableName: string;
  odsSourceBucket: string;
  odsSourcePrefix: string;
}

export const handler = async (event: HasMoreWorkEvent, context: Context) => {
  const requestId = context.awsRequestId;
  logger.debug(`context.awsRequestId:${requestId}`);

  const tableName = DYNAMODB_TABLE_NAME;
  const indexName = DYNAMODB_TABLE_INDEX_NAME;
  const odsTableName = event.odsTableName;
  const odsSourceBucket = event.odsSourceBucket;
  const odsSourcePrefix = event.odsSourcePrefix;

  logger.debug(`odsTableName: ${odsTableName}`);

  const odsEventBucketWithPrefix = `${odsSourceBucket}/${odsSourcePrefix}`;

  let newRecordResp;

  const getStatusFilesCount = async (redshiftTableName: string, jobStatus: string) => {

    let lastEvaluatedKey = undefined;
    const jobStatusQuery = composeJobStatus(jobStatus, redshiftTableName);

    const prefixQuery = odsEventBucketWithPrefix.replace(new RegExp(`/${odsTableName}/?$`), `/${redshiftTableName}/`);

    logger.info('queryItems by', {
      redshiftTableName,
      tableName,
      indexName,
      prefixQuery,
      jobStatusQuery,
    });

    let jobNewCountForTable = 0;
    while (true) {
      newRecordResp = await queryItems(tableName, indexName, prefixQuery, jobStatusQuery, lastEvaluatedKey, odsTableName);
      jobNewCountForTable += newRecordResp.Count;
      if (newRecordResp.LastEvaluatedKey) {
        lastEvaluatedKey = newRecordResp.LastEvaluatedKey;
      } else {
        break;
      }
    }
    logger.info('jobNewCountForTable=' + jobNewCountForTable + ', redshiftTableName=' + redshiftTableName);
    return jobNewCountForTable;
  };

  const currentJobNewCount = await getStatusFilesCount(odsTableName, JobStatus.JOB_NEW);

  const odsTableNames = REDSHIFT_TABLE_NAMES;
  let tableProcessingCountInfo: { [key: string]: any } = {};
  let totalProcessCount = 0;
  for (const odsTable of odsTableNames) {
    const processingCount = await getStatusFilesCount(odsTable, JobStatus.JOB_PROCESSING);
    tableProcessingCountInfo = {
      ...tableProcessingCountInfo,
      [odsTable]: processingCount,
    };
    totalProcessCount += processingCount;
  }

  return {
    processingFilesCount: tableProcessingCountInfo,
    jobNewCount: currentJobNewCount,
    hasMoreWork: (currentJobNewCount + totalProcessCount) > 0,
  };
};

