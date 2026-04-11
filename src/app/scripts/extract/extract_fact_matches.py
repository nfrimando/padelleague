from extract_sheet_common import export_sheet_records


def main() -> None:
    export_sheet_records("fact_matches", "fact_matches.csv")


if __name__ == "__main__":
    main()
