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

export {};
declare global {
  enum EPlatfom {
    Web = 'Web',
    Android = 'Android',
    iOS = 'iOS',
  }

  interface IProject {
    id: string;
    name: string;
    platform: string;
    environment: string;
    emails: string;
    region: string;
    description: string;
    pipelineId?: string;
    pipelineVersion?: string;
    applications?: IApplication[];
    analysisStudioEnabled?: boolean;
    updateAt?: number;
    operator?: string;
    deleted?: boolean;
    createAt?: number;
    type?: string;
    status?: string;
  }

  interface IAlarmPromiseResult {
    status: string;
    value?: {
      success: boolean;
      message: string;
      data: ResponseTableData<IAlarm>;
    };
  }

  interface IProjectWithAlarm {
    project: IProject;
    status: DisplayStatus;
    inAlarm: number;
    alarms: IAlarm[];
  }
}
