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

package software.aws.solution.clickstream.common;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import software.aws.solution.clickstream.common.enrich.UrlParseResult;
import software.aws.solution.clickstream.common.exception.ExtractDataException;
import software.aws.solution.clickstream.common.ingest.UserPropObjectValue;
import software.aws.solution.clickstream.common.model.ClickstreamEventPropValue;
import software.aws.solution.clickstream.common.model.ClickstreamUserPropValue;
import software.aws.solution.clickstream.common.model.ValueType;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.URISyntaxException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.zip.GZIPInputStream;

@Slf4j
public final class Util {

    public static final String ERROR_LOG = ", error: ";
    public static final String VALUE_LOG = ", value: ";

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private Util() {
    }

    public static String decompress(final byte[] str) {
        if (str == null) {
            return "";
        }
        GZIPInputStream gis;
        try {
            gis = new GZIPInputStream(new ByteArrayInputStream(str));
            BufferedReader bf = new BufferedReader(new InputStreamReader(gis, StandardCharsets.UTF_8));
            StringBuilder outStr = new StringBuilder();
            String line;
            while ((line = bf.readLine()) != null) {
                outStr.append(line);
            }
            return outStr.toString();
        } catch (IOException e) {
            log.error("decompress error:" + e.getMessage());
            throw new ExtractDataException(e);
        }
    }


    public static Map<String, List<String>> getUriParams(final String uri) {
        if (uri == null) {
            return new HashMap<>();
        }
        URI uriObj = null;
        try {
             uriObj = new URI(uri);
        } catch (URISyntaxException e) {
            if (isHasIllegalChar(e)) {
                String encodedUri = encodeUriString(uri);
                try {
                    uriObj = new URI(encodedUri);
                } catch (URISyntaxException ex) {
                    log.warn("getUriParams() cannot parse encoded uri: {}" + ERROR_LOG + "{}", encodedUri, ex.getMessage());
                    return new HashMap<>();
                }
            } else {
                log.warn("getUriParams() cannot parse uri: {}" + ERROR_LOG + "{}", uri, e.getMessage());
                return new HashMap<>();
            }
        }

        return getUriParams(uriObj);
    }

    private static boolean isHasIllegalChar(final URISyntaxException e) {
        return e.getMessage().contains("Illegal character") || e.getMessage().contains("Malformed escape pair");
    }

    public static String encodeUriString(final String pageUrlInput) {
        String pageUrl = pageUrlInput;
        log.debug("encodeUriString(): input pageUrl: {}", pageUrl);

        String[] uriParts = pageUrl.split("\\?", 2);

        String hostAndPath = uriParts[0];
        hostAndPath = encodeHostAndPath(hostAndPath);

        if (uriParts.length == 1) {
            return hostAndPath;
        }

        String queryString = uriParts[1];
        queryString = encodeQueryString(queryString);

        pageUrl = hostAndPath + "?" + queryString;
        log.debug("encodeUriString(): return pageUrl: {}", pageUrl);
        return pageUrl;
    }

    private static String encodeQueryString(final String queryString) {
        return replaceIllegalChar(queryString)
                .replace("/", "%2F");
    }

    private static String encodeHostAndPath(final String schemaHostAndPath) {
        String[] parts = schemaHostAndPath.split("://", 2);
        String schema = parts[0];
        String hostAndPath;
        if (parts.length ==2) {
            hostAndPath = parts[1];
        } else {
            schema = "https";
            hostAndPath = parts[0];
        }
        hostAndPath = replaceIllegalChar(hostAndPath);

        return String.join("://", schema, hostAndPath);
    }

    private static String replaceIllegalChar(final String hostAndPathInput) {
         return hostAndPathInput.replace("|", "%7C")
                .replace("<", "%3C")
                .replace(">", "%3E")
                .replace("#", "%23")
                .replace("{", "%7B")
                .replace("}", "%7D")
                .replace("\\", "%5C")
                .replace("^", "%5E")
                .replace("~", "%7E")
                .replace("[", "%5B")
                .replace("]", "%5D")
                .replace("`", "%60")
                .replace(";", "%3B")
                .replace("?", "%3F")
                .replace(":", "%3A")
                .replace("@", "%40")
                .replace("$", "%24")
                .replace("+", "%2B")
                .replace(",", "%2C")
                .replace("%", "%25")
                .replace("-", "%2D")
                .replace(" ", "%20");
    }

