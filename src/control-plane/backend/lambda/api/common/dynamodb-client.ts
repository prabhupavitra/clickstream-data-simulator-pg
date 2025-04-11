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

import { aws_sdk_client_common_config, marshallOptions, unmarshallOptions } from '@aws/clickstream-base-lib';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommandInput, ScanCommandInput, paginateQuery, paginateScan } from '@aws-sdk/lib-dynamodb';
import { NativeAttributeValue } from '@aws-sdk/util-dynamodb';
import memoize from 'fast-memoize';

// Create DynamoDB Client and patch it for tracing
const ddbClient = new DynamoDBClient({
  ...aws_sdk_client_common_config,
});

// Create the DynamoDB Document client.
const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions,
  unmarshallOptions,
});

const memoized = memoize(query);

async function query(input: QueryCommandInput) {
  const records: Record<string, NativeAttributeValue>[] = [];
  for await (const page of paginateQuery({ client: docClient }, input)) {
    records.push(...page.Items as Record<string, NativeAttributeValue>[]);
  }
  return records;
}

async function scan(input: ScanCommandInput) {
  const records: Record<string, NativeAttributeValue>[] = [];
  for await (const page of paginateScan({ client: docClient }, input)) {
    records.push(...page.Items as Record<string, NativeAttributeValue>[]);
  }
  return records;
}

async function memoizedQuery(input: QueryCommandInput) {
  const cache = process.env.METADATA_CACHE || 'true';
  if (cache === 'true') {
    return memoized(input);
  }
  return query(input);
}

export {
  docClient,
  ddbClient,
  marshallOptions,
  query,
  scan,
  memoizedQuery,
};