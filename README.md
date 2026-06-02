# Tamil Dictionary

A full-stack Tamil-English dictionary search application using local Excel preprocessing, Supabase PostgreSQL, a FastAPI backend on Vercel, and a plain HTML/CSS/JavaScript frontend for Cloudflare Pages.

## Project Structure

```text
tamil-dictionary/
├── preprocessing/
│   ├── excel_files/
│   ├── process_excel.py
│   ├── requirements.txt
│   └── .env.example
├── api/
│   └── index.py
├── frontend/
│   ├── index.html
│   ├── style.css
│   └── app.js
├── vercel.json
├── requirements.txt
├── .gitignore
└── README.md
```

## Database Schema

Run this SQL once in the Supabase SQL Editor before preprocessing:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS words (
    id          SERIAL PRIMARY KEY,
    sno         TEXT,
    volume      TEXT,
    subject     TEXT,
    english     TEXT NOT NULL,
    tamil       TEXT,
    sheet_name  TEXT,
    file_name   TEXT,
    row_number  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_english_trgm
    ON words USING GIN (english gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_subject
    ON words (LOWER(subject));

CREATE INDEX IF NOT EXISTS idx_filename
    ON words (LOWER(file_name));
```

## Step 1: Supabase Setup

Create a free account at [supabase.com](https://supabase.com), create a new project, then go to SQL Editor and run the schema SQL above.

Go to Settings > Database > Connection string, choose URI, and copy the direct PostgreSQL connection string. Replace `[YOUR-PASSWORD]` with your database password.

```text
postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres
```

## Step 2: Preprocessing

Put all `.xlsx` files inside `preprocessing/excel_files/`.

Create `preprocessing/.env`:

```text
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres
```

Install dependencies and run the import:

```bash
cd preprocessing
pip install -r requirements.txt
python process_excel.py
```

The script reads every `.xlsx` file recursively from `preprocessing/excel_files/`, imports every valid sheet, skips rows without an English value, commits after each file, and prints progress as it runs.

## Step 3: Deploy Backend to Vercel

Push this repository to GitHub, then go to [vercel.com](https://vercel.com) and import the GitHub repo.

In Vercel dashboard > Settings > Environment Variables, add:

```text
DATABASE_URL=your Supabase connection string
```

Deploy the project. The API endpoints are:

```text
GET /api/
GET /api/subjects
GET /api/files
GET /api/search?q=apple&subject=Biology&file_name=Biology_N&limit=50
```

## Step 4: Deploy Frontend to Cloudflare Pages

Go to [pages.cloudflare.com](https://pages.cloudflare.com), connect the GitHub repo, and set the build output directory to:

```text
frontend
```

No build command is needed.

If the frontend is hosted separately on Cloudflare Pages, edit `frontend/app.js` and set `API_BASE` to your Vercel deployment URL:

```js
const API_BASE = "https://your-project.vercel.app";
```

Push to GitHub to trigger a Cloudflare Pages redeploy.

## Excel Format

Each workbook should use this column structure, with row 1 as the header and data starting on row 2:

```text
A: S.no
B: Volume
C: Subject
D: English
E: Tamil
```

Tamil text is stored and returned as Unicode text without manual encoding or decoding.
