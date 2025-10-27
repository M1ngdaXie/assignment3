import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Bucket } from "aws-cdk-lib/aws-s3";

export class StorageStack extends cdk.Stack {
  public readonly bucket: Bucket;
  public readonly table: dynamodb.Table;

  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.bucket = new Bucket(this, "assignment3-bucket", {
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    this.table = new dynamodb.Table(this, "assignment3-table", {
      partitionKey: { name: "bucketName", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "timestamp", type: dynamodb.AttributeType.NUMBER },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Output the bucket and table names for reference
    new cdk.CfnOutput(this, "BucketName", {
      value: this.bucket.bucketName,
      description: "S3 Bucket Name",
    });

    new cdk.CfnOutput(this, "TableName", {
      value: this.table.tableName,
      description: "DynamoDB Table Name",
    });
  }
}
