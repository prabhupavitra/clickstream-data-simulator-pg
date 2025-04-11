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

import { CUSTOM_RESOURCE_RESPONSE_REDSHIFT_BI_USER_NAME } from '@aws/clickstream-base-lib';
import { Duration, CustomResource, Arn, ArnFormat, Stack, RemovalPolicy } from 'aws-cdk-lib';
import { IRole, PolicyStatement, Effect } from 'aws-cdk-lib/aws-iam';
import { Function, LayerVersion, Code, IFunction } from 'aws-cdk-lib/aws-lambda';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Asset } from 'aws-cdk-lib/aws-s3-assets';
import { StateMachine } from 'aws-cdk-lib/aws-stepfunctions';
import { Provider } from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import { BasicRedshiftServerlessProps, ProvisionedRedshiftProps, WorkflowBucketInfo } from './model';
import { reportingViewsDef, schemaDefs } from './sql-def';
import { createSQLExecutionStepFunctions } from './sql-execution-workflow';
import { createLambdaRole } from '../../common/lambda';
import { attachListTagsPolicyForFunction } from '../../common/lambda/tags';
import { SolutionNodejsFunction } from '../../private/function';
import { RedshiftOdsTables } from '../analytics-on-redshift';

export interface RedshiftSQLExecutionProps {
  readonly serverlessRedshift?: BasicRedshiftServerlessProps;
  readonly provisionedRedshift?: ProvisionedRedshiftProps;
  readonly dataAPIRole: IRole;
  readonly codePath: string;
  readonly functionEntry: string;
  readonly workflowBucketInfo: WorkflowBucketInfo;
}

export abstract class RedshiftSQLExecution extends Construct {

  readonly crForSQLExecution: CustomResource;
  readonly crFunction: IFunction;
  readonly crProvider: Provider;
  readonly sqlExecutionStepFunctions: StateMachine;
  protected readonly props: RedshiftSQLExecutionProps;

  constructor(scope: Construct, id: string, props: RedshiftSQLExecutionProps) {
    super(scope, id);

    this.props = props;

    const crProps = this.getCustomResourceProperties(props);

    /**
     * Create step function to execute SQLs using Redshift-Data API
     */
    this.sqlExecutionStepFunctions = createSQLExecutionStepFunctions(this, {
      dataAPIRole: props.dataAPIRole,
      serverlessRedshift: props.serverlessRedshift,
      provisionedRedshift: props.provisionedRedshift,
      workflowBucketInfo: props.workflowBucketInfo,
      databaseName: crProps.databaseName,
    });

    /**
     * Create custom resource to execute SQLs through step function
     */

    const resource = this.createRedshiftSQLExecutionCustomResource(props);
    this.crForSQLExecution = resource.cr;
    this.crFunction = resource.fn;
    this.crProvider = resource.provider;

    this.sqlExecutionStepFunctions?.grantStartExecution(this.crFunction);
    resource.cr.node.addDependency(this.sqlExecutionStepFunctions);
  }

  protected abstract getCustomResourceProperties(props: RedshiftSQLExecutionProps): { [key: string]: any };
  protected abstract additionalPolicies(): PolicyStatement[];

  private createRedshiftSQLExecutionCustomResource(props: RedshiftSQLExecutionProps): {
    cr: CustomResource;
    fn: IFunction;
    provider: Provider;
  } {
    const fn = this.createRedshiftSchemasLambda(props);

    props.dataAPIRole.grantAssumeRole(fn.grantPrincipal);

    const provider = new Provider(
      this,
      'RedshiftSQLExecutionCustomResourceProvider',
      {
        onEventHandler: fn,
        logRetention: RetentionDays.FIVE_DAYS,
      },
    );

    const crProps = this.getCustomResourceProperties(props);

    const customProps: { [key: string]: any } = {
      dataAPIRole: props.dataAPIRole.roleArn,
      serverlessRedshiftProps: props.serverlessRedshift,
      provisionedRedshiftProps: props.provisionedRedshift,
      schemaHash: this.getCodeHashByDirectory(props.codePath),
      ...crProps,
    };

    const cr = new CustomResource(this, 'RedshiftSQLExecutionCustomResource', {
      serviceToken: provider.serviceToken,
      properties: customProps,
    });

    return {
      cr,
      fn,
      provider,
    };
  }

