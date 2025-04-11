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

export enum MetadataSource {
  PRESET = 'Preset',
  CUSTOM = 'Custom',
  TEMPLATE = 'Template',
}

export enum MetadataPlatform {
  ANDROID = 'Android',
  IOS = 'iOS',
  WEB = 'Web',
  WECHAT_MINIPROGRAM = 'WechatMP',
}

export enum MetadataValueType {
  STRING = 'string',
  INTEGER = 'int',
  DOUBLE = 'double',
  FLOAT = 'float',
}

export enum MetadataParameterType {
  PUBLIC = 'Public',
  PRIVATE = 'Private',
}

export enum ExploreComputeMethod {
  USER_ID_CNT = 'USER_ID_CNT', // user_id
  EVENT_CNT = 'EVENT_CNT',
  SUM_VALUE = 'SUM_VALUE',
  COUNT_PROPERTY = 'COUNT_PROPERTY',
  AGGREGATION_PROPERTY = 'AGGREGATION_PROPERTY',
}

export enum ExploreAggregationMethod {
  MIN = 'min',
  MAX = 'max',
  SUM = 'sum',
  AVG = 'avg',
  MEDIAN = 'median',
}

export enum ExplorePathSessionDef {
  SESSION = 'SESSION',
  CUSTOMIZE = 'CUSTOMIZE',
}

export enum ExplorePathNodeType {
  EVENT = 'event',
  PAGE_TITLE = '_page_title',
  PAGE_URL = '_page_url',
  SCREEN_NAME = '_screen_name',
  SCREEN_ID = '_screen_id',
}

export enum ExploreConversionIntervalType {
  CURRENT_DAY = 'CURRENT_DAY',
  CUSTOMIZE = 'CUSTOMIZE',
}

export enum ExploreTimeScopeType {
  FIXED = 'FIXED',
  RELATIVE = 'RELATIVE',
}

export enum ExploreRelativeTimeUnit {
  DD = 'DD',
  WK = 'WK',
  MM = 'MM',
  Q = 'Q',
  YY = 'YY',
}

export enum ExploreGroupColumn {
  HOUR = 'HOUR',
  DAY = 'DAY',
  WEEK = 'WEEK',
  MONTH = 'MONTH',
}

export enum ExploreRequestAction {
  PREVIEW = 'PREVIEW',
  PUBLISH = 'PUBLISH',
}

export enum ExploreAnalyticsOperators {
  NULL = 'is_null',
  NOT_NULL = 'is_not_null',
  EQUAL = '=',
  NOT_EQUAL = '<>',
  GREATER_THAN = '>',
  GREATER_THAN_OR_EQUAL = '>=',
  LESS_THAN = '<',
  LESS_THAN_OR_EQUAL = '<=',
  IN = 'in',
  NOT_IN = 'not_in',
  CONTAINS = 'contains',
  NOT_CONTAINS = 'not_contains',
}

export enum ConditionCategory {
  APP_INFO = 'app_info',
  DEVICE = 'device',
  EVENT = 'event',
  GEO = 'geo',
  OTHER = 'other',
  TRAFFIC_SOURCE = 'traffic_source',
  USER = 'user',
  USER_OUTER = 'user_outer',
}

export enum QuickSightChartType {
  BAR = 'bar',
  LINE = 'line',
  FUNNEL = 'funnel',
  SANKEY = 'sankey',
}

export interface IMetadataDisplayNameAndDescription {
  'zh-CN': string;
  'en-US': string;
}

export interface IMetadataBuiltInList {
  readonly PresetEvents: Array<{
    name: string;
    displayName: IMetadataDisplayNameAndDescription;
    description: IMetadataDisplayNameAndDescription;
  }>;
  readonly PresetEventParameters: Array<{
    name: string;
    eventName?: string;
    category: ConditionCategory;
    dataType: MetadataValueType;
    displayName: IMetadataDisplayNameAndDescription;
    description: IMetadataDisplayNameAndDescription;
  }>;
  readonly PublicEventParameters: Array<{
    name: string;
    dataType: MetadataValueType;
    category: ConditionCategory;
    displayName: IMetadataDisplayNameAndDescription;
    description: IMetadataDisplayNameAndDescription;
  }>;
  readonly PresetUserAttributes: Array<{
    name: string;
    dataType: MetadataValueType;
    category: ConditionCategory;
    displayName: IMetadataDisplayNameAndDescription;
    description: IMetadataDisplayNameAndDescription;
  }>;
}
