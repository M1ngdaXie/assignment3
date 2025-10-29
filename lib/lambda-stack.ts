import * as cdk from "aws-cdk-lib";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";

// Use ARN strings instead of resource objects to avoid circular dependencies
interface LambdaStackProps extends cdk.StackProps {
  bucketArn: string;
  bucketName: string;
  tableArn: string;
  tableName: string;
  apiUrl?: string; // Optional because it might not exist on first deploy
}

export class LambdaStack extends cdk.Stack {
  public readonly plottingLambda: lambda.Function;
  public readonly driverLambda: lambda.Function;
  public readonly sizeTrackingLambda: lambda.Function;

  constructor(scope: cdk.App, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    // Import bucket and table from ARNs
    const bucket = s3.Bucket.fromBucketArn(
      this,
      "ImportedBucket",
      props.bucketArn
    );
    const table = Table.fromTableArn(this, "ImportedTable", props.tableArn);

    this.sizeTrackingLambda = new lambda.Function(this, "SizeTrackingLambda", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "index.lambda_handler",
      code: lambda.Code.fromAsset("lambda/size-tracking-lambda"),
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      environment: {
        BUCKET_ARN: props.bucketArn,
        TABLE_NAME: props.tableName,
      },
    });

    // Grant permissions
    bucket.grantRead(this.sizeTrackingLambda);
    table.grantReadWriteData(this.sizeTrackingLambda);

    // Add S3 event notifications
    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(this.sizeTrackingLambda)
    );

    bucket.addEventNotification(
      s3.EventType.OBJECT_REMOVED,
      new s3n.LambdaDestination(this.sizeTrackingLambda)
    );

    // Plotting Lambda with matplotlib layer
    const matplotlibLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "MatplotlibLayer",
      "arn:aws:lambda:us-east-1:152247411320:layer:matplotlib-layer-arm64:1"
    );

    this.plottingLambda = new lambda.Function(this, "PlottingLambda", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "index.lambda_handler",
      code: lambda.Code.fromAsset("lambda/plotting-lambda"),
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      environment: {
        BUCKET_ARN: props.bucketArn,
        TABLE_NAME: props.tableName,
      },
      layers: [matplotlibLayer],
    });

    table.grantReadData(this.plottingLambda);
    bucket.grantWrite(this.plottingLambda);

    // Driver Lambda
    // Import API URL from ApiStack export (automatically gets the value after ApiStack is deployed)
    // Note: To destroy stacks, run: cdk destroy Assignment3-LambdaStack Assignment3-ApiStack Assignment3-StorageStack
    const apiUrl = cdk.Fn.importValue("PlottingApiUrl");

    this.driverLambda = new lambda.Function(this, "DriverLambda", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "index.lambda_handler",
      code: lambda.Code.fromAsset("lambda/driver-lambda"),
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(120),
      environment: {
        BUCKET_ARN: props.bucketArn,
        TABLE_NAME: props.tableName,
        API_URL: apiUrl,
      },
    });

    bucket.grantReadWrite(this.driverLambda);
    this.plottingLambda.grantInvoke(this.driverLambda);

    // Outputs
    new cdk.CfnOutput(this, "SizeTrackingLambdaName", {
      value: this.sizeTrackingLambda.functionName,
      description: "Size Tracking Lambda Function Name",
    });

    new cdk.CfnOutput(this, "PlottingLambdaName", {
      value: this.plottingLambda.functionName,
      description: "Plotting Lambda Function Name",
    });

    new cdk.CfnOutput(this, "DriverLambdaName", {
      value: this.driverLambda.functionName,
      description: "Driver Lambda Function Name",
    });
  }
}
