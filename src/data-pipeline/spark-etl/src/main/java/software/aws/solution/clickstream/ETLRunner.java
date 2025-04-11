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


package software.aws.solution.clickstream;


import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.apache.spark.sql.Column;
import org.apache.spark.sql.Encoders;
import org.apache.spark.sql.SaveMode;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.SparkSession;
import org.apache.spark.sql.functions;
import org.apache.spark.sql.types.DataTypes;
import org.apache.spark.sql.types.StructField;
import org.apache.spark.sql.types.StructType;
import org.sparkproject.guava.annotations.VisibleForTesting;
import software.aws.solution.clickstream.common.Constant;
import software.aws.solution.clickstream.common.RuleConfig;
import software.aws.solution.clickstream.common.TransformConfig;
import software.aws.solution.clickstream.exception.ExecuteTransformerException;
import software.aws.solution.clickstream.util.*;

import javax.validation.constraints.NotEmpty;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.file.Paths;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import java.util.Arrays;
import java.util.ArrayList;

import java.util.stream.Collectors;
import java.util.stream.Stream;

import static org.apache.spark.sql.functions.col;
import static org.apache.spark.sql.functions.concat;
import static org.apache.spark.sql.functions.decode;
import static org.apache.spark.sql.functions.expr;
import static org.apache.spark.sql.functions.input_file_name;
import static org.apache.spark.sql.functions.date_format;

import static software.aws.solution.clickstream.TransformerV3.CLIENT_TIMESTAMP;
import static software.aws.solution.clickstream.TransformerV3.INPUT_FILE_NAME;
import static software.aws.solution.clickstream.util.ContextUtil.DISABLE_TRAFFIC_SOURCE_ENRICHMENT;
import static software.aws.solution.clickstream.util.ContextUtil.JOB_NAME_PROP;
import static software.aws.solution.clickstream.util.ContextUtil.WAREHOUSE_DIR_PROP;
import static software.aws.solution.clickstream.util.ContextUtil.OUTPUT_COALESCE_PARTITIONS_PROP;

@Slf4j
public class ETLRunner {
    public static final String PARTITION_APP = "partition_app";
    public static final String PARTITION_YEAR = "partition_year";
    public static final String PARTITION_MONTH = "partition_month";
    public static final String PARTITION_DAY = "partition_day";
    public static final String SINK = "sink";
    public static final String DEBUG_LOCAL_PATH = System.getProperty("debug.local.path", "/tmp/etl-debug");
    public static final String TRANSFORM_METHOD_NAME = "transform";
    public static final String EVENT_DATE = "event_date";
    public static final String CONFIG_METHOD = "config";
    public static final String APP_ID_EVENT_DATE = "app_id_event_date";
    private final SparkSession spark;
    private final ETLRunnerConfig runConfig;
    private TableName eventTableName = null;

    @Getter
    private TransformConfig transformConfig;

    public ETLRunner(final SparkSession spark, final ETLRunnerConfig runConfig) {
        this.spark = spark;
        this.runConfig = runConfig;
        initConfig(runConfig);
    }

    void initConfig(final ETLRunnerConfig runConfig) {
        String ruleConfigDir = runConfig.getConfigRuleDir();
        log.info("ruleConfigDir: " + ruleConfigDir);
        Dataset<Row> configFileDataset = this.spark.read().format("binaryFile")
                .option("pathGlobFilter", "*.json")
                .option("recursiveFileLookup", "true")
                .load(ruleConfigDir);

        List<PathContent> configFileList = configFileDataset.select(col("path"), decode(col("content"), "utf8").alias("content"))
                .as(Encoders.bean(PathContent.class)).collectAsList();

        Map<String, RuleConfig> appRuleConfig = new HashMap<>();
        for (PathContent pathContent : configFileList) {
            log.info("path: " + pathContent.getPath());

            String path = pathContent.getPath();
            String content = pathContent.getContent();

            String[] pathParts = path.split("/");
            if (pathParts.length < 2) {
                log.warn("Invalid path: " + path);
                continue;
            }
            String fileName = pathParts[pathParts.length - 1];
            String appId = pathParts[pathParts.length - 2];

            RuleConfig ruleConfig = null;
            if (appRuleConfig.containsKey(appId)) {
                ruleConfig = appRuleConfig.get(appId);
            } else {
                ruleConfig = new RuleConfig();
                appRuleConfig.put(appId, ruleConfig);
            }

            String categoryRuleFileNameV1 = "traffic_source_category_rule_v1.json";
            String channelRuleFileNameV1 = "traffic_source_channel_rule_v1.json";

            if (categoryRuleFileNameV1.equalsIgnoreCase(fileName)) {
                ruleConfig.setOptCategoryRuleJson(content);
            }
            if (channelRuleFileNameV1.equalsIgnoreCase(fileName)) {
                ruleConfig.setOptChannelRuleJson(content);
            }
        }

        showConfigInfo(appRuleConfig, runConfig.getValidAppIds());

        TransformConfig transformRuleConfig = new TransformConfig();
        transformRuleConfig.setAppRuleConfig(appRuleConfig);
        transformRuleConfig.setTrafficSourceEnrichmentDisabled(false);
        if (runConfig.getRunFlag() != null && runConfig.getRunFlag().contains(DISABLE_TRAFFIC_SOURCE_ENRICHMENT)) {
            transformRuleConfig.setTrafficSourceEnrichmentDisabled(true);
            log.info("Traffic source enrichment is disabled");
        }

        this.transformConfig = transformRuleConfig;
    }

