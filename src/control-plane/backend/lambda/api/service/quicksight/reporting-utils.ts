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

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AnalysisType,
  AttributionModelType,
  ExploreAttributionTimeWindowType,
  ExploreComputeMethod,
  ExploreConversionIntervalType,
  ExploreLocales,
  ExplorePathNodeType,
  ExplorePathSessionDef,
  ExploreRelativeTimeUnit,
  ExploreRequestAction,
  ExploreTimeScopeType,
  ExploreVisualName,
  MetadataValueType,
  QuickSightChartType,
  DATASET_ADMIN_PERMISSION_ACTIONS,
  QUICKSIGHT_DATASET_INFIX,
  QUICKSIGHT_RESOURCE_NAME_PREFIX,
  QUICKSIGHT_TEMP_RESOURCE_NAME_PREFIX,
  DEFAULT_TIMEZONE,
  OUTPUT_REPORTING_QUICKSIGHT_REDSHIFT_DATA_API_ROLE_ARN,
  OUTPUT_REPORTING_QUICKSIGHT_REDSHIFT_ENDPOINT_ADDRESS,
  sleep,
  OUTPUT_REPORTING_QUICKSIGHT_REDSHIFT_DATABASE_NAME,
} from '@aws/clickstream-base-lib';
import {
  CreateDataSetCommandOutput, QuickSight,
  ColumnGroup,
  TransformOperation,
  ColumnTag,
  InputColumn,
  FilterControl,
  FilterGroup,
  ParameterDeclaration,
  Visual,
  DashboardVersionDefinition,
  DataSetIdentifierDeclaration,
  ColumnConfiguration,
  SheetDefinition,
  GeoSpatialDataRole,
  InputColumnDataType,
  DataSetImportMode,
} from '@aws-sdk/client-quicksight';
import { RedshiftData, StatusString } from '@aws-sdk/client-redshift-data';
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts';
import Mustache from 'mustache';
import { v4 as uuidv4 } from 'uuid';
import { DataSetProps } from './dashboard-ln';
import { ReportingCheck } from './reporting-check';
import { AttributionTouchPoint, ColumnAttribute, Condition, EVENT_USER_VIEW, EventAndCondition, GroupingCondition, PairEventAndCondition, SQLParameters, buildColNameWithPrefix, buildConditionProps } from './sql-builder';
import { AttributionSQLParameters } from './sql-builder-attribution';
import { PipelineStackType } from '../../common/model-ln';
import { logger } from '../../common/powertools';
import { SDKClient } from '../../common/sdk-client';
import { getStackOutputFromPipelineStatus } from '../../common/utils';
import i18next from '../../i18n';
import { IPipeline } from '../../model/pipeline';


const sdkClient: SDKClient = new SDKClient();

export interface VisualProps {
  readonly sheetId: string;
  readonly name: ExploreVisualName;
  readonly visualId: string;
  readonly visual: Visual;
  readonly dataSetIdentifierDeclaration: DataSetIdentifierDeclaration[];
  readonly filterControl?: FilterControl;
  readonly parameterDeclarations?: ParameterDeclaration[];
  readonly filterGroup?: FilterGroup;
  readonly eventCount?: number;
  readonly columnConfigurations?: ColumnConfiguration[];
  readonly colSpan?: number;
  readonly rowSpan?: number;
}

export interface DashboardAction {
  readonly action: 'ADD' | 'UPDATE' | 'DELETE';
  readonly requestAction: ExploreRequestAction;
  readonly visuals: VisualProps[];
  readonly dashboardDef: DashboardVersionDefinition;
}

export interface DashboardCreateParameters {
  readonly region: string;
  readonly allowedDomain: string;
  readonly quickSight: {
    readonly dataSourceArn: string;
  };
}

export interface VisualMapProps {
  readonly name: ExploreVisualName;
  readonly id: string;
  readonly embedUrl?: string;
}

export interface CheckParamsStatus {
  readonly success: boolean;
  readonly message: string;
}

export interface CreateDashboardResult {
  readonly dashboardId: string;
  readonly dashboardName: string;
  readonly dashboardArn: string;
  readonly dashboardVersion: number;
  readonly dashboardEmbedUrl: string;
  readonly analysisId: string;
  readonly analysisName: string;
  readonly analysisArn: string;
  readonly sheetId: string;
  readonly visualIds: VisualMapProps[];
}

export interface VisualRelatedDefParams {
  readonly filterControl?: FilterControl;
  readonly parameterDeclarations?: ParameterDeclaration[];
  readonly filterGroup?: FilterGroup;
  readonly columnConfigurations?: FilterGroup;
}

export interface VisualRelatedDefParams {
  readonly filterControl?: FilterControl;
  readonly parameterDeclarations?: ParameterDeclaration[];
  readonly filterGroup?: FilterGroup;
  readonly columnConfigurations?: FilterGroup;
}

export interface VisualRelatedDefProps {
  readonly timeScopeType: ExploreTimeScopeType;
  readonly sheetId: string;
  readonly visualId: string;
  readonly viewName: string;
  readonly lastN?: number;
  readonly timeUnit?: ExploreRelativeTimeUnit;
  readonly timeStart?: Date;
  readonly timeEnd?: Date;
}

export interface DashboardTitleProps {
  readonly title: string;
  readonly subTitle: string;
  readonly tableTitle: string;
}

export interface DashboardDefProps {
  def: DashboardVersionDefinition;
  name?: string;
}

export type MustacheBaseType = {
  visualId: string;
  dataSetIdentifier: string;
  title: string;
  subTitle?: string;
  smalMultiplesFieldId?: string;
}

export type MustachePathAnalysisType = MustacheBaseType & {
  sourceFieldId: string;
  targetFieldId: string;
  weightFieldId: string;
}

export type MustacheFunnelAnalysisType = MustacheBaseType & {
  dateDimFieldId?: string;
  dimFieldId: string;
  measureFieldId: string;
  dateGranularity?: string;
  hierarchyId?: string;
}

export type MustacheEventAnalysisType = MustacheBaseType & {
  dateDimFieldId: string;
  catDimFieldId: string;
  catMeasureFieldId: string;
  dateGranularity?: string;
  hierarchyId?: string;
}

export type MustacheEventTableAnalysisType = MustacheBaseType & {
  dateDimFieldId: string;
  nameDimFieldId: string;
}

export type MustacheAttributionAnalysisType = MustacheBaseType & {
  touchPointNameFieldId: string;
  totalTriggerCountFieldId: string;
  triggerCountFieldId: string;
  contributionFieldId: string;
  contributionRateFieldId: string;
  totalConversionCountFieldId: string;
}

export type MustacheRetentionAnalysisType = MustacheBaseType & {
  dateDimFieldId: string;
  catDimFieldId: string;
  numberMeasureFieldId: string;
  dateGranularity?: string;
  hierarchyId?: string;
}

export type MustacheFilterGroupType = {
  dataSetIdentifier: string;
  sheetId: string;
  filterGroupId: string;
  filterId: string;
}

export type MustacheRelativeDateFilterGroupType = {
  dataSetIdentifier: string;
  sheetId: string;
  filterGroupId: string;
  filterId: string;
  lastN: number;
  dateGranularity?: string;
}

export const funnelVisualColumns: InputColumn[] = [
  {
    Name: 'event_name',
    Type: 'STRING',
  },
];

export const eventVisualColumns: InputColumn[] = [
  {
    Name: 'event_date',
    Type: 'DATETIME',
  },
  {
    Name: 'event_name',
    Type: 'STRING',
  },
  {
    Name: 'Count',
    Type: 'STRING',
  },
];

