import * as cdk from "aws-cdk-lib";
import { Table } from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as sns from "aws-cdk-lib/aws-sns";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as iam from "aws-cdk-lib/aws-iam";

// Use ARN strings instead of resource objects to avoid circular dependencies
interface LambdaStackProps extends cdk.StackProps {
  bucketArn: string;
  bucketName: string;
  tableArn: string;
  tableName: string;
  // REMOVED: apiUrl?: string;
  // We will add the API URL in the bin/assignment3.ts file after ApiStack is created.
}

export class LambdaStack extends cdk.Stack {
  public readonly plottingLambda: lambda.Function;
  public readonly driverLambda: lambda.Function;
  public readonly sizeTrackingLambda: lambda.Function;
  public readonly loggingLambda: lambda.Function;
  public readonly cleanerLambda: lambda.Function;
  public readonly apiUrl: string;

  constructor(scope: cdk.App, id: string, props: LambdaStackProps) {
    super(scope, id, props);

    // Import bucket and table from ARNs
    const bucket = s3.Bucket.fromBucketArn(
      this,
      "ImportedBucket",
      props.bucketArn
    );
    const table = Table.fromTableArn(this, "ImportedTable", props.tableArn);

    // ============================================================================
    // SNS Topic for S3 Event Fanout (Assignment 4)
    // ============================================================================
    const s3EventTopic = new sns.Topic(this, "S3EventTopic", {
      displayName: "S3 Event Fanout Topic",
      topicName: "Assignment4-S3EventTopic",
    });

    // Add S3 event notifications to SNS topic (instead of directly to Lambda)
    bucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SnsDestination(s3EventTopic)
    );

    bucket.addEventNotification(
      s3.EventType.OBJECT_REMOVED,
      new s3n.SnsDestination(s3EventTopic)
    );

    // ============================================================================
    // SQS Queues for Size Tracking and Logging Lambdas
    // ============================================================================

    // Dead Letter Queue for Size Tracking
    const sizeTrackingDLQ = new sqs.Queue(this, "SizeTrackingDLQ", {
      queueName: "Assignment4-SizeTrackingDLQ",
      retentionPeriod: cdk.Duration.days(14),
    });

    // Queue for Size Tracking Lambda
    const sizeTrackingQueue = new sqs.Queue(this, "SizeTrackingQueue", {
      queueName: "Assignment4-SizeTrackingQueue",
      visibilityTimeout: cdk.Duration.seconds(60),
      deadLetterQueue: {
        queue: sizeTrackingDLQ,
        maxReceiveCount: 3,
      },
    });

    // Subscribe Size Tracking Queue to SNS Topic
    s3EventTopic.addSubscription(
      new subscriptions.SqsSubscription(sizeTrackingQueue)
    );

    // Dead Letter Queue for Logging
    const loggingDLQ = new sqs.Queue(this, "LoggingDLQ", {
      queueName: "Assignment4-LoggingDLQ",
      retentionPeriod: cdk.Duration.days(14),
    });

    // Queue for Logging Lambda
    const loggingQueue = new sqs.Queue(this, "LoggingQueue", {
      queueName: "Assignment4-LoggingQueue",
      visibilityTimeout: cdk.Duration.seconds(60),
      deadLetterQueue: {
        queue: loggingDLQ,
        maxReceiveCount: 3,
      },
    });

    // Subscribe Logging Queue to SNS Topic
    s3EventTopic.addSubscription(
      new subscriptions.SqsSubscription(loggingQueue)
    );

    // ============================================================================
    // Size Tracking Lambda (now consumes from SQS)
    // ============================================================================
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

    // Add SQS as event source for Size Tracking Lambda
    this.sizeTrackingLambda.addEventSource(
      new lambdaEventSources.SqsEventSource(sizeTrackingQueue, {
        batchSize: 1,
      })
    );

    // ============================================================================
    // Logging Lambda (NEW for Assignment 4)
    // ============================================================================

    // Create custom log group for logging lambda
    const loggingLambdaLogGroup = new logs.LogGroup(this, "LoggingLambdaLogGroup", {
      logGroupName: "/aws/lambda/Assignment4-LoggingLambda",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      retention: logs.RetentionDays.ONE_WEEK,
    });

