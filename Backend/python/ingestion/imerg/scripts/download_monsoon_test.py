import earthaccess
from pathlib import Path


WEST = 88.00
SOUTH = 27.08
EAST = 88.95
NORTH = 28.13

START_DATE = "2025-07-15"
END_DATE = "2025-07-15"

OUTPUT_DIR = Path("ingestion/imerg/raw")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


print("Logging into NASA Earthdata...")

earthaccess.login(
    strategy="interactive",
    persist=True
)

print("Searching IMERG V07...")

results = earthaccess.search_data(
    short_name="GPM_3IMERGDF",
    version="07",
    temporal=(START_DATE, END_DATE),
    bounding_box=(
        WEST,
        SOUTH,
        EAST,
        NORTH
    )
)

print(f"Files found: {len(results)}")

if not results:
    raise RuntimeError(
        "No IMERG file found for 2025-07-15."
    )

print("Downloading...")

downloaded = earthaccess.download(
    results[:1],
    local_path=str(OUTPUT_DIR)
)

print()
print("=" * 60)
print("MONSOON DOWNLOAD COMPLETE")
print("=" * 60)

for file_path in downloaded:
    print(file_path)