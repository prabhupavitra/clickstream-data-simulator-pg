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

import { aws_sdk_client_common_config, logger } from '@aws/clickstream-base-lib';
import { Metrics, MetricUnits } from '@aws-lambda-powertools/metrics';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';

import { Context } from 'aws-lambda';
import { composeJobStatus } from './put-ods-source-to-store';
import { AnalyticsCustomMetricsName, MetricsNamespace, MetricsService } from '../../../common/model';
import { JobStatus } from '../../private/constant';
import { ManifestBody } from '../../private/model';
import { getRedshiftClient, executeStatements, getRedshiftProps } from '../redshift-data';

// Set the AWS Region.
const REGION = process.env.AWS_REGION; //e.g. "us-east-1"
// Create an Amazon service client object.
const ddbClient = new DynamoDBClient({
  ...aws_sdk_client_common_config,
  region: REGION,
});

const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME!;
const REDSHIFT_ROLE_ARN = process.env.REDSHIFT_ROLE!;
const REDSHIFT_DATA_API_ROLE_ARN = process.env.REDSHIFT_DATA_API_ROLE!;
const REDSHIFT_DATABASE = process.env.REDSHIFT_DATABASE!;
const PROJECT_ID = process.env.PROJECT_ID!;

const metrics = new Metrics({ namespace: MetricsNamespace.REDSHIFT_ANALYTICS, serviceName: MetricsService.WORKFLOW });

metrics.addDimensions({
  ProjectId: PROJECT_ID,
});


type LoadManifestEventDetail = ManifestBody & {
  execution_id: string;
}

export interface LoadManifestEvent {
  detail: LoadManifestEventDetail;
  odsTableName: string;
}

const redshiftDataApiClient = getRedshiftClient(REDSHIFT_DATA_API_ROLE_ARN);

/**
 * The lambda function submit a SQL statement to load data to Redshift.
 * @param event, the JSON format is as following:
{
  execution_id: "arn:aws:states:us-east-2:xxxxxxxxxxxx:execution:LoadManifestStateMachineAE0969CA-v2ur6ASaxNOQ:12ec840c-6282-4d53-475d-6db473e539c3_70bfb836-c7d5-7cab-75b0-5222e78194ac",
  appId: "app1",
  jobList:
    {entries:
      [{
        url:"s3://DOC-EXAMPLE-BUCKET/project1/ods_external_events/partition_app=wordpuzz.wordle.puzzle.game.word.daily.free/partition_year=2023/partition_month=01/partition_day=15/clickstream-1-job_part00000.parquet.snappy",
        meta:{
          "content_length":10324001
        }
      }]
    },
  manifestFileName: "s3://DOC-EXAMPLE-BUCKET/manifest/wordpuzz.wordle.puzzle.game.word.daily.free50be34be-fdec-4b45-8b14-63c38f910a56.manifest"
}
 * @param context The context of lambda function.
 * @returns The query_id and relevant properties.
 */
export const handler = async (event: LoadManifestEvent, context: Context) => {
  logger.debug('requestJson:', { event });
  logger.debug(`context.awsRequestId:${context.awsRequestId}`);
  const retryCount = event.detail.retryCount;
  let appId = event.detail.appId;
  const manifestFileName = event.detail.manifestFileName;
  const odsTableName = event.odsTableName;
  logger.debug(`odsTableName: ${odsTableName}`);
  const jobList = event.detail.jobList;
  logger.info('Event details', { details: event.detail });
  // The appId will be used as the schema of Redshift, '.' and '-' are not supported.
  appId = appId.replace(/\./g, '_').replace(/\-/g, '_');
  logger.debug(`appId:${appId}`);

  const redshiftProps = getRedshiftProps(
    process.env.REDSHIFT_MODE!,
    REDSHIFT_DATABASE,
    REDSHIFT_DATA_API_ROLE_ARN,
    process.env.REDSHIFT_DB_USER!,
    process.env.REDSHIFT_SERVERLESS_WORKGROUP_NAME!,
    process.env.REDSHIFT_CLUSTER_IDENTIFIER!,
  );

  for (const entry of jobList.entries) {
    await updateItem(odsTableName, DYNAMODB_TABLE_NAME, entry.url, JobStatus.JOB_PROCESSING);
  }

  const schema = appId;

  // call sp to merge data into data
  const sqlStatement = `CALL ${schema}.sp_merge_${odsTableName}('${manifestFileName}', '${REDSHIFT_ROLE_ARN}')`;

  try {
    const queryId = await executeStatements(
      redshiftDataApiClient, [sqlStatement], redshiftProps.serverlessRedshiftProps, redshiftProps.provisionedRedshiftProps);

    logger.info('loadFileToRedshift response:', { queryId });

    metrics.addMetric(AnalyticsCustomMetricsName.FILE_LOADED, MetricUnits.Count, jobList.entries.length);
    metrics.publishStoredMetrics();

    return {
      detail: {
        id: queryId,
        appId: appId,
        manifestFileName: manifestFileName,
        jobList: jobList,
        retryCount,
      },
    };
  } catch (err) {
    if (err instanceof Error) {
      logger.error('Error when loading data to Redshift.', err);
    }
    throw err;
  }

};

/**
 * Function to update item to Dynamodb table.
 * @param tableName Table name in Dynamodb.
 * @param s3Uri The URI of S3 object as partition key in Dynamodb.
 * @param awsRequestId The request ID in event request body.
 * @param jobStatus The status of job.
 * @returns The response of update item.
 */
export const updateItem = async (
  odsTableName: string,
  tableName: string,
  s3Uri: string,
  jobStatus: string,
) => {

  const qJobStatus = composeJobStatus(jobStatus, odsTableName);

  logger.info(`updateItem: s3Uri:${s3Uri} set jobStatus=${qJobStatus}`);

  const params = {
    TableName: tableName,
    Key: {
      s3_uri: s3Uri,
    },
    // Define expressions for the new or updated attributes
    UpdateExpression: 'SET #job_status= :p1',
    ExpressionAttributeNames: {
      '#job_status': 'job_status',
    },
    ExpressionAttributeValues: {
      ':p1': qJobStatus,
    },
  };
  try {
    const data = await ddbClient.send(new UpdateCommand(params));
    logger.debug('Success - item update');
    return data;
  } catch (err) {
    if (err instanceof Error) {
      logger.error('Error when updating jobs in DDB.', err);
    }
    throw err;
  }
};