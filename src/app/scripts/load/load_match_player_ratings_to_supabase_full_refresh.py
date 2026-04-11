from time import perf_counter

from load_common import MATCH_PLAYER_RATINGS_CSV, clean_int, clean_text, get_database_url, log, psycopg, read_csv_dict_rows


def read_match_player_ratings() -> list[tuple[int, int, str, str, str, str]]:
    log(f"Reading match player ratings CSV: {MATCH_PLAYER_RATINGS_CSV}")
    rows: list[tuple[int, int, str, str, str, str]] = []
    for row in read_csv_dict_rows(MATCH_PLAYER_RATINGS_CSV):
        player_id = clean_int(row.get("player_id"))
        match_id = clean_int(row.get("match_id"))
        rating_pre = clean_text(row.get("rating_pre"))
        rating_post = clean_text(row.get("rating_post"))
        result = clean_text(row.get("result"))
        formula_name = clean_text(row.get("formula_name"))

        if (
            player_id is None
            or match_id is None
            or rating_pre is None
            or rating_post is None
            or result is None
            or formula_name is None
        ):
            continue

        rows.append((player_id, match_id, rating_pre, rating_post, result, formula_name))
    log(f"Prepared {len(rows)} match_player_rating rows")
    return rows


def main() -> None:
    if not MATCH_PLAYER_RATINGS_CSV.exists():
        log("Skipping match_player_ratings load: CSV not found")
        return

    match_player_ratings = read_match_player_ratings()
    database_url = get_database_url()

    log("Connecting to database")
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cursor:
            log("Inserting match_player_ratings rows")
            insert_started = perf_counter()
            cursor.executemany(
                """
                INSERT INTO match_player_ratings (
                    player_id,
                    match_id,
                    rating_pre,
                    rating_post,
                    result,
                    formula_name
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                match_player_ratings,
            )
            log(f"Inserted match_player_ratings rows in {perf_counter() - insert_started:.2f}s")

        log("Committing transaction")
        conn.commit()

    log("Match player ratings load complete")
    log(f"Match player ratings loaded: {len(match_player_ratings)}")


if __name__ == "__main__":
    main()
