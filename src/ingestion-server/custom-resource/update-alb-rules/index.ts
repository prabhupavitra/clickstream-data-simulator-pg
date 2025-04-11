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
import { aws_sdk_client_common_config, logger } from '@aws/clickstream-base-lib';
import { ElasticLoadBalancingV2Client, DescribeRulesCommand, CreateRuleCommand, DeleteRuleCommand, ModifyListenerCommand, ModifyRuleCommand, Rule, RuleCondition, ActionTypeEnum, AuthenticateCognitoActionConditionalBehaviorEnum } from '@aws-sdk/client-elastic-load-balancing-v2';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { CloudFormationCustomResourceEvent, CloudFormationCustomResourceUpdateEvent, Context } from 'aws-lambda';

const region = process.env.AWS_REGION!;

const albClient = new ElasticLoadBalancingV2Client({
  ...aws_sdk_client_common_config,
  region,
});

const secretsManagerClient = new SecretsManagerClient({
  ...aws_sdk_client_common_config,
  region,
});

interface ResourcePropertiesType {
  ServiceToken: string;
  appIds: string;
  clickStreamSDK: string;
  targetGroupArn: string;
  listenerArn: string;
  authenticationSecretArn: string;
  endpointPath: string;
  domainName: string;
  protocol: string;
}

interface HandleClickStreamSDKInput {
  readonly appIds: string;
  readonly requestType: string;
  readonly listenerArn: string;
  readonly protocol: string;
  readonly endpointPath: string;
  readonly domainName: string;
  readonly authenticationSecretArn: string;
  readonly targetGroupArn: string;
}

interface HandleUpdateInput {
  readonly listenerArn: string;
  readonly protocol: string;
  readonly endpointPath: string;
  readonly hostHeader: string;
  readonly authenticationSecretArn: string;
  readonly oldEndpointPath: string;
  readonly oldHostHeader: string;
  readonly oldAuthenticationSecretArn: string;
}

type ResourceEvent = CloudFormationCustomResourceEvent;

export const handler = async (event: ResourceEvent, context: Context) => {
  try {
    await _handler(event, context);
    logger.info('=== complete ===');
    return;
  } catch (e: any) {
    logger.error(e);
    throw e;
  }
};

async function _handler(
  event: ResourceEvent,
  context: Context,
) {
  const props = event.ResourceProperties as ResourcePropertiesType;

  let requestType = event.RequestType;
  logger.info('functionName: ' + context.functionName);

  const appIds = props.appIds;
  const clickStreamSDK = props.clickStreamSDK;
  const targetGroupArn = props.targetGroupArn;
  const listenerArn = props.listenerArn;
  const authenticationSecretArn = props.authenticationSecretArn;
  const endpointPath = props.endpointPath;
  const domainName = props.domainName;
  const protocol = props.protocol;

  if (requestType === 'Create') {
    await handleCreate(listenerArn, protocol, endpointPath, domainName, authenticationSecretArn, targetGroupArn);
  }

  if (requestType === 'Update') {
    const oldProps = (event as CloudFormationCustomResourceUpdateEvent).OldResourceProperties as ResourcePropertiesType;
    const oldEndpointPath = oldProps.endpointPath;
    const oldDomainName = oldProps.domainName;
    const oldAuthenticationSecretArn = oldProps.authenticationSecretArn;
    await handleUpdate({
      listenerArn,
      protocol,
      endpointPath,
      hostHeader: domainName,
      authenticationSecretArn,
      oldEndpointPath,
      oldHostHeader: oldDomainName,
      oldAuthenticationSecretArn,
    });
  }

  if (clickStreamSDK === 'Yes') {
    await handleClickStreamSDK({ appIds, requestType, listenerArn, protocol, endpointPath, domainName, authenticationSecretArn, targetGroupArn });
  }

  // set default rules
  if (requestType == 'Delete') {
    logger.info('Delete Listener rules');
    const describeRulesCommand = new DescribeRulesCommand({
      ListenerArn: listenerArn,
    });
    const allAlbRulesResponse = await albClient.send(describeRulesCommand);
    const removeRules: Rule[] = allAlbRulesResponse.Rules?.filter(rule => !rule.IsDefault) || [];

    await deleteRules(removeRules);
  }

  await modifyFallbackRule(listenerArn);
}