    private static void showConfigInfo(final Map<String, RuleConfig> appRuleConfig, final String appIds) {
        for (Map.Entry<String, RuleConfig> entry : appRuleConfig.entrySet()) {
            String appInfo = "appId: " + entry.getKey() + ", ";
            if (entry.getValue().getOptCategoryRuleJson() != null) {
                log.info(appInfo + "getOptCategoryRuleJson length: " + entry.getValue().getOptCategoryRuleJson().length());
            } else {
                log.warn(appInfo + "getOptCategoryRuleJson is null");
            }
            if (entry.getValue().getOptChannelRuleJson() != null) {
                log.info(appInfo + "getOptChannelRuleJson length: " + entry.getValue().getOptChannelRuleJson().length());
            } else {
                log.warn(appInfo + "getOptChannelRuleJson is null");
            }
        }

        for (String appId: appIds.split(",")) {
            if (!appRuleConfig.containsKey(appId)) {
                log.warn("appRuleConfig does not contain appId: " + appId);
            }
        }
    }

    public static Dataset<Row> execPostTransform(final Dataset<Row> dataset, final String transformerClassName) {
        List<String> colList = Arrays.asList(dataset.columns());
        log.info("Columns:" + String.join(",", dataset.columns()));
        if (colList.contains("event_params") && colList.contains("event_bundle_sequence_id")
                && colList.contains("items") && colList.contains("user_properties")) {
            return dataset.select(getDistFields());
        } else {
            return postTransform(dataset, transformerClassName);
        }
    }

    private static Dataset<Row> postTransform(final Dataset<Row> dataset, final String transformerClassName) {
        try {
            Class<?> transformClass = Class.forName(transformerClassName);
            return tryToExecPostTransform(dataset, transformClass);
        } catch (Exception e) {
            log.error(e.getMessage());
            throw new ExecuteTransformerException(e);
        }
    }

    @SuppressWarnings("unchecked")
    private static Dataset<Row> tryToExecPostTransform(final Dataset<Row> dataset,
                                                       final Class<?> transformClass) throws InstantiationException, IllegalAccessException, InvocationTargetException {
        String mName = "postTransform";
        Dataset<Row> resultDataset = dataset;
        try {
            Method postTransform = transformClass.getMethod(mName, Dataset.class);
            log.info("find method: " + postTransform.getName());
            Object instance = transformClass.getDeclaredConstructor().newInstance();
            resultDataset = (Dataset<Row>) postTransform.invoke(instance, dataset);
        } catch (NoSuchMethodException ignored) {
            log.info("transformClass: {}, did not find method {}",  transformClass, mName);
        }
        return resultDataset;
    }

    public static Column[] getDistFields() {
        List<Column> cols = Stream.of(
                "app_info", "device", "ecommerce", "event_bundle_sequence_id",
                EVENT_DATE, "event_dimensions", "event_id", "event_name",
                "event_params", "event_previous_timestamp", "event_server_timestamp_offset", "event_timestamp",
                "event_value_in_usd", "geo", "ingest_timestamp", "items",
                "platform", "privacy_info", "project_id", "traffic_source",
                "user_first_touch_timestamp", "user_id", "user_ltv", "user_properties",
                "user_pseudo_id"
        ).map(functions::col).collect(Collectors.toList()); //NOSONAR
        return cols.toArray(new Column[]{});
    }

