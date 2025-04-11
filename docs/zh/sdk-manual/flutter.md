# Clickstream Flutter SDK

## 简介

Clickstream Flutter SDK 可以帮助您轻松地从移动设备收集和发送应用内事件到您配置的解决方案数据管道。

该 SDK 基于 [Clickstream Android SDK](./android.md) 和 [Clickstream Swift SDK](./swift.md) 构建. 因此, flutter
SDK 还支持自动收集常见的用户事件和属性（例如会话开始、首次打开）。 此外，我们还添加了易于使用的 API 来简化 Flutter
应用程序中的数据收集。

### 平台支持

**Android**: 4.1（API 级别 16）及更高版本。

**iOS**: 13 及更高版本。

## 集成 SDK

### 1. 添加 SDK

```bash
flutter pub add clickstream_analytics
```

完成后，使用如下命令重新构建您的 Flutter 应用程序：

```bash
flutter run
```

### 2. 初始化 SDK

从点击流解决方案 Web 控制台复制配置代码，配置代码应如下所示。 在解决方案控制台中将应用程序注册到数据管道后，您还可以手动添加此代码段并替换
appId 和 endpoint 的值。

```dart
import 'package:clickstream_analytics/clickstream_analytics.dart';

final analytics = ClickstreamAnalytics();
analytics.init(
  appId: "your appId",
  endpoint: "https://example.com/collect"
);
```

!!! info "Important"

    - 您的 appId 和 endpoint 已在其中设置好了。
    - 我们只需要在应用程序启动后初始化一次SDK。 建议您在应用程序的主函数中执行此操作。
    - 我们可以使用 `bool result = await analytics.init()` 来获取初始化结果的布尔值。

### 3. 开始使用

#### 记录事件

在需要记录事件的地方添加以下代码。

```dart
import 'package:clickstream_analytics/clickstream_analytics.dart';

final analytics = ClickstreamAnalytics();

// 记录带属性的事件
analytics.record(name: 'button_click', attributes: {
  "event_category": "shoes",
  "currency": "CNY",
  "value": 279.9
});

// 记录只带有事件名的事件
analytics.record(name: "button_click");
```

#### 添加全局属性

1. 在初始化 SDK 时添加全局属性。

    以下示例代码展示了如何在初始化 SDK 时添加 traffic source 相关字段作为全局属性。
    ```dart
    analytics.init({
      appId: "your appId",
      endpoint: "https://example.com/collect",
      globalAttributes: {
        Attr.TRAFFIC_SOURCE_SOURCE: "amazon",
        Attr.TRAFFIC_SOURCE_MEDIUM: "cpc",
        Attr.TRAFFIC_SOURCE_CAMPAIGN: "summer_promotion",
        Attr.TRAFFIC_SOURCE_CAMPAIGN_ID: "summer_promotion_01",
        Attr.TRAFFIC_SOURCE_TERM: "running_shoes",
        Attr.TRAFFIC_SOURCE_CONTENT: "banner_ad_1",
        Attr.TRAFFIC_SOURCE_CLID: "amazon_ad_123",
        Attr.TRAFFIC_SOURCE_CLID_PLATFORM: "amazon_ads",
        Attr.APP_INSTALL_CHANNEL: "amazon_store"
      }
    });
    ```

2. 在初始化 SDK 后添加全局属性。
    ```dart
    analytics.addGlobalAttributes({
      Attr.TRAFFIC_SOURCE_MEDIUM: "Search engine",
      "level": 10
    });
    ```

建议在初始化 SDK 时设置全局属性，设置后记录的所有事件都会包含全局属性。

#### 删除全局属性

```dart
analytics.deleteGlobalAttributes(["level"]);
```

#### 登录和登出

```dart
// 当用户登录成功后调用
analytics.setUserId("userId");

// 当用户退出登录时调用
analytics.setUserId(null);
```

#### 添加用户属性

```dart
analytics.setUserAttributes({
  "userName":"carl",
  "userAge": 22
});
```

当前登录用户的属性会进行缓存，因此在下次 App 打开时不需要再次设置所有的用户属性，当然您可以使用相同的
API `analytics.setUserAttributes()` 在当用户属性改变时来更新当前用户的属性。

!!! info "重要提示"

    如果您的应用已经上线，这时大部分用户已经登录过，则第一次接入Clickstream SDK时请手动设置一次用户属性，确保后续事件都带有用户属性。

#### 记录带有 Item 的事件

您可以添加以下代码来记录带有 Item 的事件，同时您可以在 `attributes` Map 中添加自定义 Item 属性。 除了预置属性外，一个 Item
最多可以添加 10 个自定义属性。

```dart
var itemBook = ClickstreamItem(
    id: "123",
    name: "Nature",
    category: "book",
    price: 99,
    attributes: {
      "book_publisher": "Nature Research"
    }
);

analytics.record(
    name: "view_item", 
    attributes: {
        Attr.VALUE: 99,
        Attr.CURRENCY: "USD"
        "event_category": "recommended"
    }, 
    items: [itemBook]
);
```