export const pathAnalysisVisualColumns: InputColumn[] = [
  {
    Name: 'event_date',
    Type: 'DATETIME',
  },
  {
    Name: 'source',
    Type: 'STRING',
  },
  {
    Name: 'target',
    Type: 'STRING',
  },
  {
    Name: 'x_id',
    Type: 'STRING',
  },
];

export const retentionAnalysisVisualColumns: InputColumn[] = [
  {
    Name: 'grouping',
    Type: 'STRING',
  },
  {
    Name: 'start_event_date',
    Type: 'DATETIME',
  },
  {
    Name: 'event_date',
    Type: 'DATETIME',
  },
  {
    Name: 'retention',
    Type: 'DECIMAL',
  },
];

export const attributionVisualColumns: InputColumn[] = [
  {
    Name: 'Trigger Count',
    Type: 'DECIMAL',
  },
  {
    Name: 'Touch Point Name',
    Type: 'STRING',
  },
  {
    Name: 'Number of Total Conversion',
    Type: 'DECIMAL',
  },
  {
    Name: 'Number of Triggers with Conversion',
    Type: 'DECIMAL',
  },
  {
    Name: 'Contribution(number/sum...value)',
    Type: 'DECIMAL',
  },
  {
    Name: 'Contribution Rate',
    Type: 'DECIMAL',
  },
];

export const createDataSet = async (quickSight: QuickSight, awsAccountId: string | undefined, publishUserArn: string,
  dataSourceArn: string,
  props: DataSetProps, requestAction: ExploreRequestAction)
: Promise<CreateDataSetCommandOutput|undefined> => {

  try {
    const datasetId = _getDataSetId(requestAction);

    let colGroups: ColumnGroup[] = [];
    if (props.columnGroups !== undefined) {
      for (const columnsGroup of props.columnGroups ) {
        colGroups.push({
          GeoSpatialColumnGroup: {
            Name: columnsGroup.geoSpatialColumnGroupName,
            Columns: columnsGroup.geoSpatialColumnGroupColumns,
          },
        });
      }
    }

    let dataTransforms: TransformOperation[] = [];
    let needLogicalMap = false;
    if (props.tagColumnOperations !== undefined) {
      needLogicalMap = true;
      for (const tagColOperation of props.tagColumnOperations ) {
        const tags: ColumnTag[] = [];
        for (const role of tagColOperation.columnGeographicRoles) {
          tags.push({
            ColumnGeographicRole: role as GeoSpatialDataRole,
          });
        }
        dataTransforms.push({
          TagColumnOperation: {
            ColumnName: tagColOperation.columnName,
            Tags: tags,
          },
        });
      }
    }

    if (props.projectedColumns !== undefined) {
      needLogicalMap = true;
      dataTransforms.push({
        ProjectOperation: {
          ProjectedColumns: props.projectedColumns,
        },
      });
    }

    let logicalMap = undefined;
    if (needLogicalMap) {
      logicalMap = {
        LogicalTable1: {
          Alias: 'Alias_LogicalTable1',
          Source: {
            PhysicalTableId: 'PhyTable1',
          },
          DataTransforms: dataTransforms,
        },
      };
    }

    logger.info('start to create dataset');
    const datasetPermissionActions = [
      {
        Principal: publishUserArn,
        Actions: DATASET_ADMIN_PERMISSION_ACTIONS,
      },
    ];
    const dataset = await quickSight.createDataSet({
      AwsAccountId: awsAccountId,
      DataSetId: datasetId,
      Name: datasetId,
      ImportMode: props.useSpice === 'yes' ? DataSetImportMode.SPICE : DataSetImportMode.DIRECT_QUERY,
      Permissions: requestAction === ExploreRequestAction.PUBLISH ? datasetPermissionActions : undefined,
      PhysicalTableMap: {
        PhyTable1: {
          CustomSql: {
            DataSourceArn: dataSourceArn,
            Name: props.tableName,
            SqlQuery: props.customSql,
            Columns: props.columns,
          },
        },
      },
      LogicalTableMap: needLogicalMap ? logicalMap : undefined,
      ColumnGroups: colGroups.length > 0 ? colGroups : undefined,
      DataSetUsageConfiguration: {
        DisableUseAsDirectQuerySource: false,
        DisableUseAsImportedSource: false,
      },
    });

    logger.info(`create dataset finished. Id: ${datasetId}`);

    return dataset;

  } catch (err: any) {
    logger.error(`Create QuickSight dataset failed due to: ${(err as Error).message}`);
    throw err;
  }
};

const _getDataSetId = (requestAction: ExploreRequestAction) : string => {
  let datasetId = `${QUICKSIGHT_RESOURCE_NAME_PREFIX}${QUICKSIGHT_DATASET_INFIX}${uuidv4().replace(/-/g, '')}`;
  if (requestAction === ExploreRequestAction.PREVIEW) {
    datasetId = `${QUICKSIGHT_TEMP_RESOURCE_NAME_PREFIX}${uuidv4().replace(/-/g, '')}`;
  }
  return datasetId;
};

export const getDashboardDefinitionFromArn = async (quickSight: QuickSight, awsAccountId: string | undefined, dashboardId: string)
: Promise<DashboardDefProps> => {
  const dashboard = await quickSight.describeDashboardDefinition({
    AwsAccountId: awsAccountId,
    DashboardId: dashboardId,
  });

  return {
    name: dashboard.Name,
    def: dashboard.Definition!,
  };
};

export const getAnalysisNameFromId = async (quickSight: QuickSight, awsAccountId: string, analysisId: string)
: Promise<string | undefined> => {
  const analysis = await quickSight.describeAnalysis({
    AwsAccountId: awsAccountId,
    AnalysisId: analysisId,
  });

  return analysis.Analysis?.Name;
};

export function applyChangeToDashboard(dashboardAction: DashboardAction) : DashboardVersionDefinition {
  try {
    if (dashboardAction.action === 'ADD') {
      return addVisuals(dashboardAction.visuals, dashboardAction.dashboardDef, dashboardAction.requestAction);
    }
    return dashboardAction.dashboardDef;
  } catch (err) {
    logger.error(`The dashboard was not changed due to ${(err as Error).message}`);
    return dashboardAction.dashboardDef;
  }
};

function addVisuals(visuals: VisualProps[], dashboardDef: DashboardVersionDefinition, requestAction: string) : DashboardVersionDefinition {

  // add visuals to sheet
  for (const visual of visuals) {
    logger.info('start to add visual');

    const sheet = findElementWithPropertyValue(dashboardDef, 'Sheets', 'SheetId', visual.sheetId) as SheetDefinition;
    if ( sheet !== undefined) {
      //add visual to sheet
      const charts = sheet.Visuals!;
      charts.push(visual.visual);

      _addDataSetAndFilterConfiguration(sheet, dashboardDef, visual, requestAction);

      //add filter group and column configuration
      _addFilterGroupAndColumnConfiguration(dashboardDef, visual, requestAction);

      // visual layout
      _addVisualLayout(sheet, visual, requestAction);
    }
  }

  return dashboardDef;
};

