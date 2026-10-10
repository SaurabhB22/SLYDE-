require("dotenv").config();

const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

const mongoose = require("mongoose");

const Landslide = require("../models/Landslide");


const CSV_FILE = path.resolve(
    __dirname,
    "../../../data/landslides/sikkim/sikkim_landslides_coordinates.csv"
);

const importData = async () => {

    try {

        console.log("Connecting to MongoDB...");

        await mongoose.connect(
            process.env.MONGODB_URI
        );

        console.log(
            "MongoDB connected."
        );


        const records = [];


        fs.createReadStream(CSV_FILE)
            .pipe(csv())
            .on("data", (row) => {

                const longitude =
                    Number(row.longitude);

                const latitude =
                    Number(row.latitude);


                if (
                    !Number.isFinite(longitude) ||
                    !Number.isFinite(latitude)
                ) {
                    return;
                }


                records.push({

                    site_id: row.site_id,

                    landslide_type:
                        row.landslide_type,

                    description:
                        row.description || null,

                    layer:
                        row.layer || null,


                    location: {

                        type: "Point",

                        coordinates: [
                            longitude,
                            latitude
                        ]

                    },


                    terrain: {

                        aspect:
                            Number(row.aspect),

                        curvature:
                            Number(row.curvature),

                        slope:
                            Number(row.slope),

                        elevation:
                            Number(row.elevation)

                    },


                    geology:
                        row.geology || null,

                    extent:
                        row.extent || null,


                    source: {

                        organization:
                            "Sikkim landslide inventory",

                        dataset:
                            "Multi-temporal landslide inventory for southern Sikkim",

                        year:
                            2021

                    }

                });

            })

            .on("end", async () => {

                console.log(
                    `Read ${records.length} records.`
                );


                if (records.length === 0) {

                    console.error(
                        "No valid records found."
                    );

                    await mongoose.disconnect();

                    process.exit(1);

                }


                console.log(
                    "Importing into MongoDB..."
                );


                const operations =
                    records.map((record) => ({

                        updateOne: {

                            filter: {
                                site_id:
                                    record.site_id
                            },

                            update: {
                                $set: record
                            },

                            upsert: true

                        }

                    }));


                const result =
                    await Landslide.bulkWrite(
                        operations
                    );


                console.log();
                console.log(
                    "===================================="
                );

                console.log(
                    "SIKKIM LANDSLIDE IMPORT COMPLETE"
                );

                console.log(
                    "===================================="
                );

                console.log(
                    `Records read: ${records.length}`
                );

                console.log(
                    `Inserted: ${result.upsertedCount}`
                );

                console.log(
                    `Modified: ${result.modifiedCount}`
                );


                await mongoose.disconnect();

                process.exit(0);

            });

    } catch (error) {

        console.error(
            "Import failed:",
            error
        );

        await mongoose.disconnect();

        process.exit(1);

    }

};


importData();