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

import { Alert, AppLayout } from '@cloudscape-design/components';
import { getProjectList } from 'apis/project';
import Loading from 'components/common/Loading';
import AnalyticsLayout from 'components/layouts/AnalyticsLayout';
import AnalyticsNavigation from 'components/layouts/AnalyticsNavigation';
import { t } from 'i18next';
import { useLocalStorage } from 'pages/common/use-local-storage';
import React, { useEffect, useState } from 'react';
import { AuthContextProps } from 'react-oidc-context';
import { ANALYTICS_INFO_KEY } from 'ts/const';

interface AnalyticsHomeProps {
  auth: AuthContextProps;
}

interface AppType {
  projectId: string;
  projectName: string;
  appId: string;
  appName: string;
}

const AnalyticsHome: React.FC<AnalyticsHomeProps> = (
  props: AnalyticsHomeProps
) => {
  const [loading, setLoading] = useState<boolean>(true);
  const { auth } = props;
  const [analyticsInfo, setAnalyticsInfo] = useLocalStorage(
    ANALYTICS_INFO_KEY,
    {
      projectId: '',
      projectName: '',
      appId: '',
      appName: '',
    }
  );

  const redirectToProjectApp = (apps: AppType[]) => {
    // data already in local storage and match in app list
    if (
      analyticsInfo.projectId &&
      analyticsInfo.appId &&
      apps.some(
        (item) =>
          item.projectId === analyticsInfo.projectId &&
          item.appId === analyticsInfo.appId
      )
    ) {
      window.location.href = `/analytics/${analyticsInfo.projectId}/app/${analyticsInfo.appId}/dashboards`;
    } else if (apps.length > 0) {
      setAnalyticsInfo(apps[0]);
      window.location.href = `/analytics/${apps[0].projectId}/app/${apps[0].appId}/dashboards`;
    }
  };

  const gotoProjectApp = async () => {
    setLoading(true);
    try {
      const apps: AppType[] = [];
      const { success, data }: ApiResponse<ResponseTableData<IProject>> =
        await getProjectList({
          pageNumber: 1,
          pageSize: 9999,
        });
      if (success) {
        for (const project of data.items) {
          if (project.applications && project.analysisStudioEnabled) {
            for (const app of project.applications) {
              apps.push({
                projectId: project.id,
                projectName: project.name,
                appId: app.appId,
                appName: app.name,
              });
            }
          }
        }
      }
      if (apps.length > 0) {
        redirectToProjectApp(apps);
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.log(error);
      setLoading(false);
    }
  };

  useEffect(() => {
    gotoProjectApp();
  }, []);

  if (loading) {
    return <Loading isPage />;
  }

  return (
    <AnalyticsLayout auth={auth}>
      <div className="flex">
        <AnalyticsNavigation activeHref={`/analytics`} />
        <div className="flex-1">
          <AppLayout
            toolsHide
            navigationHide
            content={
              <Alert
                statusIconAriaLabel="Error"
                type="error"
                header={t('analytics:noDataAvailableTitle')}
              >
                {t('analytics:noDataAvailableMessage')}
              </Alert>
            }
            headerSelector="#header"
          />
        </div>
      </div>
    </AnalyticsLayout>
  );
};

export default AnalyticsHome;
