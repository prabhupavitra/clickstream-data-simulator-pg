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

import {
  IChannelGroup,
  ISourceCategory,
  ITrafficSourceAction,
} from 'pages/analytics/traffic-source/reducer/trafficReducer';
import { apiRequest } from 'ts/request';

const getTrafficSource = async (params: {
  projectId: string;
  appId: string;
}) => {
  const result: any = await apiRequest('get', '/traffic/detail', params);
  return result;
};

const trafficSourceAction = async (data: {
  action: ITrafficSourceAction;
  projectId: string;
  appId: string;
  channelGroup?: IChannelGroup;
  channelGroups?: IChannelGroup[];
  sourceCategory?: ISourceCategory;
}) => {
  const result: any = await apiRequest('post', '/traffic/action', data);
  return result;
};

export { getTrafficSource, trafficSourceAction };
