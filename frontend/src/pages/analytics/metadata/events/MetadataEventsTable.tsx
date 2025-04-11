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

import { MetadataPlatform, MetadataSource } from '@aws/clickstream-base-lib';
import { Input } from '@cloudscape-design/components';
import { getMetadataEventsList, updateMetadataDisplay } from 'apis/analytics';
import { UserContext } from 'context/UserContext';
import { HelpPanelType } from 'context/reducer';
import React, { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { EVENT_DISPLAY_PREFIX, TABLE_FILTER_OPTIONS } from 'ts/const';
import {
  defaultStr,
  getUserInfoFromLocalStorage,
  isAnalystAuthorRole,
} from 'ts/utils';
import MetadataDataVolumeFC from '../comps/MetadataDataVolume';
import MetadataPlatformFC from '../comps/MetadataPlatform';
import MetadataSourceFC from '../comps/MetadataSource';
import MetadataTable from '../table/MetadataTable';
import { descriptionRegex, displayNameRegex } from '../table/table-config';

interface IEventTableItem {
  name: string;
  displayName: string;
  description: string;
  metadataSource: MetadataSource;
  hasData: boolean;
  platform: MetadataPlatform[];
  dataVolumeLastDay: number;
}

interface MetadataEventsTableProps {
  analysisStudioEnabled: boolean;
  setShowDetails: (show: boolean, data?: IMetadataType) => void;
}

const MetadataEventsTable: React.FC<MetadataEventsTableProps> = (
  props: MetadataEventsTableProps
) => {
  const { projectId, appId } = useParams();
  const { t } = useTranslation();
  const currentUser = useContext(UserContext) ?? getUserInfoFromLocalStorage();
  const { setShowDetails, analysisStudioEnabled } = props;

  const renderEditNameCell = (
    item: IEventTableItem,
    setValue: any,
    currentValue: string
  ) => {
    return (
      <Input
        autoFocus={true}
        value={currentValue ?? item.displayName}
        onChange={(event) => {
          setValue(event.detail.value);
        }}
        placeholder={defaultStr(t('tag.valuePlaceholder'))}
      />
    );
  };

  const renderEditDescCell = (
    item: IEventTableItem,
    setValue: any,
    currentValue: string
  ) => {
    return (
      <Input
        autoFocus={true}
        value={currentValue ?? item.description}
        onChange={(event) => {
          setValue(event.detail.value);
        }}
        placeholder={defaultStr(t('tag.valuePlaceholder'))}
      />
    );
  };

  const renderDataSource = (e: IEventTableItem) => {
    return <MetadataSourceFC source={e.metadataSource} />;
  };

  const renderPlatform = (e: IEventTableItem) => {
    return <MetadataPlatformFC platform={e.platform} />;
  };

  const renderLastDay = (e: IEventTableItem) => {
    return <MetadataDataVolumeFC dataVolume={e.dataVolumeLastDay} />;
  };

  const getDisplayNameEditConfig = () => {
    if (isAnalystAuthorRole(currentUser?.roles)) {
      return {
        validation(item: IEventTableItem, value: string) {
          return !displayNameRegex.test(value)
            ? undefined
            : t('tag.invalidInput');
        },
        editingCell: (item: IEventTableItem, { setValue, currentValue }: any) =>
          renderEditNameCell(item, setValue, currentValue),
      };
    }
  };

  const getDescriptionEditConfig = () => {
    if (isAnalystAuthorRole(currentUser?.roles)) {
      return {
        validation(item: IEventTableItem, value: string) {
          return !descriptionRegex.test(value)
            ? undefined
            : t('tag.invalidInput');
        },
        editingCell: (item: IEventTableItem, { setValue, currentValue }: any) =>
          renderEditDescCell(item, setValue, currentValue),
      };
    }
  };

  const COLUMN_DEFINITIONS = [
    {
      id: 'name',
      header: t('analytics:metadata.event.tableColumnName'),
      cell: (e: IEventTableItem) => {
        return e.name;
      },
    },
    {
      id: 'displayName',
      header: t('analytics:metadata.event.tableColumnDisplayName'),
      cell: (e: IEventTableItem) => {
        return e.displayName;
      },
      minWidth: 180,
      editConfig: getDisplayNameEditConfig(),
    },
    {
      id: 'description',
      header: t('analytics:metadata.event.tableColumnDescription'),
      cell: (e: IEventTableItem) => {
        return e.description;
      },
      minWidth: 180,
      editConfig: getDescriptionEditConfig(),
    },
    {
      id: 'metadataSource',
      header: t('analytics:metadata.event.tableColumnMetadataSource'),
      sortingField: 'metadataSource',
      cell: (e: IEventTableItem) => renderDataSource(e),
    },
    {
      id: 'platform',
      header: t('analytics:metadata.event.tableColumnPlatform'),
      sortingField: 'platform',
      cell: (e: IEventTableItem) => renderPlatform(e),
    },
    {
      id: 'dataVolumeLastDay',
      header: t('analytics:metadata.event.tableColumnDataVolumeLastDay'),
      sortingField: 'dataVolumeLastDay',
      cell: (e: IEventTableItem) => renderLastDay(e),
    },
  ];
  const CONTENT_DISPLAY = [
    { id: 'name', visible: true },
    { id: 'displayName', visible: true },
    { id: 'description', visible: true },
    { id: 'metadataSource', visible: true },
    { id: 'hasData', visible: true },
    { id: 'platform', visible: true },
    { id: 'dataVolumeLastDay', visible: true },
  ];
  const FILTERING_PROPERTIES = [
    {
      propertyLabel: t('analytics:metadata.event.tableColumnName'),
      key: 'name',
      groupValuesLabel: t('analytics:metadata.event.tableColumnName'),
      operators: TABLE_FILTER_OPTIONS,
    },
    {
      propertyLabel: t('analytics:metadata.event.tableColumnDisplayName'),
      key: 'displayName',
      groupValuesLabel: t('analytics:metadata.event.tableColumnDisplayName'),
      operators: TABLE_FILTER_OPTIONS,
    },
    {
      propertyLabel: t('analytics:metadata.event.tableColumnMetadataSource'),
      key: 'metadataSource',
      groupValuesLabel: t('analytics:metadata.event.tableColumnMetadataSource'),
      operators: TABLE_FILTER_OPTIONS,
    },
    {
      propertyLabel: t('analytics:metadata.event.tableColumnHasData'),
      key: 'hasData',
      groupValuesLabel: t('analytics:metadata.event.tableColumnHasData'),
      operators: TABLE_FILTER_OPTIONS,
    },
    {
      propertyLabel: t('analytics:metadata.event.tableColumnPlatform'),
      key: 'platform',
      groupValuesLabel: t('analytics:metadata.event.tableColumnPlatform'),
      operators: TABLE_FILTER_OPTIONS,
    },
  ];

  const listMetadataEvents = async () => {
    try {
      if (!projectId || !appId) {
        return [];
      }
      const { success, data }: ApiResponse<ResponseTableData<IMetadataEvent>> =
        await getMetadataEventsList({ projectId, appId });
      if (success) {
        return data.items;
      }
      return [];
    } catch (error) {
      return [];
    }
  };

  const updateMetadataEventInfo = async (newItem: IMetadataType) => {
    try {
      const { success, message }: ApiResponse<null> =
        await updateMetadataDisplay({
          id: `${EVENT_DISPLAY_PREFIX}${newItem.projectId}#${newItem.appId}#${newItem.name}`,
          projectId: newItem.projectId,
          appId: newItem.appId,
          displayName: newItem.displayName,
          description: newItem.description,
        });
      if (!success) {
        throw new Error(message);
      }
    } catch (error) {
      throw new Error('Edit error');
    }
  };

  return (
    <MetadataTable
      analysisStudioEnabled={analysisStudioEnabled}
      resourceName="Event"
      infoType={HelpPanelType.METADATA_EVENT_INFO}
      tableColumnDefinitions={COLUMN_DEFINITIONS}
      tableContentDisplay={CONTENT_DISPLAY}
      tableFilteringProperties={FILTERING_PROPERTIES}
      tableI18nStrings={{
        loadingText: t('analytics:labels.tableLoading') || 'Loading',
        emptyText: t('analytics:labels.tableEmpty'),
        headerTitle: t('analytics:metadata.event.title'),
        headerDescription: t('analytics:metadata.event.description'),
        headerRefreshButtonText: t('common:button.refreshMetadata'),
        filteringAriaLabel: t('analytics:metadata.event.filteringAriaLabel'),
        filteringPlaceholder: t(
          'analytics:metadata.event.filteringPlaceholder'
        ),
        groupPropertiesText: t('button.groupPropertiesText'),
        operatorsText: t('button.operatorsText'),
        clearFiltersText: t('button.clearFiltersText'),
        applyActionText: t('button.applyActionText'),
        useText: t('common:table.useText'),
        matchText: t('common:table.matchText'),
        matchesText: t('common:table.matchesText'),
      }}
      setShowDetails={setShowDetails}
      fetchDataFunc={listMetadataEvents}
      fetchUpdateFunc={updateMetadataEventInfo}
    ></MetadataTable>
  );
};

export default MetadataEventsTable;
