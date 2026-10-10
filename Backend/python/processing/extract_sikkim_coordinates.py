import geopandas as gpd
import pandas as pd
from pathlib import Path


# ============================================================
# PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parents[2]

INPUT_FILE = (
    BASE_DIR
    / "data"
    / "landslides"
    / "Google_Earth_landslides_point_21Dec2021.shp"
)

OUTPUT_FILE = (
    BASE_DIR
    / "data"
    / "landslides"
    / "sikkim"
    / "sikkim_landslides_coordinates.csv"
)


# ============================================================
# LOAD SHAPEFILE
# ============================================================

print("Loading Sikkim landslide shapefile...")

gdf = gpd.read_file(INPUT_FILE)

print(f"Loaded {len(gdf)} landslide points.")
print(f"CRS: {gdf.crs}")


# ============================================================
# VERIFY CRS
# ============================================================

if gdf.crs is None:
    raise RuntimeError(
        "The shapefile does not contain CRS information."
    )

if str(gdf.crs) != "EPSG:4326":
    print("Converting coordinates to EPSG:4326...")
    gdf = gdf.to_crs("EPSG:4326")


# ============================================================
# EXTRACT COORDINATES
# ============================================================

gdf["longitude"] = gdf.geometry.x
gdf["latitude"] = gdf.geometry.y


# ============================================================
# CREATE SITE IDs
# ============================================================

gdf["site_id"] = [
    f"SIK-GE-{i:03d}"
    for i in range(1, len(gdf) + 1)
]


# ============================================================
# RENAME SOURCE FIELDS
# ============================================================

gdf = gdf.rename(
    columns={
        "Name": "landslide_type",
        "descriptio": "description",
        "layer": "layer",
        "Aspect": "aspect",
        "Curvature": "curvature",
        "Slope": "slope",
        "Elevation": "elevation",
        "Geology": "geology",
        "Extent": "extent"
    }
)


# ============================================================
# SELECT FIELDS
# ============================================================

columns = [
    "site_id",
    "landslide_type",
    "description",
    "layer",
    "aspect",
    "curvature",
    "slope",
    "elevation",
    "geology",
    "extent",
    "longitude",
    "latitude"
]

result = gdf[columns].copy()


# ============================================================
# REMOVE ZEROS / INVALID GEOMETRIES
# ============================================================

result = result.dropna(
    subset=[
        "longitude",
        "latitude"
    ]
)


# ============================================================
# SAVE CSV
# ============================================================

result.to_csv(
    OUTPUT_FILE,
    index=False
)


# ============================================================
# SUMMARY
# ============================================================

print()
print("=" * 60)
print("SIKKIM LANDSLIDE COORDINATES EXTRACTED")
print("=" * 60)

print(f"Total records : {len(result)}")
print(f"Output file   : {OUTPUT_FILE}")

print()
print("First 5 locations:")
print(
    result[
        [
            "site_id",
            "longitude",
            "latitude",
            "slope",
            "elevation"
        ]
    ].head().to_string(index=False)
)

print()
print("Coordinate range:")

print(
    f"Longitude: "
    f"{result['longitude'].min():.6f} → "
    f"{result['longitude'].max():.6f}"
)

print(
    f"Latitude : "
    f"{result['latitude'].min():.6f} → "
    f"{result['latitude'].max():.6f}"
)
