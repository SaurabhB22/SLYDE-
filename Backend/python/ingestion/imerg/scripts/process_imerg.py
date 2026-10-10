import xarray as xr
import geopandas as gpd
import pandas as pd
import json
from pathlib import Path


# ============================================================
# CONFIGURATION
# ============================================================

WEST = 88.00
SOUTH = 27.08
EAST = 88.95
NORTH = 28.13

RAW_DIR = Path("ingestion/imerg/raw")

LANDSLIDE_FILE = Path(
    "../data/landslides/sikkim/"
    "Google_Earth_landslides_point_21Dec2021.shp"
)

OUTPUT_DIR = Path("ingestion/imerg/processed")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# ============================================================
# FIND DOWNLOADED IMERG FILE
# ============================================================

IMERG_FILE = (
    RAW_DIR /
    "3B-DAY.MS.MRG.3IMERG."
    "20250715-S000000-E235959.V07B.nc4"
)

if not IMERG_FILE.exists():
    raise RuntimeError(
        f"IMERG file not found: {IMERG_FILE}"
    )
print("=" * 60)
print("SIKKIM IMERG PROCESSOR")
print("=" * 60)

print(f"IMERG file: {IMERG_FILE}")
print(f"Landslide file: {LANDSLIDE_FILE}")


# ============================================================
# LOAD IMERG
# ============================================================

print("\nOpening NASA IMERG dataset...")

ds = xr.open_dataset(IMERG_FILE)

print("Dataset opened successfully.")

print(f"Time: {ds.time.values}")


# ============================================================
# EXTRACT SIKKIM REGION
# ============================================================

print("\nExtracting Sikkim region...")

sikkim = ds["precipitation"].sel(
    lon=slice(WEST, EAST),
    lat=slice(SOUTH, NORTH)
)

print(
    f"Sikkim grid shape: {sikkim.shape}"
)


# ============================================================
# CONVERT GRID TO DATAFRAME
# ============================================================

grid_df = (
    sikkim
    .to_dataframe(name="precipitation_mm_day")
    .reset_index()
)

grid_df = grid_df.dropna(
    subset=["precipitation_mm_day"]
)

print(
    f"Sikkim precipitation grid records: {len(grid_df)}"
)


# ============================================================
# LOAD REAL LANDSLIDE LOCATIONS
# ============================================================

print("\nLoading Sikkim landslide locations...")

gdf = gpd.read_file(LANDSLIDE_FILE)

print(
    f"Landslide features found: {len(gdf)}"
)

print(
    f"CRS: {gdf.crs}"
)


# ============================================================
# EXTRACT LONGITUDE / LATITUDE
# ============================================================

landslide_df = pd.DataFrame({
    "landslide_id": range(1, len(gdf) + 1),
    "landslide_type": gdf["Name"].astype(str),
    "longitude": gdf.geometry.x,
    "latitude": gdf.geometry.y,
})


# ============================================================
# MATCH EACH LANDSLIDE TO NEAREST IMERG GRID CELL
# ============================================================

print("\nMatching landslides to nearest IMERG grid cells...")

matched_records = []


for _, landslide in landslide_df.iterrows():

    longitude = landslide["longitude"]
    latitude = landslide["latitude"]

    # --------------------------------------------------------
    # Find nearest IMERG longitude
    # --------------------------------------------------------

    nearest_lon = float(
        ds.lon.sel(
            lon=longitude,
            method="nearest"
        ).values
    )

    # --------------------------------------------------------
    # Find nearest IMERG latitude
    # --------------------------------------------------------

    nearest_lat = float(
        ds.lat.sel(
            lat=latitude,
            method="nearest"
        ).values
    )

    # --------------------------------------------------------
    # Extract precipitation
    # --------------------------------------------------------

    precipitation_value = float(
        ds["precipitation"]
        .sel(
            lon=nearest_lon,
            lat=nearest_lat,
            method="nearest"
        )
        .isel(time=0)
        .values
    )

    matched_records.append({
        "landslide_id": int(
            landslide["landslide_id"]
        ),

        "landslide_type": landslide[
            "landslide_type"
        ],

        "landslide_latitude": float(
            latitude
        ),

        "landslide_longitude": float(
            longitude
        ),

        "imerg_grid_latitude": nearest_lat,

        "imerg_grid_longitude": nearest_lon,

        "precipitation_mm_day":
            precipitation_value,

        "date":
            str(
                ds.time.values[0]
            )[:10],

        "source":
            "NASA GPM IMERG Final V07",

        "product":
            "GPM_3IMERGDF",

        "region":
            "Sikkim"
    })


# ============================================================
# CREATE DATAFRAME
# ============================================================

result_df = pd.DataFrame(
    matched_records
)


# ============================================================
# SAVE CSV
# ============================================================

csv_file = (
    OUTPUT_DIR /
    "sikkim_landslide_precipitation.csv"
)

result_df.to_csv(
    csv_file,
    index=False
)


# ============================================================
# SAVE JSON
# ============================================================

json_file = (
    OUTPUT_DIR /
    "sikkim_landslide_precipitation.json"
)

with open(
    json_file,
    "w",
    encoding="utf-8"
) as f:

    json.dump(
        matched_records,
        f,
        indent=2
    )


# ============================================================
# SAVE SIKKIM GRID
# ============================================================

grid_file = (
    OUTPUT_DIR /
    "sikkim_precipitation_grid.csv"
)

grid_df.to_csv(
    grid_file,
    index=False
)


# ============================================================
# CLOSE DATASET
# ============================================================

ds.close()


# ============================================================
# SUMMARY
# ============================================================

print("\n" + "=" * 60)
print("PROCESSING COMPLETE")
print("=" * 60)

print(
    f"Landslide locations processed: "
    f"{len(result_df)}"
)

print(
    f"Sikkim grid records: "
    f"{len(grid_df)}"
)

print(
    f"CSV: {csv_file}"
)

print(
    f"JSON: {json_file}"
)

print(
    f"Grid CSV: {grid_file}"
)

print("=" * 60)