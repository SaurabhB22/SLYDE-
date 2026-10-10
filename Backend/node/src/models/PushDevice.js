const mongoose = require("mongoose");

const pushDeviceSchema = new mongoose.Schema(
  {
    deviceName: { type: String, required: true, trim: true, maxlength: 100 },
    tokenHash: { type: String, required: true, unique: true, index: true },
    subscription: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    active: { type: Boolean, default: true },
    lastSeen: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model("PushDevice", pushDeviceSchema);
