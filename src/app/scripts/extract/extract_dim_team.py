from extract_sheet_common import export_sheet_range_as_records


def main() -> None:
    export_sheet_range_as_records("dim_team", "A:G", "dim_team.csv")


if __name__ == "__main__":
    main()
