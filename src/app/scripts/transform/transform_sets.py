import pandas as pd

INPUT_PATH = "data/inputs/fact_sets.csv"
OUTPUT_PATH = "data/outputs/match_sets.csv"


def main() -> None:
    # Read only required source columns and ignore trailing noisy columns.
    df = pd.read_csv(
        INPUT_PATH,
        usecols=["match_id", "set_number", "team_1_score", "team_2_score"],
    )

    # Keep only valid rows with complete numeric set data.
    df = df.dropna(subset=["match_id", "set_number", "team_1_score", "team_2_score"])

    # Normalize numeric types to match target table expectations.
    df["match_id"] = pd.to_numeric(df["match_id"], errors="coerce").astype("Int64")
    df["set_number"] = pd.to_numeric(df["set_number"], errors="coerce").astype("Int64")
    df["team_1_games"] = pd.to_numeric(df["team_1_score"], errors="coerce").astype("Int64")
    df["team_2_games"] = pd.to_numeric(df["team_2_score"], errors="coerce").astype("Int64")

    df = df.dropna(subset=["match_id", "set_number", "team_1_games", "team_2_games"])

    out = df[["match_id", "set_number", "team_1_games", "team_2_games"]].copy()
    out["match_id"] = out["match_id"].astype(int)
    out["set_number"] = out["set_number"].astype(int)
    out["team_1_games"] = out["team_1_games"].astype(int)
    out["team_2_games"] = out["team_2_games"].astype(int)

    out.to_csv(OUTPUT_PATH, index=False)
    print(f"✅ Done! Generated {OUTPUT_PATH} with {len(out)} rows.")


if __name__ == "__main__":
    main()
