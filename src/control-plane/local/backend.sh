#!/bin/bash

# This script is used to run backend server in local environment.

# Get all the lambda functions in the control plane stack
lambdaResources=$(aws cloudformation list-stack-resources --stack-name $CONTROL_PLANE_STACK_NAME --query "StackResourceSummaries[?ResourceType=='AWS::Lambda::Function']")

# Find the Api Function physical resource id
for resource in $(echo "$lambdaResources" | jq -c '.[]'); do
    resource_type=$(echo "$resource" | jq -r '.ResourceType')
    logical_resource_id=$(echo "$resource" | jq -r '.LogicalResourceId')
    physical_resource_id=$(echo "$resource" | jq -r '.PhysicalResourceId')
    # if logical_resource_id contains ApiFunction
    if [[ "$logical_resource_id" == *"ApiFunction"* ]]; then
        ApiFunctionPhysicalResourceId=$physical_resource_id
    fi
done

echo "ApiFunctionPhysicalResourceId: $ApiFunctionPhysicalResourceId"
if [ -z "$ApiFunctionPhysicalResourceId" ]; then
    echo "Error: ApiFunctionPhysicalResourceId not found."
    exit 1
fi

# Get the lambda function environment variables
lambdaFunctionEnvironment=$(aws lambda get-function --function-name "$ApiFunctionPhysicalResourceId" --query "Configuration.Environment.Variables")

# Set the environment variables in the local environment
environments_entries=$(echo "$lambdaFunctionEnvironment" | jq -r '. | to_entries')
for entry in $(echo "$environments_entries" | jq -c '.[]'); do
    key=$(echo "$entry" | jq -r '.key')
    value=$(echo "$entry" | jq -r '.value')
    echo export $key=$value
    export $key=$value
done

# Get user pool in the control plane stack
userPoolResource=$(aws cloudformation list-stack-resources --stack-name $CONTROL_PLANE_STACK_NAME --query "StackResourceSummaries[?ResourceType=='AWS::Cognito::UserPool']")
userPoolPhysicalResourceId=$(echo "$userPoolResource" | jq -r '.[].PhysicalResourceId')
echo "userPoolPhysicalResourceId: $userPoolPhysicalResourceId"

issuer="https://cognito-idp.$AWS_REGION.amazonaws.com/$userPoolPhysicalResourceId"
echo "issuer: $issuer"
# set environment for auth middleware and role validation
export ISSUER=$issuer
export WITH_AUTH_MIDDLEWARE=true
export WITH_VALIDATE_ROLE=true
export LOG_LEVEL=DEBUG

# Run the server
cd ../backend/lambda/api && pnpm dev