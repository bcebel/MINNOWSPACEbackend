import dotenv from "dotenv";

dotenv.config({ path: "/Users/Brian/Desktop/bcode/minnowbe/minnowbe/.env" });
console.log(dotenv)

import mongoose from "mongoose";
//import Profile from "../models/Profile.js";
//import profileSeeds from "./profileSeeds.json" assert { type: "json" };

import Minnows from "../structure/models/Minnow.js";
import minnowSeeds from "../structure/models/modelseed.json" assert { type: "json" };
// MongoDB connection
const URI = process.env.MONGODB_URI;
mongoose.connect(URI);

const connection = mongoose.connection;
connection.once("open", async () => {
  try {
 //   await Profile.deleteMany({});
//    await Profile.create(profileSeeds);
    await Minnows.deleteMany({});
    await Minnows.create(minnowSeeds);

    console.log("all done!");
    process.exit(0);
  } catch (err) {
    throw err;
  }
});