function _addDataSetAndFilterConfiguration(sheet: SheetDefinition, dashboardDef: DashboardVersionDefinition,
  visual: VisualProps, requestAction: string) {
  //add dataset configuration
  const configs = dashboardDef.DataSetIdentifierDeclarations!;
  if (visual.dataSetIdentifierDeclaration) {
    configs.push(...visual.dataSetIdentifierDeclaration);
  }

  //add filter
  if (!sheet.FilterControls) {
    sheet.FilterControls = [];
  }
  const controls = sheet.FilterControls;
  if (visual.filterControl && requestAction === ExploreRequestAction.PUBLISH) {
    controls.push(visual.filterControl);
  }

  //add parameters
  const parameters = dashboardDef.ParameterDeclarations!;
  if (visual.parameterDeclarations) {
    parameters.push(...visual.parameterDeclarations);
  }

}

function _addFilterGroupAndColumnConfiguration(dashboardDef: DashboardVersionDefinition, visual: VisualProps, requestAction: string) {
  const filterGroups = dashboardDef.FilterGroups!;
  if (visual.filterGroup && requestAction === ExploreRequestAction.PUBLISH) {
    filterGroups.push(visual.filterGroup);
  }

  if (visual.columnConfigurations) {
    if (dashboardDef.ColumnConfigurations) {
      dashboardDef.ColumnConfigurations?.push(...visual.columnConfigurations);
    } else {
      dashboardDef.ColumnConfigurations = visual.columnConfigurations;
    }
  }
}

function _addVisualLayout(sheet: any, visual: VisualProps, requestAction: string) {
  const layout = findKthElement(sheet, 'Layouts', 1) as Array<any>;
  const elements = findElementByPath(layout, 'Configuration.GridLayout.Elements') as Array<any>;

  const layoutControl = JSON.parse(readFileSync(join(__dirname, './templates/layout-control.json')).toString('utf-8'));
  const visualControl = JSON.parse(readFileSync(join(__dirname, './templates/layout-visual.json')).toString('utf-8'));

  if (elements.length > 0) {
    const lastElement = elements.at(elements.length - 1);
    layoutControl.RowIndex = lastElement.RowIndex + lastElement.RowSpan;
    visualControl.RowIndex = lastElement.RowIndex + lastElement.RowSpan + layoutControl.RowSpan;
  }

  if (visual.filterControl && requestAction === ExploreRequestAction.PUBLISH) {
    const firstObj = findFirstChild(visual.filterControl);
    layoutControl.ElementId = firstObj.FilterControlId;
    elements.push(layoutControl);
  }

  visualControl.RowSpan = visual.rowSpan ?? 12;
  visualControl.ColumnSpan = visual.colSpan ?? 36;

  if (visual.eventCount) {
    visualControl.RowSpan = visual.rowSpan ?? visual.eventCount * 3;
  }

  visualControl.ElementId = findFirstChild(visual.visual).VisualId;
  elements.push(visualControl);
}

export async function getCredentialsFromRole(stsClient: STSClient, roleArn: string) {
  try {
    const assumeRoleCommand = new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: 'redshift-data-api-role',
    });

    const response = await stsClient.send(assumeRoleCommand);
    const credentials = response.Credentials;

    return credentials;
  } catch (error) {
    logger.error('Error occurred while assuming role:', error as Error);
    throw error;
  }
}

export function getFunnelVisualDef(visualId: string, viewName: string, titleProps: DashboardTitleProps,
  quickSightChartType: QuickSightChartType, groupColumn: string, groupCondition: GroupingCondition | undefined) : Visual {

  if (quickSightChartType === QuickSightChartType.FUNNEL) {
    return _getFunnelChartVisualDef(visualId, viewName, titleProps);
  } else if (quickSightChartType === QuickSightChartType.BAR) {
    return _getFunnelBarChartVisualDef(visualId, viewName, titleProps, groupColumn, groupCondition);
  } else {
    const errorMessage = `Funnel analysis: unsupported quicksight chart type ${quickSightChartType}`;
    logger.warn(errorMessage);
    throw new Error(errorMessage);
  }
}

function _getFunnelChartVisualDef(visualId: string, viewName: string, titleProps: DashboardTitleProps) : Visual {

  const visualDef = readFileSync(join(__dirname, './templates/funnel-funnel-chart.json')).toString('utf-8');
  const mustacheFunnelAnalysisType: MustacheFunnelAnalysisType = {
    visualId,
    dataSetIdentifier: viewName,
    dimFieldId: uuidv4(),
    measureFieldId: uuidv4(),
    title: titleProps.title,
    subTitle: titleProps.subTitle,
  };

  return JSON.parse(Mustache.render(visualDef, mustacheFunnelAnalysisType)) as Visual;
}

function _getFunnelBarChartVisualDef(visualId: string, viewName: string, titleProps: DashboardTitleProps,
  groupColumn: string, groupCondition: GroupingCondition | undefined) : Visual {

  const props = _getMultipleVisualProps(isValidGroupingCondition(groupCondition));

  const visualDef = readFileSync(join(__dirname, `./templates/funnel-bar-chart${props.suffix}.json`)).toString('utf-8');
  const mustacheFunnelAnalysisType: MustacheFunnelAnalysisType = {
    visualId,
    dataSetIdentifier: viewName,
    dateDimFieldId: uuidv4(),
    dimFieldId: uuidv4(),
    measureFieldId: uuidv4(),
    dateGranularity: groupColumn,
    hierarchyId: uuidv4(),
    title: titleProps.title,
    subTitle: titleProps.subTitle,
    smalMultiplesFieldId: props.smalMultiplesFieldId,
  };

  const visual = JSON.parse(Mustache.render(visualDef, mustacheFunnelAnalysisType)) as Visual;
  if (isValidGroupingCondition(groupCondition)) {
    const smallMultiples = visual.BarChartVisual?.ChartConfiguration?.FieldWells?.BarChartAggregatedFieldWells?.SmallMultiples!;
    for (const colName of buildColNameWithPrefix(groupCondition).colNames) {
      const fieldId = uuidv4();
      smallMultiples.push({
        CategoricalDimensionField: {
          FieldId: fieldId,
          Column: {
            DataSetIdentifier: viewName,
            ColumnName: colName,
          },
        },
      });
    }
  }

  return visual;
}

