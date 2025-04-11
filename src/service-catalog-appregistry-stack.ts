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
  OUTPUT_SERVICE_CATALOG_APPREGISTRY_APPLICATION_ARN,
  OUTPUT_SERVICE_CATALOG_APPREGISTRY_APPLICATION_TAG_KEY,
  OUTPUT_SERVICE_CATALOG_APPREGISTRY_APPLICATION_TAG_VALUE,
  SERVICE_CATALOG_SUPPORTED_REGIONS,
  SolutionInfo,
} from '@aws/clickstream-base-lib';
import { Application } from '@aws-cdk/aws-servicecatalogappregistry-alpha';
import { Aws, CfnCondition, CfnOutput, CfnResource, Fn, Stack, Tags } from 'aws-cdk-lib';
import { StackProps } from 'aws-cdk-lib/core/lib/stack';
import { Construct } from 'constructs';
import { Parameters } from './common/parameters';

export interface ServiceCatalogAppRegistryProps extends StackProps {
}

export class ServiceCatalogAppregistryStack extends Stack {
  constructor(scope: Construct, id: string, props?: ServiceCatalogAppRegistryProps) {
    super(scope, id, props);

    const featureName = 'AppRegistry';
    this.templateOptions.description = `(${SolutionInfo.SOLUTION_ID}-reg) ${SolutionInfo.SOLUTION_NAME} - ${featureName} ${SolutionInfo.SOLUTION_VERSION_DETAIL}`;

    const projectIdParam = Parameters.createProjectIdParameter(this);

    const serviceAvailableRegion = new CfnCondition(this, 'ServiceCatalogAvailableRegion', {
      expression: Fn.conditionOr(...SERVICE_CATALOG_SUPPORTED_REGIONS.map(region => Fn.conditionEquals(Aws.REGION, region))),
    });

    const application = new Application(this, 'ServiceCatalogApplication', {
      applicationName: Fn.join('-', [
        'clickstream-analytics',
        projectIdParam.valueAsString,
      ]),
      description: `Catalog Service AppRegistry application for Clickstream Analytics project: ${projectIdParam.valueAsString}`,
    });
    const appCfn = application.node.defaultChild as CfnResource;

    // Add condition for region validation
    appCfn.cfnOptions.condition = serviceAvailableRegion;

    // Add tags for AppRegistry application
    Tags.of(application).add('Solutions:SolutionID', SolutionInfo.SOLUTION_ID);
    Tags.of(application).add('Solutions:SolutionName', SolutionInfo.SOLUTION_NAME);
    Tags.of(application).add('Solutions:SolutionVersion', SolutionInfo.SOLUTION_VERSION_SHORT);
    Tags.of(application).add('Solutions:ApplicationType', SolutionInfo.SOLUTION_TYPE);

    new CfnOutput(this, OUTPUT_SERVICE_CATALOG_APPREGISTRY_APPLICATION_TAG_KEY, {
      description: 'Service Catalog AppRegistry Application tag key',
      value: Fn.getAtt(appCfn.logicalId, 'ApplicationTagKey').toString(),
      condition: serviceAvailableRegion,
    });

    new CfnOutput(this, OUTPUT_SERVICE_CATALOG_APPREGISTRY_APPLICATION_TAG_VALUE, {
      description: 'Service Catalog AppRegistry Application tag value',
      value: Fn.getAtt(appCfn.logicalId, 'ApplicationTagValue').toString(),
      condition: serviceAvailableRegion,
    });

    new CfnOutput(this, OUTPUT_SERVICE_CATALOG_APPREGISTRY_APPLICATION_ARN, {
      description: 'Service Catalog AppRegistry Application Arn',
      value: application.applicationArn,
      condition: serviceAvailableRegion,
    });
  }
}