async function handleCreate(
  listenerArn: string,
  protocol: string,
  endpointPath: string,
  domainName: string,
  authenticationSecretArn: string,
  targetGroupArn: string,
) {
  // Create defalut forward rule and action
  await createDefaultForwardRule(listenerArn, protocol, endpointPath, domainName, authenticationSecretArn, targetGroupArn);

  if (authenticationSecretArn && authenticationSecretArn.length > 0) {
    await createAuthLogindRule(authenticationSecretArn, listenerArn);
  }
}

async function handleUpdate(
  inputPros: HandleUpdateInput,
) {
  if (inputPros.endpointPath !== inputPros.oldEndpointPath || inputPros.hostHeader !== inputPros.oldHostHeader) {
    await updateEndpointPathAndHostHeader(
      inputPros.listenerArn,
      inputPros.endpointPath,
      inputPros.hostHeader,
      inputPros.oldEndpointPath,
      inputPros.oldHostHeader,
      inputPros.protocol,
    );
  }

  if (inputPros.authenticationSecretArn !== inputPros.oldAuthenticationSecretArn) {
    await updateAuthenticationSecretArn(inputPros.listenerArn, inputPros.authenticationSecretArn);
  }
}

async function updateEndpointPathAndHostHeader(
  listenerArn: string,
  endpointPath: string,
  hostHeader: string,
  oldEndpointPath: string,
  oldHostHeader: string,
  protocol: string,
) {
  const allExistingPathPatternRules = await getExistingRulesByEndpointPath(listenerArn, oldEndpointPath);
  if (!allExistingPathPatternRules) return;
  for (const rule of allExistingPathPatternRules) {
    if (!rule.Conditions) continue;
    const modifyCommand = new ModifyRuleCommand({
      RuleArn: rule.RuleArn,
      Conditions: [
        ...generateBaseForwardConditions(protocol, endpointPath, hostHeader),
        ...rule.Conditions.filter((condition) => condition.Field !== 'path-pattern' && condition.Field !== 'host-header'),
      ],
    });
    await albClient.send(modifyCommand);
  }

  if (hostHeader !== oldHostHeader) {
    const pingPathRule = await getExistingRulesByEndpointPath(listenerArn, process.env.PING_PATH!);
    if (!pingPathRule) return;
    for (const rule of pingPathRule) {
      if (!rule.Conditions) continue;
      const modifyCommand = new ModifyRuleCommand({
        RuleArn: rule.RuleArn,
        Conditions: [
          ...generateBaseForwardConditions(protocol, process.env.PING_PATH!, hostHeader),
          ...rule.Conditions.filter((condition) => condition.Field !== 'path-pattern' && condition.Field !== 'host-header'),
        ],
      });
      await albClient.send(modifyCommand);
    }
  }
}

