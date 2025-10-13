import requests
import os

def generate_answer(query, chunks):
    """
    Generate an answer from Groq LLM using a user query and related context chunks.

    Args:
        query (str): User's question.
        chunks (List[str]): Relevant text chunks for context.

    Returns:
        str: Generated answer or error message.
    """
    # Load Groq API key from environment
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")
    if not GROQ_API_KEY:
        raise ValueError("GROQ_API_KEY environment variable not set")

    # API endpoint and authorization header
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}"
    }

    # Concatenate chunks to provide context for the model
    context = " ".join(chunks)

    # Construct request payload
    payload = {
        "model": "llama3-8b-8192",
        "messages": [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": f"{query} Context: {context}"}
        ]
    }

    # Make the POST request to Groq API
    response = requests.post(url, json=payload, headers=headers)

    # Handle response
    if response.status_code == 200:
        return response.json()["choices"][0]["message"]["content"]
    else:
        return f"Error: {response.status_code} {response.text}"
