# Clickstream HTTP API

## 简介

本文将帮助您通过 HTTP 请求将点击流数据发送到 Clickstream 摄取服务器。 Clickstream
数据处理模块将按照以下准则正确处理您的数据。然后，您可以在后续的报告模块中直观地分析它们。

## 请求端点

在Clickstream Web控制台创建完App后，在App详情页您获得 **服务器端点** 和 **App ID**。如下所示：

- **服务器端点**: `https://example.com/collect`
- **App ID**: `my_app`

## API规范

1. 请求的端点及 query 参数中的 appId 必需是在 Clickstream Web 控制台中创建 app 时所生成的 appId 和对应的请求端点, 否则
   server 会返回 HttpCode 403，错误内容：`DefaultAction: Invalid request`。
2. 请求的 body 包含公共属性、`items`、`user` 和 `attributes` 四个部分，其中公共属性中的 `event_type`、`event_id`、`timestamp`
   和 `app_id` 是必需的，其余均是可选参数。
3. 单次请求 body 总大小不能超过 1MB，超过则会返回 HttpCode 413, 错误内容：`Request Entity Too Large`。

### 请求方法

**`POST`**

### 请求headers

| 参数名             | 是否必需 | 示例                                                                                                                                  | 参数说明                                                                                 |
|-----------------|------|-------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------|
| Content-Type    | 是    | application/json; charset=utf-8                                                                                                     | 请求的 Content type                                                                     |
| X-Forwarded-For | 否    | [101.188.67.134](https://whatismyipaddress.com/page/36)                                                                             | 源IP地址，如果您将客户端请求从您的服务器转发到点击流服务器，则这是必需的                                                |
| User-Agent      | 否    | Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36 | 用户代理                                                                                 |
| cookie          | 否    | your auth cookie                                                                                                                    | 您请求的认证token，请参考[服务端配置](./../pipeline-mgmt/ingestion/configure-ingestion-endpoint.md) |

### 请求query参数

| 参数名                      | 是否必需 | 示例                  | 参数说明                             |
|--------------------------|------|---------------------|----------------------------------|
| appId                    | 是    | test_app            | 您应用的App ID, 在解决方案 Web 控制台创建应用时生成 |
| platform                 | 否    | Android/iOS/Web/... | 区分不同的平台                          |
| event_bundle_sequence_id | 否    | 1                   | 请求序列号，值从1开始的自增整数                 |
| hashCode                 | 否    | 478acd09            | 请求body字符串进行sha256计算结果的前8位        |
| compression              | 否    | gzip                | 请求body的压缩方式，目前仅支持gzip，不传该字段表示不压缩 |

### 请求body

请求body为数组结构，其中包含一个或多个事件的JSON字符串，例如：

```json
[
  {
    "event_type": "button_click",
    "event_id": "460daa08-0717-4385-8f2e-acb5bd019ee7",
    "timestamp": 1667877566697,
    "app_id": "your appId",
    "attributes": {
      "productName": "shoes",
      "Price": 99.9
    }
  },
  {
    "event_type": "item_view",
    "event_id": "c6067c1c-fd8d-4fdb-bfaf-cc1212ca0195",
    "timestamp": 1667877565698,
    "app_id": "your appId",
    "attributes": {
      "productName": "book",
      "Price": 39.9
    }
  }
]
```

### 事件参数

| 参数名              | 是否必需 | 参数类型    | 参数值示例                                                                                                                                                                                                                                                                                                                                            | 参数说明                                                                                                                                                   |
|------------------|------|---------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| event_type       | 是    | String  | button_click                                                                                                                                                                                                                                                                                                                                     | 事件名                                                                                                                                                    |
| event_id         | 是    | String  | 460daa08-0717-4385-8f2e-acb5bd019ee7                                                                                                                                                                                                                                                                                                             | 事件的唯一ID，建议通过UUID生成                                                                                                                                     |
| timestamp        | 是    | Long    | 1667877566697                                                                                                                                                                                                                                                                                                                                    | 事件生成时的时间戳，单位为毫秒                                                                                                                                        |
| app_id           | 是    | String  | shopping_dev                                                                                                                                                                                                                                                                                                                                     | 在Clickstream Web控制台创建应用时对应的id                                                                                                                          |
| platform         | 否    | String  | Android/iOS/Web/...                                                                                                                                                                                                                                                                                                                              | 设备平台                                                                                                                                                   |
| os_version       | 否    | String  | 10                                                                                                                                                                                                                                                                                                                                               | 系统版本号                                                                                                                                                  |
| unique_id        | 否    | String  | c84ad28d-16a8-4af4-a331-f34cdc7a7a18                                                                                                                                                                                                                                                                                                             | 唯一id来标识不同的用户并关联登录和未登录的行为                                                                                                                               |
| device_id        | 否    | String  | f24bec657ea8eff7                                                                                                                                                                                                                                                                                                                                 | 区分不同设备                                                                                                                                                 |
| make             | 否    | String  | Samsung                                                                                                                                                                                                                                                                                                                                          | 设备制造商                                                                                                                                                  |
| brand            | 否    | String  | Samsung                                                                                                                                                                                                                                                                                                                                          | 品牌                                                                                                                                                     |
| model            | 否    | String  | S23 Ultra                                                                                                                                                                                                                                                                                                                                        | 设备型号                                                                                                                                                   |
| carrier          | 否    | String  | CDMA                                                                                                                                                                                                                                                                                                                                             | 设备网络运营商名称                                                                                                                                              |
| network_type     | 否    | String  | Mobile                                                                                                                                                                                                                                                                                                                                           | 当前设备网络类型                                                                                                                                               |
| locale           | 否    | String  | zh_CN                                                                                                                                                                                                                                                                                                                                            | 本地信息                                                                                                                                                   |
| system_language  | 否    | String  | zh                                                                                                                                                                                                                                                                                                                                               | 设备语言代码                                                                                                                                                 |
| country_code     | 否    | String  | CN                                                                                                                                                                                                                                                                                                                                               | 设备的国家代码                                                                                                                                                |
| zone_offset      | 否    | int     | 2880000                                                                                                                                                                                                                                                                                                                                          | 设备 与 GMT 的原始偏移量（以毫秒为单位）                                                                                                                                |
| screen_height    | 否    | int     | 1920                                                                                                                                                                                                                                                                                                                                             | 屏幕高度（以像素为单位）                                                                                                                                           |
| screen_width     | 否    | int     | 1080                                                                                                                                                                                                                                                                                                                                             | 屏幕宽度（以像素为单位）                                                                                                                                           |
| viewport_height  | 否    | int     | 540                                                                                                                                                                                                                                                                                                                                              | 应用可视区域高度                                                                                                                                               |
| viewport_width   | 否    | int     | 360                                                                                                                                                                                                                                                                                                                                              | 应用可视区域宽度                                                                                                                                               |
| sdk_version      | 否    | String  | 1.2.3                                                                                                                                                                                                                                                                                                                                            | SDK版本号                                                                                                                                                 |
| sdk_name         | 否    | String  | aws-solution-clickstream-sdk                                                                                                                                                                                                                                                                                                                     | SDK 名称                                                                                                                                                 |
| app_package_name | 否    | String  | com.example.app                                                                                                                                                                                                                                                                                                                                  | 用户应用的应用程序包名称                                                                                                                                           |
| app_version      | 否    | String  | 1.1.0                                                                                                                                                                                                                                                                                                                                            | 应用程序版本号                                                                                                                                                |
| app_title        | 否    | String  | shopping                                                                                                                                                                                                                                                                                                                                         | 应用名称                                                                                                                                                   |
| items            | 否    | Object  | [{<br/>	&nbsp;&nbsp;"id": "b011ddc3-632f-47cb-a68a-ad83678ecfed",<br/>	&nbsp;&nbsp;"name": "Classic coat-rack",<br/>	&nbsp;&nbsp;"category": "housewares",<br/>	&nbsp;&nbsp;"price": 167<br/>}]                                                                                                                                                  | 物品列表，支持一次上传多个item，一次最多上传100个item<br>关于item数量限制请参考[事件和属性限制](./web.md#_13) <br>关于item的支持的属性，请参考：[item 属性](./web.md#item_1)                               |
| user             | 否    | Object  | {<br/>&nbsp;&nbsp;"_user_id": {<br/>&nbsp;&nbsp;&nbsp;&nbsp;"value": "0202d0e1",<br/>&nbsp;&nbsp;&nbsp;&nbsp;"set_timestamp": 1695006816345<br/>  &nbsp;&nbsp;},<br/> &nbsp;&nbsp; "username": {<br/>   &nbsp;&nbsp;&nbsp;&nbsp; "value": "carl",<br/>    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;"set_timestamp": 1695006816345<br/>  &nbsp;&nbsp;}<br/>} | 用户属性，每个属性key是属性名，每个属性包含一个对象，对象中包含两个属性分别是：<br>`value`：属性的值。 <br>`set_timestamp`：改属性设置时的时间戳毫秒值。<br> 一个事件中用户属性最多可以添加100个, 具体限制请参考：[事件和属性限制](./web.md#_13) |
| attributes       | 否    | Object  | {<br/>	&nbsp;&nbsp;"productName": "book",<br/>	&nbsp;&nbsp;"Price": 39.9<br/>}                                                                                                                                                                                                                                                                   | 自定义属性，一个事件最多可以添加500个自定义属性，且满足属性名的[命名规则](./web.md#_12)                                                                                                  |

### **请求返回值**

判断请求返回的HttpCode状态码为200，则认为请求成功，其他状态码均为失败，同时请求不返回其余任何内容。

#### HttpCode

| Code   | 说明                                                |
|--------|---------------------------------------------------|
| 200    | 请求成功                                              |
| 403    | 请求失败，请检查appId和请求端点是否匹配，如果接口配置认证，请检查认证 cookie 是否正确 |
| 413    | 请求失败，请求body超过1MB                                  |

## 代码示例

=== "cURL"

    ```bash
    curl --location 'https://example.com/collect?appId=test_release&platform=Android&event_bundle_sequence_id=1' \
    --header 'Content-Type: application/json; charset=utf-8' \
    --header 'X-Forwarded-For: 101.188.67.134' \
    --data '[{"event_type":"button_click","event_id":"460daa08-0717-4385-8f2e-acb5bd019ee7","timestamp":1667877566697,"app_id":"your appId","attributes":{"productName":"shoes","Price":99.9}},{"event_type":"item_view","event_id":"c6067c1c-fd8d-4fdb-bfaf-cc1212ca0195","timestamp":1667877565698,"app_id":"your appId","attributes":{"productName":"book","Price":39.9}}]'
    ```

=== "C# HttpClient"

    ```c#
    var client = new HttpClient();
    var request = new HttpRequestMessage(HttpMethod.Post, "https://example.com/collect?appId=test_release&platform=Android&event_bundle_sequence_id=1");
    request.Headers.Add("X-Forwarded-For", "101.188.67.134");
    var content = new StringContent("[{\"event_type\":\"button_click\",\"event_id\":\"460daa08-0717-4385-8f2e-acb5bd019ee7\",\"timestamp\":1667877566697,\"app_id\":\"your appId\",\"attributes\":{\"productName\":\"shoes\",\"Price\":99.9}},{\"event_type\":\"item_view\",\"event_id\":\"c6067c1c-fd8d-4fdb-bfaf-cc1212ca0195\",\"timestamp\":1667877565698,\"app_id\":\"your appId\",\"attributes\":{\"productName\":\"book\",\"Price\":39.9}}]", null, "application/json; charset=utf-8");
    request.Content = content;
    var response = await client.SendAsync(request);
    response.EnsureSuccessStatusCode();
    Console.WriteLine(await response.Content.ReadAsStringAsync());
    ```

=== "Java Okhttp"

    ```java
    OkHttpClient client=new OkHttpClient().newBuilder()
            .build();
            MediaType mediaType=MediaType.parse("application/json; charset=utf-8");
            RequestBody body=RequestBody.create(mediaType,"[{\"event_type\":\"button_click\",\"event_id\":\"460daa08-0717-4385-8f2e-acb5bd019ee7\",\"timestamp\":1667877566697,\"app_id\":\"your appId\",\"attributes\":{\"productName\":\"shoes\",\"Price\":99.9}},{\"event_type\":\"item_view\",\"event_id\":\"c6067c1c-fd8d-4fdb-bfaf-cc1212ca0195\",\"timestamp\":1667877565698,\"app_id\":\"your appId\",\"attributes\":{\"productName\":\"book\",\"Price\":39.9}}]");
            Request request=new Request.Builder()
            .url("https://example.com/collect?appId=test_release&platform=Android&event_bundle_sequence_id=1")
            .method("POST",body)
            .addHeader("Content-Type","application/json; charset=utf-8")
            .addHeader("X-Forwarded-For","101.188.67.134")
            .build();
            Response response=client.newCall(request).execute();
    ```

=== "JavaScript Fetch"

    ```javascript
    var myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json; charset=utf-8");
    myHeaders.append("X-Forwarded-For", "101.188.67.134");
    
    var raw = "[{\"event_type\":\"button_click\",\"event_id\":\"460daa08-0717-4385-8f2e-acb5bd019ee7\",\"timestamp\":1667877566697,\"app_id\":\"your appId\",\"attributes\":{\"productName\":\"shoes\",\"Price\":99.9}},{\"event_type\":\"item_view\",\"event_id\":\"c6067c1c-fd8d-4fdb-bfaf-cc1212ca0195\",\"timestamp\":1667877565698,\"app_id\":\"your appId\",\"attributes\":{\"productName\":\"book\",\"Price\":39.9}}]";
    
    var requestOptions = {
        method: 'POST',
        headers: myHeaders,
        body: raw,
        redirect: 'follow'
    };
    
    fetch("https://example.com/collect?appId=test_release&platform=Android&event_bundle_sequence_id=1", requestOptions)
        .then(response => response.text())
        .then(result => console.log(result))
        .catch(error => console.log('error', error));
    ```

=== "Python Request"

    ```python
    import requests
    
    url = "https://example.com/collect?appId=test_release&platform=Android&event_bundle_sequence_id=1"
    
    payload = "[{\"event_type\":\"button_click\",\"event_id\":\"460daa08-0717-4385-8f2e-acb5bd019ee7\",\"timestamp\":1667877566697,\"app_id\":\"your appId\",\"attributes\":{\"productName\":\"shoes\",\"Price\":99.9}},{\"event_type\":\"item_view\",\"event_id\":\"c6067c1c-fd8d-4fdb-bfaf-cc1212ca0195\",\"timestamp\":1667877565698,\"app_id\":\"your appId\",\"attributes\":{\"productName\":\"book\",\"Price\":39.9}}]"
    headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Forwarded-For': '101.188.67.134'
    }
    
    response = requests.request("POST", url, headers=headers, data=payload)
    
    print(response.text)
    ```

## 验证数据上报成功

如果您启用了数据处理，则可以直接通过 SQL 查询 Athena 中的 **event**、**event_parameter**、**user**、**item** 或 **ingestion_events** 表。

而且，如果您在数据建模中启用了 Redshift，则可以直接通过 SQL 查询 Redshift 中的**event**、**event_parameter**、**user**或**item**表。