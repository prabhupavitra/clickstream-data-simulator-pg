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
import { CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import {
  FlowLogDestination,
  FlowLogTrafficType,
  SubnetType,
  CfnSubnet,
  Vpc,
  IVpc,
  IpAddresses,
  GatewayVpcEndpointAwsService,
} from 'aws-cdk-lib/aws-ec2';
import { LogGroup, RetentionDays, CfnLogGroup } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { addCfnNagSuppressRules, ruleToSuppressCloudWatchLogEncryption } from './cfn-nag';

export interface VpcProps {
  /**
   * cidr to create the VPC
   *
   * @default - 10.255.0.0/16.
   */
  // cidrBlock?: string

  /**
   * if a VPC is not provided, create a new VPC
   *
   * @default - None.
   */
  vpc?: IVpc;


}

/**
 * Stack to provision a default VPC and security group.
 */
export class SolutionVpc extends Construct {
  readonly vpc: IVpc;

  constructor(scope: Construct, id: string, props?: VpcProps) {
    super(scope, id);

    if (props?.vpc) {
      this.vpc = props.vpc;
    } else {
      const vpcLogGroup = new LogGroup(this, 'VPCLogGroup', {
        retention: RetentionDays.TWO_WEEKS,
        removalPolicy: RemovalPolicy.RETAIN,
      });

      const cfnVpcLG = vpcLogGroup.node.defaultChild as CfnLogGroup;
      addCfnNagSuppressRules(cfnVpcLG, [
        ruleToSuppressCloudWatchLogEncryption(),
      ]);

      // Create a new VPC
      this.vpc = new Vpc(this, 'DefaultVPC', {
        ipAddresses: IpAddresses.cidr('10.255.0.0/16'), //NOSONAR it's intended
        enableDnsHostnames: true,
        enableDnsSupport: true,
        subnetConfiguration: [
          {
            name: 'public',
            subnetType: SubnetType.PUBLIC,
            cidrMask: 24,
          },
          {
            name: 'private',
            subnetType: SubnetType.PRIVATE_WITH_EGRESS,
            cidrMask: 24,
          },
          {
            name: 'isolated',
            subnetType: SubnetType.PRIVATE_ISOLATED,
            cidrMask: 24,
          },
        ],
        maxAzs: 3,
        // natGateways: 1,
        flowLogs: {
          ['DefaultVPCFlowLog']: {
            destination: FlowLogDestination.toCloudWatchLogs(vpcLogGroup),
            trafficType: FlowLogTrafficType.REJECT,
          },
        },
      });

      this.vpc.publicSubnets.forEach((subnet) => {
        const cfnSubnet = subnet.node.defaultChild as CfnSubnet;
        addCfnNagSuppressRules(cfnSubnet, [
          {
            id: 'W33',
            reason: 'Default for public subnets',
          },
        ]);
      });

      this.vpc.addGatewayEndpoint('DynamoDbEndpoint', {
        service: GatewayVpcEndpointAwsService.DYNAMODB,
      });

      new CfnOutput(this, 'PublicSubnets', {
        description: 'Public subnets',
        value: this.vpc.publicSubnets
          .map((subnet) => subnet.subnetId)
          .join(','),
      }).overrideLogicalId('PublicSubnets');

      new CfnOutput(this, 'PrivateSubnets', {
        description: 'Private subnets',
        value: this.vpc.privateSubnets
          .map((subnet) => subnet.subnetId)
          .join(','),
      }).overrideLogicalId('PrivateSubnets');

      new CfnOutput(this, 'IsolatedSubnets', {
        description: 'Isolated Subnets',
        value: this.vpc.isolatedSubnets
          .map((subnet) => subnet.subnetId)
          .join(','),
      }).overrideLogicalId('IsolatedSubnets');
    }

    new CfnOutput(this, 'VpcId', {
      description: 'VPC ID',
      value: this.vpc.vpcId,
    }).overrideLogicalId('VpcId');

  }
}
