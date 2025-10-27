import boto3
import json
import os
import time
from decimal import Decimal
from typing import Any

s3_client = boto3.client('s3')
dynamodb: Any = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['TABLE_NAME'])

# Extract bucket name from ARN (format: arn:aws:s3:::bucket-name)
BUCKET_ARN = os.environ.get('BUCKET_ARN', '')
BUCKET_NAME = BUCKET_ARN.split(':::')[-1] if BUCKET_ARN else os.environ.get('BUCKET_NAME', '')

def lambda_handler(event, context):
    """
    Triggered by S3 events (create, update, delete).
    Computes total size of all objects in the bucket and stores in DynamoDB.
    """
    
    print(f"Event received: {json.dumps(event)}")
    
    # Extract bucket name and object key from the S3 event
    try:
        bucket_name = event['Records'][0]['s3']['bucket']['name']
        object_key = event['Records'][0]['s3']['object']['key']
    except (KeyError, IndexError) as e:
        print(f"Error extracting event info: {e}")
        return {
            'statusCode': 400,
            'body': json.dumps('Invalid event format')
        }
    
    print(f"Processing bucket: {bucket_name}")
    print(f"Triggering object: {object_key}")
    
    # CRITICAL: Ignore events for the plot file itself
    if object_key in ['plot', 'plot.png']:
        print(f"⚠ Ignoring event for plot file: {object_key}")
        return {
            'statusCode': 200,
            'body': json.dumps('Ignored plot file event')
        }
    
    # Calculate total size and object count
    total_size = 0
    object_count = 0
    
    try:
        # Use paginator to handle buckets with many objects
        paginator = s3_client.get_paginator('list_objects_v2')
        pages = paginator.paginate(Bucket=bucket_name)
        
        for page in pages:
            if 'Contents' in page:
                for obj in page['Contents']:
                    # EXCLUDE plot files from calculation
                    if obj['Key'] not in ['plot', 'plot.png']:
                        total_size += obj['Size']
                        object_count += 1
                        print(f"  Including: {obj['Key']} - {obj['Size']} bytes")
                    else:
                        print(f"  Excluding plot file: {obj['Key']}")
        
        print(f"Total size: {total_size} bytes, Object count: {object_count}")
        
    except Exception as e:
        print(f"Error listing objects: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps(f'Error calculating bucket size: {str(e)}')
        }
    
    # Get current timestamp
    current_timestamp = Decimal(str(time.time()))
    
    # Write to DynamoDB
    try:
        table.put_item(
            Item={
                'bucketName': bucket_name,
                'timestamp': current_timestamp,
                'total_size': total_size,
                'object_count': object_count
            }
        )
        
        print(f"Successfully wrote to DynamoDB: timestamp={current_timestamp}")
        
    except Exception as e:
        print(f"Error writing to DynamoDB: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps(f'Error writing to DynamoDB: {str(e)}')
        }
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'message': 'Size tracking completed',
            'bucketName': bucket_name,
            'total_size': total_size,
            'object_count': object_count,
            'timestamp': float(current_timestamp)
        })
    }