
{{ solution_name }} provides different client-side SDKs, which can make it easier for you to report click stream data to the data pipeline created in the solution. Currently, the solution supports the following platforms:

- [Android](./android.md)
- [Swift](./swift.md)
- [Web](./web.md)
- [Flutter](./flutter.md)
- [React Native](./react-native.md)
- [WeChat Miniprogram](./wechat.md)

In addition, we also provide [HTTP API](./http-api.md) to collect clickstream data from other platforms (e.g., server) through http request.

## Key features and benefits

- **Automatic data collection**. Clickstream SDKs provide built-in capabilities to automatically collect common events, such as screen view or page view, session, and user engagement, so that you only need to focus on recording business-specific events.
- **Ease of use**. Clickstream SDKs provide multiple APIs and configuration options to simplify the event reporting and attribute setting operation.
- **Cross-platform analytics**. Clickstream SDKs are consistent in event data structure, attribute validation rules, and event sending mechanism, so that data can be normalized in the same structure for cross-platform analytics.

!!! info "Note"

    All Clickstream SDKs are open source under Apache 2.0 License in [GitHub][github]. You can customize the SDKs if needed. All contributions are welcome.

[github]: https://github.com/awslabs/?q=clickstream&type=all&language=&sort=
