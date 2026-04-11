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
                        # Strip quotes and whitespace
                        value = value.strip().strip('"').strip("'")
                        os.environ[key] = value

# Load .env.local file
load_env_file('.env.local')

# --- CONFIG ---
SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

print(f"Debug - SUPABASE_URL: {SUPABASE_URL}")
print(f"Debug - SUPABASE_KEY: {'*' * len(SUPABASE_KEY) if SUPABASE_KEY else None}")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("❌ Missing Supabase environment variables")
    print("Please ensure .env.local exists with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY")
    exit(1)

# --- INIT CLIENT ---
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

# --- LOAD PLAYERS FROM SUPABASE ---
players_res = supabase.table("players").select("player_id,name,nickname").execute()
players_data = players_res.data

# Build mapping (name + nickname → player_id)
player_map = {}

for p in players_data:
    if p["name"]:
        player_map[p["name"].strip().lower()] = p["player_id"]
    if p["nickname"]:
        player_map[p["nickname"].strip().lower()] = p["player_id"]

# --- LOAD RAW CSV ---
df = pd.read_csv("data/inputs/fact_matches.csv")

matches = []
match_teams = []

# --- HELPER ---
def get_player_id(name):
    if pd.isna(name):
        return None
    key = str(name).strip().lower()
    return player_map.get(key)

# --- TRANSFORM ---
for _, row in df.iterrows():
    # Skip rows with null type (incomplete matches)
    if pd.isna(row["type"]):
        continue
    
    match_id = row["match_id"]

    # Parse datetime
    if pd.notna(row["date_time"]):
        dt = pd.to_datetime(row["date_time"])
        date_local = dt.date()
        time_local = dt.time()
    else:
        date_local = None
        time_local = None

    # Determine winner
    if row["team_1_sets"] > row["team_2_sets"]:
        winner_team = 1
    elif row["team_2_sets"] > row["team_1_sets"]:
        winner_team = 2
    else:
        winner_team = None

    # --- MATCHES ---
    matches.append({
        "match_id": match_id,
        "season_id": row.get("season"),
        "date_local": date_local,
        "time_local": time_local,
        "venue": row.get("venue"),
        "type": row.get("type"),
        "winner_team": winner_team,
        "is_forfeit": bool(row.get("is_forfeit")) if pd.notna(row.get("is_forfeit")) else False
    })

    # --- MATCH TEAMS ---
    match_teams.append({
        "match_id": match_id,
        "team_number": 1,
        "player_1_id": get_player_id(row["player_1"]),
        "player_2_id": get_player_id(row["player_2"]),
        "sets_won": row["team_1_sets"]
    })

    match_teams.append({
        "match_id": match_id,
        "team_number": 2,
        "player_1_id": get_player_id(row["player_3"]),
        "player_2_id": get_player_id(row["player_4"]),
        "sets_won": row["team_2_sets"]
    })

# --- SAVE ---
df_matches = pd.DataFrame(matches)
df_matches['winner_team'] = df_matches['winner_team'].astype('Int64')
df_matches.to_csv("data/outputs/matches.csv", index=False)

df_match_teams = pd.DataFrame(match_teams)
df_match_teams['match_id'] = df_match_teams['match_id'].astype(int)
df_match_teams['team_number'] = df_match_teams['team_number'].astype(int)
df_match_teams['player_1_id'] = df_match_teams['player_1_id'].astype('Int64')
df_match_teams['player_2_id'] = df_match_teams['player_2_id'].astype('Int64')
df_match_teams['sets_won'] = df_match_teams['sets_won'].astype('Int64')
df_match_teams.to_csv("data/outputs/match_teams.csv", index=False)

print("✅ Done! Files generated.")