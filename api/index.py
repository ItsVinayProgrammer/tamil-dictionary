import os

import psycopg2
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from mangum import Mangum
from psycopg2.extras import RealDictCursor


load_dotenv()

app = FastAPI(title="Tamil Dictionary API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_connection():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise HTTPException(status_code=500, detail="DATABASE_URL is not configured")
    try:
        return psycopg2.connect(database_url)
    except psycopg2.Error as exc:
        print(f"Database connection failed: {type(exc).__name__}: {exc}")
        raise HTTPException(status_code=500, detail="Database connection failed") from exc


def escape_like(value):
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@app.get("/api/")
def health_check():
    return {"status": "ok", "message": "Tamil Dictionary API running"}


@app.get("/")
def root():
    return {"status": "ok", "message": "Tamil Dictionary API running", "docs": "/docs"}


@app.get("/api/subjects")
def get_subjects():
    sql = """
        SELECT DISTINCT subject
        FROM words
        WHERE subject IS NOT NULL AND TRIM(subject) != ''
        ORDER BY subject
    """

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql)
            subjects = [row[0] for row in cursor.fetchall()]

    return {"subjects": subjects}


@app.get("/api/files")
def get_files():
    sql = """
        SELECT DISTINCT file_name
        FROM words
        WHERE file_name IS NOT NULL AND TRIM(file_name) != ''
        ORDER BY file_name
    """

    with get_connection() as connection:
        with connection.cursor() as cursor:
            cursor.execute(sql)
            files = [row[0] for row in cursor.fetchall()]

    return {"files": files}


@app.get("/api/search")
def search_words(
    q: str = Query(..., min_length=1),
    subject: str | None = Query(default=None),
    file_name: str | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
):
    search_term = q.strip()
    if not search_term:
        raise HTTPException(status_code=422, detail="q must contain at least one character")

    filters = ["LOWER(english) LIKE LOWER(%s) ESCAPE '\\'"]
    params = [f"%{escape_like(search_term)}%"]

    if subject:
        filters.append("LOWER(subject) = LOWER(%s)")
        params.append(subject.strip())

    if file_name:
        filters.append("LOWER(file_name) = LOWER(%s)")
        params.append(file_name.strip())

    sql = f"""
        SELECT
            sno,
            english,
            tamil,
            subject,
            volume,
            sheet_name,
            file_name,
            row_number
        FROM words
        WHERE {' AND '.join(filters)}
        ORDER BY
            CASE WHEN LOWER(english) = LOWER(%s) THEN 0 ELSE 1 END,
            LOWER(english),
            tamil
        LIMIT %s
    """
    params.extend([search_term, limit])

    with get_connection() as connection:
        with connection.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(sql, params)
            results = [dict(row) for row in cursor.fetchall()]

    return {"count": len(results), "results": results}


handler = Mangum(app)