    this.loggingLambda = new lambda.Function(this, "LoggingLambda", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "index.lambda_handler",
      code: lambda.Code.fromAsset("lambda/logging-lambda"),
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      environment: {
        BUCKET_NAME: props.bucketName,
        LOG_GROUP_NAME: loggingLambdaLogGroup.logGroupName,
      },
      logGroup: loggingLambdaLogGroup,
    });

    // Grant CloudWatch Logs permissions to query logs for deleted object sizes
    this.loggingLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["logs:FilterLogEvents"],
        resources: [loggingLambdaLogGroup.logGroupArn],
      })
    );

    // Add SQS as event source for Logging Lambda
    this.loggingLambda.addEventSource(
      new lambdaEventSources.SqsEventSource(loggingQueue, {
        batchSize: 1,
      })
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

    // API Gateway
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

    const plottingIntegration = new apigateway.LambdaIntegration(
      this.plottingLambda,
      {
        requestTemplates: { "application/json": '{ "statusCode": "200" }' },
      }
    );

    api.root.addMethod("GET", plottingIntegration);

    this.apiUrl = api.url;

    // Driver Lambda
    this.driverLambda = new lambda.Function(this, "DriverLambda", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "index.lambda_handler",
      code: lambda.Code.fromAsset("lambda/driver-lambda"),
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(300), // Increased to 300 seconds (5 minutes) for wait times
      environment: {
        BUCKET_ARN: props.bucketArn,
        TABLE_NAME: props.tableName,
        API_URL: this.apiUrl,
      },
    });

    bucket.grantReadWrite(this.driverLambda);
    this.plottingLambda.grantInvoke(this.driverLambda);

    // ============================================================================
    // CloudWatch Metric Filter for Logging Lambda (Assignment 4)
    // ============================================================================

    // Create metric filter to extract size_delta from logs
    const metricFilter = new logs.MetricFilter(this, "SizeDeltaMetricFilter", {
      logGroup: loggingLambdaLogGroup,
      metricNamespace: "Assignment4App",
      metricName: "TotalObjectSize",
      filterPattern: logs.FilterPattern.exists("$.size_delta"),
      metricValue: "$.size_delta",
    });

    // ============================================================================
    // CloudWatch Alarm for TotalObjectSize Metric (Assignment 4)
    // ============================================================================

    // Create metric for the alarm
    const totalObjectSizeMetric = new cloudwatch.Metric({
      namespace: "Assignment4App",
      metricName: "TotalObjectSize",
      statistic: "Sum",
      period: cdk.Duration.minutes(1),
    });

    // ============================================================================
    // Cleaner Lambda (NEW for Assignment 4)
    // ============================================================================

    this.cleanerLambda = new lambda.Function(this, "CleanerLambda", {
      runtime: lambda.Runtime.PYTHON_3_11,
      handler: "index.lambda_handler",
      code: lambda.Code.fromAsset("lambda/cleaner-lambda"),
      architecture: lambda.Architecture.ARM_64,
      timeout: cdk.Duration.seconds(30),
      environment: {
        BUCKET_NAME: props.bucketName,
      },
    });

    // Grant permissions to list and delete objects
    bucket.grantRead(this.cleanerLambda);
    bucket.grantDelete(this.cleanerLambda);

    // Create CloudWatch Alarm
    const alarm = new cloudwatch.Alarm(this, "TotalObjectSizeAlarm", {
      alarmName: "Assignment4-TotalObjectSize-Alarm",
      alarmDescription: "Alarm when total object size sum exceeds 20 bytes",
      metric: totalObjectSizeMetric,
      threshold: 20,
      evaluationPeriods: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Add Lambda action to the alarm
    alarm.addAlarmAction(new cloudwatchActions.LambdaAction(this.cleanerLambda));

    // Grant CloudWatch permission to invoke Cleaner Lambda
    this.cleanerLambda.addPermission("AllowCloudWatchInvoke", {
      principal: new iam.ServicePrincipal("lambda.alarms.cloudwatch.amazonaws.com"),
      action: "lambda:InvokeFunction",
      sourceArn: alarm.alarmArn,
    });

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

    new cdk.CfnOutput(this, "ApiUrl", {
      value: this.apiUrl,
      description: "API Gateway URL",
    });

    new cdk.CfnOutput(this, "LoggingLambdaName", {
      value: this.loggingLambda.functionName,
      description: "Logging Lambda Function Name",
    });

    new cdk.CfnOutput(this, "CleanerLambdaName", {
      value: this.cleanerLambda.functionName,
      description: "Cleaner Lambda Function Name",
    });

    new cdk.CfnOutput(this, "SNSTopicArn", {
      value: s3EventTopic.topicArn,
      description: "SNS Topic ARN for S3 Events",
    });

    new cdk.CfnOutput(this, "AlarmName", {
      value: alarm.alarmName,
      description: "CloudWatch Alarm Name",
    });
  }
}
