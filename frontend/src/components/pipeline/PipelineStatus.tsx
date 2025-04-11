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
  Link,
  Popover,
  SpaceBetween,
  Spinner,
  StatusIndicator,
  StatusIndicatorProps,
} from '@cloudscape-design/components';
import { getPipelineDetail } from 'apis/pipeline';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CLOUDFORMATION_STATUS_MAP, EPipelineStatus } from 'ts/const';
import { buildCloudFormationStackLink } from 'ts/url';
import { defaultStr } from 'ts/utils';

const CHECK_TIME_INTERVAL = 8000;

interface PipelineStatusProps {
  projectId?: string;
  status?: string;
  refreshCount?: number;
}
const PipelineStatus: React.FC<PipelineStatusProps> = (
  props: PipelineStatusProps
) => {
  const { status, projectId, refreshCount } = props;
  const { t } = useTranslation();
  let intervalId: any = 0;
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [updatedStatus, setUpdatedStatus] = useState(status);
  const [pipelineRegion, setPipelineRegion] = useState('');
  const [pipelineTemplateVersion, setPipelineTemplateVersion] = useState('');
  const [stackStatusList, setStackStatusList] = useState<IStackStatus[]>([]);
  const [displayStatus, setDisplayStatus] = useState('');
  const [indicatorType, setIndicatorType] =
    useState<StatusIndicatorProps.Type>('loading');
  useEffect(() => {
    let tmpDisplayStatus = '';
    let tmpIndicatorType: StatusIndicatorProps.Type;
    if (
      updatedStatus === EPipelineStatus.Creating ||
      updatedStatus === EPipelineStatus.Updating ||
      updatedStatus === EPipelineStatus.Deleting
    ) {
      tmpIndicatorType = 'loading';
      if (updatedStatus === EPipelineStatus.Creating) {
        tmpDisplayStatus = 'status.creating';
      }
      if (updatedStatus === EPipelineStatus.Updating) {
        tmpDisplayStatus = 'status.updating';
      }
      if (updatedStatus === EPipelineStatus.Deleting) {
        tmpDisplayStatus = 'status.deleting';
      }
    } else if (updatedStatus === EPipelineStatus.Failed) {
      tmpIndicatorType = 'error';
      tmpDisplayStatus = 'status.failed';
    } else if (updatedStatus === EPipelineStatus.Active) {
      tmpIndicatorType = 'success';
      tmpDisplayStatus = 'status.active';
    } else if (updatedStatus === EPipelineStatus.Warning) {
      tmpIndicatorType = 'warning';
      tmpDisplayStatus = 'status.warning';
    } else if (updatedStatus === EPipelineStatus.Deleted) {
      tmpIndicatorType = 'stopped';
      tmpDisplayStatus = 'status.deleted';
    } else {
      tmpIndicatorType = 'pending';
      tmpDisplayStatus = 'status.pending';
    }
    setDisplayStatus(tmpDisplayStatus);
    setIndicatorType(tmpIndicatorType);
  }, [updatedStatus]);

  const checkStatus = async (isRefresh?: boolean) => {
    if (!isRefresh) {
      setLoadingStatus(true);
    }
    try {
      const { success, data }: ApiResponse<IExtPipeline> =
        await getPipelineDetail({
          projectId: defaultStr(projectId),
        });
      if (success) {
        setUpdatedStatus(data.statusType);
        setPipelineRegion(data.region);
        setPipelineTemplateVersion(data.templateVersion ?? '');
        setStackStatusList(data.stackDetails ?? []);
        if (
          data.statusType === EPipelineStatus.Active ||
          data.statusType === EPipelineStatus.Failed ||
          data.statusType === EPipelineStatus.Warning
        ) {
          window.clearInterval(intervalId);
        }
        setLoadingStatus(false);
      }
    } catch (error) {
      setLoadingStatus(false);
      window.clearInterval(intervalId);
    }
  };

  const setRefreshInterval = () => {
    window.clearInterval(intervalId);
    intervalId = setInterval(() => {
      checkStatus(true);
    }, CHECK_TIME_INTERVAL);
  };

  useEffect(() => {
    setRefreshInterval();
  }, [refreshCount]);

  useEffect(() => {
    setRefreshInterval();
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    checkStatus();
    if (status) {
      setUpdatedStatus(status);
    }
  }, [status]);

  const getStackStatusIndicatorType = (
    stackVersion: string,
    stackStatus: string
  ) => {
    let stackIndicatorType: StatusIndicatorProps.Type;
    if (
      pipelineTemplateVersion !== '' &&
      pipelineTemplateVersion !== stackVersion &&
      updatedStatus !== EPipelineStatus.Creating &&
      updatedStatus !== EPipelineStatus.Updating &&
      updatedStatus !== EPipelineStatus.Deleting
    ) {
      stackIndicatorType = 'warning';
    } else {
      stackIndicatorType = CLOUDFORMATION_STATUS_MAP[stackStatus] ?? 'pending';
    }
    return stackIndicatorType;
  };

  return (
    <Popover
      dismissButton={false}
      position="right"
      size="large"
      triggerType="custom"
      content={
        loadingStatus ? (
          <Spinner />
        ) : (
          <SpaceBetween direction="vertical" size="xs">
            {stackStatusList.map((element) => {
              return (
                <div className="flex flex-1" key={element.stackType}>
                  <StatusIndicator
                    type={getStackStatusIndicatorType(
                      element.stackTemplateVersion,
                      element.stackStatus
                    )}
                  >
                    <b>{element.stackType}</b>(
                    {element.stackStatus ?? t('status.pending')})
                    {element.stackStatus && (
                      <span className="ml-5">
                        <Link
                          external
                          href={buildCloudFormationStackLink(
                            pipelineRegion,
                            element.stackName
                          )}
                        >
                          {t('pipeline:detail.stackDetails')}
                        </Link>
                      </span>
                    )}
                  </StatusIndicator>
                </div>
              );
            })}
          </SpaceBetween>
        )
      }
    >
      <StatusIndicator type={indicatorType}>
        <span className="stack-status">{t(displayStatus)}</span>
      </StatusIndicator>
    </Popover>
  );
};

export default PipelineStatus;
