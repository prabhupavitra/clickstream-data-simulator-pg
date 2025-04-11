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

package software.aws.solution.clickstream.common.util;

import com.fasterxml.jackson.core.JsonProcessingException;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;

import software.aws.solution.clickstream.BaseTest;
import software.aws.solution.clickstream.common.Util;
import software.aws.solution.clickstream.common.enrich.UrlParseResult;
import software.aws.solution.clickstream.common.model.ClickstreamUserPropValue;

import java.io.File;
import java.io.IOException;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static software.aws.solution.clickstream.common.Util.objectToJsonString;

public class UtilTest extends BaseTest {

    @Test
    void test_convertStringObjectMapToStringStringMap() throws JsonProcessingException {
        // ./gradlew clean test --info --tests software.aws.solution.clickstream.common.util.UtilTest.test_convertStringObjectMapToStringStringMap

        Map<String, Object> map = new HashMap<>();
        map.put("key1", "value1");
        map.put("key2", "value2");

        Map<String, Object> mapInner = new HashMap<>();
        mapInner.put("key3", "value3");

        map.put("key4", mapInner);

        map.put("key5", Long.valueOf(12L));

        Map<String, String> result = Util.convertStringObjectMapToStringStringMap(map);

        assertEquals("{\"key1\":\"value1\",\"key2\":\"value2\",\"key5\":\"12\",\"key4\":\"{\\\"key3\\\":\\\"value3\\\"}\"}", objectToJsonString(result));

        assertNull(Util.convertStringObjectMapToStringStringMap(null));

    }

    @Test
    void test_convertStringObjectMapToStringStringMap_error() {
        // ./gradlew clean test --info --tests software.aws.solution.clickstream.common.util.UtilTest.test_convertStringObjectMapToStringStringMap_error

        Map<String, Object> map = new HashMap<>();
        map.put("key1", "value1");
        map.put("key2", "value2");

        Map<String, Object> mapInner = new HashMap<>();
        mapInner.put("key3", "value3");
        mapInner.put("key4", new File("test.txt"));
        map.put("key5", mapInner);
        Util.convertStringObjectMapToStringStringMap(map);
    }

    @Test
    void test_getUriParams() throws JsonProcessingException {
        // ./gradlew clean test --info --tests software.aws.solution.clickstream.common.util.UtilTest.test_getUriParams

        Map<String, List<String>> result = Util.getUriParams("http://www.example.com?param1=value1&param2=value2");
        assertEquals("{\"param1\":[\"value1\"],\"param2\":[\"value2\"]}", objectToJsonString(result));
    }

    @Test
    void test_getUriParams_error() throws JsonProcessingException {
        // ./gradlew clean test --info --tests software.aws.solution.clickstream.common.util.UtilTest.test_getUriParams_error

        Map<String, List<String>> result = Util.getUriParams("abc");
        assertEquals(0, result.size());
    }

