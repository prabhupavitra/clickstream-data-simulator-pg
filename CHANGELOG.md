# Change Log

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.11] - 2025-03-12
    
### Security
  
* upgrade jsonpath-plus version to 10.3 

## [1.1.10] - 2025-02-27
    
### Security
  
* upgrade pnpm from v8.15.3 to v9.15.3

## [1.1.9] - 2025-01-24
    
### Security
  
* Updated ingestion container base images for vector and nginx

## [1.1.8] - 2024-11-20
  
### Added
  
* added solution-manifest.yaml
  
### Security
  
* updated versions of axios, browserslist, cross-spawn, esbuild, express, jsonpath-plus, html-minifier, http-proxy-middleware, setuptools, webpack

## [1.1.7] - 2024-09-20

### Updated

* use EC2 launch template instead of deprecated launch configuration. See Upgrade documentation for the post-upgrade action details.

### Fixed

* scan workflow fails due to processing events with large sizes of custom properties
* retry failure pipeline not working

## [1.1.6] - 2024-05-24

### Updated

* optimize data schema for improving query performance
* support out-of-box traffic source analysis
* new out-of-box dashboard look
* out-of-box dashboard supports timezone
* explore query improvements
* allow creating an internal load balancer as the ingestion endpoint
* improve stability of loading data into Redshift
* React Native SDK support

### Fixed

* inconsistent pipeline status in edge cases

## [1.1.5] - 2024-03-08

### Updated

* onboard QuickSight in AWS China Beijing region
* set the materialized views of Redshift backup YES
* optimize the waiting backoff when copying data to Redshift
* optimize the waiting backoff when creating or updating database schema in Redshift

### Fixed

* handle multiple source IPs in single event
* filter event date happened in future
* incorrect cron validation when configuring data processing interval

## [1.1.4] - 2024-02-28

### Fixed

* fail to create schema in provisioned redshift
* fail to delete project that was onboard myApplication


## [1.1.3] - 2024-01-30

### Updated

* improve the performance of session and event reports

### Fixed

* the dashboard of Analysis Studio can not list the customized dashboards created by Analyzer users
* the solution metadata is not updated after upgrading the web console of solution
* the processed data can not be loaded into Redshift due to the data length exceed the length of column definition

## [1.1.2] - 2024-01-16

### Updated

* improve the performance of querying metadata
* improve the performance of exploration queries

### Fixed

* mitigate the intermittent failure of creating QuickSight stack
* mitigate the potential timeout when upgrading data modeling in Redshift
* few dashboard rendering issues
* the metadata scanning failure with long non-ascii data
* coordinate the alarm period of scanning metadata workflow
* manually trigger metadata scanning
* choose S3 bucket in other regions
* transform session data in GTM transformer

## [1.1.1] - 2023-12-22

### Fixed

#### Web Console and Data pipeline

* mitigate the data modeling by putting the Redshift stack into UPDATE_ROLLBACK_FAILED status when updating pipeline
* fail to update the endpoint path, domain name and auth of ingestion
* fail to get pipeline detail if its age is more than 90 days

#### Analytics Studio

* wrong user count in the built-in dashboard
* incorrect default value of dataset parameter causes the failure to load values of selectable fields in the built-in dashboard

## [1.1.0] - 2023-12-08

### Web Console and Data pipeline

#### Added

* support self-hosted Apache Kafka cluster
* add resource awareness to the Data Processing scheduler
* add user roles management
* add metadata scanning workflow
* add third-party transform plug-in: GTM Server Side plug-in

#### Changed

* update the ingestion configuration of the existing data pipeline
* data schema updates
* update out-of-box reporting dashboards
* improve pipeline status management
* improve the reliability of service availability checks

#### Fixed

* check the incorrect configuration of NAT gateway or VPC endpoints for data pipeline
* gracefully handle with the incomplete user profile

### SDK

#### Added

* add Flutter SDK
* add Wechat Miniprogram SDK

### Analytics Studio

#### Added

* Dashboard
* Explore
* Analyzes
* Data management

## [1.0.3] - 2023-10-30

### Fixed

- the creation of reporting stack failure

## [1.0.2] - 2023-08-31

### Fixed

- schema 'items' type for data modeling
- create Athena stack when disabling Redshift in pipeline
- inconsistently set the warm pool size
- can not update endpoint path of ingestion sever
- cors not working when specifying specific domain(s)
- let domain name pattern comply with TLD standard
- web sdk integration guide
- UI spell typo

## [1.0.1] - 2023-07-24

### Fixed

- can not update interval of data processing in the existing pipeline
- can not update the CORS configuration of the existing pipeline
- incorrectly check the QuickSight availability in China regions
- can not retry when putting events into KDS throttled
- time filter does not work for the visuals of device and retention reports
- increase the timeout to avoid some stacks left after deleting the project
- the typos in web console UI
- incorrect plugin descriptions in web console
- remove broken and duplicated links in navigation bar of web console
- set the default compression option as true for SDK configuration files

## [1.0.0] - 2023-07-07

### Added

- All files, initial version
