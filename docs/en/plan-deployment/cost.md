---
title: "Cost"
weight: 1

---

!!! info "Important"

    The following cost estimations are examples and may vary depending on your environment.

You are responsible for the cost of AWS services used when running this solution. Deploying this solution will only create a solution web console in your AWS account, which is completely serverless and typically can be covered within free tier.

The majority of the cost for this solution is incurred by the data pipeline. As of this revision, the main factors affecting the solution cost include:

- **Ingestion module**: the cost depends on the size of the ingestion server and the type of the data sink you choose.

- **Data processing and modeling module** (optional): the cost depends on whether you choose to enabled this module and its relevant configurations

- **Enabled Dashboards** (optional): the cost depends on whether you choose to enabled this module and its relevant configurations

- **Additional features**

The following are cost estimations for monthly data volumes of 10/100/1000 RPS (request per second) with different data pipeline configurations. Cost estimation are provided by modules. To get a total cost for your use case, sum the cost by modules based on your actual configuration.

!!! info "Important"

    As of this revision, the following cost is calculated with `On-Demand` prices in `us-east-1` region measured in USD.

## Ingestion module

Ingestion module includes the following cost components:

- Application load balancer and public IPv4 addresses
- EC2 for ECS
- Data sink (Kinesis Data Streams | Kafka | Direct to S3)
- S3 storage

Key assumptions include:

- Compressed request payload: 2KB (10 events per request)
- MSK configurations (m5.large * 2)
- KDS configuration (on-demand, provision)
- 10/100/1000RPS
- Three public subnets are used

| Request Per Second | ALB cost | EC2 cost  |  Buffer type      | Buffer cost | S3 cost   |  Total (USD/Month) |
| ------------------ | --- | ---  |  --------------   | ----------- | ---  |  --------- |
| 10RPS (49GB/month)             |  $28.8  |  $122 |  Kinesis (On-Demand) |    $38       |   $3  |     $191.8  |
|                    |  $28.8  |  $122 |  Kinesis (Provisioned 2 shard)   |      $22       |  $3   |   $175.8  |
|                    |  $28.8  |  $122 |  MSK (m5.large * 2, connector MCU * 1)   |       $417      |   $3  |     $570.8   |
|                         | $28.8    |  $122 |  None              |             |  $3    |      $153.8   |
|100RPS (490GB/month)          |  $53.8  |  $122  |  Kinesis(On-demand)              |      $115       |  $4   |     $294.8 |
|                         | $53.8    |   $122 |  Kinesis (Provisioned 2 shard)   |      $26       | $4    |     $205.8  |
|           |   $53.8  |  $122  |   MSK (m5.large * 2, connector MCU * 1)              |      $417       |  $4   |     $596.8
|           |   $53.8  |  $122 |      None              |             |  $4    |     $179.8
|1000RPS (4900GB/month)          |   $262.8  |   $122 |      Kinesis(On-demand)              |      $1051       |  $14   |    $1449.8 |
|                         |  $262.8   |  $122  |  Kinesis (Provisioned 10 shard)   |    $180         |   $14  |     $578.8  |
|           |  $262.8   | $122  |      MSK (m5.large * 2, connector MCU * 2~3)              |      $590       |  $14  |     $988.8
|           |  $262.8   | $122   |      None              |            |  $14   |     $398.8 

### Data transfer
There are associated costs when data is transferred from EC2 to the downstream data sink. Below is an example of data transfer costs based on 1000 RPS and a 2KB request payload.

