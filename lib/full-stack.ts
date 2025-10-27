import * as cdk from "aws-cdk-lib";
import { CfnOutput, Duration, Stack, StackProps } from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";

export class FullStack extends Stack {
  public readonly plottingLambda: lambda.Function;
  public readonly driverLambda: lambda.Function;
  public readonly sizeTrackingLambda: lambda.Function;
  public readonly apiUrl: string;

  constructor(scope: cdk.App, id: string, props?: StackProps) {
    super(scope, id, props);

    // ------------------------
    // Storage resources
    // ------------------------
    const bucket = new s3.Bucket(this, "assignment3-bucket", {
      versioned: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const table = new dynamodb.Table(this, "assignment3-table", {
      partitionKey: { name: "bucketName", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "timestamp", type: dynamodb.AttributeType.NUMBER },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new CfnOutput(this, "BucketName", { value: bucket.bucketName });
    new CfnOutput(this, "TableName", { value: table.tableName });

    // ------------------------
    // Size Tracking Lambda
    // ------------------------
    this.sizeTrackingLambda = new lambda.Function(this, "SizeTrackingLambda", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "index.lambda_handler",
      code: lambda.Code.fromAsset("lambda/size-tracking-lambda"),
      architecture: lambda.Architecture.ARM_64,
      timeout: Duration.seconds(30),
      environment: {
        BUCKET_NAME: bucket.bucketName,
        TABLE_NAME: table.tableName,
      },
    });

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

    // ------------------------
    // Plotting Lambda
    // ------------------------
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
      timeout: Duration.seconds(60),
      memorySize: 512,
      environment: {
        BUCKET_NAME: bucket.bucketName,
        TABLE_NAME: table.tableName,
      },
      layers: [matplotlibLayer],
    });

    table.grantReadData(this.plottingLambda);
    bucket.grantWrite(this.plottingLambda);

    // ------------------------
    // API Gateway
    // ------------------------
    const api = new apigateway.RestApi(this, "PlottingApi", {
      restApiName: "Plotting Service",
      description: "API for triggering plot generation",
      deployOptions: { stageName: "prod" },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    const plottingIntegration = new apigateway.LambdaIntegration(
      this.plottingLambda,
      {
        requestTemplates: { "application/json": '{ "statusCode": "200" }' },
      }
    );

    api.root.addMethod("GET", plottingIntegration);

    this.apiUrl = api.url;

    new CfnOutput(this, "ApiUrl", {
      value: this.apiUrl,
      description: "API Gateway URL",
      exportName: "PlottingApiUrl",
    });

    // ------------------------
    // Driver Lambda
    // ------------------------
    this.driverLambda = new lambda.Function(this, "DriverLambda", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "index.lambda_handler",
      code: lambda.Code.fromAsset("lambda/driver-lambda"),
      architecture: lambda.Architecture.ARM_64,
      timeout: Duration.seconds(120),
      environment: {
        BUCKET_NAME: bucket.bucketName,
        TABLE_NAME: table.tableName,
        API_URL: this.apiUrl, // Now API URL is available
      },
    });

    bucket.grantReadWrite(this.driverLambda);
    this.plottingLambda.grantInvoke(this.driverLambda);

    new CfnOutput(this, "SizeTrackingLambdaName", {
      value: this.sizeTrackingLambda.functionName,
    });
    new CfnOutput(this, "PlottingLambdaName", {
      value: this.plottingLambda.functionName,
    });
    new CfnOutput(this, "DriverLambdaName", {
      value: this.driverLambda.functionName,
    });
  }
}
