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
import { CdkCustomResourceHandler, CdkCustomResourceEvent, CdkCustomResourceResponse } from 'aws-lambda';
import { CreateMappingRoleUser } from '../../private/model';
import { getRedshiftClient, executeStatementsWithWait } from '../redshift-data';

type ResourcePropertiesType = CreateMappingRoleUser & {
  readonly ServiceToken: string;
}

export const handler: CdkCustomResourceHandler = async (event) => {
  const response: CdkCustomResourceResponse = {
    PhysicalResourceId: 'create-redshift-db-user-custom-resource',
    Data: {
    },
    Status: 'SUCCESS',
  };

  try {
    await _handler(event);
  } catch (e) {
    if (e instanceof Error) {
      logger.error('Error when creating database and schema in redshift', e);
    }
    throw e;
  }
  return response;
};

async function _handler(event: CdkCustomResourceEvent) {
  const requestType = event.RequestType;

  logger.info('RequestType: ' + requestType);
  if (requestType == 'Create') {
    await onCreate(event);
  }

  if (requestType == 'Update') {
    await onUpdate(event);
  }

  if (requestType == 'Delete') {
    await onDelete(event);
  }
}

async function onCreate(event: CdkCustomResourceEvent) {
  logger.info('onCreate()');

  const props = event.ResourceProperties as ResourcePropertiesType;
  // 1. create database in Redshift
  const redshiftClient = getRedshiftClient(props.serverlessRedshiftProps!.dataAPIRoleArn);

  try {
    await executeStatementsWithWait(redshiftClient, [
      `CREATE USER "IAMR:${props.dataRoleName}" PASSWORD DISABLE CREATEDB`,
      'CREATE ROLE clickstream',
      'GRANT CREATE OR REPLACE FUNCTION TO ROLE clickstream',
      'GRANT DROP FUNCTION TO ROLE clickstream',
      'GRANT create user to role clickstream',
      `GRANT ROLE clickstream TO "IAMR:${props.dataRoleName}"`,
    ],
    props.serverlessRedshiftProps);
  } catch (err) {
    if (err instanceof Error) {
      logger.error('Error when creating database in serverless Redshift.', err);
    }
    throw err;
  }
}

async function onUpdate(event: CdkCustomResourceEvent) {
  logger.info('onUpdate()');
  const props = event.ResourceProperties as ResourcePropertiesType;
  const redshiftClient = getRedshiftClient(props.serverlessRedshiftProps!.dataAPIRoleArn);
  try {
    await executeStatementsWithWait(redshiftClient, [
      'GRANT CREATE OR REPLACE FUNCTION TO ROLE clickstream',
      'GRANT DROP FUNCTION TO ROLE clickstream',
      'GRANT create user to role clickstream',
      `GRANT ROLE clickstream TO "IAMR:${props.dataRoleName}"`,
    ],
    props.serverlessRedshiftProps);
  } catch (err) {
    if (err instanceof Error) {
      logger.error('Error when creating database in serverless Redshift.', err);
    }
    throw err;
  }
}

async function onDelete(_event: CdkCustomResourceEvent) {
  logger.info('onDelete()');
  logger.info('doNothing to keep the db user');
}