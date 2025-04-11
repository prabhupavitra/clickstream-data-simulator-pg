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


import { statSync } from 'fs';
import { join, resolve } from 'path';
import { Duration, CustomResource, CfnResource } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { addCfnNagSuppressRules, rulesToSuppressForLambdaVPCAndReservedConcurrentExecutions } from '../../common/cfn-nag';
import { createLambdaRole } from '../../common/lambda';
import { SolutionNodejsFunction } from '../../private/function';

export interface CdkCallCustomResourceProps {
  readonly table: Table;
  readonly targetToCNRegions?: boolean;
}

export class BatchInsertDDBCustomResource extends Construct {

  readonly batchInsertCustomResource: CustomResource;

  constructor(scope: Construct, id: string, props: CdkCallCustomResourceProps) {
    super(scope, id);

    const customResourceLambda = new SolutionNodejsFunction(this, 'DicInitCustomResourceFunction', {
      description: 'Lambda function for dictionary init of solution Click Stream Analytics on AWS',
      entry: join(__dirname, './lambda/batch-insert-ddb/index.ts'),
      handler: 'handler',
      timeout: Duration.seconds(30),
      memorySize: 256,
      role: createLambdaRole(this, 'DicInitCustomResourceRole', false, []),
    });

    props.table.grantReadWriteData(customResourceLambda);

    addCfnNagSuppressRules(customResourceLambda.node.defaultChild as CfnResource, [
      ...rulesToSuppressForLambdaVPCAndReservedConcurrentExecutions('DicInitCustomResourceFunction'),
    ]);

    const customResourceProvider = new Provider(
      this,
      'DicInitCustomResourceProvider',
      {
        onEventHandler: customResourceLambda,
        logRetention: RetentionDays.FIVE_DAYS,
      },
    );

    this.batchInsertCustomResource = new CustomResource(
      this,
      'DicInitCustomResource',
      {
        serviceToken: customResourceProvider.serviceToken,
        properties: {
          tableName: props.table.tableName,
          lastModifiedTime: this.getLatestTimestampFromDictionary(),
        },
      },
    );
  }

  private getLatestTimestampFromDictionary(): number {
    let latestTimestamp = 0;
    const filePath = resolve(__dirname, 'lambda/api/config/dictionary.json');
    const stats = statSync(filePath);
    if (stats.isFile()) {
      latestTimestamp = Math.max(stats.mtime.getTime(), latestTimestamp);
    }
    return latestTimestamp;
  }

}