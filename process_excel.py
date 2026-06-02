import os
from pathlib import Path

import pandas as pd
import psycopg2
from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
EXCEL_DIR = BASE_DIR / "excel_files"
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
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
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


def process_file(cursor, connection, file_path):
    inserted_count = 0

    try:
        workbook = pd.ExcelFile(file_path)

        for sheet_name in workbook.sheet_names:
            frame = workbook.parse(sheet_name=sheet_name, dtype=str, header=0)
            rows = read_sheet_rows(file_path, sheet_name, frame)
            if rows:
                cursor.executemany(INSERT_SQL, rows)
                inserted_count += len(rows)

        connection.commit()
        return inserted_count
    except Exception as exc:
        connection.rollback()
        print(f"  Error processing {file_path.name}: {exc}")
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

    with psycopg2.connect(database_url) as connection:
        with connection.cursor() as cursor:
            for file_path in excel_files:
                print(f"Processing {file_path.name}...")
                inserted_count = process_file(cursor, connection, file_path)
                files_processed += 1
                total_inserted += inserted_count
                print(
                    f"  Inserted {inserted_count} rows from {file_path.name}. "
                    f"Running total: {total_inserted}"
                )

    print(f"Files processed: {files_processed}")
    print(f"Total rows inserted: {total_inserted}")


if __name__ == "__main__":
    main()
