import csv
from time import perf_counter

from load_common import TEAMS_CSV, clean_int, clean_text, get_database_url, log, psycopg


def read_teams() -> list[tuple[int | None, int, str, str | None, int | None, int | None, int | None]]:
    log(f"Reading teams CSV: {TEAMS_CSV}")
    rows: list[tuple[int | None, int, str, str | None, int | None, int | None, int | None]] = []
    with TEAMS_CSV.open("r", encoding="utf-8", newline="") as file:
        reader = csv.DictReader(file)
        for row in reader:
            season_id = clean_int(row.get("season_id"))
            team_name = clean_text(row.get("team_name"))
            if season_id is None or team_name is None:
                continue

            rows.append(
                (
                    clean_int(row.get("team_id")),
                    season_id,
                    team_name,
                    clean_text(row.get("icon")),
                    clean_int(row.get("captain_player_id")),
                    clean_int(row.get("co_captain_player_id")),
                    clean_int(row.get("final_rank")),
                )
            )
    log(f"Prepared {len(rows)} team rows")
    return rows


def main() -> None:
    if not TEAMS_CSV.exists():
        raise SystemExit(f"Missing required CSV: {TEAMS_CSV}")

    teams = read_teams()
    database_url = get_database_url()

    log("Connecting to database")
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cursor:
            log("Truncating teams table")
            cursor.execute("TRUNCATE TABLE teams RESTART IDENTITY CASCADE")

            log("Inserting teams rows")
            insert_started = perf_counter()
            cursor.executemany(
                """
                INSERT INTO teams (
                    team_id,
                    season_id,
                    team_name,
                    icon,
                    captain_player_id,
                    co_captain_player_id,
                    final_rank
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                teams,
            )
            log(f"Inserted teams rows in {perf_counter() - insert_started:.2f}s")

        log("Committing transaction")
        conn.commit()

    log("Teams load complete")
    log(f"Teams loaded: {len(teams)}")


if __name__ == "__main__":
    main()
