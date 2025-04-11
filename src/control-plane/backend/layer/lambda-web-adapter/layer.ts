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

import path from 'path';
import { LayerVersion, Runtime, Code } from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface LambdaAdapterLayerProps {
  readonly version?: string;
}

export class LambdaAdapterLayer extends LayerVersion {
  constructor(scope: Construct, id: string, props?: LambdaAdapterLayerProps) {
    const defaultVersion = props?.version ?? '0.8.2';

    super(scope, id, {
      code: getLambdaCode(defaultVersion),
      compatibleRuntimes: [Runtime.NODEJS_16_X, Runtime.NODEJS_18_X, Runtime.NODEJS_20_X, Runtime.NODEJS_LATEST],
    });
  }
}

function getLambdaCode(defaultVersion: string) {
  if (process.env.LOCAL_TESTING === 'true') {
    return Code.fromAsset('./src/control-plane/backend/layer/lambda-web-adapter');
  } else {
    return Code.fromDockerBuild(path.join(__dirname, '.'), {
      file: 'Dockerfile',
      buildArgs: {
        ADAPTER_VERSION: defaultVersion,
      },
    });
  }
}
