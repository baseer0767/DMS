import os
from pinecone import Pinecone, ServerlessSpec

# Initialize Pinecone client using environment API key
pc = Pinecone(api_key=os.getenv("PINECONE_API_KEY"))

# Get index name from environment or default
index_name = os.getenv("PINECONE_INDEX", "rag-index")

# Connect to Pinecone index
index = pc.Index(index_name)


def store_chunks(chunks, embeddings, ids=None):
    """
    Store text chunks and embeddings into Pinecone.

    Args:
        chunks (List[str]): List of text chunks.
        embeddings (List[List[float]]): Corresponding embedding vectors.
        ids (List[str], optional): Custom unique IDs for each chunk. If None, uses default chunk-i format.
    """
    vectors = []
    for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
        vector_id = ids[i] if ids else f"chunk-{i}"
        vectors.append({
            "id": vector_id,
            "values": embedding,
            "metadata": {"text": chunk}
        })

    # Perform a bulk upsert
    index.upsert(vectors)


def retrieve_chunks(query, top_k=5):
    """
    Retrieve top matching chunks from Pinecone for a given query.

    Args:
        query (str): User question to search for relevant context.
        top_k (int): Number of top chunks to retrieve. Default is 5.

    Returns:
        List[str]: List of text chunks most relevant to the query.
    """
    # Import here to avoid circular dependency
    from app.models.cohere_embedder import get_embeddings

    # Get embedding for the query
    query_embedding = get_embeddings([query])[0]

    # Query Pinecone index
    results = index.query(vector=query_embedding, top_k=top_k, include_metadata=True)

    # Return only the text metadata from matched chunks
    return [match['metadata']['text'] for match in results['matches']]