export function getFunnelTableVisualDef(visualId: string, viewName: string, eventNames: string[],
  titleProps: DashboardTitleProps, groupColumn: string, groupingColNames: string[]): Visual {

  const visualDef = JSON.parse(readFileSync(join(__dirname, './templates/funnel-table-chart.json')).toString('utf-8')) as Visual;
  visualDef.TableVisual!.VisualId = visualId;

  visualDef.TableVisual!.Title!.FormatText = {
    PlainText: titleProps.tableTitle,
  };

  const groupBy = visualDef.TableVisual!.ChartConfiguration!.FieldWells!.TableAggregatedFieldWells?.GroupBy!;
  const sortConfiguration = visualDef.TableVisual!.ChartConfiguration!.SortConfiguration!;
  const fieldOptions = visualDef.TableVisual?.ChartConfiguration?.FieldOptions?.SelectedFieldOptions!;
  const sortFieldId = uuidv4();

  groupBy.push({
    CategoricalDimensionField: {
      FieldId: sortFieldId,
      Column: {
        DataSetIdentifier: viewName,
        ColumnName: groupColumn,
      },
    },
  });
  fieldOptions.push({
    FieldId: sortFieldId,
    Width: '120px',
  });

  for (const colName of groupingColNames) {
    const groupColFieldId = uuidv4();
    groupBy.push({
      CategoricalDimensionField: {
        FieldId: groupColFieldId,
        Column: {
          DataSetIdentifier: viewName,
          ColumnName: colName,
        },
      },
    });
    fieldOptions.push({
      FieldId: groupColFieldId,
      Width: '120px',
    });
  }

  const maxIndex = eventNames.length - 1;
  for (const [index, eventName] of eventNames.entries()) {
    const fieldId = uuidv4();
    groupBy.push({
      NumericalDimensionField: {
        FieldId: fieldId,
        Column: {
          DataSetIdentifier: viewName,
          ColumnName: `${index+1}_${eventName}`,
        },
      },
    });

    fieldOptions.push({
      FieldId: fieldId,
      Width: '120px',
    });

    if (index === 0) {
      continue;
    }

    const fieldIdRate = uuidv4();
    groupBy.push({
      NumericalDimensionField: {
        FieldId: fieldIdRate,
        Column: {
          DataSetIdentifier: viewName,
          ColumnName: `${index+1}_${eventName}_rate`,
        },
        FormatConfiguration: {
          FormatConfiguration: {
            PercentageDisplayFormatConfiguration: {
              Suffix: '%',
              SeparatorConfiguration: {
                DecimalSeparator: 'DOT',
                ThousandsSeparator: {
                  Symbol: 'COMMA',
                  Visibility: 'VISIBLE',
                },
              },
              NegativeValueConfiguration: {
                DisplayMode: 'NEGATIVE',
              },
            },
          },
        },
      },
    });

    fieldOptions.push({
      FieldId: fieldIdRate,
      Width: '120px',
    });

    if (index === maxIndex) {
      const totalRateId = uuidv4();
      groupBy.push({
        NumericalDimensionField: {
          FieldId: totalRateId,
          Column: {
            DataSetIdentifier: viewName,
            ColumnName: 'total_conversion_rate',
          },
          FormatConfiguration: {
            FormatConfiguration: {
              PercentageDisplayFormatConfiguration: {
                Suffix: '%',
                SeparatorConfiguration: {
                  DecimalSeparator: 'DOT',
                  ThousandsSeparator: {
                    Symbol: 'COMMA',
                    Visibility: 'VISIBLE',
                  },
                },
                NegativeValueConfiguration: {
                  DisplayMode: 'NEGATIVE',
                },
              },
            },
          },
        },
      });

      fieldOptions.push({
        FieldId: totalRateId,
        Width: '120px',
      });
    }
  }

  sortConfiguration.RowSort = [
    {
      FieldSort: {
        FieldId: sortFieldId,
        Direction: 'DESC',
      },
    },
  ];

  return visualDef;
}

export async function getVisualRelatedDefs(props: VisualRelatedDefProps, locale: string) : Promise<VisualRelatedDefParams> {

  const filterControlId = uuidv4();
  const sourceFilterId = uuidv4();
  const parameterSuffix = uuidv4().replace(/-/g, '');

  let filterControl: FilterControl;
  const parameterDeclarations = [];
  let filterGroup: FilterGroup;
  const t = await i18next.changeLanguage(locale);
  const filterInfoText = t('dashboard.filter.scope');

  if (props.timeScopeType === ExploreTimeScopeType.FIXED) {

    filterControl = JSON.parse(readFileSync(join(__dirname, './templates/filter-control-datetime.json')).toString('utf-8')) as FilterControl;
    filterControl.DateTimePicker!.FilterControlId = filterControlId;
    filterControl.DateTimePicker!.Title = 'event_date between';
    filterControl.DateTimePicker!.SourceFilterId = sourceFilterId;
    filterControl.DateTimePicker!.DisplayOptions!.InfoIconLabelOptions!.InfoIconText = filterInfoText;

    const filterGroupDef = readFileSync(join(__dirname, './templates/filter-group.template')).toString('utf-8');
    const mustacheFilterGroupType: MustacheFilterGroupType = {
      sheetId: props.sheetId,
      dataSetIdentifier: props.viewName,
      filterGroupId: uuidv4(),
      filterId: sourceFilterId,
    };
    filterGroup = JSON.parse(Mustache.render(filterGroupDef, mustacheFilterGroupType)) as FilterGroup;
    filterGroup.Filters![0].TimeRangeFilter!.RangeMinimumValue!.StaticValue = new Date(props.timeStart!);
    filterGroup.Filters![0].TimeRangeFilter!.RangeMaximumValue!.StaticValue = new Date(props.timeEnd!);

  } else {
    filterControl = JSON.parse(readFileSync(join(__dirname, './templates/filter-control-relative-datetime.json')).toString('utf-8')) as FilterControl;
    filterControl.RelativeDateTime!.FilterControlId = filterControlId;
    filterControl.RelativeDateTime!.Title = 'event_date';
    filterControl.RelativeDateTime!.SourceFilterId = sourceFilterId;
    filterControl.RelativeDateTime!.DisplayOptions!.InfoIconLabelOptions!.InfoIconText = filterInfoText;

    const parameterDeclarationStart = JSON.parse(readFileSync(join(__dirname, './templates/datetime-parameter.json')).toString('utf-8')) as ParameterDeclaration;
    parameterDeclarationStart.DateTimeParameterDeclaration!.Name = `dateStart${parameterSuffix}`;
    parameterDeclarationStart.DateTimeParameterDeclaration!.TimeGranularity = 'DAY';
    parameterDeclarationStart.DateTimeParameterDeclaration!.DefaultValues!.RollingDate!.Expression = `addDateTime(-${props.lastN}, '${props.timeUnit}', truncDate('${props.timeUnit}', now()))`;
    parameterDeclarationStart.DateTimeParameterDeclaration!.DefaultValues!.StaticValues = undefined;
    parameterDeclarations.push(parameterDeclarationStart);

    const parameterDeclarationEnd = JSON.parse(readFileSync(join(__dirname, './templates/datetime-parameter.json')).toString('utf-8')) as ParameterDeclaration;
    parameterDeclarationEnd.DateTimeParameterDeclaration!.Name = `dateEnd${parameterSuffix}`;
    parameterDeclarationEnd.DateTimeParameterDeclaration!.TimeGranularity = 'DAY';
    parameterDeclarationEnd.DateTimeParameterDeclaration!.DefaultValues!.RollingDate!.Expression = 'addDateTime(1, \'DD\', truncDate(\'DD\', now()))';
    parameterDeclarationEnd.DateTimeParameterDeclaration!.DefaultValues!.StaticValues = undefined;
    parameterDeclarations.push(parameterDeclarationEnd);

    const filterGroupDef = readFileSync(join(__dirname, './templates/filter-group-relative.template')).toString('utf-8');
    const mustacheRelativeDateFilterGroupType: MustacheRelativeDateFilterGroupType = {
      sheetId: props.sheetId,
      dataSetIdentifier: props.viewName,
      filterGroupId: uuidv4(),
      filterId: sourceFilterId,
      lastN: props.lastN!,
      dateGranularity: getQuickSightUnitFromTimeUnit(props.timeUnit),
    };

    filterGroup = JSON.parse(Mustache.render(filterGroupDef, mustacheRelativeDateFilterGroupType)) as FilterGroup;
  }

  return {
    parameterDeclarations,
    filterControl,
    filterGroup,
  };
}

export function getFunnelTableVisualRelatedDefs(viewName: string, colNames: string[]) : ColumnConfiguration[] {

  const columnConfigurations: ColumnConfiguration[] = [];
  for (const col of colNames) {
    const config = JSON.parse(readFileSync(join(__dirname, './templates/percentage-column-config.json')).toString('utf-8')) as ColumnConfiguration;
    config.Column!.ColumnName = col;
    config.Column!.DataSetIdentifier = viewName;
    columnConfigurations.push(config);
  }

  return columnConfigurations;
}

