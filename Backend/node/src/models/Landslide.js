const mongoose = require("mongoose");

const landslideSchema = new mongoose.Schema(
    {
        site_id: {
            type: String,
            required: true,
            unique: true,
            index: true
        },

        landslide_type: {
            type: String,
            required: true
        },

        description: {
            type: String
        },

        layer: {
            type: String
        },

        location: {
            type: {
                type: String,
                enum: ["Point"],
                required: true
            },

            coordinates: {
                type: [Number],
                required: true
            }
        },

        terrain: {
            aspect: Number,
            curvature: Number,
            slope: Number,
            elevation: Number
        },

        geology: {
            type: String
        },

        extent: {
            type: String
        },

        source: {
            organization: {
                type: String,
                default: "Sikkim landslide inventory"
            },

            dataset: {
                type: String,
                default:
                    "Multi-temporal landslide inventory for southern Sikkim"
            },

            year: {
                type: Number,
                default: 2021
            }
        }
    },

    {
        timestamps: true
    }
);


landslideSchema.index({
    location: "2dsphere"
});


module.exports = mongoose.model(
    "Landslide",
    landslideSchema
);