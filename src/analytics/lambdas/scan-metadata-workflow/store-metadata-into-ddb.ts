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

import { readFileSync } from 'fs';
import { aws_sdk_client_common_config, logger, parseMetadataFromSql, parseDynamoDBTableARN, METADATA_V3_VERSION } from '@aws/clickstream-base-lib';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  BatchWriteCommandInput,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { StoreMetadataBody } from '../../private/model';
import { executeStatementsWithWait, getRedshiftClient, getRedshiftProps, getStatementResult } from '../redshift-data';

const REDSHIFT_DATA_API_ROLE_ARN = process.env.REDSHIFT_DATA_API_ROLE!;
const REDSHIFT_DATABASE = process.env.REDSHIFT_DATABASE!;

const { ddbRegion, ddbTableName } = parseDynamoDBTableARN(process.env.METADATA_DDB_TABLE_ARN!);

// Create an Amazon service client object.
const redshiftDataApiClient = getRedshiftClient(REDSHIFT_DATA_API_ROLE_ARN);

export interface StoreMetadataEvent {
  detail: StoreMetadataBody;
}

// Create an Amazon DynamoDB service client object.
const ddbClient = new DynamoDBClient({
  ...aws_sdk_client_common_config,
  region: ddbRegion,
});

const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

/**
 * The lambda function to get event metadata and properties metadata from redshift. And store them into DDB
 * @param event StoreMetadataEvent.
 * @returns.
 */
export const handler = async (event: StoreMetadataEvent) => {
  const appId = event.detail.appId;
  const projectId = process.env.PROJECT_ID!;
  const metadataItems: any[] = [];
  // id as key, and currentMonth as value for those marked latest month
  const markedLatestMonthMap: Map<string, any> = new Map();
  try {

    await handlePropertiesMetadata(projectId, appId, metadataItems, markedLatestMonthMap);

    await handleEventMetadata(appId, metadataItems, markedLatestMonthMap);

    await handleUserAttributeMetadata(projectId, appId, metadataItems, markedLatestMonthMap);

    await batchWriteIntoDDB(metadataItems);

    return {
      detail: {
        appId: appId,
        status: 'SUCCEED',
        message: 'store metadata into ddb successfully',
      },
    };
  } catch (err) {
    logger.error('Error when store metadata into ddb.', { err } );
    return {
      detail: {
        appId: appId,
        status: 'FAILED',
        message: 'store metadata into ddb failed',
      },
    };
  }
};

async function handleEventMetadata(appId: string, metadataItems: any[], markedLatestMonthMap: Map<string, any>) {
  logger.info(`Start to handle event metadata for app: ${appId}`);
  // key is (id, originMonth), value is item
  const ddbItemsMap = await getExistingItemsFromDDB(appId, 'event_metadata');

  const inputSql = `SELECT id, month, prefix, project_id, app_id, day_number, count, event_name, platform, sdk_version, sdk_name FROM ${appId}.event_metadata;`;

  const response = await queryMetadata(inputSql);

  for (const record of response.Records!) {
    const key = `${record[0].stringValue}${record[1].stringValue}`;
    if (ddbItemsMap.has(key)) {
      await updateEventItem(ddbItemsMap, key, record, markedLatestMonthMap);
    } else {
      const item = await createEventItem(record, ddbItemsMap, markedLatestMonthMap);
      ddbItemsMap.set(key, item);
    }
  }

  // aggregate summary info
  aggEventSummary(ddbItemsMap, metadataItems);

  putItemsMapIntoDDBItems(metadataItems, ddbItemsMap);
}