export function getEventChartVisualDef(visualId: string, viewName: string, titleProps: DashboardTitleProps,
  quickSightChartType: QuickSightChartType, groupColumn: string, groupCondition: GroupingCondition | undefined) : Visual {

  if (quickSightChartType !== QuickSightChartType.LINE && quickSightChartType !== QuickSightChartType.BAR) {
    const errorMessage = `Event analysis: unsupported quicksight chart type ${quickSightChartType}`;
    logger.warn(errorMessage);
    throw new Error(errorMessage);
  }

  const props = _getMultipleVisualProps(isValidGroupingCondition(groupCondition));

  const templatePath = `./templates/event-${quickSightChartType}-chart${props.suffix}.json`;
  const visualDef = readFileSync(join(__dirname, templatePath)).toString('utf-8');
  const mustacheEventAnalysisType: MustacheEventAnalysisType = {
    visualId,
    dataSetIdentifier: viewName,
    dateDimFieldId: uuidv4(),
    catDimFieldId: uuidv4(),
    catMeasureFieldId: uuidv4(),
    hierarchyId: uuidv4(),
    dateGranularity: groupColumn,
    title: titleProps.title,
    subTitle: titleProps.subTitle,
    smalMultiplesFieldId: props.smalMultiplesFieldId,
  };

  const visual = JSON.parse(Mustache.render(visualDef, mustacheEventAnalysisType)) as Visual;

  if (isValidGroupingCondition(groupCondition)) {
    let smallMultiples = visual.BarChartVisual?.ChartConfiguration?.FieldWells?.BarChartAggregatedFieldWells?.SmallMultiples;
    if (smallMultiples === undefined) {
      smallMultiples = visual.LineChartVisual?.ChartConfiguration?.FieldWells?.LineChartAggregatedFieldWells?.SmallMultiples;
    }
    for (const colName of buildColNameWithPrefix(groupCondition).colNames) {
      const fieldId = uuidv4();
      smallMultiples!.push({
        CategoricalDimensionField: {
          FieldId: fieldId,
          Column: {
            DataSetIdentifier: viewName,
            ColumnName: colName,
          },
        },
      });
    }
  }

  return visual;
}

export function getAttributionTableVisualDef(visualId: string, viewName: string, titleProps: DashboardTitleProps,
  quickSightChartType: QuickSightChartType) : Visual {

  const templatePath = `./templates/attribution-${quickSightChartType}-chart.json`;
  const visualDef = readFileSync(join(__dirname, templatePath)).toString('utf-8');
  const mustacheAttributionAnalysisType: MustacheAttributionAnalysisType = {
    visualId,
    dataSetIdentifier: viewName,
    touchPointNameFieldId: uuidv4(),
    totalTriggerCountFieldId: uuidv4(),
    triggerCountFieldId: uuidv4(),
    contributionFieldId: uuidv4(),
    contributionRateFieldId: uuidv4(),
    totalConversionCountFieldId: uuidv4(),
    title: titleProps.title,
    subTitle: titleProps.subTitle,
  };

  return JSON.parse(Mustache.render(visualDef, mustacheAttributionAnalysisType)) as Visual;
}

export function getEventPivotTableVisualDef(visualId: string, viewName: string,
  titleProps: DashboardTitleProps, groupColumn: string, groupCondition: GroupingCondition | undefined) : Visual {

  const props = _getMultipleVisualProps(isValidGroupingCondition(groupCondition));

  const visualDef = readFileSync(join(__dirname, `./templates/event-pivot-table-chart${props.suffix}.json`)).toString('utf-8');
  const mustacheEventAnalysisType: MustacheEventAnalysisType = {
    visualId,
    dataSetIdentifier: viewName,
    dateDimFieldId: uuidv4(),
    catDimFieldId: uuidv4(),
    catMeasureFieldId: uuidv4(),
    dateGranularity: groupColumn,
    title: titleProps.tableTitle,
  };

  const visual = JSON.parse(Mustache.render(visualDef, mustacheEventAnalysisType)) as Visual;

  if (isValidGroupingCondition(groupCondition)) {
    const rows = visual.PivotTableVisual?.ChartConfiguration?.FieldWells?.PivotTableAggregatedFieldWells?.Rows!;
    for (const colName of buildColNameWithPrefix(groupCondition).colNames) {
      const fieldId = uuidv4();
      rows.push({
        CategoricalDimensionField: {
          FieldId: fieldId,
          Column: {
            DataSetIdentifier: viewName,
            ColumnName: colName,
          },
        },
      });
    }
  }

  return visual;
}

export function getEventPropertyCountPivotTableVisualDef(visualId: string, viewName: string,
  titleProps: DashboardTitleProps, groupColumn: string, grouppingColName?: string[]) : Visual {

  const props = _getMultipleVisualProps(grouppingColName !== undefined);

  const visualDef = readFileSync(join(__dirname, `./templates/event-pivot-table-chart${props.suffix}.json`)).toString('utf-8');
  const mustacheEventAnalysisType: MustacheEventAnalysisType = {
    visualId,
    dataSetIdentifier: viewName,
    dateDimFieldId: uuidv4(),
    catDimFieldId: uuidv4(),
    catMeasureFieldId: uuidv4(),
    dateGranularity: groupColumn,
    title: titleProps.tableTitle,
    smalMultiplesFieldId: props.smalMultiplesFieldId,
  };

  const visual = JSON.parse(Mustache.render(visualDef, mustacheEventAnalysisType)) as Visual;

  const fieldWells = visual.PivotTableVisual!.ChartConfiguration!.FieldWells!;
  if (grouppingColName !== undefined) {
    const rows = fieldWells.PivotTableAggregatedFieldWells!.Rows!;
    for (const colName of grouppingColName) {
      rows.push({
        CategoricalDimensionField: {
          FieldId: uuidv4(),
          Column: {
            DataSetIdentifier: viewName,
            ColumnName: colName,
          },
        },
      });
    }
  }

  const values = fieldWells.PivotTableAggregatedFieldWells?.Values!;
  values[0] = {
    NumericalMeasureField: {
      FieldId: uuidv4(),
      Column: {
        DataSetIdentifier: viewName,
        ColumnName: 'count/aggregation amount',
      },
      AggregationFunction: {
        SimpleNumericalAggregation: 'SUM',
      },
    },
  };

  return visual;
}

export function getPathAnalysisChartVisualDef(visualId: string, viewName: string, titleProps: DashboardTitleProps) : Visual {
  const visualDef = readFileSync(join(__dirname, './templates/path-sankey-chart.json')).toString('utf-8');
  const mustachePathAnalysisType: MustachePathAnalysisType = {
    visualId,
    dataSetIdentifier: viewName,
    sourceFieldId: uuidv4(),
    targetFieldId: uuidv4(),
    weightFieldId: uuidv4(),
    title: titleProps.title,
    subTitle: titleProps.subTitle,
  };

  return JSON.parse(Mustache.render(visualDef, mustachePathAnalysisType)) as Visual;
}


export function getQuickSightDataType(metadataValueType: MetadataValueType) : InputColumnDataType {

  switch (metadataValueType) {
    case MetadataValueType.STRING:
      return 'STRING';
    case MetadataValueType.BOOLEAN:
      return 'BOOLEAN';
    case MetadataValueType.NUMBER:
    case MetadataValueType.DOUBLE:
    case MetadataValueType.FLOAT:
      return 'DECIMAL';
    case MetadataValueType.INTEGER:
      return 'INTEGER';
    default:
      return 'STRING';
  }
}

