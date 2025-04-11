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

import { SolutionInfo } from '@aws/clickstream-base-lib';
import { Aspects, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { createAthenaStackParameters } from './analytics/parameter';
import { AthenaSavedQuery } from './analytics/private/athena-saved-queries';
import { RolePermissionBoundaryAspect } from './common/aspects';
import { Parameters } from './common/parameters';
import { associateApplicationWithStack } from './common/stack';

export class DataModelingAthenaStack extends Stack {

  constructor(
    scope: Construct,
    id: string,
    props?: StackProps,
  ) {
    super(scope, id, props);

    const featureName = 'Data Modeling';
    this.templateOptions.description = `(${SolutionInfo.SOLUTION_ID}-dma) ${SolutionInfo.SOLUTION_NAME} - ${featureName} ${SolutionInfo.SOLUTION_VERSION_DETAIL}`;

    const parameters = createAthenaStackParameters(this);
    this.templateOptions.metadata = parameters.metadata;
    const athenaParameters = parameters.params;

    new AthenaSavedQuery(this, 'AthenaSavedQuery', {
      database: athenaParameters.database,
      workGroup: athenaParameters.workGroup,
      eventTable: athenaParameters.eventTable,
      sessionTable: athenaParameters.sessionTable,
      userTable: athenaParameters.userTable,
      itemTable: athenaParameters.itemTable,
    });

    // Associate Service Catalog AppRegistry application with stack
    associateApplicationWithStack(this);

    // Add IAM role permission boundary aspect
    const {
      iamRoleBoundaryArnParam,
    } = Parameters.createIAMRolePrefixAndBoundaryParameters(this);
    Aspects.of(this).add(new RolePermissionBoundaryAspect(iamRoleBoundaryArnParam.valueAsString));
  }
}
