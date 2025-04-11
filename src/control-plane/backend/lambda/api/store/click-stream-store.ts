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

import { IApplication } from '../model/application';
import { IDictionary } from '../model/dictionary';
import { IPipeline } from '../model/pipeline';
import { IPlugin } from '../model/plugin';
import { IProject } from '../model/project';
import { IUser, IUserSettings } from '../model/user';

export interface ClickStreamStore {
  createProject: (project: IProject) => Promise<string>;
  getProject: (id: string) => Promise<IProject | undefined>;
  updateProject: (project: IProject) => Promise<void>;
  listProjects: (order: string) => Promise<IProject[]>;
  deleteProject: (id: string, operator: string) => Promise<void>;
  isProjectExisted: (projectId: string) => Promise<boolean>;

  addApplication: (app: IApplication) => Promise<string>;
  getApplication: (projectId: string, appId: string) => Promise<IApplication | undefined>;
  updateApplication: (app: IApplication) => Promise<void>;
  listApplication: (projectId: string, order: string) => Promise<IApplication[]>;
  listAllApplication: () => Promise<IApplication[]>;
  deleteApplication: (projectId: string, appId: string, operator: string) => Promise<void>;
  isApplicationExisted: (projectId: string, appId: string) => Promise<boolean>;

  addPipeline: (pipeline: IPipeline) => Promise<string>;
  getPipeline: (projectId: string, pipelineId: string, version?: string | undefined) => Promise<IPipeline | undefined>;
  updatePipeline: (pipeline: IPipeline, curPipeline: IPipeline) => Promise<void>;
  updatePipelineAtCurrentVersion: (pipeline: IPipeline) => Promise<void>;
  listPipeline: (projectId: string, version: string, order: string) => Promise<IPipeline[]>;
  deletePipeline: (projectId: string, pipelineId: string, operator: string) => Promise<void>;
  isPipelineExisted: (projectId: string, pipelineId: string) => Promise<boolean>;

  addPlugin: (plugin: IPlugin) => Promise<string>;
  getPlugin: (pluginId: string) => Promise<IPlugin | undefined>;
  updatePlugin: (plugin: IPlugin) => Promise<void>;
  listPlugin: (pluginType: string, order: string) => Promise<IPlugin[]>;
  deletePlugin: (pluginId: string, operator: string) => Promise<void>;
  isPluginExisted: (pluginId: string) => Promise<boolean>;
  bindPlugins: (pluginIds: string[], count: number) => Promise<void>;

  addUser: (user: IUser) => Promise<string>;
  getUser: (uid: string) => Promise<IUser | undefined>;
  updateUser: (user: IUser) => Promise<void>;
  listUser: () => Promise<IUser[]>;
  deleteUser: (uid: string, operator: string) => Promise<void>;
  getUserSettings: () => Promise<IUserSettings | undefined>;
  updateUserSettings: (settings: IUserSettings) => Promise<void>;

  getDictionary: (name: string) => Promise<IDictionary | undefined>;
  updateDictionary: (dictionary: IDictionary) => Promise<void>;
  listDictionary: () => Promise<IDictionary[]>;

  isRequestIdExisted: (id: string) => Promise<boolean>;
  saveRequestId: (id: string) => Promise<void>;
  deleteRequestId: (id: string) => Promise<void>;

  isManualTrigger: (projectId: string, appId: string) => Promise<boolean>;
  saveManualTrigger: (projectId: string, appId: string) => Promise<void>;
}
