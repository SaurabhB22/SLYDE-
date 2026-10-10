import earthaccess
import xarray as xr
import geopandas as gpd
import pandas as pd
import numpy as np

from pathlib import Path


# ============================================================
# CONFIGURATION
# ============================================================

WEST = 88.00
SOUTH = 27.08
EAST = 88.95
NORTH = 28.13

START_DATE = "2025-04-01"
END_DATE = "2025-09-30"


# ============================================================
# PATHS
# ============================================================

RAW_DIR = Path("ingestion/imerg/raw_historical")

OUTPUT_DIR = Path(
    "ingestion/imerg/historical"
)

LANDSLIDE_FILE = Path(
    "../data/landslides/sikkim/"
    "Google_Earth_landslides_point_21Dec2021.shp"
)

OUTPUT_FILE = (
    OUTPUT_DIR /
    "sikkim_historical_precipitation.csv"
)

RAW_DIR.mkdir(
    parents=True,
    exist_ok=True
)

OUTPUT_DIR.mkdir(
    parents=True,
    exist_ok=True
)


# ============================================================
# LOAD LANDSLIDES
# ============================================================

print("=" * 70)
print("SLOPETWIN HISTORICAL IMERG INGESTION")
print("=" * 70)

print("\nLoading landslide locations...")

gdf = gpd.read_file(
    LANDSLIDE_FILE
)

if gdf.crs is None:
    raise RuntimeError(
        "Landslide shapefile has no CRS."
    )

if gdf.crs.to_epsg() != 4326:

    print(
        f"Converting CRS {gdf.crs} → EPSG:4326"
    )

    gdf = gdf.to_crs(
        epsg=4326
    )


landslides = pd.DataFrame({

    "landslide_id":
        np.arange(
            1,
            len(gdf) + 1
        ),

    "landslide_type":
        gdf["Name"]
        .fillna("Unknown")
        .astype(str),

    "landslide_latitude":
        gdf.geometry.y,

    "landslide_longitude":
        gdf.geometry.x

})


print(
    f"Landslide locations: {len(landslides)}"
)


# ============================================================
# LOGIN
# ============================================================

print("\nLogging into NASA Earthdata...")

earthaccess.login(
    strategy="interactive",
    persist=True
)

print("Authentication successful.")


# ============================================================
# SEARCH HISTORICAL IMERG
# ============================================================

print("\nSearching historical IMERG V07...")

results = earthaccess.search_data(

    short_name="GPM_3IMERGDF",

    version="07",

    temporal=(
        START_DATE,
        END_DATE
    ),

    bounding_box=(
        WEST,
        SOUTH,
        EAST,
        NORTH
    )
)


print(
    f"IMERG daily files found: {len(results)}"
)


if not results:

    raise RuntimeError(
        "No IMERG files found."
    )


# ============================================================
# RESUME SUPPORT
# ============================================================

completed_dates = set()


if OUTPUT_FILE.exists():

    print("\nExisting historical dataset detected.")

    existing = pd.read_csv(
        OUTPUT_FILE,
        usecols=["date"]
    )

    completed_dates = set(
        existing["date"]
        .astype(str)
        .unique()
    )

    print(
        f"Already completed days: "
        f"{len(completed_dates)}"
    )


# ============================================================
# PROCESS EACH GRANULE
# ============================================================

processed_days = 0
skipped_days = 0
failed_days = []


