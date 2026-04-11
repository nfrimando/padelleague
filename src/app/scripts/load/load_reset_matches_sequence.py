from load_common import get_database_url, log, psycopg


def main() -> None:
    database_url = get_database_url()

    log("Connecting to database")
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cursor:
            log("Resetting sequence for matches.match_id")
            cursor.execute(
                """
                SELECT setval(
                    pg_get_serial_sequence('matches', 'match_id'),
                    COALESCE((SELECT MAX(match_id) FROM matches), 1),
                    COALESCE((SELECT MAX(match_id) FROM matches), 0) > 0
                )
                """
            )

        log("Committing transaction")
        conn.commit()

    log("Sequence reset complete")


if __name__ == "__main__":
    main()