  private createRedshiftSchemasLambda(props: RedshiftSQLExecutionProps): Function {
    const sqlLayer = new LayerVersion(this, 'SqlLayer', {
      code: Code.fromAsset(props.codePath),
      description: 'SQL layer',
    });

    const fnId = 'RedshiftSQLExecutionFn';
    const fn = new SolutionNodejsFunction(this, fnId, {
      entry: props.functionEntry,
      handler: 'handler',
      memorySize: 256,
      timeout: Duration.minutes(15),
      logConf: {
        retention: RetentionDays.ONE_WEEK,
        removalPolicy: RemovalPolicy.RETAIN_ON_UPDATE_OR_DELETE,
      },
      environment: {
        SUPPRESS_ALL_ERROR: 'false',
        APPLY_ALL_APP_SQL: 'false',
        STATE_MACHINE_ARN: this.sqlExecutionStepFunctions.stateMachineArn,
        S3_BUCKET: props.workflowBucketInfo.s3Bucket.bucketName,
        S3_PREFIX: props.workflowBucketInfo.prefix,
      },
      role: createLambdaRole(this, 'RedshiftSQLExecutionRole', false,
        this.additionalPolicies()),
      layers: [sqlLayer],
    });

    attachListTagsPolicyForFunction(this, fnId, fn);
    props.workflowBucketInfo?.s3Bucket.grantWrite(fn, `${props.workflowBucketInfo.prefix}*`);

    return fn;
  }

  private getCodeHashByDirectory(directory: string): string {
    const codesAsset = new Asset(this, 'app-schema-asset', {
      path: directory,
    });
    return codesAsset.assetHash;
  }
}

export interface ApplicationSchemasAndReportingProps extends RedshiftSQLExecutionProps {
  readonly projectId: string;
  readonly appIds: string;
  readonly timeZoneWithAppId: string;
  readonly databaseName: string;
  readonly odsTableNames: RedshiftOdsTables;
}

export class ApplicationSchemasAndReporting extends RedshiftSQLExecution {

  readonly redshiftBIUserName: string;

  constructor(scope: Construct, id: string, props: ApplicationSchemasAndReportingProps) {
    super(scope, id, props);

    this.redshiftBIUserName = this.crForSQLExecution.getAttString(CUSTOM_RESOURCE_RESPONSE_REDSHIFT_BI_USER_NAME);
  }

  public getRedshiftBIUserParameter(): string {
    return `/clickstream/reporting/user/${(this.props as ApplicationSchemasAndReportingProps).projectId}`;
  }

  protected additionalPolicies(): PolicyStatement[] {

    const writeSecretPolicy: PolicyStatement = new PolicyStatement({
      effect: Effect.ALLOW,
      resources: [
        Arn.format(
          {
            resource: 'secret',
            service: 'secretsmanager',
            resourceName: `${this.getRedshiftBIUserParameter()}*`,
            arnFormat: ArnFormat.COLON_RESOURCE_NAME,
          }, Stack.of(this),
        ),
      ],
      actions: [
        'secretsmanager:DescribeSecret',
        'secretsmanager:UpdateSecret',
        'secretsmanager:CreateSecret',
        'secretsmanager:DeleteSecret',
        'secretsmanager:TagResource',
      ],
    });

    return [writeSecretPolicy];
  }

  protected getCustomResourceProperties(props: RedshiftSQLExecutionProps) {
    const properties = props as ApplicationSchemasAndReportingProps;
    // get schemaDefs files last modify timestamp
    return {
      projectId: properties.projectId,
      appIds: properties.appIds,
      odsTableNames: properties.odsTableNames,
      databaseName: properties.databaseName,
      redshiftBIUserParameter: this.getRedshiftBIUserParameter(),
      redshiftBIUsernamePrefix: 'clickstream_bi_',
      reportingViewsDef,
      schemaDefs,
      timezoneWithAppId: properties.timeZoneWithAppId,
    };
  }
}
