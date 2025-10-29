import * as cdk from "aws-cdk-lib";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as lambda from "aws-cdk-lib/aws-lambda";

interface ApiStackProps extends cdk.StackProps {
  plottingLambda: lambda.IFunction;
}

export class ApiStack extends cdk.Stack {
  public readonly apiUrl: string;
  public readonly apiArn: string;

  constructor(scope: cdk.App, id: string, props: ApiStackProps) {
    super(scope, id, props);
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
      props.plottingLambda,
      {
        requestTemplates: { "application/json": '{ "statusCode": "200" }' },
      }
    );

    // Add GET method to root
    api.root.addMethod("GET", plottingIntegration);

    // You can also add a POST method if you prefer
    // api.root.addMethod("POST", plottingIntegration);

    this.apiUrl = api.url;
    this.apiArn = api.arnForExecuteApi();

    // Output the API URL
    new cdk.CfnOutput(this, "ApiUrl", {
      value: this.apiUrl,
      description: "API Gateway URL",
      exportName: "PlottingApiUrl",
    });

    // Output the API ARN
    new cdk.CfnOutput(this, "ApiArn", {
      value: this.apiArn,
      description: "API Gateway ARN",
      exportName: "PlottingApiArn",
    });
  }
}
