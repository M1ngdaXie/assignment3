import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Bucket } from "aws-cdk-lib/aws-s3";

export class StorageStack extends cdk.Stack {
  // Storage stack implementation goes here
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    new Bucket(this, "assignment3-bucket", {
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    new dynamodb.Table(this, "assignment3-table", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });
  }
}
