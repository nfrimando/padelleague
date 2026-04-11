import csv
from pathlib import Path

import gspread
from google.oauth2.service_account import Credentials


SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
SPREADSHEET_ID = "1w1MK6QWPswLSxnVjoF6W92x2w6C8aBWy9nAy9IDnkPU"
WORKSHEET_NAME = "RatingsV2"
CELL_RANGE = "A10:H"
WORKSHEET_V3_NAME = "RatingsV3"
CELL_V3_RANGE = "F9:S"


def main() -> None:
    credentials_path = (
        Path(__file__).resolve().parent / "padelleagueph-2b8f09674fe6.json"
    )
    print(f"[INFO] Using credentials file: {credentials_path}")

    creds = Credentials.from_service_account_file(
        str(credentials_path), scopes=SCOPES
    )
    client = gspread.authorize(creds)
    print("[INFO] Authenticated with Google Sheets API")

    spreadsheet = client.open_by_key(SPREADSHEET_ID)
    print(f"[INFO] Opened spreadsheet ID: {SPREADSHEET_ID}")

    print(f"[INFO] Reading worksheet range: {WORKSHEET_NAME}!{CELL_RANGE}")
    sheet = spreadsheet.worksheet(WORKSHEET_NAME)
    rows = sheet.get(CELL_RANGE)

    # Normalize row width so CSV columns stay aligned.
    max_cols = max((len(row) for row in rows), default=0)
    normalized_rows = [row + [""] * (max_cols - len(row)) for row in rows]

    repo_root = Path(__file__).resolve().parents[3]
    output_dir = repo_root / "data" / "inputs"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "ratings_v2.csv"

    print(f"[INFO] Writing {len(normalized_rows)} rows to: {output_path}")
    with output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerows(normalized_rows)

    print(f"[DONE] Exported {WORKSHEET_NAME}!{CELL_RANGE} to {output_path}")

    print(f"[INFO] Reading worksheet range: {WORKSHEET_V3_NAME}!{CELL_V3_RANGE}")
    v3_rows = spreadsheet.worksheet(WORKSHEET_V3_NAME).get(CELL_V3_RANGE)

    if not v3_rows:
        v3_output_path = output_dir / "ratings_v3.csv"
        with v3_output_path.open("w", newline="", encoding="utf-8") as f:
            f.write("")
        print(f"[DONE] Exported empty range to {v3_output_path}")
        return

    headers = v3_rows[0]
    match_id_idx = next(
        (
            idx
            for idx, header in enumerate(headers)
            if str(header).strip().lower() == "match_id"
        ),
        None,
    )

    if match_id_idx is None:
        raise SystemExit(
            f"Expected a 'match_id' header in {WORKSHEET_V3_NAME}!{CELL_V3_RANGE}"
        )

    filtered_v3_rows = [headers]
    for row in v3_rows[1:]:
        padded_row = row + [""] * (len(headers) - len(row))
        match_id = str(padded_row[match_id_idx]).strip()
        if match_id:
            filtered_v3_rows.append(padded_row)

    v3_output_path = output_dir / "ratings_v3.csv"
    print(f"[INFO] Writing {len(filtered_v3_rows) - 1} rows to: {v3_output_path}")
    with v3_output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerows(filtered_v3_rows)

    print(
        f"[DONE] Exported {WORKSHEET_V3_NAME}!{CELL_V3_RANGE} to {v3_output_path}"
    )


if __name__ == "__main__":
    main()
