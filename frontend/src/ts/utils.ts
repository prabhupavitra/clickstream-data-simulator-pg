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
  IMetadataBuiltInList,
  ServerlessRedshiftRPUByRegionMapping,
} from '@aws/clickstream-base-lib';
import {
  DateRangePickerProps,
  SelectProps,
} from '@cloudscape-design/components';
import { IProjectSelectItem } from 'components/eventselect/AnalyticsType';
import { isEqual } from 'lodash';
import moment from 'moment';
import momentTimezone from 'moment-timezone';
import { getLngFromLocalStorage } from 'pages/analytics/analytics-utils';
import {
  CLICK_STREAM_USER_DATA,
  EPipelineStatus,
  ExecutionType,
  FILTER_TIME_ZONE,
  IUserRole,
} from './const';

/**
 * The `ternary` function in TypeScript returns `caseOne` if `cond` is true, otherwise it returns
 */
export const ternary = <T>(cond: any, caseOne: T, caseTwo: T) =>
  cond ? caseOne : caseTwo;

export const defaultStr = (
  expectStr: string | null | undefined,
  defaultValue?: string
) => {
  return expectStr ?? defaultValue ?? '';
};

export const generateStr = (length: number, onlyLowerCase = false) => {
  let validCharacters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  if (onlyLowerCase) {
    validCharacters = 'abcdefghijklmnopqrstuvwxyz';
  }
  const array = new Uint8Array(length);
  window.crypto.getRandomValues(array);
  let randomString = '';
  array.forEach((value) => {
    randomString += validCharacters.charAt(value % validCharacters.length);
  });
  return randomString;
};

export const getTimezoneOptions = () => {
  const tzs = momentTimezone.tz
    .names()
    .filter((tz) => !FILTER_TIME_ZONE.includes(tz));
  const tzOptions = tzs.flatMap((tz) => {
    return {
      label: addTimezoneUtcOffset(tz),
      value: addTimezoneUtcOffset(tz),
    };
  });
  return tzOptions;
};

export const addTimezoneUtcOffset = (tz: string) => {
  if (tz.includes(' (UTC ')) {
    return tz;
  }
  const utcOffset = moment(new Date()).tz(tz).format('Z');
  return `${tz} (UTC ${utcOffset})`;
};

export const generateRedshiftRPUOptionListByRegion = (region: string) => {
  const STEP = 8;
  const minMaxObject = (
    ServerlessRedshiftRPUByRegionMapping as RPURegionListType
  )[region];
  if (region && minMaxObject && minMaxObject.min > 0) {
    const options: SelectProps.Option[] = [];
    for (let i = minMaxObject.min; i <= minMaxObject.max; i += STEP) {
      options.push({ label: i.toString(), value: i.toString() });
    }
    return options;
  }
  return [];
};

export const alertMsg = (alertTxt: string, alertType: AlertType = 'error') => {
  const patchEvent = new CustomEvent('showAlertMsg', {
    detail: {
      alertTxt,
      alertType,
    },
  });
  window.dispatchEvent(patchEvent);
};

export const isPositiveInteger = (num: number) => {
  return Number.isInteger(num) && num > 0;
};

export const checkStringValidRegex = (str: string, regex: RegExp) => {
  return regex.test(str);
};

export const EMAIL_PATTERN =
  '\\w+([-+.]\\w+)*@\\w+([-.]\\w+)*\\.\\w+([-.]\\w+)*';
export const validateEmails = (emails: string) => {
  const emailArray = emails.split(',');
  const regex = new RegExp(`${EMAIL_PATTERN}`);
  for (const item of emailArray) {
    const email = item.trim();
    if (!regex.test(email)) {
      return false;
    }
  }
  return true;
};

export const validateProjectId = (projectId: string) => {
  const regex = /^[a-z_][a-z0-9_]{0,126}$/;
  if (!regex.test(projectId)) {
    return false;
  }
  return true;
};

export const validateAppId = (appId: string) => {
  const regex = /^[a-zA-Z]\w{0,126}$/;
  if (!regex.test(appId)) {
    return false;
  }
  return true;
};