async function updateAuthenticationSecretArn(
  listenerArn: string,
  authenticationSecretArn: string,
) {
  const rulesWithActionTypeIsAuthenticateOidc = await getRulesWithActionTypeIsAuthenticateOidc(listenerArn);
  const { issuer, userEndpoint, authorizationEndpoint, tokenEndpoint, appClientId, appClientSecret } = await getOidcInfo(authenticationSecretArn);
  if (!rulesWithActionTypeIsAuthenticateOidc) return;
  for (const rule of rulesWithActionTypeIsAuthenticateOidc) {
    if (rule.Conditions?.some(condition => condition.Field === 'path-pattern' && condition.Values?.includes('/login'))) {
      const authLoginActions = [
        {
          Type: ActionTypeEnum.AUTHENTICATE_OIDC,
          Order: 1,
          AuthenticateOidcConfig: {
            ...createAuthenticateOidcConfig(issuer, userEndpoint, authorizationEndpoint, tokenEndpoint, appClientId, appClientSecret),
            OnUnauthenticatedRequest: AuthenticateCognitoActionConditionalBehaviorEnum.AUTHENTICATE,
          },
        },
        {
          Type: ActionTypeEnum.FIXED_RESPONSE,
          Order: 2,
          FixedResponseConfig: {
            MessageBody: 'Authenticated',
            StatusCode: '200',
            ContentType: 'text/plain',
          },
        },
      ];
      const modifyCommand = new ModifyRuleCommand({
        RuleArn: rule.RuleArn,
        Actions: authLoginActions,
      });
      await albClient.send(modifyCommand);
    } else {
      const authForwardActions = [
        {
          Type: ActionTypeEnum.AUTHENTICATE_OIDC,
          Order: 1,
          AuthenticateOidcConfig: {
            ...createAuthenticateOidcConfig(issuer, userEndpoint, authorizationEndpoint, tokenEndpoint, appClientId, appClientSecret),
            OnUnauthenticatedRequest: AuthenticateCognitoActionConditionalBehaviorEnum.DENY,
          },
        },
        {
          Type: ActionTypeEnum.FORWARD,
          Order: 2,
          TargetGroupArn: rule.Actions?.find(action => action.Type === ActionTypeEnum.FORWARD)?.TargetGroupArn,
        },
      ];
      const modifyCommand = new ModifyRuleCommand({
        RuleArn: rule.RuleArn,
        Actions: authForwardActions,
      });
      await albClient.send(modifyCommand);
    }
  }
}

function createAuthenticateOidcConfig(
  issuer: string,
  userEndpoint: string,
  authorizationEndpoint: string,
  tokenEndpoint: string,
  appClientId: string,
  appClientSecret: string,
) {
  const authenticateOidcConfig = {
    Issuer: issuer,
    ClientId: appClientId,
    ClientSecret: appClientSecret,
    TokenEndpoint: tokenEndpoint,
    UserInfoEndpoint: userEndpoint,
    AuthorizationEndpoint: authorizationEndpoint,
  };
  return authenticateOidcConfig;
}

async function getRulesWithActionTypeIsAuthenticateOidc(listenerArn: string) {
  const describeRulesCommand = new DescribeRulesCommand({
    ListenerArn: listenerArn,
  });
  const allAlbRulesResponse = await albClient.send(describeRulesCommand);
  const allAlbRules: Rule[] = allAlbRulesResponse.Rules?.filter(rule => !rule.IsDefault) || [];
  const rulesWithActionTypeIsAuthenticateOidc = allAlbRules.filter(rule =>
    rule.Actions?.some(action => action.Type === ActionTypeEnum.AUTHENTICATE_OIDC),
  );
  return rulesWithActionTypeIsAuthenticateOidc;
}


async function handleClickStreamSDK(input: HandleClickStreamSDKInput) {
  const shouldDeleteRules = [];
  //get appId list and remove empty appId
  const appIdArray = input.appIds.split(',').map((appId) => {
    return appId.trim();
  }).filter((item) => item !== '');

  if (input.requestType === 'Create' || input.requestType === 'Update') {
    if (appIdArray.length > 0) {
      await createAppIdRules(
        input.listenerArn,
        appIdArray,
        input.protocol,
        input.endpointPath,
        input.domainName,
        input.authenticationSecretArn,
        input.targetGroupArn,
      );
    }
  }

  if (input.requestType === 'Update') {
    // check existing rules, and delete not need rules
    const deleteAppIdRules = await getDeleteAppIdRules(appIdArray, input.listenerArn);
    shouldDeleteRules.push(...deleteAppIdRules);
  }

  const { fixedResponseRules, defaultActionRules } = await getFixedResponseAndDefaultActionRules(input.listenerArn);
  if (input.appIds.length > 0) {
    // Remove fixedRepsonseRule and defalut forward rule and action if existing
    shouldDeleteRules.push(...fixedResponseRules);
    shouldDeleteRules.push(...defaultActionRules);
  }

  if (input.appIds.length === 0) {
    // Create fixedRepsonseRule and defalut forward rule and action if not existing
    if (fixedResponseRules.length === 0) {
      await createFixedResponseRule(input.listenerArn);
    }
    if (defaultActionRules.length === 0) {
      await createDefaultForwardRule(
        input.listenerArn,
        input.protocol,
        input.endpointPath,
        input.domainName,
        input.authenticationSecretArn,
        input.targetGroupArn,
      );
    }
  }
  // delete rules
  await deleteRules(shouldDeleteRules);
}

