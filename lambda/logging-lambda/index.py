import boto3
import json
import os
import time
from typing import Dict, Any, Optional

logs_client = boto3.client('logs')

BUCKET_NAME = os.environ.get('BUCKET_NAME', '')
LOG_GROUP_NAME = os.environ.get('LOG_GROUP_NAME', '')

def extract_s3_event_from_sqs(event: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Extract S3 event from SQS message containing SNS notification.
    Event structure: SQS -> SNS -> S3
    """
    try:
        # Get SQS message body
        sqs_record = event['Records'][0]
        sqs_body = json.loads(sqs_record['body'])

        # Get SNS message from SQS body
        sns_message = json.loads(sqs_body['Message'])

        # Return the S3 event records
        return sns_message
    except (KeyError, IndexError, json.JSONDecodeError) as e:
        print(f"Error extracting S3 event: {e}")
        print(f"Event structure: {json.dumps(event)}")
        return None

def find_object_creation_size(object_name: str) -> Optional[int]:
    """
    Search CloudWatch Logs for the object creation event to find its size.
    Returns the size in bytes, or None if not found.
    """
    try:
        # Search for logs containing the object creation event
        # Filter pattern to find JSON logs with this object_name and positive size_delta
        filter_pattern = f'{{ $.object_name = "{object_name}" && $.size_delta > 0 }}'

        print(f"Searching logs for object: {object_name}")
        print(f"Filter pattern: {filter_pattern}")

        # Query logs from the last 24 hours
        end_time = int(time.time() * 1000)
        start_time = end_time - (24 * 60 * 60 * 1000)  # 24 hours ago

        response = logs_client.filter_log_events(
            logGroupName=LOG_GROUP_NAME,
            filterPattern=filter_pattern,
            startTime=start_time,
            endTime=end_time,
            limit=10  # We only need the first match
        )

        events = response.get('events', [])
        print(f"Found {len(events)} matching log events")

        if events:
            # Parse the first matching event
            log_message = events[0]['message']
            print(f"Found creation log: {log_message}")

            # Extract the size_delta from the log message
            log_data = json.loads(log_message)
            size_delta = log_data.get('size_delta', 0)

            print(f"Extracted size: {size_delta} bytes")
            return int(size_delta)
        else:
            print(f"No creation event found for {object_name}")
            return None

    except Exception as e:
        print(f"Error searching logs: {e}")
        import traceback
        traceback.print_exc()
        return None

def lambda_handler(event, context):
    """
    Logging Lambda - consumes S3 events from SQS queue.
    Logs object creation/deletion with size deltas in JSON format.
    """
    print(f"Received event: {json.dumps(event)}")

    # Extract S3 event from SQS/SNS envelope
    s3_event = extract_s3_event_from_sqs(event)
    if not s3_event:
        return {
            'statusCode': 400,
            'body': json.dumps('Invalid event format')
        }

    # Process each S3 event record
    for record in s3_event.get('Records', []):
        try:
            event_name = record['eventName']
            bucket_name = record['s3']['bucket']['name']
            object_key = record['s3']['object']['key']

            print(f"Processing event: {event_name} for object: {object_key}")

            # Skip plot files
            if object_key in ['plot', 'plot.png']:
                print(f"Skipping plot file: {object_key}")
                continue

            # Handle object creation events
            if event_name.startswith('ObjectCreated'):
                # Size is available in the event for creation
                object_size = record['s3']['object'].get('size', 0)

                # Log in JSON format with positive size_delta
                log_entry = {
                    "object_name": object_key,
                    "size_delta": object_size
                }
                print(json.dumps(log_entry))

            # Handle object deletion events
            elif event_name.startswith('ObjectRemoved'):
                # Size is NOT available in delete events
                # Need to search logs for the creation event
                object_size = find_object_creation_size(object_key)

                if object_size is not None:
                    # Log in JSON format with negative size_delta
                    log_entry = {
                        "object_name": object_key,
                        "size_delta": -object_size
                    }
                    print(json.dumps(log_entry))
                else:
                    print(f"Warning: Could not find creation size for {object_key}, logging with size 0")
                    log_entry = {
                        "object_name": object_key,
                        "size_delta": 0
                    }
                    print(json.dumps(log_entry))

        except Exception as e:
            print(f"Error processing record: {e}")
            import traceback
            traceback.print_exc()
            continue

    return {
        'statusCode': 200,
        'body': json.dumps('Logging completed')
    }
