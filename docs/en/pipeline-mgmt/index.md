# Data pipeline
Data pipeline is the core functionality of this solution. In the {{ solution_name }} solution, we define a data pipeline as a sequence of integrated AWS services that ingest, process, and model the clickstream data into a destination data warehouse for analytics and visualization. It is also designed to efficiently and reliably collect data from your websites and apps to a S3-based data lake, where it can be further processed, analyzed, and utilized for additional use cases (such as real-time monitoring, and personal recommendation).

## Concepts
Before creating a data pipeline, you can learn a few concepts in this solution so that you can configure the data pipeline to best fit your business goal.

### Project
A project in this solution is the top-level entity, like a container, that groups your apps and data pipeline for collecting and processing clickstream data. One project contains one data pipeline, and can have one or more apps registered to it.

### Data pipeline
A data pipeline is deployed into one AWS region, which means all the underlining resources are created in one AWS region. A data pipeline in this solution contains four modules:

- **Data ingestion**: a web service that provides an endpoint to collect data through HTTP requests, and sink the data in a streaming service (e.g., Kafka, Kinesis) or S3.
- **Data processing**: a module that transforms raw data to the solution schema and enriches data with additional dimensions.
- **Data modeling**: a module that aggregates data to calculate metrics for business analytics.
- **Reporting**: a module that creates metrics and out-of-the-box visualizations in QuickSight, and allows users to view dashboards and query clickstream data in Analytics Studio.

### App
An app in this solution can represent an application in your business, which might be built on one or multiple platforms (for example, Android, iOS, and Web).

### Analytics Studio
Analytics Studio is a web console for business or data analysts to view dashboards, query, and manage clickstream data. 

Below is a diagram to help you better understand those concepts and their relationship with each other in the AWS context.

![concepts](../images/pipe-mgmt/concepts-v11.png)

## Prerequisites

You can configure the pipeline in all AWS regions. For opt-in regions, you need to [enable them][opt-in-regions] firstly.

Before you start to configure the pipeline in a specific region, make sure you have the following in the target region:

- At least one Amazon VPC.
{%
include-markdown "./vpc-prerequisites.md"
%}
- an Amazon S3 bucket located in the same Region.
- If you need to enable Redshift Serverless as analytics engine in data modeling module, you need have subnets across at least three AZs.
- QuickSight Enterprise edition subscription is required if the reporting is enable.

[opt-in-regions]: https://docs.aws.amazon.com/general/latest/gr/rande-manage.html
[vpc-endpoints]: https://docs.aws.amazon.com/whitepapers/latest/aws-privatelink/what-are-vpc-endpoints.html