    public static Map<String, List<String>> getUriParams(final URI uriObj) {
        Map<String, List<String>> params = new HashMap<>();

        String query = uriObj.getQuery();
        if (query != null) {
            String[] pairs = query.split("&");
            for (String pair : pairs) {
                int idx = pair.indexOf("=");
                String key = idx > 0 ? pair.substring(0, idx) : pair;
                params.computeIfAbsent(key, k -> new ArrayList<>());
                String value = idx > 0 && pair.length() > idx + 1 ? pair.substring(idx + 1) : null;
                params.get(key).add(deCodeUri(value));
            }
        }

        return params;
    }

    public static Optional<UrlParseResult> parseUrl(final String url) {
        if (url == null || url.isEmpty()) {
            return Optional.empty();
        }
        String schemaUrl = url;
        if (!url.substring(0, Math.min(url.length(), 15)).contains("://")) {
            schemaUrl = "https://" + url;
        }

        UrlParseResult result = new UrlParseResult();
        try {
            result = extractFromUrl(schemaUrl);
        } catch (URISyntaxException e) {
            log.warn("parseUrl(): cannot parse uri: {}" + ERROR_LOG + "{}", schemaUrl, e.getMessage());
            if (isHasIllegalChar(e)) {
                String encodedUri = encodeUriString(schemaUrl);
                log.debug("parseUrl(): encoded uri: {}", encodedUri);
                try {
                    result = extractFromUrl(encodedUri);
                } catch (URISyntaxException ex) {
                    log.warn("parseUrl(): cannot parse encoded uri: {}" + ERROR_LOG + "{}", encodedUri, ex.getMessage());
                }
            }
        }
        log.debug("parseUrl(): result host: {}",  result.getHostName());
        return Optional.of(result);
    }

    private static UrlParseResult extractFromUrl(final String schemaUrl) throws URISyntaxException {
        UrlParseResult result = new UrlParseResult();
        URI uri = new URI(schemaUrl);
        result.setHostName(uri.getHost());
        result.setPath(uri.getPath());
        result.setQueryString(deCodeUri(uri.getQuery()));
        result.setQueryParameters(getUriParams(schemaUrl));
        return result;
    }

    public static String deCodeUri(final String uri) {
        if (uri == null) {
            return null;
        }
        try {
            return URLDecoder.decode(uri, StandardCharsets.UTF_8.toString());
        } catch (Exception e) {
            log.warn(e.getMessage() + ", uri:" + uri);
            return uri;
        }
    }

    public static Map<String, String> convertUriParamsToStrMap(final Map<String, List<String>> uriParams) {
        if (uriParams == null) {
            return null; // NOSONAR
        }
        Map<String, String> result = new HashMap<>();

        for (Map.Entry<String, List<String>> entry : uriParams.entrySet()) {
            result.put(entry.getKey(), String.join(",", entry.getValue()));
        }
        return result;
    }


    public static Map<String, String> convertStringObjectMapToStringStringMap(final Map<String, Object> inputMap) {
        if (inputMap == null) {
            return null; // NOSONAR
        }
        Map<String, String> result = new HashMap<>();

        for (Map.Entry<String, Object> entry : inputMap.entrySet()) {
            String k = entry.getKey();
            Object v = entry.getValue();
            if (v instanceof String) {
                result.put(k, v.toString());
            } else {
                try {
                    result.put(k, OBJECT_MAPPER.writeValueAsString(v));
                } catch (JsonProcessingException e) {
                    log.error("convertStringObjectMapToStringStringMap::Error converting object to string", e);
                    log.error("key: " + k + " value: " + v);
                }
            }
        }
        return result;
    }

    public static Map<String, ClickstreamEventPropValue> convertStringObjectMapToStringEventPropMap(final Map<String, Object> inputMap)
            throws JsonProcessingException {
        if (inputMap == null) {
            return null; // NOSONAR
        }
        Map<String, ClickstreamEventPropValue> result = new HashMap<>();

        for (Map.Entry<String, Object> entry : inputMap.entrySet()) {
            String k = entry.getKey();
            Object v = entry.getValue();
            if (v instanceof String) {
                result.put(k, new ClickstreamEventPropValue(v.toString(), ValueType.STRING));
            } else if (v instanceof Number) {
                result.put(k, new ClickstreamEventPropValue(v.toString(), ValueType.NUMBER));
            } else if (v instanceof Boolean) {
                result.put(k, new ClickstreamEventPropValue(v.toString(), ValueType.BOOLEAN));
            } else {
                try {
                    result.put(k, new ClickstreamEventPropValue(OBJECT_MAPPER.writeValueAsString(v), ValueType.OBJECT));
                } catch (JsonProcessingException e) {
                    log.error("convertStringObjectMapToStringEventPropMap::Error converting object to string", e);
                    throw e;
                }
            }

        }
        return result;
    }


