import gspread
from google.oauth2.service_account import Credentials
from pathlib import Path
import csv

scopes = ["https://www.googleapis.com/auth/spreadsheets.readonly"]
SPREADSHEET_ID = "1w1MK6QWPswLSxnVjoF6W92x2w6C8aBWy9nAy9IDnkPU"

credentials_path = Path(__file__).resolve().parent / "padelleagueph-2b8f09674fe6.json"
print(f"[INFO] Using credentials file: {credentials_path}")
creds = Credentials.from_service_account_file(str(credentials_path), scopes=scopes)

client = gspread.authorize(creds)
print("[INFO] Authenticated with Google Sheets API")

spreadsheet = client.open_by_key(SPREADSHEET_ID)
print(f"[INFO] Opened spreadsheet ID: {SPREADSHEET_ID}")


def export_worksheet_to_csv(worksheet_name: str, output_filename: str) -> None:
	print(f"[INFO] Reading worksheet: {worksheet_name}")
	sheet = spreadsheet.worksheet(worksheet_name)
	data = sheet.get_all_records()

	output_path = output_dir / output_filename
	print(f"[INFO] Writing {len(data)} rows to: {output_path}")

	with output_path.open("w", newline="", encoding="utf-8") as f:
		if data:
			writer = csv.DictWriter(f, fieldnames=list(data[0].keys()))
			writer.writeheader()
			writer.writerows(data)
		else:
			f.write("")

	print(f"[DONE] Exported worksheet '{worksheet_name}' to {output_filename}")

repo_root = Path(__file__).resolve().parents[3]
output_dir = repo_root / "data" / "inputs"
output_dir.mkdir(parents=True, exist_ok=True)
print(f"[INFO] Output directory ready: {output_dir}")

export_worksheet_to_csv("fact_matches", "fact_matches.csv")
export_worksheet_to_csv("dim_players", "dim_players.csv")
export_worksheet_to_csv("fact_sets", "fact_sets.csv")

print("[DONE] All worksheet exports completed successfully")