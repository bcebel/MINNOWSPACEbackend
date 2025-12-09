// datasources/MediaAPI.js

// This uses require(), which is the standard CommonJS import for ES5 Node.js
const { RESTDataSource } = require("@apollo/datasource-rest");

class MediaAPI extends RESTDataSource {
  // Set the base URL to your server's endpoint prefix
  // Assuming your GraphQL and REST are on the same base server URL for simplicity
  baseURL = "https://minnowspacebackend-e6635e46c3d0.herokuapp.com";

  // ... (all the methods remain the same) ...
  async getPublicMetadata(cid) {
    return this.get(`/api/media/public/${cid}`);
  }

  async getPrivateMetadata(cid, token) {
    return this.get(`/api/media/private/${cid}`);
  }

  willSendRequest(request) {
    if (this.context.token) {
      request.headers.set("Authorization", `Bearer ${this.context.token}`);
    }
  }
}

// This uses module.exports, which is the standard CommonJS export for ES5 Node.js
module.exports = MediaAPI; // <-- This is the ES5 export