async function handlePropertiesMetadata(
  projectId: string,
  appId: string,
  metadataItems: any[],
  markedLatestMonthMap: Map<string, any>,
) {
  logger.info(`Start to handle properties metadata for app: ${appId}`);
  // key is (id, originMonth), value is item
  const ddbItemsMap = await getExistingItemsFromDDB(appId, 'event_parameter_metadata');

  const inputSql =
    `SELECT id, month, prefix, project_id, app_id, day_number, category, event_name_set, property_name, value_type, property_value, count, platform FROM ${appId}.event_parameter_metadata;`;
  const response = await queryMetadata(inputSql);

  for (const record of response.Records!) {
    const id = record[0].stringValue;
    const month = record[1].stringValue;
    const key = `${id}${month}`;
    if (ddbItemsMap.has(key)) {
      // there is existing item in ddb, update the item according to the record from redshift
      await updateEventParameterItem(ddbItemsMap, key, record, markedLatestMonthMap);
    } else {
      // there is not existing item in ddb, create a new item and set into ddbItemsMap
      const item = await createEventParameterItem(record, ddbItemsMap, markedLatestMonthMap);
      ddbItemsMap.set(key, item);
    }
  }

  const allDistinctEventSet = await getDistinctEventName(appId);
  const allDistinctPlatformSet = await getDistinctPlatform(appId);

  // aggregate summary info
  await aggEventParameterSummary(ddbItemsMap, allDistinctEventSet, allDistinctPlatformSet);

  putItemsMapIntoDDBItems(metadataItems, ddbItemsMap);

  const metadataItemsWithoutValue = generateEventPropertiesWithoutValue(projectId, appId, allDistinctEventSet, allDistinctPlatformSet);

  metadataItemsWithoutValue.forEach(item => {
    metadataItems.push({
      PutRequest: {
        Item: item,
      },
    });
  });
}

async function handleUserAttributeMetadata(projectId: string, appId: string, metadataItems: any[], markedLatestMonthMap: Map<string, any>) {
  logger.info(`Start to handle user attribute metadata for app: ${appId}`);
  // key is (id, originMonth), value is item
  const ddbItemsMap = await getExistingItemsFromDDB(appId, 'user_attribute_metadata');
  const inputSql =
    `SELECT id, month, prefix, project_id, app_id, day_number, category, property_name, value_type, value_enum FROM ${appId}.user_attribute_metadata;`;

  const response = await queryMetadata(inputSql);

  for (const record of response.Records!) {
    const key = `${record[0].stringValue}${record[1].stringValue}`;
    if (ddbItemsMap.has(key)) {
      await updateUserPropertiesItem(ddbItemsMap, key, record, markedLatestMonthMap);
    } else {
      const item = await createUserPropertiesItem(record, ddbItemsMap, markedLatestMonthMap);
      ddbItemsMap.set(key, item);
    }
  }
  putItemsMapIntoDDBItems(metadataItems, ddbItemsMap);

  const metadataItemsWithoutValue = generateUserPropertiesWithoutValue(projectId, appId);

  metadataItemsWithoutValue.forEach(item => {
    metadataItems.push({
      PutRequest: {
        Item: item,
      },
    });
  });
}

async function batchWriteIntoDDB(metadataItems: any[]) {
  logger.info('Start to batch write into ddb, metadataItems: ', { metadataItems });
  const chunkedMetadataItems = chunkArray(metadataItems, 20);

  for (const itemsChunk of chunkedMetadataItems) {
    const inputPara: BatchWriteCommandInput = {
      RequestItems: {
        [ddbTableName]: itemsChunk,
      },
    };
    try {
      await ddbDocClient.send(new BatchWriteCommand(inputPara));
    } catch (error) {
      // log error and inputPara
      logger.error('Error when batch write into ddb: ', { error, inputPara });
      throw error;
    }
  }
}

// limit the size of set to 1000 for events in parameter
function addSetIntoAnotherSet(sourceSet: Set<string>, inputSet: Set<string>) {
  for (const element of inputSet) {
    if (sourceSet.size < 1000) {
      sourceSet.add(element);
    }
  }
}

/**
 * Check whether currentMonth is latest month for id and update earlier month to its origin month
 * @param memoryItemMap memory item map
 * @param id id
 * @param currentMonth current month
 * @param markedLatestMonthMap marked latest month map
 * @returns
 * latest: if currentMonth is latest
 * originMonth: if currentMonth is not latest
 **/
async function getAndMarkMonthValue(memoryItemMap: Map<string, any>, id: string, currentMonth: string, markedLatestMonthMap: Map<string, any>) {
  try {
    let monthValue;
    if (!markedLatestMonthMap.has(id)) {
      monthValue = await checkLatestMonthWithDDB(id, currentMonth, markedLatestMonthMap);
    } else {
      monthValue = checkLatestMonthWithMemory(memoryItemMap, id, currentMonth, markedLatestMonthMap);
    }
    if (monthValue === 'latest') {
      // update memory latest month
      markedLatestMonthMap.set(id, currentMonth);
    }
    return monthValue;
  } catch (error) {
    logger.error('Error when mark latest month .', { error });
    throw error;
  }
}