async function deleteRules(rules: Rule[]) {

  for (const rule of rules) {
    const deleteRuleInput = {
      RuleArn: rule.RuleArn,
    };
    const command = new DeleteRuleCommand(deleteRuleInput);
    await albClient.send(command);
  }
}

async function createFixedResponseRule(listenerArn: string) {
  const fixedResponseActions = [
    {
      Type: ActionTypeEnum.FIXED_RESPONSE,
      FixedResponseConfig: {
        MessageBody: 'Configuration invalid!',
        StatusCode: '400',
        ContentType: 'text/plain',
      },
    },
  ];
  const createForwardRuleCommand = new CreateRuleCommand({
    ListenerArn: listenerArn,
    Actions: fixedResponseActions,
    Conditions: [
      {
        Field: 'path-pattern',
        PathPatternConfig: {
          Values: ['/*'],
        },
      },
    ],
    Priority: 1,
  });
  await albClient.send(createForwardRuleCommand);
}

async function getFixedResponseAndDefaultActionRules(listenerArn: string) {
  const describeRulesCommand = new DescribeRulesCommand({
    ListenerArn: listenerArn,
  });
  const allAlbRulesResponse = await albClient.send(describeRulesCommand);
  const allAlbRules: Rule[] = allAlbRulesResponse.Rules?.filter(rule => !rule.IsDefault) || [];
  const fixedResponseRules = allAlbRules.filter(rule =>
    parseInt(rule.Priority!) === 1,
  );
  const defaultActionRules = allAlbRules.filter(rule =>
    parseInt(rule.Priority!) === 2 || parseInt(rule.Priority!) === 3,
  );

  return { fixedResponseRules, defaultActionRules };
}

async function getDeleteAppIdRules(appIdArray: Array<string>, listenerArn: string) {
  const existingAppIdRules = await getAllExistingAppIdRules(listenerArn);

  const shouldDeleteRules = existingAppIdRules.filter(rule =>
    rule.Conditions?.some(condition =>
      condition.QueryStringConfig?.Values?.some(value => {
        return value.Key === 'appId' && value.Value !== undefined && !appIdArray.includes(value.Value);
      }),
    ),
  );
  return shouldDeleteRules;
}

async function createAppIdRules(
  listenerArn: string,
  appIdArray: Array<string>,
  protocol: string,
  endpointPath: string,
  domainName: string,
  authenticationSecretArn: string,
  targetGroupArn: string,
) {
  const allExistingAppIdRules = await getAllExistingAppIdRules(listenerArn);

  const forwardActions = await generateForwardActions(authenticationSecretArn, targetGroupArn);
  const allPriorities = allExistingAppIdRules.map(rule => parseInt(rule.Priority!));
  const existingAppIds = getAllExistingAppIds(allExistingAppIdRules);

  for (const appId of appIdArray) {
    if (existingAppIds.includes(appId)) {
      continue; // skip to the next iteration of the loop
    }
    const appIdConditions = generateAppIdCondition(appId);

    let priority = createPriority(allPriorities);
    const baseForwardConditions = generateBaseForwardConditions(protocol, endpointPath, domainName);
    //@ts-ignore
    baseForwardConditions.push(...appIdConditions);
    // Create a rule just contains mustConditions
    const createRuleCommand = new CreateRuleCommand({
      ListenerArn: listenerArn,
      Actions: forwardActions,
      Conditions: baseForwardConditions,
      Priority: priority,
    });
    await albClient.send(createRuleCommand);

    priority = createPriority(allPriorities);
    const pingPathRuleConditions = generateBaseForwardConditions(protocol, process.env.PING_PATH!, domainName);
    //@ts-ignore
    pingPathRuleConditions.push(...appIdConditions);
    const createPingPathRuleCommand = new CreateRuleCommand({
      ListenerArn: listenerArn,
      Actions: forwardActions,
      Conditions: pingPathRuleConditions,
      Priority: priority,
    });
    await albClient.send(createPingPathRuleCommand);
  }
}