export function getRetentionChartVisualDef(visualId: string, viewName: string,
  titleProps: DashboardTitleProps,
  quickSightChartType: QuickSightChartType, groupCondition: GroupingCondition | undefined) : Visual {

  if (quickSightChartType !== QuickSightChartType.LINE && quickSightChartType !== QuickSightChartType.BAR) {
    const errorMessage = `Retention analysis: unsupported quicksight chart type ${quickSightChartType}`;
    logger.warn(errorMessage);
    throw new Error(errorMessage);
  }

  const props = _getMultipleVisualProps(isValidGroupingCondition(groupCondition));

  const templatePath = `./templates/retention-${quickSightChartType}-chart${props.suffix}.json`;
  const visualDef = readFileSync(join(__dirname, templatePath)).toString('utf-8');
  const mustacheRetentionAnalysisType: MustacheRetentionAnalysisType = {
    visualId,
    dataSetIdentifier: viewName,
    catDimFieldId: uuidv4(),
    dateDimFieldId: uuidv4(),
    numberMeasureFieldId: uuidv4(),
    hierarchyId: uuidv4(),
    title: titleProps.title,
    subTitle: titleProps.subTitle,
    smalMultiplesFieldId: props.smalMultiplesFieldId,
  };

  const visual = JSON.parse(Mustache.render(visualDef, mustacheRetentionAnalysisType)) as Visual;

  if (isValidGroupingCondition(groupCondition)) {
    let smallMultiples = visual.BarChartVisual?.ChartConfiguration?.FieldWells?.BarChartAggregatedFieldWells?.SmallMultiples;
    if (smallMultiples === undefined) {
      smallMultiples = visual.LineChartVisual?.ChartConfiguration?.FieldWells?.LineChartAggregatedFieldWells?.SmallMultiples;
    }
    for (const colName of buildColNameWithPrefix(groupCondition).colNames) {
      const fieldId = uuidv4();
      smallMultiples!.push({
        CategoricalDimensionField: {
          FieldId: fieldId,
          Column: {
            DataSetIdentifier: viewName,
            ColumnName: colName,
          },
        },
      });
    }
  }

  return visual;
}

export function getRetentionPivotTableVisualDef(visualId: string, viewName: string,
  titleProps: DashboardTitleProps, groupCondition: GroupingCondition | undefined) : Visual {

  const props = _getMultipleVisualProps(isValidGroupingCondition(groupCondition));

  const visualDef = readFileSync(join(__dirname, `./templates/retention-pivot-table-chart${props.suffix}.json`)).toString('utf-8');
  const mustacheRetentionAnalysisType: MustacheRetentionAnalysisType = {
    visualId,
    dataSetIdentifier: viewName,
    catDimFieldId: uuidv4(),
    dateDimFieldId: uuidv4(),
    numberMeasureFieldId: uuidv4(),
    title: titleProps.tableTitle,
    smalMultiplesFieldId: props.smalMultiplesFieldId,
  };

  const visual = JSON.parse(Mustache.render(visualDef, mustacheRetentionAnalysisType)) as Visual;
  const rows = visual.PivotTableVisual!.ChartConfiguration!.FieldWells?.PivotTableAggregatedFieldWells?.Rows!;
  const existRows = [...rows];

  if (isValidGroupingCondition(groupCondition)) {
    for (const [index, colName] of buildColNameWithPrefix(groupCondition).colNames.entries()) {
      const fieldId = uuidv4();
      rows[index] = {
        CategoricalDimensionField: {
          FieldId: fieldId,
          Column: {
            DataSetIdentifier: viewName,
            ColumnName: colName,
          },
        },
      };
    }
    rows.push(...existRows);
  }

  return visual;
}

export function buildEventConditionPropsFromEvents(eventAndConditions: EventAndCondition[] | AttributionTouchPoint[]) {

  let hasEventAttribute = false;
  const eventAttributes: ColumnAttribute[] = [];
  let hasEventNonNestAttribute = false;
  const eventNonNestAttributes: ColumnAttribute[] = [];

  for (const eventCondition of eventAndConditions) {
    if (eventCondition.sqlCondition?.conditions !== undefined) {
      const allAttribute = buildConditionProps(eventCondition.sqlCondition?.conditions);
      hasEventAttribute = hasEventAttribute || allAttribute.hasEventAttribute;
      eventAttributes.push(...allAttribute.eventAttributes);

      hasEventNonNestAttribute = hasEventNonNestAttribute || allAttribute.hasEventNonNestAttribute;
      eventNonNestAttributes.push(...allAttribute.eventNonNestAttributes);
    }
  }

  return {
    hasEventAttribute,
    hasEventNonNestAttribute,
    eventAttributes,
    eventNonNestAttributes,
  };

}

function findElementByPath(jsonData: any, path: string): any {
  const pathKeys = path.split('.');

  for (const key of pathKeys) {
    if (jsonData && typeof jsonData === 'object' && key in jsonData) {
      jsonData = jsonData[key];
    } else {
      return undefined;
    }
  }

  return jsonData;
}

function findKthElement(jsonData: any, path: string, index: number): any {
  const pathKeys = path.split('.');

  for (const key of pathKeys) {
    if (jsonData && typeof jsonData === 'object' && key in jsonData) {
      jsonData = jsonData[key];
    } else {
      return undefined;
    }
  }

  if (Array.isArray(jsonData) && jsonData.length >= index) {
    return jsonData[index-1];
  } else {
    return undefined;
  }
}

function findFirstChild(jsonData: any): any {
  if (Array.isArray(jsonData)) {
    return undefined;
  } else if (jsonData && typeof jsonData === 'object') {
    for (const key in jsonData) {
      if (jsonData.hasOwnProperty(key)) {
        return jsonData[key];
      }
    }
  }
  return undefined;
}

function findElementWithPropertyValue(root: any, path: string, property: string, value: string): any {
  const jsonData = findElementByPath(root, path);
  if (Array.isArray(jsonData)) {
    for ( const e of jsonData) {
      if (e && typeof e === 'object' && property in e) {
        const v = e[property];
        if ((v as string) === value ) {
          return e;
        }
      }
    }
    return undefined;
  } else {
    return undefined;
  }
}

export function formatDateToYYYYMMDD(date: any): string {
  date = new Date(date);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `'${year.toString().trim()}-${month.trim()}-${day.trim()}'`;
}

export function getQuickSightUnitFromTimeUnit(timeUnit: string | undefined) : string {
  let unit = 'DAY';
  if (timeUnit == ExploreRelativeTimeUnit.WK) {
    unit = 'WEEK';
  } else if (timeUnit == ExploreRelativeTimeUnit.MM) {
    unit = 'MONTH';
  } else if (timeUnit == ExploreRelativeTimeUnit.YY) {
    unit = 'YEAR';
  }
  return unit;
}

export function getTempResourceName(resourceName: string, action: ExploreRequestAction) : string {
  if (action === ExploreRequestAction.PREVIEW) {
    return QUICKSIGHT_TEMP_RESOURCE_NAME_PREFIX + resourceName;
  }

  return resourceName;
}

export function getMondayOfLastNWeeks(currentDate: Date, cnt: number): Date {
  const dayOfWeek = currentDate.getDay(); // 0: Sunday, 1: Monday, ..., 6: Saturday
  const daysSinceLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Calculate days since last Monday
  const startDateOfLastNWeeks = new Date(currentDate);
  startDateOfLastNWeeks.setDate(currentDate.getDate() - (cnt*7) - daysSinceLastMonday);
  return startDateOfLastNWeeks;
}