    public static Map<String, ClickstreamUserPropValue> convertStringObjectMapToStringUserPropMap(final Map<String, Object> inputMap)
            throws JsonProcessingException {
        if (inputMap == null) {
            return null; // NOSONAR
        }
        Map<String, ClickstreamUserPropValue> result = new HashMap<>();
        for (Map.Entry<String, Object> entry : inputMap.entrySet()) {
            String k = entry.getKey();
            Object v = entry.getValue();
            if (v instanceof String) {
                result.put(k, new ClickstreamUserPropValue(v.toString(), ValueType.STRING, null));
            } else if (v instanceof Number) {
                result.put(k, new ClickstreamUserPropValue(v.toString(), ValueType.NUMBER, null));
            } else if (v instanceof Boolean) {
                result.put(k, new ClickstreamUserPropValue(v.toString(), ValueType.BOOLEAN, null));
            } else {
                try {
                    result.put(k, new ClickstreamUserPropValue(OBJECT_MAPPER.writeValueAsString(v), ValueType.OBJECT, null));
                } catch (JsonProcessingException e) {
                    log.error("convertStringObjectMapToStringUserPropMap::Error converting object to string", e);
                    throw e;
                }
            }
        }
        return result;
    }

    public static Map<String, ClickstreamUserPropValue> convertCustomerUserPropMapToStringUserPropMap(final Map<String, UserPropObjectValue> customProperties)
            throws JsonProcessingException {
        Map<String, ClickstreamUserPropValue> result = new HashMap<>();
        if (customProperties == null) {
            return result;
        }
        for (Map.Entry<String, UserPropObjectValue> entry : customProperties.entrySet()) {
            String k = entry.getKey();
            UserPropObjectValue v = entry.getValue();
            if (v.getValue() instanceof String) {
                result.put(k, new ClickstreamUserPropValue(v.getValue().toString(), ValueType.STRING, v.getSetTimestamp()));
            } else if (v.getValue() instanceof Number) {
                result.put(k, new ClickstreamUserPropValue(v.getValue().toString(), ValueType.NUMBER, v.getSetTimestamp()));
            } else if (v.getValue() instanceof Boolean) {
                result.put(k, new ClickstreamUserPropValue(v.getValue().toString(), ValueType.BOOLEAN, v.getSetTimestamp()));
            } else {
                result.put(k, new ClickstreamUserPropValue(OBJECT_MAPPER.writeValueAsString(v.getValue()), ValueType.OBJECT, v.getSetTimestamp()));
            }
        }

        return result;
    }

    public static String objectToJsonString(final Object obj) throws JsonProcessingException {
        return OBJECT_MAPPER.writeValueAsString(obj);
    }

    public static String getStackTrace(final Exception e) {
        StringBuilder sb = new StringBuilder();
        sb.append(e.getClass()).append(": ")
                .append(e.getMessage()).append("\n");
        for (StackTraceElement element : e.getStackTrace()) {
            sb.append(element.toString());
            sb.append("\n");
        }
        return sb.toString();
    }

    public static String readResourceFile(final String fileName) throws IOException {
        InputStream inputStream = getResourceAsStream(fileName);
        if (inputStream == null) {
            throw new IllegalArgumentException("File not found! " + fileName);
        }
        ByteArrayOutputStream output = readAllInputStream(inputStream);
        return output.toString(StandardCharsets.UTF_8.toString());

    }

    public static boolean isResourceFileExist(final String fileName) {
        return Util.class.getClassLoader().getResource(fileName) != null;
    }

    public static ByteArrayOutputStream readAllInputStream(final InputStream inputStream) throws IOException {
        byte[] buffer = new byte[1024];
        int bytesRead;
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        while ((bytesRead = inputStream.read(buffer)) != -1) {
            output.write(buffer, 0, bytesRead);
        }
        return output;
    }


    public static String readTextFile(final String fileName) throws IOException {
        FileInputStream inputStream = new FileInputStream(fileName);
        ByteArrayOutputStream output = readAllInputStream(inputStream);
        return output.toString(StandardCharsets.UTF_8.toString());
    }

    public static InputStream getResourceAsStream(final String fileName) {
        return Util.class.getClassLoader().getResourceAsStream(fileName);
    }
}
