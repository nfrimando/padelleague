import subprocess
import sys
import os
from pathlib import Path


SCRIPTS = [
    "extract_fact_matches.py",
    "extract_dim_players.py",
    "extract_fact_sets.py",
    "extract_dim_team.py",
    "extract_ratings_v2.py",
    "extract_ratings_v3.py",
]


def main() -> None:
    scripts_dir = Path(__file__).resolve().parent
    failures = []
    run_env = os.environ.copy()
    run_env["PYTHONDONTWRITEBYTECODE"] = "1"

    print("[INFO] Starting full extract pipeline")
    for script_name in SCRIPTS:
        script_path = scripts_dir / script_name
        print(f"\n[INFO] Running: {script_name}")

        result = subprocess.run(
            [sys.executable, str(script_path)],
            cwd=str(scripts_dir),
            capture_output=True,
            text=True,
            env=run_env,
        )

        if result.stdout.strip():
            print(result.stdout.rstrip())

        if result.returncode != 0:
            failures.append(script_name)
            print(f"[ERROR] {script_name} failed with exit code {result.returncode}")
            if result.stderr.strip():
                print(result.stderr.rstrip())
        else:
            print(f"[DONE] {script_name} completed")

    if failures:
        print("\n[ERROR] Extract pipeline completed with failures:")
        for script_name in failures:
            print(f" - {script_name}")
        raise SystemExit(1)

    print("\n[DONE] Extract pipeline completed successfully")


if __name__ == "__main__":
    main()