async function checkLatestMonthWithDDB(id: string, currentMonth: string, markedLatestMonthMap: Map<string, any>) {
  // compare with ddb latest month
  const getCommandParameter = {
    TableName: ddbTableName,
    Key: {
      id: id,
      month: 'latest',
    },
  };
  const response = await ddbDocClient.send(new GetCommand(getCommandParameter));
  if (response.Item) {
    const item = response.Item;
    const existingDDBItemOriginMonth = item.originMonth;
    if (currentMonth < existingDDBItemOriginMonth) {
      // set markedLatestMonthMap
      markedLatestMonthMap.set(id, existingDDBItemOriginMonth);
      return currentMonth;
    }
    if (currentMonth > existingDDBItemOriginMonth) {
      // update ddb latest month to its origin month
      item.month = existingDDBItemOriginMonth;
      item.updateTimestamp = Date.now();
      item.prefix = addVersionToPrefix(item.prefix);
      const params = {
        TableName: ddbTableName,
        Item: item,
      };
      await ddbDocClient.send(new PutCommand(params));
    }
  }
  return 'latest';
}

function checkLatestMonthWithMemory(memoryItemMap: Map<string, any>, id: string, currentMonth: string, markedLatestMonthMap: Map<string, any>) {
  const markedMonth = markedLatestMonthMap.get(id);
  if (currentMonth < markedMonth) {
    return currentMonth;
  }
  if (currentMonth > markedMonth) {
    // update memory latest month
    const key = `${id}${markedMonth}`;
    const item = memoryItemMap.get(key);
    item.month = markedMonth;
    memoryItemMap.set(key, item);
  }
  return 'latest';
}

function chunkArray(inputArray: any[], chunkSize: number) {
  const chunks = [];
  for (let i = 0; i < inputArray.length; i += chunkSize) {
    chunks.push(inputArray.slice(i, i + chunkSize));
  }
  return chunks;
};

async function queryMetadata(inputSql: string) {
  const redshiftProps = getRedshiftProps(
    process.env.REDSHIFT_MODE!,
    REDSHIFT_DATABASE,
    REDSHIFT_DATA_API_ROLE_ARN,
    process.env.REDSHIFT_DB_USER!,
    process.env.REDSHIFT_SERVERLESS_WORKGROUP_NAME!,
    process.env.REDSHIFT_CLUSTER_IDENTIFIER!,
  );
  const sqlStatements : string[] = [];

  sqlStatements.push(inputSql);
  try {
    const queryId = await executeStatementsWithWait(
      redshiftDataApiClient, sqlStatements, redshiftProps.serverlessRedshiftProps, redshiftProps.provisionedRedshiftProps);

    if (!queryId) {
      throw new Error(`Query failed with sqls: ${sqlStatements}`);
    }

    logger.info('query metadata response:', { queryId });

    // Fetch results
    const response = await getStatementResult(redshiftDataApiClient, queryId);

    return response;
  } catch (err) {
    logger.error('Error when query metadata.', { err } );
    throw err;
  }
}

function convertToSet(inputString?: string) {
  let dataSet : Set<string> = new Set();
  if (inputString) {
    inputString.split('#|!|#').forEach(item => {
      // limit the size of set to 1000 for events in parameter
      if (dataSet.size < 1000) {
        dataSet.add(item);
      }
    });
  }
  return dataSet;
}

function convertValueEnumToDDBList(inputString?: string) {
  let listData: any[] = [];
  if (inputString) {
    listData = inputString.split('#|!|#').map(item => {
      const lastUnderscoreIndex = item.lastIndexOf('_');
      const value = item.substring(0, lastUnderscoreIndex);
      const count = parseInt(item.substring(lastUnderscoreIndex + 1));
      if (!value || isNaN(count)) {
        return null;
      }
      return { value, count };
    }).filter(item => item !== null);
  }
  return listData;
}

