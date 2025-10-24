import boto3
import json
import time
import urllib3

s3_client = boto3.client('s3')

# Configuration
BUCKET_NAME = 'testbucket-cloud-app-123456'  
API_ENDPOINT = 'https://u5j74ylbmg.execute-api.us-east-1.amazonaws.com/prod/plot'  

def lambda_handler(event, context):
    """
    Driver lambda that orchestrates the testing workflow:
    1. Create assignment1.txt
    2. Update assignment1.txt
    3. Delete assignment1.txt
    4. Create assignment2.txt
    5. Call plotting API
    """
    
    print("Starting driver lambda...")
    
    # Step 1: Create object assignment1.txt
    print("\n=== Step 1: Creating assignment1.txt ===")
    try:
        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key='assignment1.txt',
            Body='Empty Assignment 1'
        )
        print("✓ Created assignment1.txt (18 bytes)")
    except Exception as e:
        print(f"✗ Error creating assignment1.txt: {e}")
        return {'statusCode': 500, 'body': str(e)}
    
    # Sleep to space out the operations
    print("Sleeping for 2 seconds...")
    time.sleep(4)
    
    # Step 2: Update object assignment1.txt
    print("\n=== Step 2: Updating assignment1.txt ===")
    try:
        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key='assignment1.txt',
            Body='Empty Assignment 2222222222'
        )
        print("✓ Updated assignment1.txt (27 bytes)")
    except Exception as e:
        print(f"✗ Error updating assignment1.txt: {e}")
        return {'statusCode': 500, 'body': str(e)}
    
    # Sleep
    print("Sleeping for 2 seconds...")
    time.sleep(4)
    
    # Step 3: Delete object assignment1.txt
    print("\n=== Step 3: Deleting assignment1.txt ===")
    try:
        s3_client.delete_object(
            Bucket=BUCKET_NAME,
            Key='assignment1.txt'
        )
        print("✓ Deleted assignment1.txt (0 bytes)")
    except Exception as e:
        print(f"✗ Error deleting assignment1.txt: {e}")
        return {'statusCode': 500, 'body': str(e)}
    
    # Sleep
    print("Sleeping for 2 seconds...")
    time.sleep(4)
    
    # Step 4: Create object assignment2.txt
    print("\n=== Step 4: Creating assignment2.txt ===")
    try:
        s3_client.put_object(
            Bucket=BUCKET_NAME,
            Key='assignment2.txt',
            Body='33'
        )
        print("✓ Created assignment2.txt (2 bytes)")
    except Exception as e:
        print(f"✗ Error creating assignment2.txt: {e}")
        return {'statusCode': 500, 'body': str(e)}
    
    # Sleep before calling plotting API
    print("Sleeping for 3 seconds before calling plotting API...")
    time.sleep(3)
    
    # Step 5: Call the plotting lambda API
    print("\n=== Step 5: Calling plotting API ===")
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
        print("Note: Make sure API_ENDPOINT is correctly configured")
        return {'statusCode': 500, 'body': str(e)}
    
    print("\n=== Driver lambda completed successfully ===")
    
    return {
        'statusCode': 200,
        'body': json.dumps({
            'message': 'Driver lambda completed successfully',
            'operations': [
                'Created assignment1.txt',
                'Updated assignment1.txt',
                'Deleted assignment1.txt',
                'Created assignment2.txt',
                'Called plotting API'
            ]
        })
    }