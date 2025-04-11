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

import { ExploreRequestAction, ExploreVisualName } from '@aws/clickstream-base-lib';
import { CategoricalAggregationFunction, OtherCategories, ResizeOption, SelectedTooltipType, SheetContentType, SortDirection, TooltipTitleType, Visibility } from '@aws-sdk/client-quicksight';
import { applyChangeToDashboard } from '../../service/quicksight/reporting-utils';

describe('QuickSight visual management test', () => {

  beforeEach(() => {
  });

  const dashboardDef =
  {
    DataSetIdentifierDeclarations: [],
    Sheets: [
      {
        SheetId: 'f43cdc10-0f41-4ad1-bd42-deb0f6dbeb64',
        Name: 'sheet1',
        FilterControls: [],
        Visuals: [],
        Layouts: [
          {
            Configuration: {
              GridLayout: {
                Elements: [],
                CanvasSizeOptions: {
                  ScreenCanvasSizeOptions: {
                    ResizeOption: ResizeOption.FIXED,
                    OptimizedViewPortWidth: '1600px',
                  },
                },
              },
            },
          },
        ],
        ContentType: SheetContentType.INTERACTIVE,
      },
    ],
    CalculatedFields: [],
    ParameterDeclarations: [],
    FilterGroups: [],
    AnalysisDefaults: {
      DefaultNewSheetConfiguration: {
        InteractiveLayoutConfiguration: {
          Grid: {
            CanvasSizeOptions: {
              ScreenCanvasSizeOptions: {
                ResizeOption: ResizeOption.FIXED,
                OptimizedViewPortWidth: '1600px',
              },
            },
          },
        },
        SheetContentType: SheetContentType.INTERACTIVE,
      },
    },
  };

  const visualContent =
  {
    FunnelChartVisual: {
      VisualId: 'e6105df1-3bd6-4d4d-9a44-f34d00fafea0',
      Title: {
        Visibility: Visibility.VISIBLE,
      },
      Subtitle: {
        Visibility: Visibility.VISIBLE,
      },
      ChartConfiguration: {
        FieldWells: {
          FunnelChartAggregatedFieldWells: {
            Category: [
              {
                CategoricalDimensionField: {
                  FieldId: 'e6105df1-3bd6-4d4d-9a44-f34d00fabbbb',
                  Column: {
                    DataSetIdentifier: 'testview0001',
                    ColumnName: 'event_name',
                  },
                },
              },
            ],
            Values: [
              {
                CategoricalMeasureField: {
                  FieldId: 'e6105df1-3bd6-4d4d-9a44-f34d00faaaaa',
                  Column: {
                    DataSetIdentifier: 'testview0001',
                    ColumnName: 'x_id',
                  },
                  AggregationFunction: CategoricalAggregationFunction.COUNT,
                },
              },
            ],
          },
        },
        SortConfiguration: {
          CategorySort: [
            {
              FieldSort: {
                FieldId: 'e6105df1-3bd6-4d4d-9a44-f34d00fabbbb',
                Direction: SortDirection.DESC,
              },
            },
            {
              FieldSort: {
                FieldId: 'e6105df1-3bd6-4d4d-9a44-f34d00faaaaa',
                Direction: SortDirection.DESC,
              },
            },
          ],
          CategoryItemsLimit: {
            OtherCategories: OtherCategories.INCLUDE,
          },
        },
        Tooltip: {
          TooltipVisibility: Visibility.VISIBLE,
          SelectedTooltipType: SelectedTooltipType.DETAILED,
          FieldBasedTooltip: {
            AggregationVisibility: Visibility.HIDDEN,
            TooltipTitleType: TooltipTitleType.PRIMARY_VALUE,
            TooltipFields: [
              {
                FieldTooltipItem: {
                  FieldId: 'e6105df1-3bd6-4d4d-9a44-f34d00fabbbb',
                  Visibility: Visibility.VISIBLE,
                },
              },
              {
                FieldTooltipItem: {
                  FieldId: 'e6105df1-3bd6-4d4d-9a44-f34d00faaaaa',
                  Visibility: Visibility.VISIBLE,
                },
              },
            ],
          },
        },
        DataLabelOptions: {
          Visibility: Visibility.VISIBLE,
          CategoryLabelVisibility: Visibility.VISIBLE,
          MeasureLabelVisibility: Visibility.VISIBLE,
        },
      },
      Actions: [

      ],
      ColumnHierarchies: [

      ],
    },
  }
  ;

  test('add visual to dashboard', () => {

    const dashboard = applyChangeToDashboard({
      action: 'ADD',
      requestAction: ExploreRequestAction.PUBLISH,
      visuals: [
        {
          sheetId: 'f43cdc10-0f41-4ad1-bd42-deb0f6dbeb64',
          name: ExploreVisualName.CHART,
          visualId: 'e6105df1-3bd6-4d4d-9a44-f34d00fafea0',
          visual: visualContent,
          dataSetIdentifierDeclaration: [{
            Identifier: 'clickstream_funnel_chart_view',
            DataSetArn: 'fakearn',
          }],
          filterControl: {
            DateTimePicker: {
              FilterControlId: 'ec48601c-4fa5-4219-a31b-ceaedfd9ad80',
              Title: 'event_date between',
              SourceFilterId: 'a4366267-b733-473a-962f-73acc694c2f7',
              Type: 'DATE_RANGE',
            },
          },
          parameterDeclarations: [
            {
              DateTimeParameterDeclaration: {
                Name: 'dateStart',
                DefaultValues: {
                  StaticValues: [],
                  RollingDate: {
                    Expression: "truncDate('DD', now())",
                  },
                },
                TimeGranularity: 'DAY',
              },
            },
            {
              DateTimeParameterDeclaration: {
                Name: 'dateEnd',
                DefaultValues: {
                  StaticValues: [],
                  RollingDate: {
                    Expression: "addDateTime(-1, 'DD', truncDate('DD', now()))",
                  },
                },
                TimeGranularity: 'DAY',
              },
            },
          ],
          filterGroup: {
            FilterGroupId: 'a4366267-b733-473a-962f-73acc694c2f7',
            Filters: [
              {
                TimeRangeFilter: {
                  FilterId: 'f51fec2f-f759-4e62-a356-fd21a24b75c9',
                  Column: {
                    DataSetIdentifier: 'clickstream_funnel_chart_view',
                    ColumnName: 'event_date',
                  },
                  NullOption: 'NON_NULLS_ONLY',
                  TimeGranularity: 'MINUTE',
                },
              },
            ],
            ScopeConfiguration: {
              SelectedSheets: {
                SheetVisualScopingConfigurations: [
                  {
                    SheetId: 'f43cdc10-0f41-4ad1-bd42-deb0f6dbeb64',
                    Scope: 'SELECTED_VISUALS',
                    VisualIds: [
                      'e6105df1-3bd6-4d4d-9a44-f34d00fafea0',
                    ],
                  },
                ],
              },
            },
            Status: 'ENABLED',
            CrossDataset: 'ALL_DATASETS',
          },
          eventCount: 5,
        },
      ],
      dashboardDef: dashboardDef,

    });

    expect(JSON.stringify(dashboard)).toEqual(JSON.stringify({
      DataSetIdentifierDeclarations: [
        {
          Identifier: 'clickstream_funnel_chart_view',
          DataSetArn: 'fakearn',
        },
      ],
      Sheets: [
        {
          SheetId: 'f43cdc10-0f41-4ad1-bd42-deb0f6dbeb64',
          Name: 'sheet1',
          FilterControls: [
            {
              DateTimePicker: {
                FilterControlId: 'ec48601c-4fa5-4219-a31b-ceaedfd9ad80',
                Title: 'event_date between',
                SourceFilterId: 'a4366267-b733-473a-962f-73acc694c2f7',
                Type: 'DATE_RANGE',
              },
            },
          ],
          Visuals: [
            {
              FunnelChartVisual: {
                VisualId: 'e6105df1-3bd6-4d4d-9a44-f34d00fafea0',
                Title: {
                  Visibility: 'VISIBLE',
                },
                Subtitle: {
                  Visibility: 'VISIBLE',
                },
                ChartConfiguration: {
                  FieldWells: {
                    FunnelChartAggregatedFieldWells: {
                      Category: [
                        {
                          CategoricalDimensionField: {
                            FieldId: 'e6105df1-3bd6-4d4d-9a44-f34d00fabbbb',
                            Column: {
                              DataSetIdentifier: 'testview0001',
                              ColumnName: 'event_name',
                            },
                          },
                        },
                      ],
                      Values: [
                        {
                          CategoricalMeasureField: {
                            FieldId: 'e6105df1-3bd6-4d4d-9a44-f34d00faaaaa',
                            Column: {
                              DataSetIdentifier: 'testview0001',
                              ColumnName: 'x_id',
                            },
                            AggregationFunction: 'COUNT',
                          },
                        },
                      ],
                    },
                  },
                  SortConfiguration: {
                    CategorySort: [
                      {
                        FieldSort: {
                          FieldId: 'e6105df1-3bd6-4d4d-9a44-f34d00fabbbb',
                          Direction: 'DESC',
                        },
                      },
                      {
                        FieldSort: {
                          FieldId: 'e6105df1-3bd6-4d4d-9a44-f34d00faaaaa',
                          Direction: 'DESC',
                        },
                      },
                    ],
                    CategoryItemsLimit: {
                      OtherCategories: 'INCLUDE',
                    },
                  },
                  Tooltip: {
                    TooltipVisibility: 'VISIBLE',
                    SelectedTooltipType: 'DETAILED',
                    FieldBasedTooltip: {
                      AggregationVisibility: 'HIDDEN',
                      TooltipTitleType: 'PRIMARY_VALUE',
                      TooltipFields: [
                        {
                          FieldTooltipItem: {
                            FieldId: 'e6105df1-3bd6-4d4d-9a44-f34d00fabbbb',
                            Visibility: 'VISIBLE',
                          },
                        },
                        {
                          FieldTooltipItem: {
                            FieldId: 'e6105df1-3bd6-4d4d-9a44-f34d00faaaaa',
                            Visibility: 'VISIBLE',
                          },
                        },
                      ],
                    },
                  },
                  DataLabelOptions: {
                    Visibility: 'VISIBLE',
                    CategoryLabelVisibility: 'VISIBLE',
                    MeasureLabelVisibility: 'VISIBLE',
                  },
                },
                Actions: [

                ],
                ColumnHierarchies: [

                ],
              },
            },
          ],
          Layouts: [
            {
              Configuration: {
                GridLayout: {
                  Elements: [
                    {
                      ElementId: 'ec48601c-4fa5-4219-a31b-ceaedfd9ad80',
                      ElementType: 'FILTER_CONTROL',
                      ColumnIndex: 0,
                      ColumnSpan: 8,
                      RowIndex: 0,
                      RowSpan: 4,
                    },
                    {
                      ElementId: 'e6105df1-3bd6-4d4d-9a44-f34d00fafea0',
                      ElementType: 'VISUAL',
                      ColumnIndex: 0,
                      ColumnSpan: 36,
                      RowIndex: 4,
                      RowSpan: 15,
                    },
                  ],
                  CanvasSizeOptions: {
                    ScreenCanvasSizeOptions: {
                      ResizeOption: 'FIXED',
                      OptimizedViewPortWidth: '1600px',
                    },
                  },
                },
              },
            },
          ],
          ContentType: 'INTERACTIVE',
        },
      ],
      CalculatedFields: [

      ],
      ParameterDeclarations: [
        {
          DateTimeParameterDeclaration: {
            Name: 'dateStart',
            DefaultValues: {
              StaticValues: [

              ],
              RollingDate: {
                Expression: "truncDate('DD', now())",
              },
            },
            TimeGranularity: 'DAY',
          },
        },
        {
          DateTimeParameterDeclaration: {
            Name: 'dateEnd',
            DefaultValues: {
              StaticValues: [

              ],
              RollingDate: {
                Expression: "addDateTime(-1, 'DD', truncDate('DD', now()))",
              },
            },
            TimeGranularity: 'DAY',
          },
        },
      ],
      FilterGroups: [
        {
          FilterGroupId: 'a4366267-b733-473a-962f-73acc694c2f7',
          Filters: [
            {
              TimeRangeFilter: {
                FilterId: 'f51fec2f-f759-4e62-a356-fd21a24b75c9',
                Column: {
                  DataSetIdentifier: 'clickstream_funnel_chart_view',
                  ColumnName: 'event_date',
                },
                NullOption: 'NON_NULLS_ONLY',
                TimeGranularity: 'MINUTE',
              },
            },
          ],
          ScopeConfiguration: {
            SelectedSheets: {
              SheetVisualScopingConfigurations: [
                {
                  SheetId: 'f43cdc10-0f41-4ad1-bd42-deb0f6dbeb64',
                  Scope: 'SELECTED_VISUALS',
                  VisualIds: [
                    'e6105df1-3bd6-4d4d-9a44-f34d00fafea0',
                  ],
                },
              ],
            },
          },
          Status: 'ENABLED',
          CrossDataset: 'ALL_DATASETS',
        },
      ],
      AnalysisDefaults: {
        DefaultNewSheetConfiguration: {
          InteractiveLayoutConfiguration: {
            Grid: {
              CanvasSizeOptions: {
                ScreenCanvasSizeOptions: {
                  ResizeOption: 'FIXED',
                  OptimizedViewPortWidth: '1600px',
                },
              },
            },
          },
          SheetContentType: 'INTERACTIVE',
        },
      },
    }));

  });

});
