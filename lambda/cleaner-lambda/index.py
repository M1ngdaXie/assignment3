import boto3
import json
import os
from typing import List, Dict, Any, Optional

s3_client = boto3.client('s3')

BUCKET_NAME = os.environ.get('BUCKET_NAME', '')

def get_largest_object(bucket_name: str) -> Optional[Dict[str, Any]]:
    """
    List all objects in the bucket and find the one with the largest size.
    Excludes plot files.
    Returns dict with 'Key' and 'Size', or None if bucket is empty.
    """
    try:
        print(f"Listing objects in bucket: {bucket_name}")

        largest_object = None
        largest_size = 0

        # Use paginator to handle buckets with many objects
        paginator = s3_client.get_paginator('list_objects_v2')
        pages = paginator.paginate(Bucket=bucket_name)

        for page in pages:
            if 'Contents' not in page:
                continue

            for obj in page['Contents']:
                # Skip plot files
                if obj['Key'] in ['plot', 'plot.png']:
                    print(f"Skipping plot file: {obj['Key']}")
                    continue

                print(f"Object: {obj['Key']} - Size: {obj['Size']} bytes")

                if obj['Size'] > largest_size:
                    largest_size = obj['Size']
                    largest_object = {
                        'Key': obj['Key'],
                        'Size': obj['Size']
                    }

        if largest_object:
            print(f"Largest object: {largest_object['Key']} ({largest_object['Size']} bytes)")
        else:
            print("No objects found in bucket (excluding plot files)")

        return largest_object

    except Exception as e:
        print(f"Error listing objects: {e}")
        import traceback
        traceback.print_exc()
        return None

def lambda_handler(event, context):
    """
    Cleaner Lambda - triggered by CloudWatch Alarm.
    Deletes the largest object from the bucket.
    """
    print(f"Cleaner Lambda invoked!")
    print(f"Event: {json.dumps(event)}")

    if not BUCKET_NAME:
        print("ERROR: BUCKET_NAME environment variable not set")
        return {
            'statusCode': 500,
            'body': json.dumps('BUCKET_NAME not configured')
        }

    # Find the largest object
    largest_object = get_largest_object(BUCKET_NAME)

    if not largest_object:
        print("No objects to delete")
        return {
            'statusCode': 200,
            'body': json.dumps('No objects to delete')
        }

    # Delete the largest object
    try:
        object_key = largest_object['Key']
        object_size = largest_object['Size']

        print(f"Deleting largest object: {object_key} ({object_size} bytes)")

        s3_client.delete_object(
            Bucket=BUCKET_NAME,
            Key=object_key
        )

        print(f"Successfully deleted {object_key}")

        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Successfully deleted largest object',
                'deleted_object': object_key,
                'deleted_size': object_size
            })
        }

    except Exception as e:
        print(f"Error deleting object: {e}")
        import traceback
        traceback.print_exc()

        return {
            'statusCode': 500,
            'body': json.dumps(f'Error deleting object: {str(e)}')
        }