for index, granule in enumerate(
    results,
    start=1
):

    # --------------------------------------------------------
    # Get date from NASA metadata
    # --------------------------------------------------------

    try:

        temporal = granule[
            "umm"
        ][
            "TemporalExtent"
        ][
            "RangeDateTime"
        ]

        date = temporal[
            "BeginningDateTime"
        ][:10]

    except Exception:

        # Fallback using string representation

        text = str(granule)

        marker = (
            "BeginningDateTime': '"
        )

        start = text.find(marker)

        if start == -1:

            print(
                f"\n[{index}/{len(results)}] "
                "Unable to determine date."
            )

            failed_days.append(
                f"unknown-{index}"
            )

            continue

        start += len(marker)

        date = text[
            start:start + 10
        ]


    # --------------------------------------------------------
    # Skip already processed day
    # --------------------------------------------------------

    if date in completed_dates:

        skipped_days += 1

        print(
            f"[{index}/{len(results)}] "
            f"{date} already processed — skipping"
        )

        continue


    print()
    print(
        f"[{index}/{len(results)}] "
        f"Processing {date}"
    )


    downloaded_files = []


    try:

        # ====================================================
        # DOWNLOAD ONE GRANULE
        # ====================================================

        downloaded_files = earthaccess.download(

            [granule],

            local_path=str(
                RAW_DIR
            )
        )


        if not downloaded_files:

            raise RuntimeError(
                "NASA download returned no file."
            )


        file_path = Path(
            downloaded_files[0]
        )


        if not file_path.exists():

            raise RuntimeError(
                f"Downloaded file does not exist: "
                f"{file_path}"
            )


        # ====================================================
        # OPEN NETCDF
        # ====================================================

        with xr.open_dataset(
            file_path
        ) as ds:


            if "precipitation" not in ds:

                raise RuntimeError(
                    "precipitation variable missing."
                )


            # ================================================
            # MATCH ALL 185 LOCATIONS
            # ================================================

            daily_records = []


            for _, site in landslides.iterrows():

                lat = float(
                    site[
                        "landslide_latitude"
                    ]
                )

                lon = float(
                    site[
                        "landslide_longitude"
                    ]
                )


                point = ds.sel(

                    lat=lat,

                    lon=lon,

                    method="nearest"

                )


                precipitation = float(

                    point[
                        "precipitation"
                    ]
                    .isel(time=0)
                    .values

                )


                # ============================================
                # QUALITY VARIABLES
                # ============================================

                precipitation_cnt = None

                if "precipitation_cnt" in point:

                    precipitation_cnt = float(

                        point[
                            "precipitation_cnt"
                        ]
                        .isel(time=0)
                        .values

                    )


                precipitation_cnt_cond = None

                if "precipitation_cnt_cond" in point:

                    precipitation_cnt_cond = float(

                        point[
                            "precipitation_cnt_cond"
                        ]
                        .isel(time=0)
                        .values

                    )


                random_error = None

                if "randomError" in point:

                    random_error = float(

                        point[
                            "randomError"
                        ]
                        .isel(time=0)
                        .values

                    )


                # ============================================
                # GRID COORDINATES
                # ============================================

                grid_lat = float(
                    point["lat"].values
                )

                grid_lon = float(
                    point["lon"].values
                )


                daily_records.append({

                    "landslide_id":
                        int(
                            site[
                                "landslide_id"
                            ]
                        ),

                    "date":
                        date,

                    "landslide_type":
                        site[
                            "landslide_type"
                        ],

                    "landslide_latitude":
                        lat,

                    "landslide_longitude":
                        lon,

                    "imerg_grid_latitude":
                        grid_lat,

                    "imerg_grid_longitude":
                        grid_lon,

                    "precipitation_mm_day":
                        precipitation,

                    "precipitation_cnt":
                        precipitation_cnt,

                    "precipitation_cnt_cond":
                        precipitation_cnt_cond,

                    "random_error_mm_day":
                        random_error,

                    "source":
                        "NASA GPM IMERG Final V07",

                    "product":
                        "GPM_3IMERGDF",

                    "region":
                        "Sikkim"

                })


        # ====================================================
        # APPEND DAY TO CSV
        # ====================================================

        daily_df = pd.DataFrame(
            daily_records
        )


        if len(daily_df) != len(landslides):

            raise RuntimeError(
                f"Expected {len(landslides)} records "
                f"but generated {len(daily_df)}."
            )


        write_header = (
            not OUTPUT_FILE.exists()
        )


        daily_df.to_csv(

            OUTPUT_FILE,

            mode="a",

            header=write_header,

            index=False

        )


        completed_dates.add(
            date
        )

        processed_days += 1


        print(
            f"✓ {date}: "
            f"{len(daily_df)} records saved"
        )


    except Exception as error:

        failed_days.append(
            date
        )

        print(
            f"✗ {date} FAILED:"
        )

        print(
            f"  {error}"
        )


    finally:

        # ====================================================
        # DELETE RAW GLOBAL FILE
        # ====================================================

        for downloaded in downloaded_files:

            try:

                path = Path(
                    downloaded
                )

                if path.exists():

                    path.unlink()

                    print(
                        "  Raw NetCDF removed."
                    )

            except Exception as cleanup_error:

                print(
                    "  Cleanup warning:",
                    cleanup_error
                )


# ============================================================
# FINAL SUMMARY
# ============================================================

print()
print("=" * 70)
print("HISTORICAL INGESTION COMPLETE")
print("=" * 70)

print(
    f"New days processed: {processed_days}"
)

print(
    f"Previously completed: {skipped_days}"
)

print(
    f"Failed days: {len(failed_days)}"
)

if failed_days:

    print(
        "Failed dates:"
    )

    for date in failed_days:

        print(
            f"  - {date}"
        )


print(
    f"\nDataset: {OUTPUT_FILE}"
)

print("=" * 70)