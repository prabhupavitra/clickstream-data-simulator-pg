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
  SideNavigation,
  SideNavigationProps,
} from '@cloudscape-design/components';
import { UserContext } from 'context/UserContext';
import React, { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { buildDocumentLink } from 'ts/url';
import {
  getUserInfoFromLocalStorage,
  isAdminRole,
  isAnalystRole,
} from 'ts/utils';

interface INavigationProps {
  activeHref: string;
}

const Navigation: React.FC<INavigationProps> = (props: INavigationProps) => {
  const { activeHref } = props;
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const currentUser = useContext(UserContext) ?? getUserInfoFromLocalStorage();

  const navHeader = {
    text: t('name'),
    href: isAnalystRole(currentUser?.roles) ? '/analytics' : '/',
  };
  const pipelineNavItems: SideNavigationProps.Item[] = [
    { type: 'link', text: t('nav.home'), href: '/' },
    { type: 'link', text: t('nav.projects'), href: '/projects' },
    {
      type: 'link',
      text: t('nav.analyticsStudio'),
      href: '/analytics',
      external: true,
      info: (
        <Popover
          header={
            t('analytics:information.introducingAnalyticsHeader') ??
            'Introducing analytics'
          }
          content={
            <div>
              {t('analytics:information.introducingAnalyticsContent')}
              <br />
              <Link
                href={buildDocumentLink(i18n.language, '/analytics/')}
                variant="primary"
              >
                {t('learnMore')}
              </Link>
            </div>
          }
        >
          <Link variant="info"> {t('new')}</Link>
        </Popover>
      ),
    },
    {
      text: t('nav.operation'),
      type: 'section',
      defaultExpanded: true,
      items: [{ type: 'link', text: t('nav.monitorAlerts'), href: '/alarms' }],
    },
    {
      text: t('nav.tools'),
      type: 'section',
      defaultExpanded: true,
      items: [{ type: 'link', text: t('nav.plugins'), href: '/plugins' }],
    },
  ];
  const systemNavItems: SideNavigationProps.Item[] = [
    {
      text: t('nav.system'),
      type: 'section',
      defaultExpanded: true,
      items: [{ type: 'link', text: t('nav.user'), href: '/user' }],
    },
  ];
  const docNavItems: SideNavigationProps.Item[] = [
    { type: 'divider' },
    {
      type: 'link',
      text: t('nav.doc'),
      href: buildDocumentLink(i18n.language, '/'),
      external: true,
    },
  ];

  const getNavItems = () => {
    if (isAdminRole(currentUser?.roles)) {
      return [...pipelineNavItems, ...systemNavItems, ...docNavItems];
    } else if (isAnalystRole(currentUser?.roles)) {
      return [...pipelineNavItems, ...docNavItems];
    } else {
      return [
        ...pipelineNavItems.slice(0, 2),
        ...pipelineNavItems.slice(3),
        ...docNavItems,
      ];
    }
  };

  return (
    <SideNavigation
      header={navHeader}
      items={getNavItems()}
      activeHref={activeHref}
      onFollow={(e) => {
        if (!e.detail.external) {
          e.preventDefault();
          navigate(e.detail.href);
        }
      }}
    />
  );
};

export default Navigation;