function getAllExistingAppIds(rules: Rule[]) {
  const appIdSet = new Set<string>();
  for (const rule of rules) {
    // Check if Conditions exist
    if (rule.Conditions) {
      for (const condition of rule.Conditions) {
        getAppIdsFromCondition(condition, appIdSet);
      }
    }
  }
  return Array.from(appIdSet); // Convert Set to Array
}

function getAppIdsFromCondition(condition: RuleCondition, appIdSet: Set<string>) {
  // Check if Field is 'query-string' and QueryStringConfig and Values exist
  if (condition.Field === 'query-string' && condition.QueryStringConfig && condition.QueryStringConfig.Values) {
    for (const value of condition.QueryStringConfig.Values) {
      // Check if Key is 'appId' and Value exists
      if (value.Key === 'appId' && value.Value) {
        appIdSet.add(value.Value);
      }
    }
  }
}

async function getAllExistingAppIdRules(listenerArn: string) {
  const describeRulesCommand = new DescribeRulesCommand({
    ListenerArn: listenerArn,
  });

  const allAlbRulesResponse = await albClient.send(describeRulesCommand);
  const allAlbRules: Rule[] = allAlbRulesResponse.Rules?.filter(rule => !rule.IsDefault) || [];
  const allExistingAppIdRules = allAlbRules.filter(rule =>
    parseInt(rule.Priority!) > 4,
  );
  return allExistingAppIdRules;
}

// create a function, get all rules which contains path-pattern condition and the value equal input endpointPath
async function getExistingRulesByEndpointPath(listenerArn: string, endpointPath: string) {
  const describeRulesCommand = new DescribeRulesCommand({
    ListenerArn: listenerArn,
  });

  const allAlbRulesResponse = await albClient.send(describeRulesCommand);
  const allAlbRules: Rule[] = allAlbRulesResponse.Rules?.filter(rule => !rule.IsDefault) || [];
  const existingRules = allAlbRules.filter(rule =>
    rule.Conditions?.some(condition =>
      condition.Field === 'path-pattern' && condition.Values?.includes(endpointPath),
    ),
  );
  return existingRules;
}

async function createDefaultForwardRule(
  listenerArn: string,
  protocol: string,
  endpointPath: string,
  domainName: string,
  authenticationSecretArn: string,
  targetGroupArn: string) {
  const defaultForwardConditions = generateBaseForwardConditions(protocol, endpointPath, domainName);

  const defaultForwardActions = await generateForwardActions(authenticationSecretArn, targetGroupArn);

  const createForwardRuleCommand = new CreateRuleCommand({
    ListenerArn: listenerArn,
    Actions: defaultForwardActions,
    Conditions: defaultForwardConditions,
    Priority: 2,
  });
  await albClient.send(createForwardRuleCommand);

  const pingPathRuleConditions = generateBaseForwardConditions(protocol, process.env.PING_PATH!, domainName);
  const createPingPathRuleCommand = new CreateRuleCommand({
    ListenerArn: listenerArn,
    Actions: defaultForwardActions,
    Conditions: pingPathRuleConditions,
    Priority: 3,
  });
  await albClient.send(createPingPathRuleCommand);
}

async function generateForwardActions(
  authenticationSecretArn: string,
  targetGroupArn: string) {
  const defaultForwardActions = [];
  if (authenticationSecretArn && authenticationSecretArn.length > 0) {
    // auth scenario
    // create auth forward rule
    const { issuer, userEndpoint, authorizationEndpoint, tokenEndpoint, appClientId, appClientSecret } = await getOidcInfo(authenticationSecretArn);
    // create auth forward rule
    defaultForwardActions.push(
      {
        Type: ActionTypeEnum.AUTHENTICATE_OIDC,
        Order: 1,
        AuthenticateOidcConfig: {
          Issuer: issuer,
          ClientId: appClientId,
          ClientSecret: appClientSecret,
          TokenEndpoint: tokenEndpoint,
          UserInfoEndpoint: userEndpoint,
          AuthorizationEndpoint: authorizationEndpoint,
          OnUnauthenticatedRequest: AuthenticateCognitoActionConditionalBehaviorEnum.DENY,
        },
      },
    );
  }
  defaultForwardActions.push({
    Type: ActionTypeEnum.FORWARD,
    Order: 2,
    TargetGroupArn: targetGroupArn,
  });
  return defaultForwardActions;
}

