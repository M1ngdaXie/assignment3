#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { App } from "aws-cdk-lib";
import { LambdaStack } from "../lib/lambda-stack";
import { StorageStack } from "../lib/storage-stack";

const app = new App();

// ============================================================================
// TWO-STACK DEPLOYMENT
// ============================================================================

// Stack 1: Storage resources (S3 bucket and DynamoDB table)
const storageStack = new StorageStack(app, "Assignment3-StorageStack", {
  description: "Storage resources: S3 bucket and DynamoDB table",
});

// Stack 2: Lambda functions + API Gateway (all in one stack)
const lambdaStack = new LambdaStack(app, "Assignment3-LambdaStack", {
  description: "Lambda functions and API Gateway",
  bucketArn: storageStack.bucket.bucketArn,
  bucketName: storageStack.bucket.bucketName,
  tableArn: storageStack.table.tableArn,
  tableName: storageStack.table.tableName,
});

console.log(`Lambda Stack configured with API URL: ${lambdaStack.apiUrl}`);

// Add tags for all resources
cdk.Tags.of(app).add("Project", "Assignment3");
cdk.Tags.of(app).add("Course", "Cloud-Computing");
