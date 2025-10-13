import os
import cohere
from dotenv import load_dotenv

load_dotenv()
co = cohere.Client(api_key=os.getenv("COHERE_API_KEY"))  # ✅ Fix here

def get_embeddings(chunks):
    response = co.embed(
        texts=chunks,
        model="embed-english-v3.0",
        input_type="classification"
    )
    return response.embeddings
