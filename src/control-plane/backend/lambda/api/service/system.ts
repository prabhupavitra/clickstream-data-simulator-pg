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

import { SolutionVersion, fetchRemoteUrl } from '@aws/clickstream-base-lib';
import { FULL_SOLUTION_VERSION } from '../common/constants';
import { logger } from '../common/powertools';
import { ApiSuccess } from '../common/types';
import { getTemplateUrl } from '../common/utils';
import { ClickStreamStore } from '../store/click-stream-store';
import { DynamoDbStore } from '../store/dynamodb/dynamodb-store';

const store: ClickStreamStore = new DynamoDbStore();
const consoleTemplateName = process.env.TEMPLATE_FILE!;
const stackId = process.env.STACK_ID!;

export class SystemService {

  public async info(_req: any, res: any, next: any) {
    try {
      const solution = await store.getDictionary('Solution');
      const templateUrl = getTemplateUrl(consoleTemplateName, solution, true);

      let remoteVersion = '';
      try {
        const response = await fetchRemoteUrl(templateUrl);
        const jsonData = await response.json();
        logger.debug('Received remote template', { jsonData });
        const { version, buildString } = this._parseVersionString( jsonData.Description);
        logger.info(`fetched the template ${templateUrl}.`, { version, buildString });
        remoteVersion = `${version}-${buildString}`;
      } catch (error) {
        logger.warn(`failed to fetch the template from ${templateUrl}`, { error });
      }

      return res.json(new ApiSuccess({
        version: FULL_SOLUTION_VERSION,
        templateUrl,
        remoteVersion,
        stackId,
        hasUpdate: remoteVersion == '' ? false :
          SolutionVersion.Of(remoteVersion).fullVersionGreaterThan(SolutionVersion.Of(FULL_SOLUTION_VERSION)),
      }));
    } catch (error) {
      next(error);
    }
  };

  _parseVersionString(descriptionStr: string): { version: string | null; buildString: string | null } {
    const versionPattern = /Version\s*(v\d+\.\d+\.\d+)/;
    const buildPattern = /Build\s*([\w-]+)/;

    const versionMatch = descriptionStr.match(versionPattern);
    const buildMatch = descriptionStr.match(buildPattern);

    const version = versionMatch ? versionMatch[1] : null;
    const buildString = buildMatch ? buildMatch[1] : null;

    return { version, buildString };
  }
}
