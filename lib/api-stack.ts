import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as s3 from "aws-cdk-lib/aws-s3";

interface ApiStackProps extends cdk.StackProps {
  bucketArn: string;
  bucketName: string;
  tableArn: string;
  tableName: string;
}

export class ApiStack extends cdk.Stack {
  public readonly apiUrl: string;
  public readonly apiArn: string;

  constructor(scope: cdk.App, id: string, props: ApiStackProps) {
    super(scope, id, props);

    // Import bucket and table from ARNs
    const bucket = s3.Bucket.fromBucketArn(this, "ImportedBucket", props.bucketArn);
    const table = dynamodb.Table.fromTableArn(this, "ImportedTable", props.tableArn);

    // Create Plotting Lambda with matplotlib layer
    const matplotlibLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "MatplotlibLayer",
      "arn:aws:lambda:us-east-1:152247411320:layer:matplotlib-layer-arm64:1"
    );

    const plottingLambda = new lambda.Function(this, "PlottingLambda", {
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

    table.grantReadData(plottingLambda);
    bucket.grantWrite(plottingLambda);

    // Create REST API
    const api = new apigateway.RestApi(this, "PlottingApi", {
      restApiName: "Plotting Service",
      description: "API for triggering plot generation",
      deployOptions: {
        stageName: "prod",
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    // Create Lambda integration
    const plottingIntegration = new apigateway.LambdaIntegration(
      plottingLambda,
      {
        requestTemplates: { "application/json": '{ "statusCode": "200" }' },
      }
    );

    // Add GET method to root
    api.root.addMethod("GET", plottingIntegration);

    this.apiUrl = api.url;
    this.apiArn = api.arnForExecuteApi();

    // Output the API URL
    new cdk.CfnOutput(this, "ApiUrl", {
      value: this.apiUrl,
      description: "API Gateway URL",
      exportName: "PlottingApiUrl", // Export for LambdaStack to import
    });

    // Output the API ARN
    new cdk.CfnOutput(this, "ApiArn", {
      value: this.apiArn,
      description: "API Gateway ARN",
    });

    // Output Plotting Lambda name
    new cdk.CfnOutput(this, "PlottingLambdaName", {
      value: plottingLambda.functionName,
      description: "Plotting Lambda Function Name",
    });
  }
}
