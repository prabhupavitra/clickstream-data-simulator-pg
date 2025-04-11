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

import { Aspects, Duration, IAspect, Token } from 'aws-cdk-lib';
import {
  AutoScalingGroup,
  BlockDeviceVolume,
  CfnWarmPool,
  HealthCheck,
} from 'aws-cdk-lib/aws-autoscaling';
import { ISecurityGroup, SubnetType, UserData, LaunchTemplate, LaunchTemplateHttpTokens } from 'aws-cdk-lib/aws-ec2';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import {
  Cluster,
  Ec2Service,
  TaskDefinition,
  AsgCapacityProvider,
  EcsOptimizedImage,
  AmiHardwareType,
  CfnClusterCapacityProviderAssociations,
} from 'aws-cdk-lib/aws-ecs';
import { IRole, ServicePrincipal, Role } from 'aws-cdk-lib/aws-iam';
import { Construct, IConstruct } from 'constructs';
import { createProxyAndWorkerECRImages } from './ecr';

import { createECSService } from './ecs-service';
import { addPoliciesToAsgRole } from './iam';
import { IngestionServerProps, RESOURCE_ID_PREFIX } from '../ingestion-server';

export interface ECSClusterProps extends IngestionServerProps {
  ecsSecurityGroup: ISecurityGroup;
}

export interface EcsServiceResult {
  ecsService: Ec2Service;
  taskDefinition: TaskDefinition;
  httpContainerName: string;
}
export interface EcsClusterResult extends EcsServiceResult {
  ecsCluster: Cluster;
  autoScalingGroup: AutoScalingGroup;
  ec2Role: IRole;
}

export function createECSClusterAndService(
  scope: Construct,
  props: ECSClusterProps,
): EcsClusterResult {
  const vpc = props.vpc;

  const ecsCluster = new Cluster(scope, `${RESOURCE_ID_PREFIX}ecs-cluster`, {
    vpc,
    containerInsights: true,
  });

  const ecsAsgSetting = props.fleetProps;
  const isArm = ecsAsgSetting.isArm;

  const ecsConfig = {
    instanceType: ecsAsgSetting.instanceType,
    machineImage: EcsOptimizedImage.amazonLinux2023(
      isArm ? AmiHardwareType.ARM : AmiHardwareType.STANDARD,
    ),
    platform: isArm ? Platform.LINUX_ARM64 : Platform.LINUX_AMD64,
  };

  const ec2Role = new Role(scope, `${RESOURCE_ID_PREFIX}ecs-role`, {
    assumedBy: new ServicePrincipal('ec2.amazonaws.com'),
  });

  const userData = UserData.forLinux();

  const launchTemplate = new LaunchTemplate(scope, `${RESOURCE_ID_PREFIX}ecs-launch-template`, {
    machineImage: ecsConfig.machineImage,
    instanceType: ecsConfig.instanceType,
    securityGroup: props.ecsSecurityGroup,
    associatePublicIpAddress: props.vpcSubnets.subnetType == SubnetType.PUBLIC,
    userData,
    blockDevices: [
      {
        deviceName: '/dev/xvda',
        volume: BlockDeviceVolume.ebs(30),
      },
    ],
    role: ec2Role,
    requireImdsv2: true,
    httpTokens: LaunchTemplateHttpTokens.REQUIRED,
  });

  let notifications = {};

  if (props.notificationsTopic) {
    notifications = { notifications: [{ topic: props.notificationsTopic }] };
  }

  const autoScalingGroup = new AutoScalingGroup(scope, `${RESOURCE_ID_PREFIX}ecs-asg`, {
    vpc,
    vpcSubnets: props.vpcSubnets,
    launchTemplate,
    maxCapacity: ecsAsgSetting.taskMax,
    minCapacity: ecsAsgSetting.taskMin,
    ...notifications,
    healthCheck: HealthCheck.ec2({
      grace: Duration.seconds(60),
    }),
  });

  if (Token.isUnresolved(ecsAsgSetting.warmPoolSize)) {
    // warmPoolSize is passed by CfnParameter
    new CfnWarmPool(scope, 'warmPool', {
      autoScalingGroupName: autoScalingGroup.autoScalingGroupName,
      minSize: ecsAsgSetting.warmPoolSize,
      maxGroupPreparedCapacity: ecsAsgSetting.warmPoolSize,
    });
  } else {
    // warmPoolSize is passed by normal variable
    if (ecsAsgSetting.warmPoolSize && ecsAsgSetting.warmPoolSize > 0) {
      autoScalingGroup.addWarmPool({
        minSize: ecsAsgSetting.warmPoolSize,
        maxGroupPreparedCapacity: ecsAsgSetting.warmPoolSize,
      });
    }
  }

  addPoliciesToAsgRole(ec2Role);

  const capacityProvider = new AsgCapacityProvider(
    scope,
    `${RESOURCE_ID_PREFIX}ecs-capacity-provider`,
    {
      autoScalingGroup,
      enableManagedTerminationProtection: false,
    },
  );

  ecsCluster.addAsgCapacityProvider(capacityProvider);

  const { proxyImage, workerImage } = createProxyAndWorkerECRImages(
    scope,
    ecsConfig.platform,
  );
  const ecsServiceInfo = createECSService(scope, {
    ...props,
    ecsCluster,
    proxyImage,
    workerImage,
    capacityProvider,
    autoScalingGroup,
  });
  Aspects.of(scope).add(new AddDefaultCapacityProviderStrategyAspect(capacityProvider));
  return { ...ecsServiceInfo, autoScalingGroup, ecsCluster, ec2Role };
}


class AddDefaultCapacityProviderStrategyAspect implements IAspect {
  capacityProvider: AsgCapacityProvider;

  constructor(capacityProvider: AsgCapacityProvider ) {
    this.capacityProvider = capacityProvider;
  }
  public visit(node: IConstruct): void {
    if (node instanceof CfnClusterCapacityProviderAssociations) {
      node.addPropertyOverride('DefaultCapacityProviderStrategy', [
        {
          Base: 0,
          Weight: 1,
          CapacityProvider: this.capacityProvider.capacityProviderName,
        },
      ]);
    }
  }
}