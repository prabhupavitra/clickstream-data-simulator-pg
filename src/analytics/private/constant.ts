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


export enum JobStatus {
  JOB_NEW = 'NEW',
  JOB_ENQUEUE = 'ENQUEUE',
  JOB_PROCESSING = 'PROCESSING',
}

export enum WorkflowStatus {
  FAILED = 'FAILED',
  ABORTED = 'ABORTED',
  SKIP = 'SKIP',
  CONTINUE = 'CONTINUE',
  FINISHED = 'FINISHED',
  SUCCEED = 'SUCCEED',
  NO_JOBS = 'NO_JOBS',
}

export enum RefreshWorkflowSteps {
  REFRESH_SP_STEP = 'REFRESH_SP',
  REFRESH_MV_STEP = 'REFRESH_MV',
  END_STEP = 'END',
}

export const DYNAMODB_TABLE_INDEX_NAME = 'status_timestamp_index';

export const REDSHIFT_EVENT_V2_TABLE_NAME = 'event_v2';
export const REDSHIFT_ITEM_V2_TABLE_NAME = 'item_v2';
export const REDSHIFT_USER_V2_TABLE_NAME = 'user_v2';
export const REDSHIFT_SESSION_TABLE_NAME = 'session';

export const REDSHIFT_TABLE_NAMES = [
  REDSHIFT_EVENT_V2_TABLE_NAME, REDSHIFT_ITEM_V2_TABLE_NAME,
  REDSHIFT_USER_V2_TABLE_NAME, REDSHIFT_SESSION_TABLE_NAME,
];

export const REDSHIFT_DUPLICATE_DATE_INTERVAL = 3; // Days

export const SP_SCAN_METADATA = 'sp_scan_metadata';
export const PROPERTY_ARRAY_TEMP_TABLE = 'property_array_temp_table';

export const SP_CLEAR_EXPIRED_DATA = 'sp_clear_expired_data';


export const SQL_TEMPLATE_PARAMETER = {
  sp_scan_metadata: 'sp_scan_metadata',
  sp_merge_event_v2: 'sp_merge_event_v2',
  sp_merge_item_v2: 'sp_merge_item_v2',
  sp_merge_user_v2: 'sp_merge_user_v2',
  sp_merge_session: 'sp_merge_session',
  sp_clickstream_log: 'sp_clickstream_log',
  sp_clickstream_log_non_atomic: 'sp_clickstream_log_non_atomic',
  table_clickstream_log: 'clickstream_log_v2',
  table_refresh_mv_sp_status: 'refresh_mv_sp_status',
};