async function getMetadataFromDDBByIdAndOriginMonth(id: string, originMonth: string) {
  logger.info(`Get all metadata from DDB according to id: ${id} and originMonth: ${originMonth}`);
  const queryCommandInput: QueryCommandInput = {
    TableName: ddbTableName,
    KeyConditionExpression: '#id= :id',
    FilterExpression: '#originMonth = :originMonth',
    ExpressionAttributeNames: {
      '#originMonth': 'originMonth',
      '#id': 'id',
    },
    ExpressionAttributeValues: {
      ':id': id,
      ':originMonth': originMonth,
    },
    ScanIndexForward: false,
  };
  const response = await ddbDocClient.send(new QueryCommand(queryCommandInput));
  return response.Items;
}

async function getExistingItemsFromDDB(appId: string, redshiftTableName: string) {
  const distinctIdAndMonthSql = `SELECT distinct id, month FROM ${appId}.${redshiftTableName};`;
  const idAndMonthResponse = await queryMetadata(distinctIdAndMonthSql);
  const itemsMap = new Map();
  for (const record of idAndMonthResponse.Records!) {
    // read all ddb item of keys(id, originMonth) into memory
    const id = record[0].stringValue;
    const originMonth = record[1].stringValue;
    const ddbRecrods = await getMetadataFromDDBByIdAndOriginMonth(id, originMonth);
    ddbRecrods?.forEach(item => {
      const key = `${id}${originMonth}`;
      itemsMap.set(key, item);
    });
  };
  return itemsMap;
}

function putItemsMapIntoDDBItems(metadataItems: any[], itemsMap: Map<string, any[]>) {
  for (const item of itemsMap.values()) {
    metadataItems.push({
      PutRequest: {
        Item: item,
      },
    });
  }
}

async function updateEventParameterItem(itemsMap: Map<string, any>, key: string, record: any, markedLatestMonthMap: Map<string, any>) {
  const item = itemsMap.get(key);
  const dayNumber = `day${record[5].longValue}`;
  if (!item[dayNumber]) {
    // initialize dayN record
    item[dayNumber] = {
      hasData: true,
      platform: [],
      valueEnum: [],
    };
  }
  // set platform value
  const platformSet: Set<string> = new Set(item[dayNumber].platform);

  addSetIntoAnotherSet(platformSet, convertToSet(record[12].stringValue));

  item[dayNumber].platform = Array.from(platformSet);

  // convert valueEnum to map, and check if there is same value in valueEnum, if yes, update the count
  const valueEnumMap = new Map();
  item[dayNumber].valueEnum.forEach((element: any) => {
    valueEnumMap.set(element.value, element.count);
  });
  valueEnumMap.set(record[10].stringValue, record[11].longValue);

  // convert valueEnumMap to valueEnum and push into item
  item[dayNumber].valueEnum = [];
  for (const [parameterValue, countValue] of valueEnumMap) {
    if (item[dayNumber].valueEnum.length < 20) {
      item[dayNumber].valueEnum.push({ value: parameterValue, count: countValue });
    } else {
      break;
    }
  }

  // item should be updated if other month data is later than current month data
  item.month = await getAndMarkMonthValue(itemsMap, record[0].stringValue, record[1].stringValue, markedLatestMonthMap);

  item.updateTimestamp = Date.now();

  if (item.summary) {
    // add event name to event name set
    const eventNameSet: Set<string> = new Set(item.summary.associatedEvents);
    addSetIntoAnotherSet(eventNameSet, convertToSet(record[7].stringValue));
    item.summary.associatedEvents = Array.from(eventNameSet);
  }
  item.prefix = addVersionToPrefix(record[2].stringValue);
}

async function createEventParameterItem(record: any, itemsMap: Map<string, any>, markedLatestMonthMap: Map<string, any>) {
  return {
    id: record[0].stringValue,
    month: await getAndMarkMonthValue(itemsMap, record[0].stringValue, record[1].stringValue, markedLatestMonthMap),
    originMonth: record[1].stringValue,
    prefix: addVersionToPrefix(record[2].stringValue),
    projectId: record[3].stringValue,
    appId: record[4].stringValue,
    name: record[8].stringValue,
    category: record[6].stringValue,
    valueType: record[9].stringValue,
    createTimestamp: Date.now(),
    updateTimestamp: Date.now(),
    [`day${record[5].longValue}`]: {
      hasData: true,
      platform: Array.from(convertToSet(record[12].stringValue)),
      valueEnum: [{ value: record[10].stringValue, count: record[11].longValue }],
    },
    summary: {
      hasData: true,
      platform: Array.from(convertToSet(record[12].stringValue)),
      valueEnum: [{ value: record[10].stringValue, count: record[11].longValue }],
      associatedEvents: Array.from(convertToSet(record[7].stringValue)),
    },
  };
}

