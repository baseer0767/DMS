
'''from fastapi import FastAPI, File, UploadFile, Form
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import os
from dotenv import load_dotenv
import fitz  # PyMuPDF for PDF reading
from uuid import uuid4  # For unique chunk IDs

# Custom internal modules
from app.models.cohere_embedder import get_embeddings
from app.models.pinecone_handler import store_chunks, retrieve_chunks
from app.models.groq_generator import generate_answer

# Load environment variables
load_dotenv()

# Initialize FastAPI app
app = FastAPI()

# Serve static frontend files
app.mount("/static", StaticFiles(directory="static"), name="static")

# Directory where uploaded PDFs are stored
UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def process_all_pdfs():
    """
    Extracts, chunks, and returns text from all PDFs in the uploads directory.
    Returns a list of dictionaries: [{id, text, filename}, ...]
    """
    all_chunks = []

    for filename in os.listdir(UPLOAD_DIR):
        if filename.endswith(".pdf"):
            path = os.path.join(UPLOAD_DIR, filename)
            doc = fitz.open(path)
            full_text = "\n".join([page.get_text() for page in doc])

            chunks = [full_text[i:i + 500] for i in range(0, len(full_text), 500)]
            for chunk in chunks:
                all_chunks.append({
                    "id": str(uuid4()),
                    "text": chunk,
                    "filename": filename
                })

    return all_chunks


@app.post("/upload")
async def upload(file: UploadFile = File(...), question: str = Form(...)):
    """
    Uploads a PDF, saves it, processes all local PDFs,
    and returns answer to the question.
    """
    # Save the uploaded file
    file_path = os.path.join(UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as f:
        f.write(await file.read())

    # Process all local PDFs
    file_chunks = process_all_pdfs()
    texts = [item["text"] for item in file_chunks]
    ids = [item["id"] for item in file_chunks]

    # Get embeddings and store
    embeddings = get_embeddings(texts)
    store_chunks(texts, embeddings, ids=ids)

    # Retrieve and answer
    top_chunks = retrieve_chunks(question)
    answer = generate_answer(question, top_chunks)

    return JSONResponse({"answer": answer})


@app.post("/ask")
async def ask_only(question: str = Form(...)):
    """
    Accepts a question and answers it based on previously uploaded PDFs.
    No file upload required.
    """
    top_chunks = retrieve_chunks(question)
    answer = generate_answer(question, top_chunks)
    return JSONResponse({"answer": answer})


@app.get("/")
def root():
    """
    Serve HTML frontend.
    """
    with open("static/index.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())'''

from fastapi import FastAPI, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from datetime import datetime
import logging

from app.database import get_db, create_tables
from app import crud

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()
app.mount("/static", StaticFiles(directory="static"), name="static")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

create_tables()

class DocumentCreate(BaseModel):
    title: str
    file_type: str
    file_size: str | int | None = None
    folder_id: str | None = None
    uploaded_by: int
    upload_date: datetime | None = None
    file_url: str
    tags: str | None = ""
    drive_id: str | None = None
    file_id: str | None = None

@app.get("/")
def root():
    with open("static/login.html", "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

@app.post("/signup")
def signup(data: dict, db: Session = Depends(get_db)):
    if crud.get_user_by_username(db, data["username"]):
        raise HTTPException(status_code=400, detail="Username already exists")
    if crud.get_user_by_email(db, data["email"]):
        raise HTTPException(status_code=400, detail="Email already registered")

    user = crud.create_user(
        db,
        first_name=data["first_name"],
        last_name=data["last_name"],
        username=data["username"],
        email=data["email"],
        password=data["password"],
    )
    return {"message": "User created successfully", "user_id": user.id}

@app.post("/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = crud.get_admin_by_username(db, form_data.username)
    role = "admin" if user else None

    if not user:
        user = crud.get_user_by_username(db, form_data.username)
        role = "user" if user else None

    if not user or form_data.password != user.password:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    return {"access_token": f"dummy-token-for-{user.username}", "token_type": "bearer", "role": role}

@app.post("/upload-document")
def create_document(data: DocumentCreate, db: Session = Depends(get_db)):
    try:
        logger.info(f"Received document upload request: {data.dict()}")

        incoming_drive_id = data.drive_id or data.file_id
        if not incoming_drive_id:
            raise HTTPException(status_code=400, detail="drive_id (or file_id) is required")

        file_size = 0
        if isinstance(data.file_size, int):
            file_size = data.file_size
        elif isinstance(data.file_size, str) and data.file_size.isdigit():
            file_size = int(data.file_size)

        if data.file_type == "application/vnd.google-apps.folder":
            folder = crud.create_folder(
                db=db,
                folder_name=data.title,
                parent_folder_id=data.folder_id,
                drive_path=data.file_url,
                created_by=data.uploaded_by,
                created_date=data.upload_date or datetime.utcnow(),
                folder_id=incoming_drive_id,
            )
            return {"message": "Folder upserted", "folder_id": folder.id}

        if data.file_type.startswith("application/vnd.google-apps."):
            file_size = 0

        doc = crud.create_document(
            db=db,
            title=data.title,
            file_type=data.file_type,
            file_size=file_size,
            folder_id=data.folder_id,
            drive_id=incoming_drive_id,
            uploaded_by=data.uploaded_by,
            upload_date=data.upload_date or datetime.utcnow(),
            file_url=data.file_url,
            tags=data.tags or "",
        )
        return {"message": "Document upserted", "document_id": doc.id}

    except ValueError as e:
        logger.error(f"Validation error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.get("/folders")
def list_folders(db: Session = Depends(get_db)):
    return crud.get_all_folders(db)