export function getFirstDayOfLastNMonths(currentDate: Date, n: number): Date {
  const lastNMonths = new Date(currentDate);
  lastNMonths.setMonth(currentDate.getMonth() - n); // Subtract n months and add 1 to get the first day of the month
  lastNMonths.setDate(1); // Set the day to the first day of the month
  return lastNMonths;
}

export function getFirstDayOfLastNYears(currentDate: Date, cnt: number): Date {
  const currentYear = currentDate.getFullYear();
  return new Date(currentYear - cnt, 0, 1);
}

export async function getDashboardTitleProps(analysisType: AnalysisType, query: any) {

  const locale = query.locale ?? ExploreLocales.EN_US;
  const t = await i18next.changeLanguage(locale);
  let title = '';
  let subTitle = ' ';
  const tableTitle = query.chartTitle ? `${query.chartTitle} - ${t('dashboard.title.tableChart')}` : t('dashboard.title.tableChart');

  if (query.action === ExploreRequestAction.PUBLISH) {
    title = query.chartTitle;
    subTitle = (query.chartSubTitle === undefined || query.chartSubTitle === '') ? ' ' : query.chartSubTitle;
  } else {
    switch (analysisType) {
      case AnalysisType.FUNNEL:
        title = t('dashboard.title.funnelAnalysis');
        break;
      case AnalysisType.EVENT:
        title = t('dashboard.title.eventAnalysis');
        break;
      case AnalysisType.PATH:
        title = t('dashboard.title.pathAnalysis');
        break;
      case AnalysisType.RETENTION:
        title = t('dashboard.title.retentionAnalysis');
        break;
      case AnalysisType.ATTRIBUTION:
        title = t('dashboard.title.attributionAnalysis');
        break;
    }
  }

  return {
    title,
    subTitle,
    tableTitle,
  };
}

export function checkFunnelAnalysisParameter(params: any): CheckParamsStatus {

  const checkChain = new ReportingCheck(params);
  _checkCommonPartParameter(checkChain);

  if (params.specifyJoinColumn === undefined
    || params.eventAndConditions === undefined
    || params.groupColumn === undefined
    || (params.eventAndConditions !== undefined && params.eventAndConditions.length < 1)
  ) {
    return {
      success: false,
      message: 'Missing required parameter.',
    };
  }

  if (
    (params.specifyJoinColumn && params.joinColumn === undefined)
    || (params.conversionIntervalType === ExploreConversionIntervalType.CUSTOMIZE && params.conversionIntervalInSeconds === undefined)
  ) {
    return {
      success: false,
      message: 'At least missing one of following parameters [joinColumn,conversionIntervalInSeconds].',
    };
  }

  if (params.chartType !== QuickSightChartType.FUNNEL && params.chartType !== QuickSightChartType.BAR) {
    return {
      success: false,
      message: 'unsupported chart type',
    };
  }

  if (params.groupCondition !== undefined && params.chartType === QuickSightChartType.FUNNEL) {
    return {
      success: false,
      message: 'Grouping function is not supported for funnel type chart.',
    };
  }

  if (params.eventAndConditions.length < 2) {
    return {
      success: false,
      message: 'At least specify 2 event for funnel analysis',
    };
  }

  checkChain.NodesLimit();

  return checkChain.status;
}

export function checkAttributionAnalysisParameter(params: any): CheckParamsStatus {

  const checkChain = new ReportingCheck(params);
  _checkCommonPartParameter(checkChain);

  if (params.targetEventAndCondition === undefined
    || params.modelType === undefined
    || params.eventAndConditions === undefined
    || params.timeWindowType === undefined
  ) {
    return {
      success: false,
      message: 'Missing required parameter.',
    };
  }

  if (params.eventAndConditions.length < 1) {
    return {
      success: false,
      message: 'At least specify 1 event for attribution analysis',
    };
  }

  if (params.modelType === AttributionModelType.POSITION && (params.modelWeights === undefined || params.modelWeights.length < 1) ) {
    return {
      success: false,
      message: 'missing weights for attribution analysis',
    };
  }

  if (params.timeWindowType === ExploreAttributionTimeWindowType.CUSTOMIZE && params.timeWindowInSeconds === undefined) {
    return {
      success: false,
      message: 'missing time window parameter for attribution analysis',
    };
  }

  if (params.timeWindowType === ExploreAttributionTimeWindowType.CUSTOMIZE && params.timeWindowInSeconds !== undefined
    && params.timeWindowInSeconds > 10 * 365 * 24 * 60 * 60) {
    return {
      success: false,
      message: 'time window too long for attribution analysis, max is 10 years',
    };
  }

  if (params.computeMethod !== ExploreComputeMethod.EVENT_CNT && params.computeMethod !== ExploreComputeMethod.SUM_VALUE) {
    return {
      success: false,
      message: 'unsupported compute method for attribution analysis',
    };
  }

  return checkChain.status;
}

export function checkEventAnalysisParameter(params: any): CheckParamsStatus {

  const checkChain = new ReportingCheck(params);
  _checkCommonPartParameter(checkChain);

  if (params.eventAndConditions === undefined
    || params.groupColumn === undefined
    || (params.eventAndConditions !== undefined && params.eventAndConditions.length < 1)
  ) {
    return {
      success: false,
      message: 'Missing required parameter.',
    };
  }

  if (params.chartType !== QuickSightChartType.LINE && params.chartType !== QuickSightChartType.BAR) {
    return {
      success: false,
      message: 'unsupported chart type',
    };
  }

  return checkChain.status;
}

export function checkPathAnalysisParameter(params: any): CheckParamsStatus {

  const checkChain = new ReportingCheck(params);
  _checkCommonPartParameter(checkChain);

  if (params.eventAndConditions === undefined
    || params.pathAnalysis === undefined
  ) {
    return {
      success: false,
      message: 'Missing required parameter.',
    };
  }

  if (params.pathAnalysis.sessionType === ExplorePathSessionDef.CUSTOMIZE
     && params.pathAnalysis.lagSeconds === undefined
  ) {
    return {
      success: false,
      message: 'Missing required parameter [lagSeconds].',
    };
  }

  if (params.pathAnalysis.nodeType !== ExplorePathNodeType.EVENT
    && (params.pathAnalysis.nodes === undefined
        || params.pathAnalysis.platform === undefined
        || params.pathAnalysis.nodes.length <1)
  ) {
    return {
      success: false,
      message: 'At least missing one required parameter [nodes,platform].',
    };
  }

  if (params.chartType !== QuickSightChartType.SANKEY) {
    return {
      success: false,
      message: 'unsupported chart type',
    };
  }

  if (params.groupCondition !== undefined) {
    return {
      success: false,
      message: 'Grouping function is not supported for path analysis.',
    };
  }

  return checkChain.status;
}

export function checkRetentionAnalysisParameter(params: any): CheckParamsStatus {

  const checkChain = new ReportingCheck(params);
  _checkCommonPartParameter(checkChain);

  if (params.pairEventAndConditions === undefined
    || (params.pairEventAndConditions !== undefined && params.pairEventAndConditions.length < 1)
    || params.groupColumn === undefined
  ) {
    return {
      success: false,
      message: 'Missing required parameter.',
    };
  }

  if (params.chartType !== QuickSightChartType.LINE && params.chartType !== QuickSightChartType.BAR) {
    return {
      success: false,
      message: 'unsupported chart type.',
    };
  }

  const retentionJoinColumnResult = _checkRetentionJoinColumn(params.pairEventAndConditions);
  if (retentionJoinColumnResult !== undefined ) {
    return retentionJoinColumnResult;
  }

  return checkChain.status;
}

