// structure/pubsub.js
import { PubSub } from "graphql-subscriptions";

// Create a single instance
const pubsub = new PubSub();

console.log("📡 PubSub instance created at startup");

// Export both named and default
export { pubsub };
export default pubsub;
