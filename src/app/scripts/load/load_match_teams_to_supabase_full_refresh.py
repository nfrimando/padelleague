from time import perf_counter

from load_common import MATCH_TEAMS_CSV, clean_int, get_database_url, log, psycopg, read_csv_dict_rows


def read_match_teams() -> list[tuple[int, int, int | None, int | None, int | None]]:
    log(f"Reading match teams CSV: {MATCH_TEAMS_CSV}")
    rows: list[tuple[int, int, int | None, int | None, int | None]] = []
    for row in read_csv_dict_rows(MATCH_TEAMS_CSV):
        match_id = clean_int(row.get("match_id"))
        team_number = clean_int(row.get("team_number"))
        if match_id is None or team_number is None:
            continue

        rows.append(
            (
                match_id,
                team_number,
                clean_int(row.get("player_1_id")),
                clean_int(row.get("player_2_id")),
                clean_int(row.get("sets_won")),
            )
        )
    log(f"Prepared {len(rows)} match_team rows")
    return rows


def main() -> None:
    if not MATCH_TEAMS_CSV.exists():
        raise SystemExit(f"Missing required CSV: {MATCH_TEAMS_CSV}")

    match_teams = read_match_teams()
    database_url = get_database_url()

    log("Connecting to database")
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cursor:
            log("Inserting match_teams rows")
            insert_started = perf_counter()
            cursor.executemany(
                """
                INSERT INTO match_teams (
                    match_id,
                    team_number,
                    player_1_id,
                    player_2_id,
                    sets_won
                )
                VALUES (%s, %s, %s, %s, %s)
                """,
                match_teams,
            )
            log(f"Inserted match_teams rows in {perf_counter() - insert_started:.2f}s")

        log("Committing transaction")
        conn.commit()

    log("Match teams load complete")
    log(f"Match teams loaded: {len(match_teams)}")


if __name__ == "__main__":
    main()