export const validatePluginName = (name: string) => {
  const re = /[^0-9a-zA-Z_\- |]/g;
  if (!re?.test(name)) {
    return true;
  }
  return false;
};

export const validatePluginMainFunction = (functionName: string) => {
  const re = /[^0-9a-zA-Z._\- |]/g;
  if (!re?.test(functionName)) {
    return true;
  }
  return false;
};

export const generateFileDownloadLink = (fileContent: string): string => {
  // Create Blob url
  const blob = new Blob([fileContent], { type: 'text/plain' });
  // create URL Object
  const url = URL.createObjectURL(blob);
  return url;
};

const buildCronFixedRate = (
  fixedValue: number,
  unit: SelectProps.Option | null,
  defaultValue: string
) => {
  if (fixedValue && fixedValue > 0) {
    if (unit?.value === 'hour') {
      return `rate(${fixedValue} ${ternary(fixedValue > 1, 'hours', 'hour')})`;
    } else if (unit?.value === 'minute') {
      return `rate(${fixedValue} ${ternary(
        fixedValue > 1,
        'minutes',
        'minute'
      )})`;
    } else if (unit?.value === 'day') {
      return `rate(${fixedValue} ${ternary(fixedValue > 1, 'days', 'day')})`;
    } else {
      return defaultValue;
    }
  } else {
    return defaultValue;
  }
};

export const generateCronDateRange = (
  type: string | undefined,
  fixedValue: number,
  cronExp: string,
  unit: SelectProps.Option | null,
  attr: 'processing' | 'dataload'
) => {
  let DEFAULT_VALUE = `rate(1 hour)`;
  if (attr === 'dataload') {
    DEFAULT_VALUE = `rate(5 minutes)`;
  }
  if (type === ExecutionType.FIXED_RATE) {
    return buildCronFixedRate(fixedValue, unit, DEFAULT_VALUE);
  } else if (type === ExecutionType.CRON_EXPRESS) {
    if (cronExp) {
      return `cron(${cronExp})`;
    } else {
      return DEFAULT_VALUE;
    }
  } else {
    return DEFAULT_VALUE;
  }
};

export const reverseCronDateRange = (value: string) => {
  if (value.startsWith('cron')) {
    return {
      value: value.substring(5, value.length - 1),
      unit: '',
      type: ExecutionType.CRON_EXPRESS,
    } as ICronFixed;
  } else {
    const indexSpace = value.indexOf(' ');
    const fixedValue = value.substring(5, indexSpace);
    let fixedUnitStr = value.substring(indexSpace + 1, value.length - 1);
    if (fixedUnitStr.endsWith('s')) {
      fixedUnitStr = fixedUnitStr.substring(0, fixedUnitStr.length - 1);
    }
    return {
      value: fixedValue,
      unit: fixedUnitStr,
      type: ExecutionType.FIXED_RATE,
    } as ICronFixed;
  }
};

export const generateRedshiftInterval = (value?: number, unit?: string) => {
  if (value) {
    if (unit === 'month') {
      return value * 60 * 24 * 30;
    }
    if (unit === 'day') {
      return value * 60 * 24;
    }
    return value;
  } else {
    return 6 * 60 * 24 * 30;
  }
};

export const reverseRedshiftInterval = (value: number) => {
  if (value) {
    if (value / (60 * 24 * 30) >= 1 && value % (60 * 24 * 30) === 0) {
      return {
        value: (value / (60 * 24 * 30)).toString(),
        unit: 'month',
      } as IInterval;
    }
    if (value / (60 * 24) >= 1 && value % (60 * 24) === 0) {
      return {
        value: (value / (60 * 24)).toString(),
        unit: 'day',
      } as IInterval;
    }
  }
  return {
    value: '0',
    unit: 'day',
  } as IInterval;
};

export const reverseFreshnessInHour = (value: number) => {
  if (value) {
    if (value / 24 >= 1 && value % 24 === 0) {
      return {
        value: (value / 24).toString(),
        unit: 'day',
      } as IInterval;
    }
    return {
      value: value.toString(),
      unit: 'hour',
    } as IInterval;
  }
  return {
    value: '0',
    unit: 'hour',
  } as IInterval;
};