async function aggEventParameterSummary(
  itemsMap: Map<string, any>,
  allDistinctEventSet: Set<string>,
  allDistinctPlatformSet: Set<string>,
) {
  const metadataNameSet = getMetadataName();
  for (const item of itemsMap.values()) {
    const platformSet: Set<string> = new Set();
    const valueEnumAggregation: { [key: string]: number } = {};
    aggEventParameterValueEnumAndPlatform(item, platformSet, valueEnumAggregation, metadataNameSet, allDistinctPlatformSet);
    const valueEnum = [];
    // limit the size of valueEnum to 50
    for (const key in valueEnumAggregation) {
      if (valueEnum.length < 50) {
        valueEnum.push({ value: key, count: valueEnumAggregation[key] });
      } else {
        break;
      }
    }
    item.summary.platform = Array.from(platformSet);
    item.summary.valueEnum = valueEnum;

    if (metadataNameSet.has(item.name)) {
      item.summary.associatedEvents = Array.from(allDistinctEventSet);
      item.summary.platform = Array.from(allDistinctPlatformSet);
    }
  }
}

async function getDistinctEventName(appId: string) {
  const inputSql = `SELECT distinct event_name FROM ${appId}.event_v2;`;
  const response = await queryMetadata(inputSql);
  const eventNameSet: Set<string> = new Set();
  for (const record of response.Records!) {
    eventNameSet.add(record[0].stringValue);
  }
  return eventNameSet;
}

async function getDistinctPlatform(appId: string) {
  const inputSql = `SELECT distinct platform FROM ${appId}.event_v2;`;
  const response = await queryMetadata(inputSql);
  const platformSet: Set<string> = new Set();
  for (const record of response.Records!) {
    platformSet.add(record[0].stringValue);
  }
  return platformSet;
}

// get all METADATA name from session.sql and event-v2.sql
function getMetadataName() {
  const fileContentSession = readFileSync('/opt/session.sql').toString('utf-8');
  const metadataArraySession = parseMetadataFromSql(fileContentSession);

  const fileContentEvent = readFileSync('/opt/event-v2.sql').toString('utf-8');
  const metadataArrayEvent = parseMetadataFromSql(fileContentEvent);
  const metadataNameSet: Set<string> = new Set();

  for (const metadataObject of metadataArraySession) {
    metadataNameSet.add(metadataObject.name);
  }
  for (const metadataObject of metadataArrayEvent) {
    metadataNameSet.add(metadataObject.name);
  }
  return metadataNameSet;
}

function generateEventPropertiesWithoutValue(
  projectId: string,
  appId: string,
  allDistinctEventSet: Set<string>,
  allDistinctPlatformSet: Set<string>,
) {
  const fileContentSession = readFileSync('/opt/session.sql').toString('utf-8');
  const metadataArraySession = parseMetadataFromSql(fileContentSession);

  const fileContentEvent = readFileSync('/opt/event-v2.sql').toString('utf-8');
  const metadataArrayEvent = parseMetadataFromSql(fileContentEvent);

  const metadataItemsWithoutValue: any[] = [];
  for (const metadataObject of metadataArraySession) {
    if (metadataObject.scanValue === 'false') {
      metadataItemsWithoutValue.push(generateParametersRecord(metadataObject, projectId, appId, allDistinctEventSet, allDistinctPlatformSet));
    }
  }
  for (const metadataObject of metadataArrayEvent) {
    if (metadataObject.scanValue === 'false') {
      metadataItemsWithoutValue.push(generateParametersRecord(metadataObject, projectId, appId, allDistinctEventSet, allDistinctPlatformSet));
    }
  }
  return metadataItemsWithoutValue;
}

function generateUserPropertiesWithoutValue(projectId: string, appId: string) {
  const fileContentUser = readFileSync('/opt/user-v2.sql').toString('utf-8');
  const metadataArrayUser = parseMetadataFromSql(fileContentUser);
  const metadataItemsWithoutValue: any[] = [];
  for (const metadataObject of metadataArrayUser) {
    if (metadataObject.scanValue === 'false') {
      metadataItemsWithoutValue.push(generateUserPropertiesRecord(metadataObject, projectId, appId));
    }
  }
  return metadataItemsWithoutValue;
}

