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
import { ExecutionStatus } from '@aws-sdk/client-sfn';
import { EventBridgeEvent } from 'aws-lambda';
import { CFN_RULE_PREFIX } from '../api/common/constants';
import { StepFunctionsExecutionStatusChangeNotificationEventDetail, deleteProject, deleteRuleAndTopic, fetchAllStackDetails, getPipeline, getTopicArn, updatePipelineAllStackStatus, updatePipelineStateStatus } from '../listen-stack-status/listen-tools';

export const handler = async (
  event: EventBridgeEvent<'Step Functions Execution Status Change', StepFunctionsExecutionStatusChangeNotificationEventDetail>): Promise<void> => {

  logger.debug('Event: ', { event });
  const eventDetail = event.detail;
  const executionName = eventDetail.name;
  if (!executionName?.startsWith('main-')) {
    return;
  }
  logger.info('Detail: ', { executionName: eventDetail.name, status: eventDetail.status });

  const pipelineId = executionName.split('-')[1];
  const pipeline = await getPipeline(pipelineId);
  if (!pipeline) {
    logger.error('Failed to get pipeline by pipelineId: ', { pipelineId });
    throw new Error('Failed to get pipeline');
  }

  const projectId = pipeline.projectId;

  await updatePipelineStateStatus(projectId, pipelineId, eventDetail, pipeline.updateAt);

  if (eventDetail.status !== ExecutionStatus.RUNNING) {
    const stackDetails = await fetchAllStackDetails(pipeline);
    logger.debug('Update all stack status', { eventDetail, stackDetails } );
    await updatePipelineAllStackStatus(projectId, pipelineId, stackDetails, pipeline.updateAt);
  }

  if (eventDetail.status === ExecutionStatus.SUCCEEDED && pipeline.lastAction === 'Delete') {
    const ruleName = `${CFN_RULE_PREFIX}-${projectId}`;
    const topicArn = getTopicArn(pipeline.region, pipeline.pipelineId);
    logger.debug('Delete project, rule and topic', { projectId, ruleName, topicArn });
    await deleteProject(projectId);
    await deleteRuleAndTopic(pipeline.region, ruleName, topicArn);
  }
};