要记录 Item 中的更多属性，请参阅 [Item 属性](android.md#item_1)。

!!! warning "重要提示"

    数据管道的版本需要在 v1.1 及以上才能够处理带有自定义属性的 Item。
    
    ITEM_ID 为必需字段，如果不设置，该 Item 将被丢弃。

#### 手动记录 Screen View 事件

默认情况下，当 Android Activity 触发 `onResume` 或 iOS ViewController 触发 `viewDidAppear` 时，SDK
会自动记录预置的 `_screen_view` 事件。

无论是否启用预置的 `_screen_view` 事件，您都可以手动记录屏幕浏览事件。添加以下代码以记录带有如下两个属性的 `_screen_view`
事件。

* `screenName` 必需字段，屏幕的名称。
* `screenUniqueId` 可选字段，设置为您组件的 id。如果不设置，SDK会以当前原生 Activity 或原生 ViewController 的 hashcode
  作为默认值。

```dart
analytics.recordScreenView(
  screenName: 'Main',
  screenUniqueId: '123adf',
  attributes: { ... }
);
```

#### 其他配置项

除了必需的 `appId` 和 `endpoint` 之外，您还可以配置其他参数以满足更多定制化的使用：

```dart
final analytics = ClickstreamAnalytics();
analytics.init(
  appId: "your appId",
  endpoint: "https://example.com/collect",
  isLogEvents: false,
  isCompressEvents: false,
  sendEventsInterval: 10000,
  isTrackScreenViewEvents: true,
  isTrackUserEngagementEvents: true,
  isTrackAppExceptionEvents: false,
  authCookie: "your auth cookie",
  sessionTimeoutDuration: 1800000,
  globalAttributes: {
    "_traffic_source_medium": "Search engine",
  }
);
```

以下是每个参数的说明

| 参数名称                        | 是否必需	 | 默认值	    | 解释                                  |
|-----------------------------|-------|---------|-------------------------------------|
| appId                       | 是     | --      | 在解决方案控制平面中您应用程序的 ID                 |
| endpoint                    | 是     | --      | 您将事件上传到 Clickstream 摄取服务器的 URL 请求路径 |
| isLogEvents                 | 否     | false   | 是否自动打印事件 JSON 以调试事件，[了解更多](#_10)    |
| isCompressEvents            | 否     | true    | 上传事件时是否通过gzip压缩事件内容                 |
| sendEventsInterval          | 否     | 10000   | 事件发送间隔（毫秒）                          |
| isTrackScreenViewEvents     | 否     | true    | 是否自动记录 screen view（屏幕浏览） 事件         |
| isTrackUserEngagementEvents | 否     | true    | 是否自动记录 user engagement（用户参与） 事件     |
| isTrackAppExceptionEvents   | 否     | false   | 是否自动记录应用崩溃事件                        |
| authCookie                  | 否     | --      | 您的 AWS 应用程序负载均衡器身份验证 cookie         |
| sessionTimeoutDuration      | 否     | 1800000 | 会话超时的时长（毫秒）                         |
| globalAttributes            | 否     | --      | 初始化SDK时的全局属性                        |

#### 更新配置

您可以在初始化 SDK 后更新默认配置，以下是您可以更新的配置参数。

```dart
final analytics = ClickstreamAnalytics();
analytics.updateConfigure(
    appId: "your appId",
    endpoint: "https://example.com/collect",
    isLogEvents: true,
    isCompressEvents: false,
    isTrackScreenViewEvents: false
    isTrackUserEngagementEvents: false,
    isTrackAppExceptionEvents: false,
    authCookie: "test cookie");
```

#### 实时发送事件

```dart
final analytics = ClickstreamAnalytics();
analytics.flushEvents();
```

#### 禁用 SDK

您可以根据需要禁用该SDK。禁用 SDK 后，SDK 将不会处理日志记录和发送任何事件。当然，当您需要继续记录事件时，您可以再次启用 SDK。

```dart
final analytics = ClickstreamAnalytics();

// 禁用 SDK
analytics.disable();

// 启用 SDK
analytics.enable();
```

#### 调试事件

您可以按照以下步骤查看事件原始 JSON 并调试您的事件。

1. 使用 `analytics.updateConfigure()` 并在调试模式下将 `isLogEvents` 设置成为 true, 例如:
    ```dart
    // 在调试模式下打开事件 JSON 内容的打印
    analytics.updateConfigure(isLogEvents: true);
    ```

2. 集成 SDK 并启动您的应用程序。
    1. 对于Android应用程序日志，我们可以直接在终端窗口中看到。 您还可以使用 Android Studio **Logcat** 窗口中的过滤器来查看日志。
    2. 对于iOS应用程序日志，我们需要通过 Xcode 启动 App 后并打开日志面板来查看它。

3. 在 filter 中输入 `EventRecorder`，您将看到 Clickstream Flutter SDK 记录的所有事件的 JSON 内容。

## 数据格式定义

### 数据类型

Clickstream Flutter SDK 支持以下数据类型：

| 数据类型    | 范围                                            | 示例            |
|---------|-----------------------------------------------|---------------|
| int     | -9223372036854775808 ～ 9223372036854775807  	 | 12            |
| double  | 5e-324 ~ 1.79e+308                            | 3.14          |
| bool    | true, false                                   | true          |
| String  | max 1024 characters                           | "Clickstream" |

### 命名规则

1. 事件名称和属性名称不能以数字开头，只能包含大写字母、小写字母、数字和下划线，如果属性名称或用户属性名称无效，将丢弃该属性并记录错误。

2. 不要在事件名称或属性名称前使用 `_` 作为前缀，因为 `_` 前缀保留给解决方案使用。

3. 事件名称和属性名称区分大小写，因此 `Add_to_cart` 和 `add_to_cart` 将被识别为两个不同的事件名称。

### 事件和属性限制

为了提高查询和分析的效率，我们需要对事件进行以下限制：

| 名称                | 建议           | 硬限制          | 超过限制的处理策略                               | 错误码  |
|-------------------|--------------|--------------|-----------------------------------------|------|
| 事件名称合规            | --           | --           | 丢弃该事件，打印日志并记录`_clickstream_error`事件     | 1001 |
| 事件名称长度            | 25 个字符以下     | 50 个字符       | 丢弃该事件，打印日志并记录`_clickstream_error`事件     | 1002 |
| 事件属性名称的长度         | 25 个字符以下     | 50 个字符       | 丢弃该属性、打印日志并在事件属性中记录错误                   | 2001 |
| 属性名称合规            | --           | --           | 丢弃该属性、打印日志并在事件属性中记录错误                   | 2002 |
| 事件属性值的长度          | 少于 100 个字符   | 1024 个字符     | 丢弃该属性、打印日志并在事件属性中记录错误                   | 2003 |
| 每个事件的事件属性         | 50 属性以下      | 500 event 属性 | 丢弃超过限制的属性、打印日志并在事件属性中记录错误               | 2004 |
| 用户属性数             | 25岁以下属性      | 100个用户属性     | 丢弃超过限制的属性、打印日志并记录`_clickstream_error`事件 | 3001 |
| 用户属性名称的长度         | 25 个字符以下     | 50 个字符       | 丢弃该属性、打印日志并记录`_clickstream_error`事件     | 3002 |
| 用户属性名称合规          | --           | --           | 丢弃该属性、打印日志并记录`_clickstream_error`事件     | 3003 |
| 用户属性值的长度          | 50 个字符以下     | 256 个字符      | 丢弃该属性、打印日志并记录`_clickstream_error`事件     | 3004 |
| 事件中 Item 的个数      | 50 个 Item 以下 | 100 个 Item   | 丢弃超出限制的 Item，打印错误日志并在事件属性中记录错误          | 4001 |
| Item 属性值的长度       | 少于 100 个字符   | 256 个字符      | 丢弃超出限制的 Item，打印错误日志并在事件属性中记录错误          | 4002 |
| 一个 Item 中自定义属性的个数 | 少于 10 个自定义属性 | 10 个自定义属性    | 丢弃超出限制的 Item，打印错误日志并在事件属性中记录错误          | 4003 |
| Item 属性名的长度       | 25 个字符以下     | 50 个字符       | 丢弃超出限制的 Item，打印错误日志并在事件属性中记录错误          | 4004 |
| Item 属性名称合规       | --           | --           | 丢弃超出限制的 Item，打印错误日志并在事件属性中记录错误          | 4005 |

!!! info "重要提示"

    - 字符限制对于单字节字符语言（例如英语）和双字节字符语言（例如中文）是相同的。
    - 事件属性数包括事件中公共属性和预设属性。
    - 如果添加了具有相同名称的属性或用户属性超过两次，将使用最新的值。
    - 超过限制的所有错误都会在事件attributes里记录 `_error_code` 和 `_error_message` 这两个字段。

## 预置事件

Android: 参考 [Android SDK 预置事件](./android.md#_13)

iOS: 参考 [Swift SDK 预置事件](./swift.md#_13)

## 事件属性

Android: 参考 [Android SDK 事件属性](./android.md#_18)

iOS: 参考 [Swift SDK 事件属性](./swift.md#_18)

## SDK更新日志

参考：[GitHub 更新日志](https://github.com/awslabs/clickstream-flutter/releases)

原生 SDK 版本依赖关系

| Flutter SDK 版本 | Android SDK 版本     | Swift SDK 版本 |
|----------------|--------------------|--------------|
| 0.4.2          | 0.13.0             | 0.12.3       |
| 0.3.0 ~ 0.4.1  | 0.12.0             | 0.11.0       |
| 0.2.0          | 0.10.0             | 0.9.1        |
| 0.1.0          | 0.9.0              | 0.8.0        |

## 参考链接

[SDK 源码](https://github.com/awslabs/clickstream-flutter)

[SDK 问题](https://github.com/awslabs/clickstream-flutter/issues)