    public void run() {
        ContextUtil.setContextProperties(this.runConfig);

        log.info(JOB_NAME_PROP + ":" + System.getProperty(JOB_NAME_PROP));
        log.info(WAREHOUSE_DIR_PROP + ":" + System.getProperty(WAREHOUSE_DIR_PROP));

        Dataset<Row> dataset = readInputDataset(true);
        ContextUtil.cacheDataset(dataset);
        log.info(new ETLMetric(dataset, "source").toString());

        Dataset<Row> dataset2 = executeTransformers(dataset, runConfig.getTransformerClassNames());

        long resultCount = writeResultEventDataset(dataset2);
        log.info(new ETLMetric(resultCount, SINK).toString());
    }

    private Dataset<Row> rePartitionInputDataset(final Dataset<Row> dataset) {
        int inputDataPartitions = dataset.rdd().getNumPartitions();
        Dataset<Row> repDataset = dataset;
        if (runConfig.getRePartitions() > 0
                && (inputDataPartitions > 200 || runConfig.getRePartitions() < inputDataPartitions)
        ) {
            log.info("inputDataPartitions:" + inputDataPartitions + ", repartition to: " + runConfig.getRePartitions());
            repDataset = repDataset.repartition(runConfig.getRePartitions(),
                    col("ingest_time"), col("rid"));
        }
        log.info("NumPartitions: " + repDataset.rdd().getNumPartitions());
        return repDataset;
    }

    public long writeResultEventDataset(final Dataset<Row> dataset2) {
        String outPath = runConfig.getOutputPath();
        if (this.eventTableName == null) {
            throw new IllegalStateException("eventTableName is null");
        }
        return writeResult(outPath, dataset2, this.eventTableName);
    }

    public Dataset<Row> readInputDataset(final boolean checkModifiedTime) {

        List<String[]> partitions = getSourcePartition(runConfig.getStartTimestamp(), runConfig.getEndTimestamp());
        List<String> sourcePaths = getSourcePaths(runConfig.getSourcePath(), partitions);

        String[] sourcePathsArray = sourcePaths.toArray(new String[]{});

        DateTimeFormatter dateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
        ZoneId utc = ZoneId.of("UTC");

        ZonedDateTime modifiedAfterDatetime = Instant.ofEpochMilli(runConfig.getStartTimestamp())
                .atZone(utc);
        // add one second to endTimestamp here to change range from inclusive to exclusive
        // (startTimestamp, endTimestamp] ==> (modifiedAfter, modifiedBefore)
        ZonedDateTime modifiedBeforeDatetime = Instant.ofEpochMilli(runConfig.getEndTimestamp() + 1000L)
                .atZone(utc);

        String modifiedAfter = dateTimeFormatter.format(modifiedAfterDatetime);
        String modifiedBefore = dateTimeFormatter.format(modifiedBeforeDatetime);

        log.info("startTimestamp:" + runConfig.getStartTimestamp() + ", endTimestamp:" + runConfig.getEndTimestamp());
        log.info("modifiedAfter:" + modifiedAfter + ", modifiedBefore:" + modifiedBefore);
        log.info("sourcePathsArray:" + String.join(",", sourcePathsArray));

        StructType inputDataSchema = DataTypes.createStructType(
                new StructField[]{
                        DataTypes.createStructField("_corrupt_record", DataTypes.StringType, true),
                        DataTypes.createStructField("date", DataTypes.StringType, true),
                        DataTypes.createStructField("data", DataTypes.StringType, true),
                        DataTypes.createStructField("ip", DataTypes.StringType, true),
                        DataTypes.createStructField("source_type", DataTypes.StringType, true),
                        DataTypes.createStructField("rid", DataTypes.StringType, true),
                        DataTypes.createStructField("ua", DataTypes.StringType, true),
                        DataTypes.createStructField("m", DataTypes.StringType, true),
                        DataTypes.createStructField("uri", DataTypes.StringType, true),
                        DataTypes.createStructField("platform", DataTypes.StringType, true),
                        DataTypes.createStructField("path", DataTypes.StringType, true),
                        DataTypes.createStructField("appId", DataTypes.StringType, true),
                        DataTypes.createStructField("compression", DataTypes.StringType, true),
                        DataTypes.createStructField("ingest_time", DataTypes.LongType, true),
                        DataTypes.createStructField(CLIENT_TIMESTAMP, DataTypes.LongType, true),
                        DataTypes.createStructField("server_ingest_time", DataTypes.LongType, true),
                        DataTypes.createStructField("hour", DataTypes.IntegerType, true)
                }
        );

        Map<String, String> options = new HashMap<>();
        options.put("timeZone", "UTC");
        options.put("mode", "PERMISSIVE");
        options.put("columnNameOfCorruptRecord", "_corrupt_record");
        if (checkModifiedTime) {
            //note the range is exclusive (modifiedAfter, modifiedBefore)
            options.put("modifiedAfter", modifiedAfter);
            options.put("modifiedBefore", modifiedBefore);
        }
        Dataset<Row> dataset = spark.read()
                .options(options)
                .schema(inputDataSchema)
                .json(sourcePathsArray[0])
                .withColumn(INPUT_FILE_NAME, input_file_name());
        log.info("read source " + 0 + ", path:" + sourcePathsArray[0]);
        for (int i = 1; i < sourcePathsArray.length; i++) {
            Dataset<Row> datasetTemp = spark.read()
                    .options(options)
                    .schema(inputDataSchema)
                    .json(sourcePathsArray[i])
                    .withColumn(INPUT_FILE_NAME, input_file_name());
            log.info("read source " + i + ", path:" + sourcePathsArray[i]);
            dataset = dataset.unionAll(datasetTemp);
        }

        List<Row> inputFiles = dataset.select(col(INPUT_FILE_NAME).alias("fileName")).distinct().collectAsList();
        inputFiles.forEach(row -> log.info(row.getAs("fileName")));
        long fileNameCount = inputFiles.size();
        log.info(new ETLMetric(fileNameCount, "loaded input files").toString());

        return rePartitionInputDataset(dataset);
    }

