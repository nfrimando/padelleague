import pandas as pd
import os
from supabase import create_client

# --- LOAD ENVIRONMENT VARIABLES ---
def load_env_file(filepath):
    """Load environment variables from a .env file"""
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#'):
                    if '=' in line:
                        key, value = line.split('=', 1)
                        value = value.strip().strip('"').strip("'")
                        os.environ[key] = value

load_env_file('.env.local')

# --- CONFIG ---
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Missing Supabase environment variables")
    print("Please ensure .env.local exists with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY")
    exit(1)

INPUT_DIR = "data/inputs"
OUTPUT_DIR = "data/outputs"
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "match_player_ratings.csv")

os.makedirs(OUTPUT_DIR, exist_ok=True)

# --- LOAD PLAYERS FROM SUPABASE ---
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
players_res = supabase.table("players").select("player_id,name").execute()

player_map = {}
for p in players_res.data:
    if p["name"]:
        player_map[p["name"].strip().lower()] = p["player_id"]

print(f"✅ Loaded {len(player_map)} players from Supabase")


# --- TRANSFORM V2 ---
v2_path = os.path.join(INPUT_DIR, "ratings_v2.csv")
print(f"\n📄 Processing: {v2_path}")

df_v2 = pd.read_csv(v2_path)

# Keep only rows with a valid match_id
df_v2 = df_v2[df_v2["match_id"].notna() & (df_v2["match_id"].astype(str).str.strip() != "")]
df_v2["match_id"] = df_v2["match_id"].astype(float).astype(int)

# Normalize result
df_v2["result"] = df_v2["outcome"].str.strip().str.lower().map({"win": "win", "loss": "loss"})

# Lookup player_id by name
df_v2["player_id"] = df_v2["name"].str.strip().str.lower().map(player_map)

df_v2["formula_name"] = "v2"
df_v2["rating_pre"] = pd.to_numeric(df_v2["rating_pre"], errors="coerce")
df_v2["rating_post"] = pd.to_numeric(df_v2["rating_post"], errors="coerce")

rows_before = len(df_v2)
unmatched_v2 = df_v2[df_v2["player_id"].isna()]["name"].unique()
if len(unmatched_v2) > 0:
    print(f"  ⚠️  {len(unmatched_v2)} unmatched player names in v2: {unmatched_v2.tolist()}")

df_v2 = df_v2[df_v2["player_id"].notna() & df_v2["result"].notna() & df_v2["rating_pre"].notna() & df_v2["rating_post"].notna()]
print(f"  Rows: {rows_before} total → {len(df_v2)} valid after filtering")

df_v2_out = df_v2[["player_id", "match_id", "rating_pre", "rating_post", "result", "formula_name"]].copy()
df_v2_out["player_id"] = df_v2_out["player_id"].astype(int)


# --- TRANSFORM V3 ---
v3_path = os.path.join(INPUT_DIR, "ratings_v3.csv")
print(f"\n📄 Processing: {v3_path}")

df_v3 = pd.read_csv(v3_path)

# Keep only rows with a valid match_id (extract script already filters, but be safe)
df_v3 = df_v3[df_v3["match_id"].notna() & (df_v3["match_id"].astype(str).str.strip() != "")]
df_v3["match_id"] = df_v3["match_id"].astype(float).astype(int)

# Normalize result
df_v3["result"] = df_v3["Win / Loss"].str.strip().str.lower().map({"win": "win", "loss": "loss"})

# Lookup player_id by name
df_v3["player_id"] = df_v3["Name"].str.strip().str.lower().map(player_map)

df_v3["formula_name"] = "v3"
df_v3["rating_pre"] = pd.to_numeric(df_v3["Rating Pre"], errors="coerce")
df_v3["rating_post"] = pd.to_numeric(df_v3["Rating Post"], errors="coerce")

rows_before = len(df_v3)
unmatched_v3 = df_v3[df_v3["player_id"].isna()]["Name"].unique()
if len(unmatched_v3) > 0:
    print(f"  ⚠️  {len(unmatched_v3)} unmatched player names in v3: {unmatched_v3.tolist()}")

df_v3 = df_v3[df_v3["player_id"].notna() & df_v3["result"].notna() & df_v3["rating_pre"].notna() & df_v3["rating_post"].notna()]
print(f"  Rows: {rows_before} total → {len(df_v3)} valid after filtering")

df_v3_out = df_v3[["player_id", "match_id", "rating_pre", "rating_post", "result", "formula_name"]].copy()
df_v3_out["player_id"] = df_v3_out["player_id"].astype(int)


# --- COMBINE AND SAVE ---
df_combined = pd.concat([df_v2_out, df_v3_out], ignore_index=True)
df_combined = df_combined.sort_values(["formula_name", "match_id", "player_id"]).reset_index(drop=True)

df_combined.to_csv(OUTPUT_FILE, index=False)
print(f"\n✅ Saved {len(df_combined)} rows to {OUTPUT_FILE}")
print(f"   v2 rows: {len(df_v2_out)}, v3 rows: {len(df_v3_out)}")