    @Test
    void test_decompress() {
        // ./gradlew clean test --info --tests software.aws.solution.clickstream.common.util.UtilTest.test_decompress

        String base64Str = "H4sIAAAAAAAAE41UTW/bOBD9Kwvt1TQkWZbE3Fx7geaQbLFJ2sNiQdDkyCIskV6ScuoE+e8dSoqjpEEbG7DkN2+Gb77472NUc1evjYToIirjbJlu42gW8cOBKYlQt+UE/yDUafV/BwNKs0TmcVGRuMoFyWABpIzlkmTbpZDZAioOC0rRScJRidFpeFeSJHmZLhKaxDTLihfS9ICuSrMtiHxZAC+hqgINjqA986dDkLpulNgnZ7R3SipelnEFpIgpalluY0IT4CitSNNEQkGzQdXg4wCP06O6dBZ51YLzvD1EF68UzqJDw31lbItnrK43//x9ucEgxrEjWKeMRtg4ckzmoXIt3wd9V/j44/Pd6ttflwhuLddB4afwfIFbLHuD8ACQL0kIILi1CmzIcXO1QkCDvzd2/5z5ldmqBhB3wgJoVoPa1R4zSJf0DN4r6WvMIy7jWfRgNDBTVQ4CDUsUPrOoMYI3IeJDzdbX7M/PXLsQ9uQ8tKzhetfx3WAPskynvT0xMYzK+jpQ5X5Sg3ie9hUIqOZtYPF7R5xpOo8MIkLLnLfAW4Kcccpe/If6BezAxR6Pfo4iTDv/rri5BzWX0BqkYCgego4OXvk+E48NJP0fQikpw9S6UMrHiIWXvtOP0ZE3XWAvkhS/QTHgXE27nxdlUSzzPKfF02z0HcS8eI+KPurel/LsncYfdKuUdUgznain5HOg0SvFX7r8YMzGH5norMXhP00zurvZfDSbEMKGNeqmWSXpYp79TgXG4N5bte2wW31rvOVVpQRzprO4ji1I1YVdu725Qj1vzeNQ3N5cv2McHr35JpgPVh25ODGlK8O4dMx5Y4ep/nK5eoeieXPySrwhvsPEMrhwunaqv5bMHnRPvru9DWRRc6377V7HcRgyNl5zWDRphlGMvr42cYnb4JVTejfYN6vLzUgBa80whHg+1ru3vzE0oHe+ZvBdALw29w36hf3cEebUA7xmKPc8hSpU3tsOpqjkpzOINQnLPIh3AHjPpDHeo6nck3TR0ZQksgpYNCHjlNif5oXmC9rPy4QoOzss/UVOwxX29PTfD8p43ZTABgAA";
        byte[] bytes = Base64.getDecoder().decode(base64Str);
        String result = Util.decompress(bytes);
        assertTrue(result.contains("app_id"));

        String result2 = Util.decompress(null);
        assertEquals("", result2);

        boolean exception = false;
        try {
            Util.decompress("ab".getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            exception = true;
        }
        assertTrue(exception);
    }

    @Test
    void test_convertStringObjectMapToStringUserPropMap() throws JsonProcessingException {
        // ./gradlew clean test --info --tests software.aws.solution.clickstream.common.util.UtilTest.test_convertStringObjectMapToStringUserPropMap

        Map<String, Object> map = new HashMap<>();
        map.put("name", "value1");
        map.put("age", 23);
        map.put("first", true);

        Map<String, Object> score = new HashMap<>();
        score.put("value", 99.9);
        score.put("set_timestamp", 8123L);
        map.put("score", score);
        Map<String, Object> address = new HashMap<>();
        address.put("city", "Seattle");
        address.put("state", "WA");
        map.put("address",address );

        Map<String, ClickstreamUserPropValue> result = Util.convertStringObjectMapToStringUserPropMap(map);

        assertEquals("{\"score\":{\"value\":\"{\\\"set_timestamp\\\":8123,\\\"value\\\":99.9}\",\"type\":\"object\",\"setTimemsec\":null}," +
                        "\"address\":{\"value\":\"{\\\"city\\\":\\\"Seattle\\\",\\\"state\\\":\\\"WA\\\"}\",\"type\":\"object\",\"setTimemsec\":null}," +
                        "\"name\":{\"value\":\"value1\",\"type\":\"string\",\"setTimemsec\":null},\"age\":{\"value\":\"23\",\"type\":\"number\",\"setTimemsec\":null}," +
                        "\"first\":{\"value\":\"true\",\"type\":\"boolean\",\"setTimemsec\":null}}",
                objectToJsonString(result));

        assertNull(Util.convertStringObjectMapToStringUserPropMap(null));
    }

    @Test
    void test_readResourceFile() throws IOException {
        // ./gradlew clean test --info --tests software.aws.solution.clickstream.common.util.UtilTest.test_readResourceFile
        String result = Util.readResourceFile("original_data.json");
        assertNotNull(result);
    }

    @Test
    void test_readResourceFile_not_exists() {
        // ./gradlew clean test --info --tests software.aws.solution.clickstream.common.util.UtilTest.test_readResourceFile_not_exists
        Assertions.assertThrows(IllegalArgumentException.class, () -> {
            Util.readResourceFile("_not_exist_file.json");
        });
    }

    @Test
    void test_readTextFile() throws IOException {
        writeStringToFile("/tmp/_test_readTextFile.txt", "test");
        String content =  Util.readTextFile("/tmp/_test_readTextFile.txt");
        assertEquals("test", content);
    }

    @Test
    void  test_parseUrl() {
        // ./gradlew clean test --info --tests software.aws.solution.clickstream.common.util.UtilTest.test_parseUrl
        String url = "https://www.example.com/abc/test?param1=value1&param2=value2";
        UrlParseResult result = Util.parseUrl(url).get();
        assertEquals("www.example.com", result.getHostName());
        assertEquals("param1=value1&param2=value2", result.getQueryString());
        assertEquals("/abc/test", result.getPath());

        assertTrue(Util.parseUrl(null).isEmpty());
        assertTrue(Util.parseUrl("").isEmpty());
        assertNotNull(Util.parseUrl("https://www.example.com/"));
        assertNotNull(Util.parseUrl("https://www.example.com/?"));
    }

    @Test
    void  test_getUriParams2() {
        // ./gradlew clean test --info --tests software.aws.solution.clickstream.common.util.UtilTest.test_getUriParams2
        String url = "https://www.example.com/abc/test?param1=value1&param2=value2";
        Map<String, List<String>> params = Util.getUriParams(url);
        assertEquals("value1", params.get("param1").get(0));

        params = Util.getUriParams((String)null);
        assertEquals(0, params.size());

        params = Util.getUriParams("");
        assertEquals(0, params.size());

        params = Util.getUriParams("https://www.example.com/?abc=12|aa#!~*$(-)][");
        assertEquals("12|aa#!~*$(-)][", params.get("abc").get(0));
    }
}
