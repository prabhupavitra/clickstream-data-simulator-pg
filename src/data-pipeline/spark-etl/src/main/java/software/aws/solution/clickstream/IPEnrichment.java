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

import com.maxmind.db.CHMCache;
import com.maxmind.db.MaxMindDbConstructor;
import com.maxmind.db.MaxMindDbParameter;
import com.maxmind.db.Reader;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.apache.spark.SparkFiles;
import org.apache.spark.sql.Dataset;
import org.apache.spark.sql.Row;
import org.apache.spark.sql.SaveMode;
import org.apache.spark.sql.api.java.UDF2;
import org.apache.spark.sql.catalyst.expressions.GenericRow;
import org.apache.spark.sql.expressions.UserDefinedFunction;
import org.apache.spark.sql.types.DataTypes;
import org.apache.spark.sql.types.StructField;
import software.aws.solution.clickstream.common.Cache;
import software.aws.solution.clickstream.util.*;

import java.io.File;
import java.net.InetAddress;
import java.util.Map;
import java.util.Optional;

import static org.apache.spark.sql.functions.col;
import static org.apache.spark.sql.functions.split;
import static org.apache.spark.sql.functions.udf;
import static software.aws.solution.clickstream.common.Util.getStackTrace;
import static software.aws.solution.clickstream.util.DatasetUtil.GEO_FOR_ENRICH;
import static software.aws.solution.clickstream.ETLRunner.DEBUG_LOCAL_PATH;

@Slf4j
public class IPEnrichment {
    private static final Cache<Row> CACHED_IP = new Cache<>();
    public Dataset<Row> transform(final Dataset<Row> dataset) {
        UserDefinedFunction udfEnrichIP = udf(enrich(), DataTypes.createStructType(
                new StructField[]{
                        DataTypes.createStructField("city", DataTypes.StringType, true),
                        DataTypes.createStructField("continent", DataTypes.StringType, true),
                        DataTypes.createStructField("country", DataTypes.StringType, true),

                        DataTypes.createStructField("metro", DataTypes.StringType, true),
                        DataTypes.createStructField("region", DataTypes.StringType, true),
                        DataTypes.createStructField("sub_continent", DataTypes.StringType, true),
                        DataTypes.createStructField("locale", DataTypes.StringType, true),
                }
        ));
        Dataset<Row> ipEnrichDataset = dataset.withColumn("geo",
                udfEnrichIP.apply(
                        split(col(GEO_FOR_ENRICH).getItem("ip"), ",").getItem(0),
                        col(GEO_FOR_ENRICH).getItem("locale")
                )).drop(GEO_FOR_ENRICH);

        if (ContextUtil.isDebugLocal()) {
            ipEnrichDataset.write().mode(SaveMode.Overwrite).json(DEBUG_LOCAL_PATH + "/enrich-ip-Dataset/");
        }
        return ipEnrichDataset;
    }

    static UDF2<String, String, Row> enrich() {
        return (ipValue, localeValue) -> {
            if (CACHED_IP.containsKey(ipValue)) {
                return CACHED_IP.get(ipValue);
            }
            GenericRow defaultRow = new GenericRow(
                    new Object[]{null, null, null, null, null, null, localeValue}
            );
            GenericRow resultRow = defaultRow;
            try (Reader reader = new Reader(new File(SparkFiles.get("GeoLite2-City.mmdb")),
                    new CHMCache(1024 * 128))) {
                InetAddress address = InetAddress.getByName(ipValue);
                LookupResult result = reader.get(address, LookupResult.class);
                resultRow = Optional.ofNullable(result)
                        .map(geo -> new GenericRow(new Object[]{
                                Optional.ofNullable(geo.getCity()).map(LookupResult.City::getName).orElse(null),
                                Optional.ofNullable(geo.getContinent()).map(LookupResult.Continent::getName).orElse(null),
                                Optional.ofNullable(geo.getCountry()).map(LookupResult.Country::getName).orElse(null),
                                null,
                                null,
                                null,
                                localeValue
                        }))
                        .orElse(defaultRow);
            } catch (Exception e) {
                log.warn("failed to enrich IP: " + ipValue + ", " + getStackTrace(e));
            }
            CACHED_IP.put(ipValue, resultRow);
            return resultRow;
        };
    }

    public static class LookupResult {

        @Getter
        private final Country country;
        @Getter
        private final Continent continent;
        @Getter
        private final City city;
        @Getter
        private final Location location;

        @MaxMindDbConstructor
        public LookupResult(final @MaxMindDbParameter(name = "country") Country country,
                            final @MaxMindDbParameter(name = "continent") Continent continent,
                            final @MaxMindDbParameter(name = "city") City city,
                            final @MaxMindDbParameter(name = "location") Location location) {
            this.country = country;
            this.continent = continent;
            this.city = city;
            this.location = location;
        }

        public static class Country {
            private final String name;
            private final String isoCode;

            @MaxMindDbConstructor
            public Country(final @MaxMindDbParameter(name = "names") Map<String, String> names,
                           final @MaxMindDbParameter(name = "iso_code") String isoCode) {
                this.name = names.getOrDefault("en", null);
                this.isoCode = isoCode;
            }

            public String getName() {
                return name;
            }

            public String getIsoCode() {
                return this.isoCode;
            }
        }

        public static class Continent {
            @Getter
            private final String name;

            @MaxMindDbConstructor
            public Continent(final @MaxMindDbParameter(name = "names") Map<String, String> names) {
                this.name = names.getOrDefault("en", null);
            }
        }

        public static class City {
            @Getter
            private final String name;

            @MaxMindDbConstructor
            public City(final @MaxMindDbParameter(name = "names") Map<String, String> names) {
                this.name = names.getOrDefault("en", null);
            }
        }

        public static class Location {
            @Getter
            private final double latitude;
            @Getter
            private final double longitude;

            @MaxMindDbConstructor
            public Location(final @MaxMindDbParameter(name = "latitude") double latitude,
                            final @MaxMindDbParameter(name = "longitude") double longitude) {
                this.latitude = latitude;
                this.longitude = longitude;
            }
        }
    }
}
