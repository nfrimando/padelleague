from extract_sheet_common import export_sheet_range_as_rows


def main() -> None:
    export_sheet_range_as_rows("RatingsV2", "A10:I", "ratings_v2.csv")


if __name__ == "__main__":
    main()
