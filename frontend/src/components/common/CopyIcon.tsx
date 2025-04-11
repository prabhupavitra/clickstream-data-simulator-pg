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
  Button,
  Popover,
  StatusIndicator,
} from '@cloudscape-design/components';
import React from 'react';
import { useTranslation } from 'react-i18next';

interface CopyCodeProps {
  text: string;
}
const CopyText: React.FC<CopyCodeProps> = (props: CopyCodeProps) => {
  const { t } = useTranslation();
  const { text } = props;

  const copyText = () => {
    navigator.clipboard.writeText(text);
  };

  return (
    <span>
      <Popover
        size="small"
        position="top"
        triggerType="custom"
        dismissButton={false}
        content={
          <StatusIndicator type="success">{t('copied')}</StatusIndicator>
        }
      >
        <Button variant="inline-icon" iconName="copy" onClick={copyText} />
      </Popover>
    </span>
  );
};

export default CopyText;
