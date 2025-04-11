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

import { aws_sdk_client_common_config, generateRandomStr, logger, marshallOptions, unmarshallOptions } from '@aws/clickstream-base-lib';
import {
  DynamoDBClient,
  BatchWriteItemCommand,
  BatchWriteItemCommandInput,
} from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  ScanCommandInput,
  paginateScan,
} from '@aws-sdk/lib-dynamodb';
import { NativeAttributeValue, marshall } from '@aws-sdk/util-dynamodb';
import {
  CdkCustomResourceEvent,
  CdkCustomResourceResponse,
  CloudFormationCustomResourceUpdateEvent,
  Context,
} from 'aws-lambda';
import dictionary from '../../lambda/api/config/dictionary.json';

const ddbClient = new DynamoDBClient({
  ...aws_sdk_client_common_config,
});

const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { ...marshallOptions, convertTopLevelContainer: false },
  unmarshallOptions: { ...unmarshallOptions },
});

interface DicItem {
  readonly name: string;
  readonly data: any;
}

export const handler = async (
  event: CdkCustomResourceEvent,
  _context: Context,
): Promise<CdkCustomResourceResponse> => {
  logger.debug('dictionary:', { dictionary });

  const physicalId = ('PhysicalResourceId' in event) ? event.PhysicalResourceId :
    `batchInsertDDB${generateRandomStr(8, 'abcdefghijklmnopqrstuvwxyz0123456789')}`;
  const response: CdkCustomResourceResponse = {
    StackId: event.StackId,
    RequestId: event.RequestId,
    LogicalResourceId: event.LogicalResourceId,
    PhysicalResourceId: physicalId,
    Data: {
      TableName: event.ResourceProperties.tableName,
    },
    Status: 'SUCCESS',
  };

  try {
    await _handler(event);
  } catch (e) {
    if (e instanceof Error) {
      logger.error('Batch insert error.', e);
    }
    throw e;
  }
  return response;
};

async function _handler(event: CdkCustomResourceEvent) {
  const requestType = event.RequestType;

  if (requestType == 'Create') {
    await cleanData(event);
    await batchInsert(event);
  } else if (requestType == 'Update') {
    const lastModifiedTime = event.ResourceProperties.lastModifiedTime;
    const oldLastModifiedTime = (event as CloudFormationCustomResourceUpdateEvent).OldResourceProperties.lastModifiedTime;
    if (lastModifiedTime === oldLastModifiedTime) {
      logger.info('No change in dictionary. Skip batch insert.');
      return;
    }
    await cleanData(event);
    await batchInsert(event);
  }
}

async function batchInsert(event: CdkCustomResourceEvent): Promise<any> {
  const tableName: string = event.ResourceProperties.tableName;
  const items: DicItem[] = dictionary;
  const itemsAsDynamoPutRequest: any[] = [];
  items.forEach(item => {
    const marshallItem = marshall(item, { ...marshallOptions, convertTopLevelContainer: false });
    itemsAsDynamoPutRequest.push({
      PutRequest: {
        Item: marshallItem,
      },
    });
  });
  const input: BatchWriteItemCommandInput = {
    RequestItems: {
      [tableName]: itemsAsDynamoPutRequest,
    },
  };
  await ddbClient.send(new BatchWriteItemCommand(input));
}

async function cleanData(event: CdkCustomResourceEvent): Promise<any> {
  const tableName: string = event.ResourceProperties.tableName;
  const input: ScanCommandInput = {
    TableName: tableName,
  };
  const records = await scan(input);
  const items = records as DicItem[];
  for (let index in items) {
    const params: DeleteCommand = new DeleteCommand({
      TableName: tableName,
      Key: {
        name: items[index].name,
      },
    });
    await docClient.send(params);
  }
}

const scan = async (input: ScanCommandInput) => {
  const records: Record<string, NativeAttributeValue>[] = [];
  for await (const page of paginateScan({ client: docClient }, input)) {
    records.push(...page.Items as Record<string, NativeAttributeValue>[]);
  }
  return records;
};
