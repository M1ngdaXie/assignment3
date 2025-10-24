import * as cdk from "aws-cdk-lib";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import { Bucket } from "aws-cdk-lib/aws-s3";

interface LambdaStackProps extends cdk.StackProps {
  s3Bucket: Bucket;
  dynamodbTable: Table;
}

export class LambdaStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: LambdaStackProps) {
    super(scope, id, props);

    const sizeTrackingLambda = new cdk.aws_lambda.Function(
      this,
      "SizeTrackingLambda",
      {
        runtime: cdk.aws_lambda.Runtime.PYTHON_3_11,
        handler: "index.handler",
        code: cdk.aws_lambda.Code.fromAsset("lambda/size-tracking-lambda"),
        environment: {
          BUCKET_NAME: props?.s3Bucket.bucketName || "",
          TABLE_NAME: props?.dynamodbTable.tableName || "",
        },
      }
    );
    const plottingLambda = new cdk.aws_lambda.Function(this, "PlottingLambda", {
      runtime: cdk.aws_lambda.Runtime.PYTHON_3_11,
      handler: "index.handler",
      code: cdk.aws_lambda.Code.fromAsset("lambda/plotting-lambda"),
    });
    const driverLambda = new cdk.aws_lambda.Function(this, "DriverLambda", {
      runtime: cdk.aws_lambda.Runtime.PYTHON_3_11,
      handler: "index.handler",
      code: cdk.aws_lambda.Code.fromAsset("lambda/driver-lambda"),
      environment: {
        SIZE_TRACKING_LAMBDA_NAME: sizeTrackingLambda.functionName,
        PLOTTING_LAMBDA_NAME: plottingLambda.functionName,
        BUCKET_NAME: props?.s3Bucket.bucketName || "",
        TABLE_NAME: props?.dynamodbTable.tableName || "",
      },
    });
    // Grant necessary permissions
    props?.s3Bucket.grantRead(sizeTrackingLambda);
    props?.dynamodbTable.grantWriteData(sizeTrackingLambda);

    props?.s3Bucket.addEventNotification(
      cdk.aws_s3.EventType.OBJECT_CREATED,
      new cdk.aws_s3_notifications.LambdaDestination(sizeTrackingLambda)
    );
  }
}
