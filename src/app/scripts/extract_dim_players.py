from extract_sheet_common import export_sheet_records


def main() -> None:
    export_sheet_records("dim_players", "dim_players.csv")


if __name__ == "__main__":
    main()
