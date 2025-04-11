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

import { parseVersion } from '@aws/clickstream-base-lib';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import fetch, { Response } from 'node-fetch';
import request from 'supertest';
import { dictionaryMock } from './ddb-mock';
import { FULL_SOLUTION_VERSION } from '../../common/constants';
import { app, server } from '../../index';

const ddbMock = mockClient(DynamoDBDocumentClient);

jest.mock('node-fetch');

describe('system api test', () => {

  const mockFetch = fetch as jest.MockedFunction<typeof fetch>;
  const version = FULL_SOLUTION_VERSION;

  beforeEach(() => {
    ddbMock.reset();
    mockFetch.mockReset();
    dictionaryMock(ddbMock, 'Solution');
  });

  afterAll((done) => {
    server.close();
    done();
  });

  it('fetch info with current version and failed to fetch remote version', async () => {
    const res = await request(app)
      .get('/api/system/info');
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      data: {
        version,
        remoteVersion: '',
        templateUrl: `https://EXAMPLE-BUCKET.s3.us-east-1.amazonaws.com/clickstream-branch-main/feature-rel/main/default/${process.env.TEMPLATE_FILE}`,
        hasUpdate: false,
      },
      message: '',
      success: true,
    });
  });

  it('fetch info with current version and same remote version', async () => {
    const structureVersion = parseVersion(version);

    doMockFetch({
      Description: `(SO0219) Clickstream Analytics on AWS (Version ${structureVersion.short})(Build ${structureVersion.buildId})- Control Plane`,
      Metadata: {},
    });

    const res = await request(app)
      .get('/api/system/info');
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      data: {
        version,
        remoteVersion: version,
        templateUrl: `https://EXAMPLE-BUCKET.s3.us-east-1.amazonaws.com/clickstream-branch-main/feature-rel/main/default/${process.env.TEMPLATE_FILE}`,
        hasUpdate: false,
      },
      message: '',
      success: true,
    });
  });

  it('fetch info with current version and remote version with newer build number', async () => {

    doMockFetch({
      Description: '(SO0219) Clickstream Analytics on AWS (Version v1.1.6)(Build 202404071513)- Control Plane',
      Metadata: {},
    });

    expect(FULL_SOLUTION_VERSION).toEqual(version);

    const res = await request(app)
      .get('/api/system/info');
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      data: {
        version,
        remoteVersion: 'v1.1.6-202404071513',
        templateUrl: `https://EXAMPLE-BUCKET.s3.us-east-1.amazonaws.com/clickstream-branch-main/feature-rel/main/default/${process.env.TEMPLATE_FILE}`,
        hasUpdate: true,
      },
      message: '',
      success: true,
    });
  });

  it('fetch info with current version and remote version with newer micro version', async () => {

    doMockFetch({
      Description: '(SO0219) Clickstream Analytics on AWS (Version v1.1.7)(Build 202404071513)- Control Plane',
      Metadata: {},
    });

    expect(FULL_SOLUTION_VERSION).toEqual(version);

    const res = await request(app)
      .get('/api/system/info');
    expect(res.headers['content-type']).toEqual('application/json; charset=utf-8');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      data: {
        version,
        remoteVersion: 'v1.1.7-202404071513',
        templateUrl: `https://EXAMPLE-BUCKET.s3.us-east-1.amazonaws.com/clickstream-branch-main/feature-rel/main/default/${process.env.TEMPLATE_FILE}`,
        hasUpdate: true,
      },
      message: '',
      success: true,
    });
  });

  function doMockFetch(content: {}) {
    const fn = jest.fn() as jest.MockedFunction<any>;
    fn.mockResolvedValue(content);
    mockFetch.mockResolvedValue({ ok: true, status: 200, json: fn } as Response);
  }
});