export const extractAccountIdFromArn = (arn: string) => {
  const regex = /^arn:aws.*:redshift-serverless:[^:]+:(\d{12}):/;
  const matchResult = arn.match(regex);
  return matchResult ? matchResult[1] : '';
};

export const isEmpty = (a: any) => {
  if (a === '') return true; //Verify empty string
  if (a === 'null') return true; //Verify null string
  if (a === 'undefined') return true; //Verify undefined string
  if (!a && a !== 0 && a !== '') return true; //Verify undefined and null
  // eslint-disable-next-line no-prototype-builtins
  if (Array.prototype.isPrototypeOf(a) && a.length === 0) return true; //Verify empty array
  // eslint-disable-next-line no-prototype-builtins
  if (Object.prototype.isPrototypeOf(a) && Object.keys(a).length === 0)
    return true; //Verify empty objects
  return false;
};

export const extractRegionFromCloudWatchArn = (arn: string) => {
  const regex = /^arn:aws.*:cloudwatch:(\w{2}-\w{1,10}-\d):\d{12}:/;
  const matchResult = arn.match(regex);
  return matchResult ? matchResult[1] : '';
};

export const isDisabled = (update?: boolean, pipelineInfo?: IExtPipeline) => {
  return (
    update &&
    (pipelineInfo?.statusType === EPipelineStatus.Failed ||
      pipelineInfo?.statusType === EPipelineStatus.Active ||
      pipelineInfo?.statusType === EPipelineStatus.Warning)
  );
};

export const isReportingDisabled = (
  update?: boolean,
  pipelineInfo?: IExtPipeline
) => {
  if (!update && pipelineInfo?.serviceStatus?.QUICK_SIGHT) {
    return false;
  } else {
    return (
      pipelineInfo?.enableReporting ||
      !pipelineInfo?.serviceStatus?.QUICK_SIGHT ||
      !pipelineInfo.enableRedshift ||
      !(
        pipelineInfo?.statusType === EPipelineStatus.Failed ||
        pipelineInfo?.statusType === EPipelineStatus.Active ||
        pipelineInfo?.statusType === EPipelineStatus.Warning
      )
    );
  }
};

// Validate subnets cross N AZs
export const validateSubnetCrossInAZs = (
  subnets: readonly SelectProps.Option[],
  nAZ: number
) => {
  const subnetsAZs = subnets.map(
    (element) => element?.description?.split(':')[0]
  );
  const subnetSets = new Set(subnetsAZs);
  if (subnetSets.size < nAZ) {
    return false;
  }
  return true;
};

// Validate Private Subnet in same AZ with Public Subnets
export const validatePublicSubnetInSameAZWithPrivateSubnets = (
  publicSubnets: readonly SelectProps.Option[],
  privateSubnets: readonly SelectProps.Option[]
) => {
  const publicSubnetsAZs = publicSubnets.map(
    (element) => element?.description?.split(':')[0]
  );
  const privateSubnetsAZs = privateSubnets.map(
    (element) => element?.description?.split(':')[0]
  );
  return isEqual(new Set(publicSubnetsAZs), new Set(privateSubnetsAZs));
};

export const getValueFromStackOutputs = (
  pipeline: IPipeline,
  stackType: string,
  keys: string[]
) => {
  const res: Map<string, string> = new Map<string, string>();
  const stackDetail = pipeline.stackDetails?.find(
    (s) => s.stackType === stackType
  );
  if (!stackDetail) {
    return res;
  }
  const stackOutputs = stackDetail.outputs;
  for (const key of keys) {
    for (const output of stackOutputs) {
      if (output.OutputKey?.endsWith(key)) {
        res.set(key, output.OutputValue ?? '');
        break;
      }
    }
  }
  return res;
};

export const defaultSelectOptions = (
  optionDefault: SelectProps.Option,
  optionNotSure?: SelectProps.Option | null
) => {
  if (optionNotSure) {
    return optionNotSure;
  } else {
    return optionDefault;
  }
};

