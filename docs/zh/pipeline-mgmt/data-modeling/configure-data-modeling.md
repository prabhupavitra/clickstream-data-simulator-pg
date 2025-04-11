# 数据建模设置

数据管道处理完事件数据后，您可以将数据加载到分析引擎进行数据建模，比如Redshift或Athena，其中数据将被汇总并组织成不同的视图（如事件、设备、会话），以及常用的计算指标。

您可以选择使用Redshift或Athena，或两者都用。

!!! tip "提示"

    我们建议你选择两者都用，也就是说，使用Redshift进行热数据建模，并使用Athena进行全时间数据分析。

您可以为 Redshift 设置以下配置。

  * **Redshift 模式**：选择 Redshift 无服务器或预设模式。

    * **无服务器模式**

        * **基础 RPU**：RPU 代表 Redshift 处理单元。Amazon Redshift Serverless 以 RPU 计算数据仓库容量，这些是处理工作负载所使用的资源。基础容量指定 Amazon Redshift 用于服务查询的基础数据仓库容量，并以 RPU 表示。提高基础容量可以改善查询性能，尤其是对于消耗大量资源的数据处理工作。

        * **VPC**：基于 Amazon VPC 服务的虚拟私有云（VPC）是您在 AWS 云中的私有、逻辑隔离的网络。

            !!! info "注意"
            
                如部署在逻辑隔离的网络中，VPC 必须为 S3，Logs，Dynamodb，STS，States, Redshift 以及 Redshift-data 服务拥有 VPC 终端。

        * **安全组**：此 VPC 安全组定义了可以在 VPC 中使用的哪些子网和 IP 范围可访问 Redshift 服务端点。

        * **子网**：选择至少三个现有的 VPC 子网。

            !!! info "注意"
            
                我们建议出于最佳安全实践使用私有子网进行部署。

            !!! info "注意"
            
                请确保您的子网有足够的可用 IP 地址来创建 Redshift Serverless，请查阅[每个子网所需的可用 IP 地址数量][serverless-usage-considerations]。

    * **预设模式**

        * **Redshift 集群**: 使用预设模式的 Amazon Redshift 集群，您可以使用符合成本和性能规格的节点类型构建集群。您必须设置、调整和管理 Amazon Redshift 预设模式的集群。

        * **数据库用户**: 该解决方案需要权限才能在 Redshift 集群中访问和创建数据库。默认情况下，它授予 Redshift Data API 管理员用户执行命令以创建数据库、表和视图以及加载数据的权限。

    * **数据范围**：考虑到让 Redshift 保存所有数据的成本效益问题，我们建议 Redshift 仅保存热数据，而所有数据都存储在 S3 中。需要定期在 Redshift 中删除过期数据。

* **Athena**：选择 Athena 使用在 Glue 数据目录中创建的表查询 S3 上的所有数据。

[serverless-usage-considerations]: https://docs.aws.amazon.com/redshift/latest/mgmt/serverless-usage-considerations.html