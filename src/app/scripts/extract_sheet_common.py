import csv
from pathlib import Path

import gspread
from google.oauth2.service_account import Credentials


SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
SPREADSHEET_ID = "1w1MK6QWPswLSxnVjoF6W92x2w6C8aBWy9nAy9IDnkPU"
CREDENTIALS_FILENAME = "padelleagueph-2b8f09674fe6.json"


def _get_spreadsheet() -> gspread.Spreadsheet:
    credentials_path = Path(__file__).resolve().parent / CREDENTIALS_FILENAME
    print(f"[INFO] Using credentials file: {credentials_path}")

    creds = Credentials.from_service_account_file(str(credentials_path), scopes=SCOPES)
    client = gspread.authorize(creds)
    print("[INFO] Authenticated with Google Sheets API")

    spreadsheet = client.open_by_key(SPREADSHEET_ID)
    print(f"[INFO] Opened spreadsheet ID: {SPREADSHEET_ID}")
    return spreadsheet


def _get_output_path(output_filename: str) -> Path:
    repo_root = Path(__file__).resolve().parents[3]
    output_dir = repo_root / "data" / "inputs"
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"[INFO] Output directory ready: {output_dir}")
    return output_dir / output_filename


def export_sheet_records(worksheet_name: str, output_filename: str) -> None:
    spreadsheet = _get_spreadsheet()
    sheet = spreadsheet.worksheet(worksheet_name)
    print(f"[INFO] Reading worksheet: {worksheet_name}")
    data = sheet.get_all_records()

    output_path = _get_output_path(output_filename)
    print(f"[INFO] Writing {len(data)} rows to: {output_path}")

    with output_path.open("w", newline="", encoding="utf-8") as f:
        if data:
            writer = csv.DictWriter(f, fieldnames=list(data[0].keys()))
            writer.writeheader()
            writer.writerows(data)
        else:
            f.write("")

    print(f"[DONE] Exported worksheet '{worksheet_name}' to {output_path}")


def export_sheet_range_as_records(
    worksheet_name: str,
    cell_range: str,
    output_filename: str,
) -> None:
    spreadsheet = _get_spreadsheet()
    sheet = spreadsheet.worksheet(worksheet_name)
    print(f"[INFO] Reading worksheet range: {worksheet_name}!{cell_range}")
    rows = sheet.get(cell_range)

    if rows and rows[0]:
        headers = rows[0]
        data_rows = rows[1:]
        data = [
            {headers[idx]: row[idx] if idx < len(row) else "" for idx in range(len(headers))}
            for row in data_rows
        ]
    else:
        data = []

    output_path = _get_output_path(output_filename)
    print(f"[INFO] Writing {len(data)} rows to: {output_path}")

    with output_path.open("w", newline="", encoding="utf-8") as f:
        if data:
            writer = csv.DictWriter(f, fieldnames=list(data[0].keys()))
            writer.writeheader()
            writer.writerows(data)
        else:
            f.write("")

    print(f"[DONE] Exported worksheet range '{worksheet_name}!{cell_range}' to {output_path}")


def export_sheet_range_as_rows(
    worksheet_name: str,
    cell_range: str,
    output_filename: str,
    required_header_for_non_empty: str | None = None,
) -> None:
    spreadsheet = _get_spreadsheet()
    sheet = spreadsheet.worksheet(worksheet_name)
    print(f"[INFO] Reading worksheet range: {worksheet_name}!{cell_range}")
    rows = sheet.get(cell_range)

    if not rows:
        filtered_rows: list[list[str]] = []
    else:
        headers = rows[0]
        max_cols = max((len(row) for row in rows), default=0)
        normalized_rows = [row + [""] * (max_cols - len(row)) for row in rows]

        if required_header_for_non_empty:
            target_idx = next(
                (
                    idx
                    for idx, header in enumerate(headers)
                    if str(header).strip().lower()
                    == required_header_for_non_empty.strip().lower()
                ),
                None,
            )

            if target_idx is None:
                raise SystemExit(
                    f"Expected header '{required_header_for_non_empty}' in "
                    f"{worksheet_name}!{cell_range}"
                )

            filtered_rows = [normalized_rows[0]]
            for row in normalized_rows[1:]:
                if str(row[target_idx]).strip():
                    filtered_rows.append(row)
        else:
            filtered_rows = normalized_rows

    output_path = _get_output_path(output_filename)
    row_count = max(len(filtered_rows) - 1, 0) if filtered_rows else 0
    print(f"[INFO] Writing {row_count} rows to: {output_path}")

    with output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerows(filtered_rows)

    print(f"[DONE] Exported worksheet range '{worksheet_name}!{cell_range}' to {output_path}")
