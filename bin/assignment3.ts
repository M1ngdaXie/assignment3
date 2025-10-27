#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { App } from "aws-cdk-lib";
import { FullStack } from "../lib/full-stack";

const app = new App();

new FullStack(app, "Assignment3Stack", {
  description: "Full stack: bucket, DynamoDB, Lambdas, and API",
});

// Add tags for all resources
cdk.Tags.of(app).add("Project", "Assignment3");
cdk.Tags.of(app).add("Course", "Cloud-Computing");
