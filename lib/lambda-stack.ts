import * as cdk from "aws-cdk-lib";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Bucket } from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";

// Remove the duplicate interface - keep only one with apiUrl
interface LambdaStackProps extends cdk.StackProps {
  s3Bucket: Bucket;
  dynamodbTable: Table;
  apiUrl?: string; // Optional because it might not exist on first deploy
}

export class LambdaStack extends cdk.Stack {
  public readonly plottingLambda: lambda.Function;
  public readonly driverLambda: lambda.Function;

  constructor(scope: cdk.App, id: string, props: LambdaStackProps) {
    // Remove the ? to make props required
    super(scope, id, props);

    const sizetrackinglambda = new lambda.Function(
      this,
      "SizeTrackingLambda",
      {
        runtime: lambda.Runtime.PYTHON_3_11,
        handler: "index.lambda_handler",
        code: lambda.Code.fromAsset("lambda/size-tracking-lambda"),
        architecture: lambda.Architecture.ARM_64,
        timeout: cdk.Duration.seconds(30),
        environment: {
          BUCKET_NAME: props.s3Bucket.bucketName,
          TABLE_NAME: props.dynamodbTable.tableName,
        },
      }
    );

    // Grant permissions
    props.s3Bucket.grantRead(sizetrackinglambda);
    props.dynamodbTable.grantReadWriteData(sizetrackinglambda);

    // Add S3 event notifications
    props.s3Bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(sizetrackinglambda)
    );

    props.s3Bucket.addEventNotification(
      s3.EventType.OBJECT_REMOVED,
      new s3n.LambdaDestination(sizetrackinglambda)
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
        BUCKET_NAME: props.s3Bucket.bucketName,
        TABLE_NAME: props.dynamodbTable.tableName,
      },
      layers: [matplotlibLayer],
    });

    props.dynamodbTable.grantReadData(this.plottingLambda);
    props.s3Bucket.grantWrite(this.plottingLambda);

    // Driver Lambda
    this.driverLambda = new lambda.Function(this, "DriverLambda", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "index.lambda_handler",
      code: lambda.Code.fromAsset("lambda/driver-lambda"),
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(120),
      environment: {
        BUCKET_NAME: props.s3Bucket.bucketName,
        TABLE_NAME: props.dynamodbTable.tableName,
        API_URL: props.apiUrl || "",
      },
    });

    props.s3Bucket.grantReadWrite(this.driverLambda);
    this.plottingLambda.grantInvoke(this.driverLambda);

    // Outputs
    new cdk.CfnOutput(this, "SizeTrackingLambdaName", {
      value: sizetrackinglambda.functionName,
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