async function createAuthLogindRule(authenticationSecretArn: string, listenerArn: string) {
  const { issuer, userEndpoint, authorizationEndpoint, tokenEndpoint, appClientId, appClientSecret } = await getOidcInfo(authenticationSecretArn);
  const authLoginActions = [
    {
      Type: ActionTypeEnum.AUTHENTICATE_OIDC,
      Order: 1,
      AuthenticateOidcConfig: {
        Issuer: issuer,
        ClientId: appClientId,
        ClientSecret: appClientSecret,
        TokenEndpoint: tokenEndpoint,
        UserInfoEndpoint: userEndpoint,
        AuthorizationEndpoint: authorizationEndpoint,
        OnUnauthenticatedRequest: AuthenticateCognitoActionConditionalBehaviorEnum.AUTHENTICATE,
      },
    },
    {
      Type: ActionTypeEnum.FIXED_RESPONSE,
      Order: 2,
      FixedResponseConfig: {
        MessageBody: 'Authenticated',
        StatusCode: '200',
        ContentType: 'text/plain',
      },
    },
  ];
  // create auth login condition
  const authLoginCondition = [
    {
      Field: 'path-pattern',
      Values: ['/login'],
    },
    {
      Field: 'http-request-method',
      HttpRequestMethodConfig: {
        Values: ['GET'],
      },
    },
  ];
  const createAuthLoginRuleCommand = new CreateRuleCommand({
    ListenerArn: listenerArn,
    Actions: authLoginActions,
    Conditions: authLoginCondition,
    Priority: 4,
  });
  await albClient.send(createAuthLoginRuleCommand);
}

function generateBaseForwardConditions(protocol: string, endpointPath: string, domainName: string) {
  // create base condition
  const baseForwardCondition = [
    {
      Field: 'path-pattern',
      Values: [endpointPath],
    },
  ];
  if (protocol === 'HTTPS') {
    baseForwardCondition.push(...[
      {
        Field: 'host-header',
        Values: [domainName],
      },
    ]);
  }
  return baseForwardCondition;
}

async function modifyFallbackRule(listenerArn: string) {
  // modify default action to return 403,
  const defaultActions = [
    {
      Type: ActionTypeEnum.FIXED_RESPONSE,
      FixedResponseConfig: {
        MessageBody: 'DefaultAction: Invalid request',
        StatusCode: '403',
        ContentType: 'text/plain',
      },
    },
  ];
  const modifyListenerDefaultRuleCommand = new ModifyListenerCommand({
    DefaultActions: defaultActions,
    ListenerArn: listenerArn,
  });
  await albClient.send(modifyListenerDefaultRuleCommand);
}

async function getOidcInfo(authenticationSecretArn: string) {
  const secretParams = {
    SecretId: authenticationSecretArn,
  };
  const data = await secretsManagerClient.send(new GetSecretValueCommand(secretParams));
  const secretValue = JSON.parse(data.SecretString!);
  const issuer = secretValue.issuer;
  const userEndpoint = secretValue.userEndpoint;
  const authorizationEndpoint = secretValue.authorizationEndpoint;
  const tokenEndpoint = secretValue.tokenEndpoint;
  const appClientId = secretValue.appClientId;
  const appClientSecret = secretValue.appClientSecret;
  return { issuer, userEndpoint, authorizationEndpoint, tokenEndpoint, appClientId, appClientSecret };
}

function createPriority(allPriorities: Array<number>) {
  let priority = 5;
  while (allPriorities.includes(priority)) {
    priority++;
  }
  allPriorities.push(priority);
  return priority;
}

function generateAppIdCondition(appId: string) {
  const appIdConditions = [
    {
      Field: 'query-string',
      QueryStringConfig: {
        Values: [{
          Key: 'appId',
          Value: appId,
        }],
      },
    },
  ];
  return appIdConditions;
}