    @VisibleForTesting
    public Dataset<Row> executeTransformers(final Dataset<Row> dataset,
                                            final @NotEmpty List<String> transformerClassNames) {
        Dataset<Row> result = dataset;
        int ind = 0;
        for (String transformerClassName : transformerClassNames) {
            log.info("executeTransformer: " + transformerClassName);
            result = executeTransformer(result, transformerClassName, ind++);
        }
        return execPostTransform(result, transformerClassNames.get(0));
    }

    @SuppressWarnings("unchecked")
    private Dataset<Row> executeTransformer(final Dataset<Row> dataset, final String transformerClassName, final int ind) {
        try {
            Class<?> aClass = Class.forName(transformerClassName);
            Object instance = aClass.getDeclaredConstructor().newInstance();
            Method transform = aClass.getMethod(TRANSFORM_METHOD_NAME, Dataset.class);
            Dataset<Row> eventDataset;

            if (List.class.getCanonicalName().equals(transform.getReturnType().getCanonicalName())) {
                // V2 transform
                this.eventTableName = TableName.EVENT;
                List<Dataset<Row>> transformedDatasets = (List<Dataset<Row>>) transform.invoke(instance, dataset);
                eventDataset = transformedDatasets.get(0);
                saveTransformedDatasets(transformedDatasets);

            } else if (Map.class.getCanonicalName().equals(transform.getReturnType().getCanonicalName())) {
                // V3 transform for event_v2
                this.eventTableName = TableName.EVENT_V2;

                configTransformerInstance(aClass, instance);

                Map<TableName, Dataset<Row>> transformedDatasets = (Map<TableName, Dataset<Row>>) transform.invoke(instance, dataset);
                eventDataset = transformedDatasets.get(TableName.EVENT_V2);
                saveTransformedDatasets(transformedDatasets);
            } else {
                eventDataset = (Dataset<Row>) transform.invoke(instance, dataset);
                if (ind == 0) {
                    this.eventTableName = TableName.ODS_EVENTS;
                }
            }

            if (ContextUtil.isDebugLocal()) {
                eventDataset.write().mode(SaveMode.Overwrite)
                        .json(DEBUG_LOCAL_PATH + "/" + transformerClassName + "-eventDataset/");
            }
            return eventDataset;
        } catch (ClassNotFoundException | InvocationTargetException | InstantiationException
                 | IllegalAccessException | NoSuchMethodException e) {
            log.error(e.getMessage());
            throw new ExecuteTransformerException(e);
        }
    }

    private void configTransformerInstance(final Class<?> aClass, final Object instance)
            throws IllegalAccessException, InvocationTargetException, NoSuchMethodException {
            Method configMethod = aClass.getMethod(CONFIG_METHOD, TransformConfig.class);
            configMethod.invoke(instance, this.transformConfig);
    }

