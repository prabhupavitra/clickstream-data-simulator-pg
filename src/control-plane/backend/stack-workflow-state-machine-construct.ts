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

import { join } from 'path';
import { Aws, aws_iam as iam, aws_lambda, Duration, Stack, CfnResource } from 'aws-cdk-lib';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import {
  Choice,
  Condition,
  IntegrationPattern,
  JsonPath,
  LogLevel,
  Map as SFNMap,
  Pass,
  StateMachine,
  TaskInput,
  IStateMachine,
  DefinitionBody,
} from 'aws-cdk-lib/aws-stepfunctions';
import { LambdaInvoke, StepFunctionsStartExecution } from 'aws-cdk-lib/aws-stepfunctions-tasks';
import { Construct } from 'constructs';
import { LambdaFunctionNetworkProps } from './click-stream-api';
import { addCfnNagSuppressRules, rulesToSuppressForLambdaVPCAndReservedConcurrentExecutions } from '../../common/cfn-nag';
import { createLambdaRole } from '../../common/lambda';
import { createLogGroup } from '../../common/logs';
import { getShortIdOfStack } from '../../common/stack';
import { SolutionNodejsFunction } from '../../private/function';

export interface StackWorkflowStateMachineProps {
  readonly stateActionMachine: StateMachine;
  readonly targetToCNRegions?: boolean;
  readonly lambdaFunctionNetwork: LambdaFunctionNetworkProps;
  readonly workflowBucket: IBucket;
  readonly iamRolePrefix: string;
  readonly conditionStringRolePrefix: string;
  readonly conditionStringStackPrefix: string;
}

export class StackWorkflowStateMachine extends Construct {

  readonly stackWorkflowMachine: StateMachine;

  constructor(scope: Construct, id: string, props: StackWorkflowStateMachineProps) {
    super(scope, id);

    const stackWorkflowMachineName = `clickstream-stack-workflow-${getShortIdOfStack(Stack.of(scope))}`;
    const stackWorkflowMachineNameArn = `arn:${Aws.PARTITION}:states:${Aws.REGION}:${Aws.ACCOUNT_ID}:stateMachine:${stackWorkflowMachineName}`;

    const cfnPolicyStatements = [
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: [`arn:${Aws.PARTITION}:cloudformation:*:${Aws.ACCOUNT_ID}:stack/${props.conditionStringStackPrefix}*`],
        actions: [
          'cloudformation:DescribeStacks',
        ],
      }),
    ];

    const deployInVpc = props.lambdaFunctionNetwork.vpc !== undefined;
    const workflowFunction = new SolutionNodejsFunction(this, 'WorkflowFunction', {
      description: 'Lambda function for state machine workflow of solution Clickstream Analytics on AWS',
      entry: join(__dirname, './lambda/sfn-workflow/index.ts'),
      handler: 'handler',
      tracing: aws_lambda.Tracing.ACTIVE,
      role: createLambdaRole(this, 'WorkflowFunctionRole', deployInVpc, cfnPolicyStatements),
      timeout: Duration.seconds(15),
      ...props.lambdaFunctionNetwork,
    });
    props.workflowBucket.grantReadWrite(workflowFunction, 'clickstream/*');

    addCfnNagSuppressRules(workflowFunction.node.defaultChild as CfnResource, [
      ...rulesToSuppressForLambdaVPCAndReservedConcurrentExecutions('portal_fn'),
    ]);

    const inputTask = new LambdaInvoke(this, 'InputTask', {
      lambdaFunction: workflowFunction,
      payload: TaskInput.fromJsonPathAt('$'),
      outputPath: '$.Payload',
    });

    const stackExecution = new StepFunctionsStartExecution(this, 'StackExecution', {
      stateMachine: props.stateActionMachine,
      integrationPattern: IntegrationPattern.RUN_JOB,
      input: TaskInput.fromObject({
        Action: JsonPath.stringAt('$.Input.Action'),
        Token: JsonPath.taskToken,
        Input: JsonPath.stringAt('$.Input'),
        Callback: JsonPath.stringAt('$.Callback'),
      }),
    });

    const serialCallSelf = new StepFunctionsStartExecution(this, 'SerialCallSelf', {
      stateMachine: {
        stateMachineArn: stackWorkflowMachineNameArn,
      } as IStateMachine,
      integrationPattern: IntegrationPattern.RUN_JOB,
      input: TaskInput.fromObject({
        Token: JsonPath.taskToken,
        MapRun: true,
        Data: JsonPath.stringAt('$'),
      }),
    });

    const parallelCallSelf = new StepFunctionsStartExecution(this, 'ParallelCallSelf', {
      stateMachine: {
        stateMachineArn: stackWorkflowMachineNameArn,
      } as IStateMachine,
      integrationPattern: IntegrationPattern.RUN_JOB,
      input: TaskInput.fromObject({
        Token: JsonPath.taskToken,
        MapRun: true,
        Data: JsonPath.stringAt('$'),
      }),
    });

    const serialMap = new SFNMap(this, 'SerialMap', {
      maxConcurrency: 1,
      itemsPath: JsonPath.stringAt('$'),
    });
    serialMap.itemProcessor(serialCallSelf);

    const parallelMap = new SFNMap(this, 'ParallelMap', {
      maxConcurrency: 40,
      itemsPath: JsonPath.stringAt('$'),
    });
    parallelMap.itemProcessor(parallelCallSelf);

    const pass = new Pass(this, 'Pass');

    const typeChoice = new Choice(this, 'TypeChoice', {
      outputPath: '$.Data',
    }).when(Condition.stringEquals('$.Type', 'Stack'), stackExecution)
      .when(Condition.stringEquals('$.Type', 'Serial'), serialMap)
      .when(Condition.stringEquals('$.Type', 'Parallel'), parallelMap)
      .otherwise(pass);

    inputTask.next(typeChoice);

    const stackWorkflowLogGroup = createLogGroup(this, {
      prefix: '/aws/vendedlogs/states/Clickstream/StackWorkflowLogGroup',
    });

    // Define a state machine
    this.stackWorkflowMachine = new StateMachine(this, 'StackWorkflowStateMachine', {
      stateMachineName: stackWorkflowMachineName,
      definitionBody: DefinitionBody.fromChainable(inputTask),
      logs: {
        destination: stackWorkflowLogGroup,
        level: LogLevel.ALL,
      },
      tracingEnabled: true,
      timeout: Duration.days(3),
    });
  }
}