export const checkDisable = (condOne?: boolean, condTwo?: boolean) => {
  if (condOne) {
    return true;
  }
  if (condTwo) {
    return true;
  }
  return false;
};

export const defaultGenericsValue = <T>(expectValue: T, defaultValue: T) => {
  if (expectValue || expectValue === 0) {
    return expectValue;
  } else {
    return defaultValue;
  }
};

export const getEventParameters = (
  metadataEventParameters: IMetadataEventParameter[],
  metadataEvents: IMetadataEvent[],
  builtInMetadata?: IMetadataBuiltInList,
  eventName?: string
) => {
  if (!eventName) {
    return [];
  }
  if (metadataEventParameters?.[0]?.eventNames?.length > 0) {
    const associatedParameters = metadataEventParameters.filter(
      (p) => p.eventNames.includes(eventName) || p.eventNames.includes('*')
    );
    patchBuiltInMetadata(eventName, associatedParameters, builtInMetadata);
    return associatedParameters;
  }
  const event = metadataEvents.find((item) => item.name === eventName);
  if (event) {
    const associatedParameters = event.associatedParameters ?? [];
    patchBuiltInMetadata(eventName, associatedParameters, builtInMetadata);
    return associatedParameters;
  }
  return [];
};

const patchBuiltInMetadata = (
  eventName: string,
  metadataEventParameters: IMetadataEventParameter[],
  builtInMetadata?: IMetadataBuiltInList
) => {
  if (!builtInMetadata) {
    return metadataEventParameters;
  }
  const presetEventParameters = builtInMetadata.PresetEventParameters;
  for (const parameter of metadataEventParameters) {
    const presetParameter = presetEventParameters.find(
      (item) =>
        item.name === parameter.name &&
        item.eventName === eventName &&
        item.category === parameter.category &&
        item.dataType === parameter.valueType
    );
    if (presetParameter) {
      const localeLng = getLngFromLocalStorage();
      parameter.displayName = presetParameter.displayName[localeLng];
      parameter.description = presetParameter.description[localeLng];
    }
  }
};

export const getUserInfoFromLocalStorage = () => {
  if (window.localStorage.getItem(CLICK_STREAM_USER_DATA)) {
    return JSON.parse(
      window.localStorage.getItem(CLICK_STREAM_USER_DATA) ?? ''
    ) as IUser;
  } else {
    return null;
  }
};

export const getLocaleLngDescription = (description: {
  [key: string]: string;
}) => {
  const localeLng = getLngFromLocalStorage();
  return description[localeLng];
};

export const getAbsoluteStartEndRange = () => {
  const endDate = moment();
  const startDate = moment().subtract(7, 'days');
  return {
    type: 'absolute',
    startDate: startDate.format('YYYY-MM-DD'),
    endDate: endDate.format('YYYY-MM-DD'),
  } as DateRangePickerProps.AbsoluteValue;
};

export const getIntersectArrays = (a: any[], b: any[]) => {
  return [...new Set(a)].filter((x) => new Set(b).has(x));
};

export const isAdminRole = (roles: IUserRole[] | undefined) => {
  if (!roles) {
    return false;
  }
  return roles.some((role) => role === IUserRole.ADMIN);
};

export const isAnalystRole = (roles: IUserRole[] | undefined) => {
  if (!roles) {
    return false;
  }
  return roles.some(
    (role) => role === IUserRole.ANALYST || role === IUserRole.ANALYST_READER
  );
};

export const isAnalystAuthorRole = (roles: IUserRole[] | undefined) => {
  if (!roles) {
    return false;
  }
  return roles.some(
    (role) => role === IUserRole.ANALYST || role === IUserRole.ADMIN
  );
};

export const getProjectAppFromOptions = (
  projectId: string,
  appId: string,
  projectGroupOptions: SelectProps.OptionGroup[]
) => {
  for (const projectOption of projectGroupOptions) {
    const appOptions = projectOption.options as IProjectSelectItem[];
    for (const appOption of appOptions) {
      if (appOption.projectId === projectId && appOption.appId === appId) {
        return {
          ...appOption,
          disabled: projectOption.disabled,
        };
      }
    }
  }
};

export const isJson = (str) => {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
};