    private void saveTransformedDatasets(final List<Dataset<Row>> transformedDatasets) {
        if (transformedDatasets.size() != 4) {
            return;
        }
        Dataset<Row> evenParamDataset = transformedDatasets.get(1);
        Dataset<Row> itemDataset = transformedDatasets.get(2);
        Dataset<Row> userDataset = transformedDatasets.get(3);
        String outPath = runConfig.getOutputPath();
        long evenParamDatasetCount = writeResult(outPath, evenParamDataset, TableName.EVEN_PARAMETER);
        log.info(new ETLMetric(evenParamDatasetCount, SINK + " " + TableName.EVEN_PARAMETER.getTableName()).toString());

        if (itemDataset != null) {
            long itemDatasetCount = writeResult(outPath, itemDataset, TableName.ITEM);
            log.info(new ETLMetric(itemDatasetCount, SINK + " " + TableName.ITEM.getTableName()).toString());
        }
        if (userDataset != null) {
            long userDatasetCount = writeResult(outPath, userDataset, TableName.USER);
            log.info(new ETLMetric(userDatasetCount, SINK + " " + TableName.USER.getTableName()).toString());
        }
    }

    private void saveTransformedDatasets(final Map<TableName, Dataset<Row>> transformedDatasetMap) {
        log.info("saveTransformedDatasets, tableNames: " + transformedDatasetMap.keySet());
        for (Map.Entry<TableName, Dataset<Row>> entry : transformedDatasetMap.entrySet()) {
            TableName tableName = entry.getKey();
            if (tableName == TableName.EVENT_V2) {
                continue;
            }
            Dataset<Row> dataset = entry.getValue();
            String outPath = runConfig.getOutputPath();
            long datasetCount = writeResult(outPath, dataset, tableName);
            log.info(new ETLMetric(datasetCount, SINK + " " + tableName.getTableName()).toString());
        }
    }

    protected long writeResult(final String outputPath, final Dataset<Row> dataset, final TableName tbName) {
        log.info("writeResult for table " + tbName);
        Dataset<Row> partitionedDataset = prepareForPartition(dataset, tbName);
        partitionedDataset.cache();
        long resultCount = partitionedDataset.count();
        log.info(new ETLMetric(resultCount, "writeResult for table " + tbName).toString());
        log.info("outputPath: " + outputPath);
        if (resultCount == 0) {
            return 0L;
        }
        String saveOutputPath = outputPath;
        if (!(saveOutputPath.endsWith(tbName.getTableName() + "/")
                || saveOutputPath.endsWith(tbName.getTableName()))) {
            saveOutputPath = Paths.get(outputPath, tbName.getTableName()).toString()
                    .replace("s3:/", "s3://");
        }
        log.info("saveOutputPath: " + saveOutputPath);

        String[] partitionBy = new String[]{PARTITION_APP, PARTITION_YEAR, PARTITION_MONTH, PARTITION_DAY};
        if ("json".equalsIgnoreCase(runConfig.getOutPutFormat())) {
            partitionedDataset
                    .drop(APP_ID_EVENT_DATE)
                    .write()
                    .partitionBy(partitionBy)
                    .mode(SaveMode.Append)
                    .json(saveOutputPath);
        } else {
            long outFolderCount = partitionedDataset
                    .sample(0.15)
                    .select(APP_ID_EVENT_DATE)
                    .select(expr("approx_count_distinct(*)").alias("count"))
                    .first()
                    .getLong(0);

            outFolderCount = outFolderCount == 0 ? 1 : outFolderCount;
            log.info("sampled unique app_id and event_date count: " + outFolderCount);

            int numPartitions = (int) (resultCount / (50_000 * outFolderCount)) + 1;
            int outPartitions = Integer.parseInt(System.getProperty(OUTPUT_COALESCE_PARTITIONS_PROP, "-1"));
            log.info("calculated numPartitions: " + numPartitions + ", outPartitions:" + outPartitions);

            if (outPartitions > 0 && numPartitions > outPartitions) {
                numPartitions = outPartitions;
            }
            log.info("actual numPartitions: " + numPartitions);
            partitionedDataset
                    .drop(APP_ID_EVENT_DATE)
                    .coalesce(numPartitions)
                    .write()
                    .option("compression", "snappy")
                    .partitionBy(partitionBy)
                    .mode(SaveMode.Append)
                    .parquet(saveOutputPath);
        }
        return resultCount;
    }

