import pandas as pd
import os

# === CONFIG ===
INPUT_DIR = "data/inputs"
OUTPUT_DIR = "data/outputs"
INPUT_FILE = os.path.join(INPUT_DIR, "dim_players.csv")

# Create output directory if it doesn't exist
os.makedirs(OUTPUT_DIR, exist_ok=True)

if not os.path.exists(INPUT_FILE):
    print(f"❌ File not found: {INPUT_FILE}")
    exit(1)

print(f"\n📄 Processing: {INPUT_FILE}")
print(f"\n📄 Processing: {INPUT_FILE}")

# === LOAD CSV ===
df = pd.read_csv(INPUT_FILE)

# Print columns so you can see what you're working with
print("Columns in CSV:")
print(df.columns.tolist())
print(f"Total rows in CSV: {len(df)}")


# === TRANSFORM FUNCTION ===
def transform(row):
    import pandas as pd
    
    def clean_value(val):
        if pd.isna(val):
            return None
        val_str = str(val).strip()
        return val_str if val_str else None
    
    return {
        "name": clean_value(row.get("name")),
        "nickname": clean_value(row.get("nickname")),
        "image_link": clean_value(row.get("img_link")),
    }


# === APPLY TRANSFORMATION ===
transformed_data = df.apply(transform, axis=1, result_type="expand")
print(f"Rows after transformation: {len(transformed_data)}")
print(f"Sample data:\n{transformed_data.head()}")

# === CLEANING ===

# Remove rows with no name or nickname
print(f"\nRows before cleaning: {len(transformed_data)}")
transformed_data = transformed_data[
    transformed_data["name"].notna() & transformed_data["nickname"].notna()
]
print(f"Rows with both name and nickname: {len(transformed_data)}")

# Drop duplicate nicknames (since it's UNIQUE in Supabase)
transformed_data = transformed_data.drop_duplicates(subset=["nickname"])

# Optional: reset index
transformed_data = transformed_data.reset_index(drop=True)


# === SAVE OUTPUT ===
# Get the filename without extension and add _fixed prefix
base_filename = os.path.basename(INPUT_FILE)
filename_without_ext = os.path.splitext(base_filename)[0]
OUTPUT_FILE = os.path.join(OUTPUT_DIR, f"{filename_without_ext}_fixed.csv")

transformed_data.to_csv(OUTPUT_FILE, index=False, na_rep="")

if len(transformed_data) > 0:
    print(f"✅ Transformed CSV saved to {OUTPUT_FILE}")
    print(f"Final row count: {len(transformed_data)}")
else:
    print(f"⚠️  No data to save. CSV is empty.")