export function encodeQueryValueForSql(params: SQLParameters) {
  if (params.eventAndConditions !== undefined) {
    for (const item of (params.eventAndConditions)) {
      _encodeFilterValue(item.sqlCondition?.conditions);
      item.eventName = _encodeSqlSpecialChars(item.eventName);
    }
  }

  _encodeFilterValue(params.globalEventCondition?.conditions);

  if (params.pairEventAndConditions !== undefined) {
    for (const item of (params.pairEventAndConditions)) {
      _encodeFilterValue(item.startEvent.sqlCondition?.conditions);
      _encodeFilterValue(item.backEvent.sqlCondition?.conditions);

      item.startEvent.eventName = _encodeSqlSpecialChars(item.startEvent.eventName);
      item.backEvent.eventName = _encodeSqlSpecialChars(item.backEvent.eventName);
    }
  }
}

export function encodeAttributionQueryValueForSql(params: AttributionSQLParameters) {
  if (params.eventAndConditions !== undefined) {
    for (const item of (params.eventAndConditions)) {
      _encodeFilterValue(item.sqlCondition?.conditions);
      item.eventName = _encodeSqlSpecialChars(item.eventName);
    }
  }

  _encodeFilterValue(params.targetEventAndCondition?.sqlCondition?.conditions);
  params.targetEventAndCondition.eventName = _encodeSqlSpecialChars(params.targetEventAndCondition.eventName);

  _encodeFilterValue(params.globalEventCondition?.conditions);

}

function _encodeFilterValue(conditions: Condition[] | undefined) {
  if (conditions !== undefined) {
    for (const condition of conditions) {
      if (condition.dataType === MetadataValueType.STRING) {
        let values = [];
        for (const [index, value] of condition.value.entries()) {
          values[index] = _encodeSqlSpecialChars(value);
        }
        condition.value = values;
      }
    }
  }
}

function _encodeSqlSpecialChars(input: string): string {
  const sqlSpecialChars: { [key: string]: string } = {
    "'": "''",
  };

  const encodedString = input.replace(/\'/g, (match) => sqlSpecialChars[match]);

  return encodedString;
}

function _checkRetentionJoinColumn(pairEventAndConditions: PairEventAndCondition[]): CheckParamsStatus | void {
  const sameType = pairEventAndConditions.every((item) => {
    return (
      item.startEvent.retentionJoinColumn?.dataType ===
      item.backEvent.retentionJoinColumn?.dataType
    );
  });
  if (!sameType) {
    return {
      success: false,
      message: 'The data type for each set of associated parameter in retention analysis must be the same.',
    };
  }
}

function _checkCommonPartParameter(checkChain: ReportingCheck) {
  checkChain
    .CommonParameterRequired()
    .GroupCondition()
    .FilterTypeAndValue()
    .Condition()
    .TimeParameters()
    .TimeLargeThan10Years();
}


function _getMultipleVisualProps(hasGrouping: boolean) {
  let suffix = '';
  let smalMultiplesFieldId = undefined;
  if (hasGrouping) {
    suffix = '-multiple';
    smalMultiplesFieldId = uuidv4();
  }

  return {
    suffix,
    smalMultiplesFieldId,
  };
}

export function getTimezoneByAppId(pipeline: IPipeline | undefined, appId: string): string {
  if (!pipeline || !pipeline.timezone) {
    return DEFAULT_TIMEZONE;
  }
  return pipeline.timezone.find((tz) => tz.appId === appId)?.timezone ?? DEFAULT_TIMEZONE;
}

export function isValidGroupingCondition(groupCondition: GroupingCondition | undefined): boolean {

  if (groupCondition === undefined || groupCondition.conditions === undefined || groupCondition.conditions.length === 0) {
    return false;
  }

  for (const condition of groupCondition.conditions) {
    if (condition.property === undefined || condition.property === '') {
      return false;
    }
  }

  return true;
}

export async function warmupRedshift(pipeline: IPipeline, appId: string, executeId?:string): Promise<string | undefined> {
  const dataApiRole = getStackOutputFromPipelineStatus(
    pipeline.stackDetails ?? pipeline.status?.stackDetails,
    PipelineStackType.REPORTING,
    OUTPUT_REPORTING_QUICKSIGHT_REDSHIFT_DATA_API_ROLE_ARN);
  const redshiftEndpoint = getStackOutputFromPipelineStatus(
    pipeline.stackDetails ?? pipeline.status?.stackDetails,
    PipelineStackType.REPORTING,
    OUTPUT_REPORTING_QUICKSIGHT_REDSHIFT_ENDPOINT_ADDRESS);
  const redshiftDatabaseName = getStackOutputFromPipelineStatus(
    pipeline.stackDetails ?? pipeline.status?.stackDetails,
    PipelineStackType.REPORTING,
    OUTPUT_REPORTING_QUICKSIGHT_REDSHIFT_DATABASE_NAME);

  logger.debug(`Data Api Role: ${dataApiRole}, Redshift Endpoint: ${redshiftEndpoint}`);
  const workgroupName = redshiftEndpoint?.split('.')[0];
  if (!dataApiRole || !workgroupName || !redshiftDatabaseName) {
    logger.warn('Data Api Role, Workgroup Name or Database Name not found');
    return;
  }
  const redshiftType = redshiftEndpoint?.split('.')[3];
  if (redshiftType !== 'redshift-serverless') {
    return;
  }
  const redshiftData = sdkClient.RedshiftData(
    {
      region: pipeline.region,
    },
    dataApiRole,
  );
  const queryId = await waitExecuteWarmupStatement(
    redshiftData,
    workgroupName,
    'dev',
    `select * from ${redshiftDatabaseName}.${appId}.${EVENT_USER_VIEW} limit 1`,
    executeId,
  );
  return queryId;
}

export const waitExecuteWarmupStatement = async (
  redshiftData: RedshiftData,
  workgroupName: string,
  database: string,
  sql: string,
  executeId?: string) => {
  let queryId = executeId;
  if (!executeId) {
    const executeStatementOutput = await redshiftData.executeStatement({
      Sql: sql,
      WorkgroupName: workgroupName,
      Database: database,
      WithEvent: false,
    });
    queryId = executeStatementOutput.Id;
  }
  let describeStatementOutput = await redshiftData.describeStatement({
    Id: queryId,
  });
  logger.info(`Got statement query '${queryId}' with status: ${describeStatementOutput.Status} after submitting it`);
  let count = 0;
  while (describeStatementOutput.Status != StatusString.FINISHED &&
    describeStatementOutput.Status != StatusString.FAILED &&
    count < 30) {
    await sleep(500);
    count++;
    describeStatementOutput = await redshiftData.describeStatement({
      Id: queryId,
    });
    logger.info(`Got statement query '${queryId}' with status: ${describeStatementOutput.Status} in ${count * 500} Milliseconds`);
  }
  if (describeStatementOutput.Status == StatusString.FAILED) {
    logger.error(`Got statement query '${queryId}' with status: ${describeStatementOutput.Status} in ${count * 500} Milliseconds`, { describeStatementOutput });
    throw new Error(`Statement query '${queryId}' with status ${describeStatementOutput.Status}, error: ${describeStatementOutput.Error}, queryString: ${describeStatementOutput.QueryString}`);
  } else if (count >= 30) {
    logger.error('Timeout: wait status timeout: ' + describeStatementOutput.Status, { describeStatementOutput });
    return queryId;
  }
  return;
};
