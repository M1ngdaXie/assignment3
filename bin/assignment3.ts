#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { App } from "aws-cdk-lib";
import { ApiStack } from "../lib/api-stack";
import { LambdaStack } from "../lib/lambda-stack";
import { StorageStack } from "../lib/storage-stack";

const app = new App();

// ============================================================================
// SINGLE STACK DEPLOYMENT (CURRENTLY ACTIVE)
// ============================================================================
// new FullStack(app, "Assignment3Stack", {
//   description: "Full stack: bucket, DynamoDB, Lambdas, and API",
// });

// ============================================================================
// MULTI-STACK DEPLOYMENT (COMMENTED OUT - HAS CIRCULAR DEPENDENCY)
// ============================================================================
// Uncomment below to use multiple stacks:
//
// NOTE: We need to deploy in two phases to avoid circular dependencies:
// Phase 1: Deploy StorageStack and LambdaStack without S3 notifications
// Phase 2: Update StorageStack with Lambda ARN to add S3 notifications

// Stack 1: Storage resources (S3 bucket and DynamoDB table)
const storageStack = new StorageStack(app, "Assignment3-StorageStack", {
  description: "Storage resources: S3 bucket and DynamoDB table",
  // Pass Lambda ARN as string to add S3 event notifications (from first deployment):
  // sizeTrackingLambdaArn: "arn:aws:lambda:us-east-1:152247411320:function:Assignment3-LambdaStack-SizeTrackingLambda9C763A26-k2C0luEduYR0",
});

// Stack 2: Lambda functions - pass ARNs as strings to avoid circular dependency
const lambdaStack = new LambdaStack(app, "Assignment3-LambdaStack", {
  description: "Lambda functions: size tracking, plotting, and driver",
  bucketArn: storageStack.bucket.bucketArn,
  bucketName: storageStack.bucket.bucketName,
  tableArn: storageStack.table.tableArn,
  tableName: storageStack.table.tableName,
});

// Stack 3: API Gateway
const apiStack = new ApiStack(app, "Assignment3-ApiStack", {
  description: "REST API for plotting lambda",
  plottingLambda: lambdaStack.plottingLambda,
});

console.log(`API Stack configured with URL: ${apiStack.apiUrl}`);

// Add tags for all resources
cdk.Tags.of(app).add("Project", "Assignment3");
cdk.Tags.of(app).add("Course", "Cloud-Computing");
