import csv
import os
from datetime import datetime
from pathlib import Path

try:
    import psycopg
except ImportError as exc:
    raise SystemExit(
        "psycopg is required. Install it with: pip install psycopg[binary]"
    ) from exc


BASE_DIR = Path(__file__).resolve().parents[4]
OUTPUT_DIR = BASE_DIR / "data" / "outputs"

TEAMS_CSV = OUTPUT_DIR / "teams.csv"
MATCHES_CSV = OUTPUT_DIR / "matches.csv"
MATCH_TEAMS_CSV = OUTPUT_DIR / "match_teams.csv"
MATCH_SETS_CSV = OUTPUT_DIR / "match_sets.csv"
MATCH_PLAYER_RATINGS_CSV = OUTPUT_DIR / "match_player_ratings.csv"


def log(message: str) -> None:
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] {message}")


def load_env_file(filepath: Path) -> None:
    if not filepath.exists():
        return

    with filepath.open("r", encoding="utf-8") as file:
        for line in file:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue

            key, value = line.split("=", 1)
            os.environ[key.strip()] = value.strip().strip('"').strip("'")


def get_database_url() -> str:
    log("Loading environment from .env.local")
    load_env_file(BASE_DIR / ".env.local")

    for env_var in (
        "SUPABASE_DB_URL",
        "DATABASE_URL",
        "POSTGRES_URL",
        "POSTGRES_PRISMA_URL",
    ):
        value = os.getenv(env_var)
        if value:
            log(f"Using database URL from {env_var}")
            return value

    raise SystemExit(
        "Missing database connection string. Set SUPABASE_DB_URL, DATABASE_URL, POSTGRES_URL, or POSTGRES_PRISMA_URL in .env.local"
    )


def clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def clean_int(value: str | None) -> int | None:
    value = clean_text(value)
    if value is None:
        return None
    try:
        return int(value)
    except ValueError:
        float_value = float(value)
        if not float_value.is_integer():
            raise ValueError(f"Expected integer-compatible value, got: {value}")
        return int(float_value)


def clean_bool(value: str | None) -> bool:
    value = clean_text(value)
    if value is None:
        return False
    return value.lower() in {"true", "t", "1", "yes", "y"}


def read_csv_dict_rows(path: Path) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    with path.open("r", encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            rows.append(row)
    return rows
