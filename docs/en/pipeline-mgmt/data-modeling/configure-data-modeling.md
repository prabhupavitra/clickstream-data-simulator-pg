# Data modeling settings
Once the data pipeline processes the event data, you can load the data into an analytics engine (i.e., Redshift) for data modeling, where data will be aggregated and organized into different views (such as event, device, session), as well as calculated metrics that are commonly used. 

You can choose to use Redshift or Athena, or both. 

!!! tip "Tip"

    We recommended you select both, that is, using Redshift for hot data modeling and using Athena for all-time data analysis.

You can set below configurations for Redshift.  

  * **Redshift Mode**: Select Redshift serverless or provisioned mode.

    * **Serverless mode**

        * **Base RPU**: RPU stands for Redshift Processing Unit. Amazon Redshift Serverless measures data warehouse capacity in RPUs, which are resources used to handle workloads. The base capacity specifies the base data warehouse capacity Amazon Redshift uses to serve queries and is specified in RPUs. Setting higher base capacity improves query performance, especially for data processing jobs that consume a lot of resources.

        * **VPC**: A virtual private cloud (VPC) based on the Amazon VPC service is your private, logically isolated network in the AWS Cloud.

            !!! info "Note"

                If you place the cluster within the isolated subnets, the VPC must have VPC endpoints for S3, Logs, Dynamodb, STS, States, Redshift and Redshift-data service.

        * **Security Group**: This VPC security group defines which subnets and IP ranges can access the endpoint of Redshift cluster.

        * **Subnets**: Select at least three existing VPC subnets.

            !!! info "Note"
            
                We recommend using private subnets to deploy for following security best practices.

            !!! info "Note"
            
                Please ensure that your subnets have enough available IP addresses to create Redshift Serverless, and check [the number of free IP addresses required for each subnet][serverless-usage-considerations].

    * **Provisioned mode**

        * **Redshift Cluster**: With a provisioned Amazon Redshift cluster, you build a cluster with node types that meet your cost and performance specifications. You have to set up, tune, and manage Amazon Redshift provisioned clusters.

        * **Database user**: The solution needs permissions to access and create database in Redshift cluster. By default, it grants Redshift Data API with the permissions of the admin user to execute the commands to create DB, tables, and views, as well as loading data.

    * **Data range**: Considering the cost performance issue of having Redshift to save all the data, we recommend that Redshift save hot data and that all data are stored in S3. It is necessary to delete expired data in Redshift on a regular basis.

* **Athena**: Choose Athena to query all data on S3 using the table created in the Glue Data Catalog.

[serverless-usage-considerations]: https://docs.aws.amazon.com/redshift/latest/mgmt/serverless-usage-considerations.html