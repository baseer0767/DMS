from typing import Optional
from sqlalchemy.orm import Session
from app.database import Admin, User, Document, Folder
from datetime import datetime

# ================= AUTH HELPERS =================
def get_admin_by_username(db: Session, username: str):
    return db.query(Admin).filter(Admin.username == username).first()

def get_user_by_username(db: Session, username: str):
    return db.query(User).filter(User.username == username).first()

def get_user_by_email(db: Session, email: str):
    return db.query(User).filter(User.email == email).first()

def create_user(db: Session, first_name: str, last_name: str, username: str, email: str, password: str):
    user = User(first_name=first_name, last_name=last_name, username=username, email=email, password=password)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

# ================= FOLDER CRUD =================
def create_folder(
    db: Session,
    folder_name: str,
    parent_folder_id: Optional[str],
    drive_path: str,
    created_by: int,
    created_date: datetime,
    folder_id: str,
):
    parent_db_id = None
    if parent_folder_id:
        parent = db.query(Folder).filter(Folder.drive_folder_id == parent_folder_id).first()
        if parent:
            parent_db_id = parent.id

    folder = db.query(Folder).filter(Folder.drive_folder_id == folder_id).first()
    if folder:
        return folder

    folder = Folder(
        folder_name=folder_name,
        parent_id=parent_db_id,
        drive_path=drive_path,
        created_by=created_by,
        created_date=created_date,
        drive_folder_id=folder_id,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder

def get_all_folders(db: Session):
    return db.query(Folder).all()

# ================= DOCUMENT CRUD =================
def create_document(
    db: Session,
    title: str,
    file_type: str,
    file_size: int,
    folder_id: Optional[str],
    drive_id: str,
    uploaded_by: int,
    upload_date: datetime,
    file_url: str,
    tags: str = "",
):
    user = db.query(User).filter(User.id == uploaded_by).first()
    if not user:
        raise ValueError(f"No user found with ID: {uploaded_by}")

    db_folder_id = None
    if folder_id:
        parent = db.query(Folder).filter(Folder.drive_folder_id == folder_id).first()
        if parent:
            db_folder_id = parent.id

    doc = db.query(Document).filter(Document.drive_id == drive_id).first()
    if doc:
        return doc

    doc = Document(
        title=title,
        file_type=file_type,
        file_size=file_size,
        folder_id=db_folder_id,
        drive_id=drive_id,
        uploaded_by=uploaded_by,
        upload_date=upload_date,
        file_url=file_url,
        tags=tags,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc

def get_all_documents(db: Session):
    return db.query(Document).all()
