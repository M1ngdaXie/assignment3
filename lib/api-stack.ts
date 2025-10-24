import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
interface ApiStackProps extends cdk.StackProps {
  plottingLambdaName: lambda.IFunction;
}
export class ApiStack extends cdk.Stack {
  public readonly apiUrl: string;
  constructor(scope: cdk.App, id: string, props?: ApiStackProps) {
    super(scope, id, props);
  }
}