    private Dataset<Row> prepareForPartition(final Dataset<Row> dataset, final TableName tbName) {
        if (Arrays.asList(TableName.EVENT_V2,
                TableName.USER_V2,
                TableName.ITEM_V2,
                TableName.SESSION).contains(tbName)) {
            return prepareForPartitionV2(dataset, tbName);
        }

        log.info("prepareForPartition for table " + tbName);

        List<String> colNames = Arrays.asList(dataset.columns());
        String appId = "app_id";
        Column appIdCol = col("app_info").getItem(appId);
        if (colNames.contains(appId)) {
            appIdCol = col(appId);
        }
        Dataset<Row> dataset1 = dataset.withColumn(PARTITION_APP, appIdCol)
                .withColumn(PARTITION_YEAR, date_format(col(EVENT_DATE), "yyyy"))
                .withColumn(PARTITION_MONTH, date_format(col(EVENT_DATE), "MM"))
                .withColumn(PARTITION_DAY, date_format(col(EVENT_DATE), "dd"))
                .withColumn(APP_ID_EVENT_DATE, concat(appIdCol, date_format(col(EVENT_DATE), "yyyyMMdd")));

        if (Arrays.asList(TableName.USER, TableName.EVEN_PARAMETER, TableName.ITEM).contains(tbName)) {
            return dataset1.drop(EVENT_DATE, appId);
        }
        return dataset1;

    }

    public Dataset<Row> prepareForPartitionV2(final Dataset<Row> dataset, final TableName tbName) {
        log.info("prepareForPartitionV2 for table " + tbName);
        Dataset<Row> datasetWithPartition = dataset
                .withColumn(PARTITION_APP, col(Constant.APP_ID))
                .withColumn(PARTITION_YEAR, date_format(col(Constant.EVENT_TIMESTAMP), "yyyy"))
                .withColumn(PARTITION_MONTH, date_format(col(Constant.EVENT_TIMESTAMP), "MM"))
                .withColumn(PARTITION_DAY, date_format(col(Constant.EVENT_TIMESTAMP), "dd"))
                .withColumn(APP_ID_EVENT_DATE, concat(col(Constant.APP_ID),  date_format(col(Constant.EVENT_TIMESTAMP), "yyyyMMdd")));

        if (tbName == TableName.ITEM_V2) {
            return datasetWithPartition.drop(Constant.APP_ID);
        }

        if (tbName == TableName.EVENT_V2) {
            return datasetWithPartition.drop(Constant.UA, Constant.IP);
        }

        if (tbName == TableName.USER_V2) {
            return datasetWithPartition.drop(Constant.APP_ID, Constant.EVENT_NAME);
        }

        if (tbName == TableName.SESSION) {
            return datasetWithPartition.drop(Constant.APP_ID);
        }
        return datasetWithPartition;
    }

    private List<String[]> getSourcePartition(final long milliSecStart, final long milliSecEnd) {
        long oneHourMilliSec = 3600 * 1000L;
        long oneDayMilliSec = 24 * oneHourMilliSec;

        String[] endDayParts = getUTCYearMonthDay(milliSecEnd);
        List<String[]> partitions = new ArrayList<>();
        long milliSec = milliSecStart;

        while (milliSec <= milliSecEnd) {
            String[] tempDayParts = getUTCYearMonthDay(milliSec);
            if (!isDayEqual(endDayParts, tempDayParts)) {
                partitions.add(tempDayParts);
            }
            milliSec += oneDayMilliSec;
        }
        partitions.add(endDayParts);
        return partitions;
    }

    private List<String> getSourcePaths(final String sourceDir, final List<String[]> partitions) {
        return partitions.stream().map((String[] p) -> sourceDir + String.join("/",
                "year=" + p[0], "month=" + p[1], "day=" + p[2])).collect(Collectors.toList()); //NOSONAR
    }

    private String[] getUTCYearMonthDay(final long timestamp) {
        ZonedDateTime endDateDatetime = Instant.ofEpochMilli(timestamp).atZone(ZoneId.of("UTC"));
        String year = String.valueOf(endDateDatetime.getYear());
        // change month=9 -> 09
        String month = String.valueOf(endDateDatetime.getMonth().getValue() + 100).substring(1, 3);
        // change day=5 -> 05
        String day = String.valueOf(endDateDatetime.getDayOfMonth() + 100).substring(1, 3);

        return new String[]{
                year, month, day,
        };
    }

    private boolean isDayEqual(final String[] day1, final String[] day2) {
        return String.join("-", day1).equals(String.join("-", day2));
    }

}


