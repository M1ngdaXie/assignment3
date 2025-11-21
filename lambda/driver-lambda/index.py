import boto3
import json
import os 
import time
import urllib3

s3_client = boto3.client('s3')

# Configuration - use environment variables
# Extract bucket name from ARN (format: arn:aws:s3:::bucket-name)
BUCKET_ARN = os.environ.get('BUCKET_ARN', '')
BUCKET_NAME = BUCKET_ARN.split(':::')[-1] if BUCKET_ARN else os.environ.get('BUCKET_NAME', '')
API_ENDPOINT = os.environ.get('API_URL', '') 

def lambda_handler(event, context):
    """
    Driver lambda for Assignment 4 workflow:
    1. Create assignment1.txt (19 bytes)
    2. Create assignment2.txt (28 bytes) - total: 47 bytes, triggers alarm, Cleaner deletes assignment2.txt
    3. Wait for Cleaner to delete assignment2.txt
    4. Create assignment3.txt (2 bytes) - total: 21 bytes, triggers alarm, Cleaner deletes assignment1.txt
    5. Wait for Cleaner to delete assignment1.txt
    6. Call plotting API
    """
    print("Starting driver lambda (Assignment 4)...")
    print(f"Using bucket: {BUCKET_NAME}")
    print(f"Using API: {API_ENDPOINT}")

    # Step 1: Create assignment1.txt (19 bytes)
    print("\n=== Step 1: Creating assignment1.txt (19 bytes) ===")
    try:
        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key='assignment1.txt',
            Body='Empty Assignment 1'  # 19 bytes
        )
        print("✓ Created assignment1.txt (19 bytes)")
    except Exception as e:
        print(f"✗ Error creating assignment1.txt: {e}")
        return {'statusCode': 500, 'body': str(e)}

    # Sleep to allow metrics to propagate
    print("Sleeping for 5 seconds...")
    time.sleep(5)

    # Step 2: Create assignment2.txt (28 bytes)
    # Total size will be 19 + 28 = 47 bytes, which exceeds threshold of 20
    # This should trigger the alarm and Cleaner should delete assignment2.txt
    print("\n=== Step 2: Creating assignment2.txt (28 bytes) ===")
    print("(This should trigger alarm - total size: 47 bytes > 20 bytes threshold)")
    try:
        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key='assignment2.txt',
            Body='Empty Assignment 2222222222'  # 28 bytes
        )
        print("✓ Created assignment2.txt (28 bytes)")
    except Exception as e:
        print(f"✗ Error creating assignment2.txt: {e}")
        return {'statusCode': 500, 'body': str(e)}

    # Wait for alarm to fire and Cleaner to delete assignment2.txt
    # Note: CloudWatch alarm evaluation happens every 1 minute, so we need to wait
    # for the next evaluation period plus some buffer time for the Cleaner to execute
    print("\nWaiting 75 seconds for alarm to fire and Cleaner to delete assignment2.txt...")
    time.sleep(75)

    # Wait for alarm to clear back to OK before creating next file
    # This ensures the alarm can fire again when assignment3.txt is created
    print("\nWaiting additional 60 seconds for alarm to clear to OK state...")
    time.sleep(60)

    # Step 3: Create assignment3.txt (5 bytes)
    # After Cleaner deletes assignment2.txt, only assignment1.txt (18 bytes) remains
    # Adding assignment3.txt (5 bytes) makes total 23 bytes, which exceeds threshold of 20
    # Since we waited for alarm to clear to OK, this should trigger alarm again
    # The alarm will then fire and Cleaner should delete assignment1.txt (the largest)
    print("\n=== Step 3: Creating assignment3.txt (5 bytes) ===")
    print("(Alarm should be OK now, this will trigger alarm again)")
    try:
        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key='assignment3.txt',
            Body='33333'  # 5 bytes
        )
        print("✓ Created assignment3.txt (5 bytes)")
    except Exception as e:
        print(f"✗ Error creating assignment3.txt: {e}")
        return {'statusCode': 500, 'body': str(e)}

    # Wait for alarm to fire and Cleaner to delete assignment1.txt
    print("\nWaiting 75 seconds for alarm to fire and Cleaner to delete assignment1.txt...")
    time.sleep(75)

    # Step 4: Call the plotting lambda API
    print("\n=== Step 4: Calling plotting API ===")
    if not API_ENDPOINT:
        print("⚠ API_ENDPOINT not configured, skipping API call")
    else:
        try:
            http = urllib3.PoolManager()
            response = http.request('GET', API_ENDPOINT)
            
            print(f"API Response Status: {response.status}")
            print(f"API Response Body: {response.data.decode('utf-8')}")
            
            if response.status == 200:
                print("✓ Successfully called plotting API")
            else:
                print(f"⚠ API returned status code: {response.status}")
                
        except Exception as e:
            print(f"✗ Error calling plotting API: {e}")
            return {'statusCode': 500, 'body': str(e)}
    
    print("\n=== Driver lambda completed successfully ===")

    return {
        'statusCode': 200,
        'body': json.dumps({
            'message': 'Driver lambda completed successfully (Assignment 4)',
            'operations': [
                'Created assignment1.txt (18 bytes)',
                'Created assignment2.txt (27 bytes) - triggered alarm, Cleaner deleted it',
                'Created assignment3.txt (5 bytes) - triggered alarm, Cleaner deleted assignment1.txt',
                'Called plotting API'
            ]
        })
    }