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
  TopNavigation,
  TopNavigationProps,
} from '@cloudscape-design/components';
import { AppContext } from 'context/AppContext';
import { SystemInfoContext } from 'context/SystemInfoContext';
import { UserContext } from 'context/UserContext';
import React, { useContext, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CLICK_STREAM_USER_DATA,
  DEFAULT_ZH_LANG,
  EN_TEXT,
  LANGUAGE_ITEMS,
  PROJECT_CONFIG_JSON,
  ZH_LANGUAGE_LIST,
  ZH_TEXT,
} from 'ts/const';
import { buildUpdateCloudFormationStackLink } from 'ts/url';
import { defaultStr, getUserInfoFromLocalStorage, isAdminRole } from 'ts/utils';

interface IHeaderProps {
  user: any;
  signOut: any;
}

const Header: React.FC<IHeaderProps> = (props: IHeaderProps) => {
  const { t, i18n } = useTranslation();
  const { user, signOut } = props;
  const [displayName, setDisplayName] = useState('');
  const [fullLogoutUrl, setFullLogoutUrl] = useState('');
  const appConfig = useContext(AppContext);
  const currentUser = useContext(UserContext) ?? getUserInfoFromLocalStorage();
  const systemInfo = useContext(SystemInfoContext);

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
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
        id_token_hint: user?.id_token,
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
        text: defaultStr(t('header.solutionLibrary')),
        href: 'https://aws.amazon.com/solutions/',
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
            window.localStorage.removeItem(CLICK_STREAM_USER_DATA);
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
          href: '/',
          title: defaultStr(t('header.solution')),
        }}
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
    </header>
  );
};

export default Header;
