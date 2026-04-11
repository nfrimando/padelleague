from extract_sheet_common import export_sheet_range_as_rows


def main() -> None:
    export_sheet_range_as_rows(
        "RatingsV3",
        "F9:S",
        "ratings_v3.csv",
        required_header_for_non_empty="match_id",
    )


if __name__ == "__main__":
    main()