1. EC2 Network In: This does not incur any costs.
2. EC2 Network Out: There are three data sink options:

    | Data Sink Type | Way to access data sink |  Dimensions |   Total (USD/Month) |
    | ------------------ | --- | --- | ---  |  
    | S3         |  S3 Gateway endpoints | The S3 Gateway endpoints does not incur any costs   | $0  |  
    | MSK          |  |  Data processed cost ($0.010 per GB in/out/between EC2 AZs)  | $210  |       
    | KDS          |  NAT |  NAT fixed cost: $64 (2 Availability Zones and a NAT per AZ, $0.045 per NAT Gateway Hour). <br> Data processed cost: $1201 ($0.045 per GB Data Processed by NAT Gateways).  | $1266  | 
    | KDS          |  VPC Endpoint |  VPC Endpoint fixed cost: $14.62 (Availability Zones $0.01 per AZ Hour). <br> Data processed cost: $267 ($0.01 per GB Data Processed by Interface endpoints).  | $281.62  | 

    We suggest using a [VPC endpoint](https://docs.aws.amazon.com/whitepapers/latest/aws-privatelink/what-are-vpc-endpoints.html) for the KDS data sink. For more information on using the VPC endpoint, please refer to the VPC endpoint documentation. 

## Data processing & data modeling modules

Data processing & modeling module include the following cost components if you choose to enable:

- EMR Serverless

- Redshift

Key assumptions include:

- 10/100/1000 RPS
- Data processing interval: hourly/6-hourly/daily
- EMR running three built-in plugins to process data

| Request Per Second | EMR schedule interval |  EMR cost | Redshift type            | Redshift Load cost  | Redshift Storage cost | S3 cost | Total (USD/Month) |
| ----------------------- | --------------------- | ---------------- | -------- | ------------------------ |  ----- | ----- | -----  |
| 10RPS             | Hourly                |     $66.5 ($1.35/GB)    | Serverless (8 based RPU) |     $172     |  $3.4     |  $0.36 |  $242.26    |
|                         | 6-hourly              |     $22.2 ($0.45/GB)     | Serverless(8 based RPU)               |      $70      |  $3.4       | $0.36 |  $95.96    |
|                         | Daily                 |      $39 ($0.8/GB)   | Serverless(8 based RPU)               |     $31     |  $3.4          |  $0.36 | $73.76    |
| 100RPS             | Hourly                |      $353 ($0.72/GB)   | Serverless (8 based RPU) |       $385       |  $34      | $3.6 |  $775.6    |
|                         | 6-hourly              |     $179 ($0.37/GB)     | Serverless(8 based RPU)               |       $282       |  $34      |  $3.6 |  $498.6    |
|                         | Daily                 |     $247 ($0.5/GB)     | Serverless(8 based RPU)               |       $160        |  $34      |  $3.6 |   $444.6   |
| 1000RPS             | Hourly                |      $1260 ($0.26/GB)   | Serverless (16 based RPU) |       $2325     |  $340        | $36 | $3961    |

!!! info "Note"
    The term **Redshift storage cost** refers to the cost of Redshift storage incurred for one month based on the corresponding RPS (Requests Per Second) specified in the above table. If the data is stored for more than one month, please refer to the [Redshift pricing](https://aws.amazon.com/redshift/pricing/?nc1=h_ls) for calculating the pricing.

## Reporting module

Reporting module include the following cost components if you choose to enable:

- QuickSight

Key assumptions include

- QuickSight Enterprise subscription
- Exclude Q cost
- Access through **Analytics Studio**
- **Two authors** with monthly subscription
- 10GB SPICE capacity

| Daily data volume/RPS | Authors |  SPICE | Total cost (USD/Month) |
| --------------------- | ------- |  ----- | ----- |
| All size              | $24      |    0   | $24 |

!!! info "Note"
    All your data pipelines are applied to the above QuickSight costs, even the visualizations managed outside the solution.

## Logs and Monitoring

The solution utilizes CloudWatch Logs, CloudWatch Metrics and CloudWatch Dashboard to implement logging, monitoring and visualizating features. The total cost is around $14 per month and may fluctuate based on the volume of logs and the number of metrics being monitored.

## Additional features

You will be charged with additional cost only if you choose to enable the following features.

### Secrets Manager

- If you enable reporting, the solution creates a secret in Secrets Manager to store the Redshift credentials used by QuickSight visualization. **Cost**: 0.4 USD/month.

- If you enable the authentication feature of the ingestion module, you need to create a secret in Secrets Manager to store the information for OIDC. **Cost**: 0.4 USD/month.

### Amazon Global Accelerator

It incurs a fixed hourly charge, a per-day volume data transfer cost and two public IPv4 addresses cost.

Key assumptions:

- Ingestion deployment in `us-east-1`

| Request Per Second | Fixed hourly cost | Two public IPv4 addresses cost | Data transfer cost | Total cost (USD/Month) |
| --------------------- | ----------------- | ----------------- | ------------------ | ---------- |
| 10RPS           |        $18           |        $7.2           |          $0.6          |       $25.8     |
| 100RPS         |          $18         |        $7.2           |           $6         |      $31.2      |
| 1000RPS       |            $18       |        $7.2           |            $60        |      $85.2      |

### Application Load Balancer Access log

You are charged storage costs for Amazon S3, but not charged for the bandwidth used by Elastic Load Balancing to send log files to Amazon S3. For more information about storage costs, see [Amazon S3 pricing](https://aws.amazon.com/s3/pricing/).

| Request Per Second | Log size(GB) | S3 cost(USD/Month)|
| --------------------- | -------- | ------- |
| 10 RPS           |    16.5       |    $0.38     |
| 100 RPS         |     165     |      $3.8   |
| 1000 RPS       |     1650     |    $38     |

[vpce]: https://docs.aws.amazon.com/whitepapers/latest/aws-privatelink/what-are-vpc-endpoints.html