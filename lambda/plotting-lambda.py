import boto3
import json
import time
from datetime import datetime
from decimal import Decimal
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import io

s3_client = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table('S3-object-size-history')

# Configuration
BUCKET_NAME = 'testbucket-cloud-app-123456'

def decimal_to_float(obj):
    """Helper function to convert Decimal to float for JSON serialization"""
    if isinstance(obj, Decimal):
        return float(obj)
    raise TypeError

def lambda_handler(event, context):
    """
    Query bucket size history from last 10 seconds and create a plot.
    Plot includes recent sizes and a horizontal line for max size ever.
    """
    
    print("Starting plotting lambda...")
    
    current_time = Decimal(str(time.time()))
    twenty_seconds_ago = current_time - Decimal('20')
    
    # Query items from last 20 seconds
    try:
        response = table.query(
            KeyConditionExpression='bucket_name = :bn AND #ts >= :start_time',
            ExpressionAttributeNames={
                '#ts': 'timestamp'
            },
            ExpressionAttributeValues={
                ':bn': BUCKET_NAME,
                ':start_time': twenty_seconds_ago
            }
        )
        
        recent_items = response['Items']
        print(f"Found {len(recent_items)} items in last 20 seconds")
        
    except Exception as e:
        print(f"Error querying recent items: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps(f'Error querying DynamoDB: {str(e)}')
        }
    
    # Query all items to find maximum size ever
    try:
        response_all = table.query(
            KeyConditionExpression='bucket_name = :bn',
            ExpressionAttributeValues={
                ':bn': BUCKET_NAME
            }
        )
        
        all_items = response_all['Items']
        max_size = max([int(item['total_size']) for item in all_items]) if all_items else 0
        print(f"Maximum size ever: {max_size} bytes")
        
    except Exception as e:
        print(f"Error querying all items: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps(f'Error finding max size: {str(e)}')
        }
    
    # Check if we have data to plot
    if not recent_items:
        print("No data to plot in last 20 seconds")
        return {
            'statusCode': 200,
            'body': json.dumps('No data available in last 20 seconds to plot')
        }
    
    # Sort by timestamp and take only the first 4 entries
    sorted_items = sorted(recent_items, key=lambda x: float(x['timestamp']))
    filtered_items = sorted_items[:4]
    
    print(f"Using first {len(filtered_items)} items for plotting")
    for item in filtered_items:
        print(f"  Timestamp: {item['timestamp']}, Size: {item['total_size']}, Count: {item['object_count']}")
    
    # Prepare data for plotting
    timestamps = [float(item['timestamp']) for item in filtered_items]
    sizes = [int(item['total_size']) for item in filtered_items]
    
    print(f"Sizes to plot: {sizes}")
    
    # Convert timestamps to relative time (seconds from first timestamp)
    min_timestamp = min(timestamps)
    relative_times = [(ts - min_timestamp) for ts in timestamps]
    
    print(f"Relative times: {relative_times}")
    
    # Create the plot
    plt.figure(figsize=(10, 6))
    
    # Plot bucket size changes
    plt.plot(relative_times, sizes, 'bo-', label='Bucket Size', linewidth=2, markersize=8)
    
    # Plot maximum size line
    plt.axhline(y=max_size, color='r', linestyle='--', linewidth=2, label=f'Max Size Ever: {max_size} bytes')
    
    # Labels and formatting
    plt.xlabel('Time (seconds)', fontsize=12)
    plt.ylabel('Size (bytes)', fontsize=12)
    plt.title(f'S3 Bucket Size Change - Last 10 Seconds\n{BUCKET_NAME}', fontsize=14)
    plt.legend(fontsize=10)
    plt.grid(True, alpha=0.3)
    
    # Set y-axis to start from 0 to clearly show the drop to 0 bytes
    plt.ylim(bottom=-1, top=max_size + 5)
    
    # Save plot to buffer
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=100, bbox_inches='tight')
    buf.seek(0)
    plt.close()
    
    # Upload to S3
    try:
        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key='plot',
            Body=buf.getvalue(),
            ContentType='image/png'
        )
        
        print("Plot uploaded successfully to S3")
        
    except Exception as e:
        print(f"Error uploading plot to S3: {e}")
        return {
            'statusCode': 500,
            'body': json.dumps(f'Error uploading plot: {str(e)}')
        }
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'message': 'Plot generated and uploaded successfully',
            'bucket': BUCKET_NAME,
            'plot_key': 'plot',
            'data_points': len(filtered_items),
            'max_size': max_size,
            'sizes': sizes,
            'relative_times': relative_times
        })
    }