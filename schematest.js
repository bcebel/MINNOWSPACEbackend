import typeDefs from "./structure/typedefs/typedefs.js";
import { parse } from "graphql";

try {
  parse(typeDefs);
  console.log("✅ Schema is valid!");
} catch (error) {
  console.error("❌ Schema error:", error.message);
  console.error("At line:", error.locations?.[0]?.line);
}
