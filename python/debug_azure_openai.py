#!/usr/bin/env python3
"""Debug script to test Azure OpenAI deployment connectivity."""

import os
from dotenv import load_dotenv
from openai import AzureOpenAI, OpenAI
import requests

load_dotenv()

ENDPOINT = os.getenv("AZURE_OPENAI_ENDPOINT")
API_VERSION = os.getenv("AZURE_OPENAI_API_VERSION")
API_KEY = os.getenv("AZURE_OPENAI_API_KEY")

print("=" * 60)
print("Azure OpenAI Connection Debug")
print("=" * 60)
print(f"Endpoint: {ENDPOINT}")
print(f"API Version: {API_VERSION}")
print(f"API Key: {API_KEY[:10]}...{API_KEY[-4:]}")
print()

# Test 1: List deployments via REST API
print("=" * 60)
print("Test 1: List deployments via REST API")
print("=" * 60)
try:
    # Try the management API to list deployments
    url = f"{ENDPOINT}openai/deployments?api-version={API_VERSION}"
    headers = {"api-key": API_KEY}
    response = requests.get(url, headers=headers)
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print("Available deployments:")
        for dep in data.get("data", []):
            print(f"  - {dep.get('id')} (model: {dep.get('model')})")
    else:
        print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")

# Test 2: Check if it's Azure AI Foundry (different endpoint structure)
print()
print("=" * 60)
print("Test 2: Check Azure AI Foundry models endpoint")
print("=" * 60)
try:
    # Foundry uses /models endpoint
    url = f"{ENDPOINT}openai/models?api-version={API_VERSION}"
    headers = {"api-key": API_KEY}
    response = requests.get(url, headers=headers)
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print("Available models:")
        for model in data.get("data", []):
            print(f"  - {model.get('id')}")
    else:
        print(f"Response: {response.text[:200]}")
except Exception as e:
    print(f"Error: {e}")

# Test 3: Try Azure AI Foundry inference endpoint format
print()
print("=" * 60)
print("Test 3: Azure AI Foundry serverless inference")
print("=" * 60)
# Foundry uses different URL pattern: /models/{model-name}/chat/completions
try:
    url = f"{ENDPOINT}openai/deployments/gpt-5-mini/chat/completions?api-version={API_VERSION}"
    headers = {"api-key": API_KEY, "Content-Type": "application/json"}
    payload = {"messages": [{"role": "user", "content": "Hi"}], "max_tokens": 5}
    response = requests.post(url, headers=headers, json=payload)
    print(f"Deployment endpoint status: {response.status_code}")
    print(f"Response: {response.text[:300]}")
except Exception as e:
    print(f"Error: {e}")

# Test 4: Try the model specified in ai_client.py
print()
print("=" * 60)
print("Test 4: Test 'gpt-5-mini' via SDK")
print("=" * 60)
client = AzureOpenAI(
    azure_endpoint=ENDPOINT,
    api_version=API_VERSION,
    api_key=API_KEY,
)

try:
    response = client.chat.completions.create(
        model="gpt-5-mini",
        messages=[{"role": "user", "content": "Say hello"}],
        max_tokens=10,
    )
    print("SUCCESS!")
    print(f"Response: {response.choices[0].message.content}")
except Exception as e:
    print(f"FAILED: {e}")

# Test 5: Try common model names
print()
print("=" * 60)
print("Test 5: Try common deployment names")
print("=" * 60)
common_models = [
    "gpt-4o-mini",
    "gpt-4o",
    "gpt-4",
    "gpt-4-turbo",
    "gpt-35-turbo",
    "gpt-3.5-turbo",
    "o1-mini",
    "o1",
    "o3-mini",
]

for model in common_models:
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[{"role": "user", "content": "Hi"}],
            max_tokens=5,
        )
        print(f"  {model}: SUCCESS - {response.choices[0].message.content}")
    except Exception as e:
        error_code = str(e).split("'code': '")[1].split("'")[0] if "'code': '" in str(e) else str(e)[:50]
        print(f"  {model}: FAILED - {error_code}")

# Test 6: Check endpoint health
print()
print("=" * 60)
print("Test 6: Endpoint health/accessibility")
print("=" * 60)
try:
    # Just hit the base endpoint
    response = requests.get(ENDPOINT, timeout=5)
    print(f"Base endpoint status: {response.status_code}")
except Exception as e:
    print(f"Base endpoint error: {e}")

# Try without trailing slash
endpoint_no_slash = ENDPOINT.rstrip("/")
try:
    response = requests.get(f"{endpoint_no_slash}/openai?api-version={API_VERSION}", headers={"api-key": API_KEY})
    print(f"OpenAI path status: {response.status_code}")
    print(f"Response: {response.text[:200]}")
except Exception as e:
    print(f"Error: {e}")

print()
print("=" * 60)
print("Summary")
print("=" * 60)
print("""
Possible issues:
1. The Azure OpenAI resource may have been deleted
2. This might be an Azure AI Foundry project needing different auth/endpoint
3. The API key may have been revoked/rotated
4. The deployment 'gpt-5-mini' doesn't exist - needs to be created in Azure portal

To fix:
- Check Azure Portal > Azure OpenAI resources
- Verify the deployment exists at: {ENDPOINT}
- Create a new deployment if needed and update DEFAULT_MODEL in ai_client.py
""")