// generate parameters record for scanValue is false from session.sql and event-v2.sql
function generateParametersRecord(
  metadataObject: any,
  projectId: string,
  appId: string,
  allDistinctEventSet: Set<string>,
  allDistinctPlatformSet: Set<string>,
) {
  return {
    id: `${projectId}#${appId}#${metadataObject.category}#${metadataObject.name}#${metadataObject.dataType}`,
    month: 'latest',
    originMonth: convertDateToMonth(new Date().toISOString()),
    prefix: `EVENT_PARAMETER#${projectId}#${appId}#${METADATA_V3_VERSION}`,
    projectId: projectId,
    appId: appId,
    name: metadataObject.name,
    category: metadataObject.category,
    valueType: metadataObject.dataType,
    createTimestamp: Date.now(),
    updateTimestamp: Date.now(),
    summary: {
      hasData: true,
      platform: Array.from(allDistinctPlatformSet),
      valueEnum: [],
      associatedEvents: Array.from(allDistinctEventSet),
    },
  };
}

function generateUserPropertiesRecord(metadataObject: any, projectId: string, appId: string) {
  return {
    id: `${projectId}#${appId}#${metadataObject.category}#${metadataObject.name}#${metadataObject.dataType}`,
    month: 'latest',
    originMonth: convertDateToMonth(new Date().toISOString()),
    prefix: `USER_ATTRIBUTE#${projectId}#${appId}#${METADATA_V3_VERSION}`,
    projectId: projectId,
    appId: appId,
    name: metadataObject.name,
    category: metadataObject.category,
    valueType: metadataObject.dataType,
    createTimestamp: Date.now(),
    updateTimestamp: Date.now(),
    summary: {
      hasData: true,
    },
  };
}


function aggEventParameterValueEnumAndPlatform(
  item: any, platformSet: Set<string>,
  valueEnumAggregation: { [key: string]: number },
  metadataNameSet: Set<string>,
  allDistinctPlatformSet: Set<string>,
) {
  for (const key in item) {
    if (key.startsWith('day')) {
      const dayData = item[key];
      dayData.platform?.forEach((element: string) => platformSet.add(element));
      if (metadataNameSet.has(item.name)) {
        dayData.platform = Array.from(allDistinctPlatformSet);
      }
      dayData.valueEnum?.forEach((element: any) => {
        if (valueEnumAggregation[element.value]) {
          valueEnumAggregation[element.value] += element.count;
        } else {
          valueEnumAggregation[element.value] = element.count;
        }
      });
    }
  }
}

async function updateEventItem(itemsMap: Map<string, any>, key: string, record: any, markedLatestMonthMap: Map<string, any>) {
  const item = itemsMap.get(key);
  item[`day${record[5].longValue}`] = {
    count: record[6].longValue,
    hasData: true,
    platform: Array.from(convertToSet(record[8].stringValue)),
    sdkVersion: Array.from(convertToSet(record[9].stringValue)),
    sdkName: Array.from(convertToSet(record[10].stringValue)),
  };
  item.month = await getAndMarkMonthValue(itemsMap, record[0].stringValue, record[1].stringValue, markedLatestMonthMap);
  item.updateTimestamp = Date.now();
  item.prefix = addVersionToPrefix(record[2].stringValue);
}

async function createEventItem(record: any, itemsMap: Map<string, any>, markedLatestMonthMap: Map<string, any>) {
  return {
    id: record[0].stringValue,
    month: await getAndMarkMonthValue(itemsMap, record[0].stringValue, record[1].stringValue, markedLatestMonthMap),
    originMonth: record[1].stringValue,
    prefix: addVersionToPrefix(record[2].stringValue),
    projectId: record[3].stringValue,
    appId: record[4].stringValue,
    name: record[7].stringValue,
    createTimestamp: Date.now(),
    updateTimestamp: Date.now(),
    [`day${record[5].longValue}`]: {
      count: record[6].longValue,
      hasData: true,
      platform: Array.from(convertToSet(record[8].stringValue)),
      sdkVersion: Array.from(convertToSet(record[9].stringValue)),
      sdkName: Array.from(convertToSet(record[10].stringValue)),
    },
    summary: {
      hasData: true,
      platform: Array.from(convertToSet(record[8].stringValue)),
      sdkVersion: Array.from(convertToSet(record[9].stringValue)),
      sdkName: Array.from(convertToSet(record[10].stringValue)),
      associatedParameters: [],
    },
  };
}

