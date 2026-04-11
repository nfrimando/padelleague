from time import perf_counter

from load_common import MATCH_SETS_CSV, clean_int, get_database_url, log, psycopg, read_csv_dict_rows


def read_match_sets() -> list[tuple[int, int, int, int]]:
    log(f"Reading match sets CSV: {MATCH_SETS_CSV}")
    rows: list[tuple[int, int, int, int]] = []
    for row in read_csv_dict_rows(MATCH_SETS_CSV):
        match_id = clean_int(row.get("match_id"))
        set_number = clean_int(row.get("set_number"))
        team_1_games = clean_int(row.get("team_1_games"))
        team_2_games = clean_int(row.get("team_2_games"))

        if (
            match_id is None
            or set_number is None
            or team_1_games is None
            or team_2_games is None
        ):
            continue

        rows.append((match_id, set_number, team_1_games, team_2_games))

    log(f"Prepared {len(rows)} match_set rows")
    return rows


def main() -> None:
    if not MATCH_SETS_CSV.exists():
        raise SystemExit(f"Missing required CSV: {MATCH_SETS_CSV}")

    match_sets = read_match_sets()
    database_url = get_database_url()

    log("Connecting to database")
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cursor:
            log("Inserting match_sets rows")
            insert_started = perf_counter()
            cursor.executemany(
                """
                INSERT INTO match_sets (
                    match_id,
                    set_number,
                    team_1_games,
                    team_2_games
                )
                VALUES (%s, %s, %s, %s)
                """,
                match_sets,
            )
            log(f"Inserted match_sets rows in {perf_counter() - insert_started:.2f}s")

        log("Committing transaction")
        conn.commit()

    log("Match sets load complete")
    log(f"Match sets loaded: {len(match_sets)}")


if __name__ == "__main__":
    main()
