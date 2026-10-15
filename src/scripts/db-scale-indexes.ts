import "dotenv/config";
import { connectPrimaryDatabase } from "../database/mongoConnect.js";
import mongoose from "mongoose";

async function main() {
  await connectPrimaryDatabase();
  console.log("Scale indexes ensured on", mongoose.connection.name);
  await mongoose.disconnect();
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
