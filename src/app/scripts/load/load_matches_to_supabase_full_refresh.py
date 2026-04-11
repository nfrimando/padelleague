from time import perf_counter

from load_common import MATCHES_CSV, clean_bool, clean_int, clean_text, get_database_url, log, psycopg, read_csv_dict_rows


def read_matches() -> list[tuple[int, int | None, str | None, str | None, str | None, str | None, int | None, bool]]:
    log(f"Reading matches CSV: {MATCHES_CSV}")
    rows: list[tuple[int, int | None, str | None, str | None, str | None, str | None, int | None, bool]] = []
    for row in read_csv_dict_rows(MATCHES_CSV):
        match_id = clean_int(row.get("match_id"))
        if match_id is None:
            continue

        rows.append(
            (
                match_id,
                clean_int(row.get("season_id")),
                clean_text(row.get("date_local")),
                clean_text(row.get("time_local")),
                clean_text(row.get("venue")),
                clean_text(row.get("type")),
                clean_int(row.get("winner_team")),
                clean_bool(row.get("is_forfeit")),
            )
        )
    log(f"Prepared {len(rows)} match rows")
    return rows


def main() -> None:
    if not MATCHES_CSV.exists():
        raise SystemExit(f"Missing required CSV: {MATCHES_CSV}")

    matches = read_matches()
    database_url = get_database_url()

    log("Connecting to database")
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cursor:
            log("Truncating tables: match_player_ratings, match_sets, match_teams, matches")
            cursor.execute(
                "TRUNCATE TABLE match_player_ratings, match_sets, match_teams, matches RESTART IDENTITY CASCADE"
            )

            log("Inserting matches rows")
            insert_started = perf_counter()
            cursor.executemany(
                """
                INSERT INTO matches (
                    match_id,
                    season_id,
                    date_local,
                    time_local,
                    venue,
                    type,
                    winner_team,
                    is_forfeit
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                matches,
            )
            log(f"Inserted matches rows in {perf_counter() - insert_started:.2f}s")

        log("Committing transaction")
        conn.commit()

    log("Matches load complete")
    log(f"Matches loaded: {len(matches)}")


if __name__ == "__main__":
    main()
