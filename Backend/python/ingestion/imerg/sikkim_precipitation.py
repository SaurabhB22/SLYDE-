import earthaccess
import xarray as xr
import pandas as pd
from pathlib import Path
import json

# ============================================================
# SIKKIM AREA OF INTEREST
# ============================================================

WEST = 88.00
SOUTH = 27.08
EAST = 88.95
NORTH = 28.13

START_DATE = "2020-01-01"
END_DATE = "2025-12-31"

OUTPUT_DIR = Path("sikkim_precipitation_data")
OUTPUT_DIR.mkdir(exist_ok=True)

# ============================================================
# NASA EARTHDATA LOGIN
# ============================================================

print("Logging into NASA Earthdata...")

earthaccess.login(
    strategy="interactive",
    persist=True
)

# ============================================================
# SEARCH NASA GPM IMERG
# ============================================================

print("Searching NASA GPM IMERG data for Sikkim...")

results = earthaccess.search_data(
    short_name="GPM_3IMERGDF",
    temporal=(START_DATE, END_DATE),
    bounding_box=(
        WEST,
        SOUTH,
        EAST,
        NORTH
    )
)

print(f"Found {len(results)} NASA IMERG files.")

if len(results) == 0:
    raise RuntimeError(
        "No IMERG files were found for the selected Sikkim period."
    )

# ============================================================
# DOWNLOAD DATA
# ============================================================

print("Downloading IMERG files...")

downloaded_files = earthaccess.download(
    results,
    local_path=str(OUTPUT_DIR / "raw")
)

print(
    f"Downloaded {len(downloaded_files)} files."
)

# ============================================================
# PROCESS IMERG FILES
# ============================================================

records = []

for file_path in downloaded_files:

    print(f"Processing: {file_path}")

    try:

        dataset = xr.open_dataset(
            file_path,
            engine="netcdf4"
        )

        # ----------------------------------------------------
        # Find precipitation variable
        # ----------------------------------------------------

        if "precipitationCal" in dataset.data_vars:

            precipitation = dataset["precipitationCal"]

        elif "precipitation" in dataset.data_vars:

            precipitation = dataset["precipitation"]

        else:

            print(
                "Precipitation variable not found:",
                list(dataset.data_vars)
            )

            continue

        # ----------------------------------------------------
        # Normalize coordinate names
        # ----------------------------------------------------

        if "latitude" in dataset.coords:

            dataset = dataset.rename(
                {"latitude": "lat"}
            )

        if "longitude" in dataset.coords:

            dataset = dataset.rename(
                {"longitude": "lon"}
            )

        # Re-select precipitation after rename
        if "precipitationCal" in dataset.data_vars:
            precipitation = dataset["precipitationCal"]
        else:
            precipitation = dataset["precipitation"]

        # ----------------------------------------------------
        # Extract Sikkim bounding box
        # ----------------------------------------------------

        lat_values = dataset["lat"].values

        if lat_values[0] < lat_values[-1]:

            precipitation_sikkim = precipitation.sel(
                lat=slice(SOUTH, NORTH),
                lon=slice(WEST, EAST)
            )

        else:

            precipitation_sikkim = precipitation.sel(
                lat=slice(NORTH, SOUTH),
                lon=slice(WEST, EAST)
            )

        # ----------------------------------------------------
        # Convert to DataFrame
        # ----------------------------------------------------

        df = (
            precipitation_sikkim
            .to_dataframe(
                name="precipitation"
            )
            .reset_index()
        )

        # ----------------------------------------------------
        # Remove missing values
        # ----------------------------------------------------

        df = df.dropna(
            subset=["precipitation"]
        )

        # ----------------------------------------------------
        # Add metadata
        # ----------------------------------------------------

        df["source"] = "NASA GPM IMERG"
        df["product"] = "GPM_3IMERGDF"
        df["region"] = "Sikkim"
        df["latitude_min"] = SOUTH
        df["latitude_max"] = NORTH
        df["longitude_min"] = WEST
        df["longitude_max"] = EAST

        # ----------------------------------------------------
        # Rename coordinates
        # ----------------------------------------------------

        if "lat" in df.columns:

            df = df.rename(
                columns={
                    "lat": "latitude"
                }
            )

        if "lon" in df.columns:

            df = df.rename(
                columns={
                    "lon": "longitude"
                }
            )

        records.append(df)

        dataset.close()

    except Exception as error:

        print(
            f"Error processing {file_path}:",
            error
        )

# ============================================================
# COMBINE ALL FILES
# ============================================================

if not records:

    raise RuntimeError(
        "No precipitation records were extracted."
    )

final_df = pd.concat(
    records,
    ignore_index=True
)

# ============================================================
# SORT DATA
# ============================================================

if "time" in final_df.columns:

    final_df = final_df.sort_values(
        by=["time", "latitude", "longitude"]
    )

# ============================================================
# SAVE CSV
# ============================================================

csv_file = (
    OUTPUT_DIR /
    "sikkim_precipitation.csv"
)

final_df.to_csv(
    csv_file,
    index=False
)

print(
    f"CSV created: {csv_file}"
)

# ============================================================
# CONVERT TO JSON
# ============================================================

json_records = final_df.to_dict(
    orient="records"
)

json_file = (
    OUTPUT_DIR /
    "sikkim_precipitation.json"
)

with open(
    json_file,
    "w",
    encoding="utf-8"
) as file:

    json.dump(
        json_records,
        file,
        indent=2,
        default=str
    )

print(
    f"JSON created: {json_file}"
)

# ============================================================
# SUMMARY
# ============================================================

print("\n===================================")
print(" SIKKIM PRECIPITATION DATA READY")
print("===================================")

print(
    f"Records: {len(final_df)}"
)

print(
    f"CSV: {csv_file}"
)

print(
    f"JSON: {json_file}"
)

print(
    "Region: Sikkim"
)

print(
    f"Bounding Box: "
    f"{WEST}, {SOUTH}, {EAST}, {NORTH}"
)

print(
    f"Period: {START_DATE} → {END_DATE}"
)

print(
    "Source: NASA GPM IMERG"
)