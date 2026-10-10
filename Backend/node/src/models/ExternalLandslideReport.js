const mongoose = require("mongoose");

const externalLandslideReportSchema = new mongoose.Schema(
  {
    sourceUrl: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    sourceTitle: {
      type: String,
      required: true,
      trim: true
    },
    sourceDomain: {
      type: String,
      default: null
    },
    sourceSnippet: {
      type: String,
      default: ""
    },
    reportedDateText: {
      type: String,
      default: null
    },
    searchQueries: {
      type: [String],
      default: []
    },
    provider: {
      type: String,
      default: "tinyfish",
      immutable: true
    },
    verificationStatus: {
      type: String,
      enum: ["unverified", "corroborated", "official"],
      default: "unverified"
    },
    lastSeenAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    collection: "external_landslide_reports"
  }
);


externalLandslideReportSchema.index({ lastSeenAt: -1 });

module.exports = mongoose.model(
  "ExternalLandslideReport",
  externalLandslideReportSchema
);
