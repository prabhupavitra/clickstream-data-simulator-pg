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
  ButtonDropdownProps,
  Flashbar,
  FlashbarProps,
  Select,
  SelectProps,
  TopNavigation,
  TopNavigationProps,
} from '@cloudscape-design/components';
import { getProjectList } from 'apis/project';
import { IProjectSelectItem } from 'components/eventselect/AnalyticsType';
import { AppContext } from 'context/AppContext';
import { SystemInfoContext } from 'context/SystemInfoContext';
import { UserContext } from 'context/UserContext';
import { useLocalStorage } from 'pages/common/use-local-storage';
import React, { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import {
  ANALYTICS_INFO_KEY,
  ANALYTICS_NAV_ITEM,
  DEFAULT_ZH_LANG,
  EN_TEXT,
  LANGUAGE_ITEMS,
  PROJECT_CONFIG_JSON,
  ZH_LANGUAGE_LIST,
  ZH_TEXT,
} from 'ts/const';
import { buildDocumentLink, buildUpdateCloudFormationStackLink } from 'ts/url';
import {
  defaultStr,
  getProjectAppFromOptions,
  getUserInfoFromLocalStorage,
  isAdminRole,
} from 'ts/utils';

interface IHeaderProps {
  user: any;
  signOut: any;
}

const AnalyticsHeader: React.FC<IHeaderProps> = (props: IHeaderProps) => {
  const { t, i18n } = useTranslation();
  const { user, signOut } = props;
  const { projectId, appId } = useParams();
  const [displayName, setDisplayName] = useState('');
  const [fullLogoutUrl, setFullLogoutUrl] = useState('');
  const [allProjectOptions, setAllProjectOptions] = useState<
    SelectProps.OptionGroup[]
  >([]);
  const [selectedOption, setSelectedOption] = useState<any>(null);
  const [analyticsInfo, setAnalyticsInfo] = useLocalStorage(
    ANALYTICS_INFO_KEY,
    {
      projectId: '',
      projectName: '',
      appId: '',
      appName: '',
    }
  );
  const [items, setItems] = useState<FlashbarProps.MessageDefinition[]>([]);
  const appConfig = useContext(AppContext);
  const currentUser = useContext(UserContext) ?? getUserInfoFromLocalStorage();
  const systemInfo = useContext(SystemInfoContext);

  const getRedirectUrl = (projectId: string, appId: string) => {
    const navItem = localStorage.getItem(ANALYTICS_NAV_ITEM) ?? 'dashboards';
    return `/analytics/${projectId}/app/${appId}/${navItem}`;
  };

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  const getSelectLabel = (label: string, analysisStudioEnabled: boolean) => {
    if (!analysisStudioEnabled) {
      return `${label} (${t('analytics:labels.analyticsStudioNotAvailable')})`;
    }
    return label;
  };

  const getSelectOptions = (element: IProject) => {
    const options: IProjectSelectItem[] = [];
    if (!element.applications) {
      return options;
    }
    for (const app of element.applications) {
      options.push({
        label: app.name,
        value: `${element.id}-${app.appId}`,
        projectId: element.id,
        projectName: element.name,
        appId: app.appId,
        appName: app.name,
      });
    }
    return options;
  };

  const showWarningMessage = (type: FlashbarProps.Type, message: string) => {
    setItems([
      {
        type: type,
        content: message,
        dismissible: true,
        onDismiss: () => setItems([]),
        id: 'message',
      },
    ]);
  };

  const setSelectOptionFromParams = (
    projectOptions: SelectProps.OptionGroup[]
  ) => {
    if (projectId && appId) {
      const option = getProjectAppFromOptions(projectId, appId, projectOptions);
      if (!option) {
        showWarningMessage(
          'error',
          `${t('analytics:valid.errorProjectOrApp')}${projectId} / ${appId}`
        );
        setSelectedOption(null);
      } else if (option.disabled) {
        showWarningMessage(
          'warning',
          `${t(
            'analytics:valid.notSupportProjectOrApp'
          )}${projectId} / ${appId}`
        );
        setSelectedOption(null);
      } else {
        setSelectedOption({
          label: `${option.projectName} / ${option.appName}`,
          value: `${option.projectId}_${option.appId}`,
        });
        if (
          analyticsInfo.projectId !== option.projectId ||
          analyticsInfo.appId !== option.appId
        ) {
          setAnalyticsInfo({
            projectId: defaultStr(option.projectId),
            projectName: defaultStr(option.projectName),
            appId: defaultStr(option.appId),
            appName: defaultStr(option.appName),
          });
        }
      }
    }
  };

  const listProjects = async () => {
    try {
      const { success, data }: ApiResponse<ResponseTableData<IProject>> =
        await getProjectList({
          pageNumber: 1,
          pageSize: 9999,
        });
      if (success) {
        const projectOptions: SelectProps.OptionGroup[] = data.items.map(
          (element) => ({
            label: getSelectLabel(
              element.name,
              element.analysisStudioEnabled ?? false
            ),
            value: element.id,
            disabled: !element.analysisStudioEnabled,
            options: getSelectOptions(element),
          })
        );
        setAllProjectOptions(projectOptions);
        setSelectOptionFromParams(projectOptions);
      }
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    setDisplayName(
      user?.profile?.email ||
        user?.profile?.name ||
        user?.profile?.preferred_username ||
        user?.profile?.nickname ||
        user?.profile?.sub ||
        ''
    );
    listProjects();
  }, [user]);

  useEffect(() => {
    if (ZH_LANGUAGE_LIST.includes(i18n.language)) {
      changeLanguage(DEFAULT_ZH_LANG);
    }
    const configJSONObj: ConfigType = localStorage.getItem(PROJECT_CONFIG_JSON)
      ? JSON.parse(localStorage.getItem(PROJECT_CONFIG_JSON) ?? '')
      : {};
    if (configJSONObj.oidc_logout_url) {
      const redirectUrl = configJSONObj.oidc_redirect_url.replace(
        '/signin',
        ''
      );
      const queryParams = new URLSearchParams({
        client_id: configJSONObj.oidc_client_id,
        id_token_hint: user.id_token,
        logout_uri: redirectUrl,
        redirect_uri: redirectUrl,
        post_logout_redirect_uri: redirectUrl,
      });
      const logoutUrl = new URL(configJSONObj.oidc_logout_url);
      logoutUrl.search = queryParams.toString();
      setFullLogoutUrl(decodeURIComponent(logoutUrl.toString()));
    }
  }, []);

  const getNotifyItem = () => {
    let updateNotifyItem: ButtonDropdownProps.ItemOrGroup = {
      id: 'no-update',
      disabled: true,
      text: defaultStr(t('header.noNotification')),
    };

    if (systemInfo?.hasUpdate) {
      if (isAdminRole(currentUser?.roles))
        updateNotifyItem = {
          id: 'update-available',
          href: appConfig?.solution_region
            ? buildUpdateCloudFormationStackLink(
                appConfig.solution_region,
                systemInfo?.stackId,
                systemInfo?.templateUrl
              )
            : '',
          text: defaultStr(
            t('header.updateAvailable1', {
              version: systemInfo?.remoteVersion,
            })
          ),
          external: true,
          externalIconAriaLabel: '(opens in AWS console)',
        };
      else {
        updateNotifyItem = {
          id: 'update-available',
          disabled: true,
          text: defaultStr(
            t('header.updateAvailable2', {
              version: systemInfo?.remoteVersion,
            })
          ),
        };
      }
    }

    return updateNotifyItem;
  };
  const getNavItems = () => {
    const updateNotifyItem = getNotifyItem();

    return [
      {
        type: 'button',
        text: defaultStr(t('header.analyticsDocumentation')),
        href: buildDocumentLink(i18n.language, '/'),
        external: true,
      },
      {
        type: 'menu-dropdown',
        text: ZH_LANGUAGE_LIST.includes(i18n.language) ? ZH_TEXT : EN_TEXT,
        title: 'Language',
        ariaLabel: 'settings',
        onItemClick: (item) => {
          changeLanguage(item.detail.id);
          window.location.reload();
        },
        items:
          i18n.language === DEFAULT_ZH_LANG
            ? [...LANGUAGE_ITEMS].reverse()
            : LANGUAGE_ITEMS,
      },
      {
        type: 'menu-dropdown',
        iconName: 'notification',
        title: '',
        ariaLabel: 'Notifications (unread)',
        badge: systemInfo?.hasUpdate,
        items: [updateNotifyItem],
      },
      {
        type: 'menu-dropdown',
        text: displayName,
        description: displayName,
        iconName: 'user-profile',
        onItemClick: (item) => {
          if (item.detail.id === 'signout') {
            if (fullLogoutUrl) {
              signOut?.();
              window.location.href = fullLogoutUrl;
            }
            signOut?.();
          }
        },
        items: [{ id: 'signout', text: defaultStr(t('header.signOut')) }],
      },
    ] as ReadonlyArray<TopNavigationProps.Utility>;
  };

  return (
    <header id="h">
      <TopNavigation
        identity={{
          href: '/analytics',
          title: defaultStr(t('header.analyticsStudio')),
        }}
        search={
          <Select
            selectedOption={selectedOption}
            onChange={({ detail }) => {
              const option = detail.selectedOption as IProjectSelectItem;
              setSelectedOption({
                label: `${option.projectName} / ${option.appName}`,
                value: `${option.projectId}-${option.appId}`,
              });
              setAnalyticsInfo({
                projectId: defaultStr(option.projectId),
                projectName: defaultStr(option.projectName),
                appId: defaultStr(option.appId),
                appName: defaultStr(option.appName),
              });
              window.location.href = getRedirectUrl(
                defaultStr(option.projectId),
                defaultStr(option.appId)
              );
            }}
            options={allProjectOptions}
          />
        }
        utilities={getNavItems()}
        i18nStrings={{
          searchIconAriaLabel: defaultStr(t('header.search')),
          searchDismissIconAriaLabel: defaultStr(t('header.closeSearch')),
          overflowMenuTriggerText: defaultStr(t('header.more')),
          overflowMenuTitleText: defaultStr(t('header.all')),
          overflowMenuBackIconAriaLabel: defaultStr(t('header.back')),
          overflowMenuDismissIconAriaLabel: defaultStr(t('header.closeMenu')),
        }}
      />
      <div className="flex center">
        <Flashbar items={items} />
      </div>
    </header>
  );
};

export default AnalyticsHeader;