function associatedParametersToEvent(eventName: string, associatedParameters: any[], parameterItems: any[]) {
  for (const parameter of parameterItems) {
    const parameterItem = parameter.PutRequest.Item;
    if (parameterItem.summary.associatedEvents.includes(eventName)) {
      const parameterName = parameterItem.name;
      const parameterCategory = parameterItem.category;
      const parameterValueType = parameterItem.valueType;
      // check if any record of associatedParameters contains parameterName, parameterCategory and parameterValueType
      const existedParameter = associatedParameters.find(
        (element: any) => element.name === parameterName && element.category === parameterCategory && element.valueType === parameterValueType);
      if (!existedParameter && associatedParameters.length < 1000) {
        associatedParameters.push({
          name: parameterName,
          category: parameterCategory,
          valueType: parameterValueType,
        });
      }
    }
  }
}

function aggEventSummary(itemsMap: Map<string, any>, metadataItems: any[]) {
  // aggregate summary info
  for (const item of itemsMap.values()) {
    const platformSet: Set<string> = new Set();
    const sdkVersionSet: Set<string> = new Set();
    const sdkNameSet: Set<string> = new Set();
    let maxDayNumber = 0;
    for (const key in item) {
      if (key.startsWith('day')) {
        const currentDayNumber = parseInt(key.substring(3));
        maxDayNumber = Math.max(maxDayNumber, currentDayNumber);
        const dayData = item[key];
        dayData.platform?.forEach((element: string) => platformSet.add(element));
        dayData.sdkVersion?.forEach((element: string) => sdkVersionSet.add(element));
        dayData.sdkName?.forEach((element: string) => sdkNameSet.add(element));
      }
    }
    item.summary.latestCount = item[`day${maxDayNumber}`].count;
    item.summary.platform = Array.from(platformSet);
    item.summary.sdkVersion = Array.from(sdkVersionSet);
    item.summary.sdkName = Array.from(sdkNameSet);
    associatedParametersToEvent(item.name, item.summary.associatedParameters, metadataItems);
  }
}

async function updateUserPropertiesItem(itemsMap: Map<string, any>, key: string, record: any, markedLatestMonthMap: Map<string, any>) {
  const item = itemsMap.get(key);
  item[`day${record[5].longValue}`] = {
    hasData: true,
    valueEnum: convertValueEnumToDDBList(record[9].stringValue),
  };
  item.summary = {
    hasData: true,
    valueEnum: convertValueEnumToDDBList(record[9].stringValue),
  };
  item.month = await getAndMarkMonthValue(itemsMap, record[0].stringValue, record[1].stringValue, markedLatestMonthMap);
  item.updateTimestamp = Date.now();
  item.prefix = addVersionToPrefix(record[2].stringValue);
}

async function createUserPropertiesItem(record: any, itemsMap: Map<string, any>, markedLatestMonthMap: Map<string, any>) {
  return {
    id: record[0].stringValue,
    month: await getAndMarkMonthValue(itemsMap, record[0].stringValue, record[1].stringValue, markedLatestMonthMap),
    originMonth: record[1].stringValue,
    prefix: addVersionToPrefix(record[2].stringValue),
    projectId: record[3].stringValue,
    appId: record[4].stringValue,
    name: record[7].stringValue,
    category: record[6].stringValue,
    valueType: record[8].stringValue,
    createTimestamp: Date.now(),
    updateTimestamp: Date.now(),
    [`day${record[5].longValue}`]: {
      hasData: true,
      valueEnum: convertValueEnumToDDBList(record[9].stringValue),
    },
    summary: {
      hasData: true,
      valueEnum: convertValueEnumToDDBList(record[9].stringValue),
    },
  };
}

function addVersionToPrefix(prefix: string) {
  if (!prefix.endsWith(`#${METADATA_V3_VERSION}`)) {
    return `${prefix}#${METADATA_V3_VERSION}`;
  }
  return prefix;
}

// convert date to like #202405
function convertDateToMonth(date: string) {
  return `#${date.substring(0, 7).replace('-', '')}`;
}

