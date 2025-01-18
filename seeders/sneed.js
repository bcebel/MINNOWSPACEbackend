
import db from "../config/connection";
import Profile from "../models/Profile";
import profileSeeds from "./profileSeeds.json";


db.once("open", async () => {
  try {
    await Profile.deleteMany({});
    await Profile.create(profileSeeds);

    console.log("all done!");
    process.exit(0);
  } catch (err) {
    throw err;
  }
});
