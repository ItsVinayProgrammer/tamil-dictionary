import os
import time
from pathlib import Path

import pandas as pd
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_values


BASE_DIR = Path(__file__).resolve().parent
EXCEL_DIR = BASE_DIR / "excel_files"
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "1000"))
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))
INSERT_SQL = """
    INSERT INTO words (
        sno,
        volume,
        subject,
        english,
        tamil,
        sheet_name,
        file_name,
        row_number
    )
    VALUES %s
"""


def clean_value(value):
    if pd.isna(value):
        return ""
    text = str(value).strip()
    return "" if text.lower() == "nan" else text


def read_sheet_rows(file_path, sheet_name, frame):
    frame.columns = [str(column).strip() for column in frame.columns]

    if "English" not in frame.columns or "Tamil" not in frame.columns:
        print(f"  Skipping sheet '{sheet_name}': missing English or Tamil column")
        return []

    rows = []
    file_name = file_path.stem

    for row_idx, row in frame.iterrows():
        english = clean_value(row.get("English", ""))
        if not english:
            continue

        rows.append(
            (
                clean_value(row.get("S.no", "")),
                clean_value(row.get("Volume", "")),
                clean_value(row.get("Subject", "")),
                english,
                clean_value(row.get("Tamil", "")),
                str(sheet_name),
                file_name,
                int(row_idx) + 2,
            )
        )

    return rows


def read_workbook_rows(file_path):
    workbook = pd.ExcelFile(file_path)
    rows = []

    for sheet_name in workbook.sheet_names:
        frame = workbook.parse(sheet_name=sheet_name, dtype=str, header=0)
        rows.extend(read_sheet_rows(file_path, sheet_name, frame))

    return rows


def batched(items, size):
    for start in range(0, len(items), size):
        yield items[start : start + size]


def insert_rows(database_url, file_name, rows):
    with psycopg2.connect(
        database_url,
        connect_timeout=15,
        keepalives=1,
        keepalives_idle=30,
        keepalives_interval=10,
        keepalives_count=5,
    ) as connection:
        with connection.cursor() as cursor:
            cursor.execute("DELETE FROM words WHERE file_name = %s", (file_name,))
            connection.commit()

            inserted_count = 0
            for batch in batched(rows, BATCH_SIZE):
                execute_values(cursor, INSERT_SQL, batch, page_size=len(batch))
                connection.commit()
                inserted_count += len(batch)
                print(f"  Inserted {inserted_count}/{len(rows)} rows", end="\r")

    print(" " * 50, end="\r")
    return len(rows)


def process_file(database_url, file_path):
    rows = read_workbook_rows(file_path)
    file_name = file_path.stem

    if not rows:
        return 0

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            return insert_rows(database_url, file_name, rows)
        except (psycopg2.Error, OSError) as exc:
            print(f"  Attempt {attempt}/{MAX_RETRIES} failed for {file_path.name}: {exc}")
            if attempt == MAX_RETRIES:
                print(f"  Skipping {file_path.name} after {MAX_RETRIES} failed attempts")
                return 0
            time.sleep(attempt * 3)

    return 0


def main():
    load_dotenv(BASE_DIR / ".env")
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        raise RuntimeError("DATABASE_URL is not set. Create preprocessing/.env first.")

    if not EXCEL_DIR.exists():
        EXCEL_DIR.mkdir(parents=True, exist_ok=True)
        print(f"Created {EXCEL_DIR}. Add your .xlsx files there, then run again.")
        return

    excel_files = sorted(EXCEL_DIR.rglob("*.xlsx"))
    if not excel_files:
        print(f"No .xlsx files found inside {EXCEL_DIR}")
        return

    total_inserted = 0
    files_processed = 0

    for file_path in excel_files:
        print(f"Processing {file_path.name}...")
        inserted_count = process_file(database_url, file_path)
        files_processed += 1
        total_inserted += inserted_count
        print(
            f"  Finished {file_path.name}: {inserted_count} rows. "
            f"Running total: {total_inserted}"
        )

    print(f"Files processed: {files_processed}")
    print(f"Total rows inserted: {total_inserted}")


if __name__ == "__main__":
    main()
