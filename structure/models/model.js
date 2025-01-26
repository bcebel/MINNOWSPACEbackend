{
  _id: ObjectId,
  username: String, // Unique
  email: String, // Unique
  password: String, // Hashed
  createdAt: Date,
  updatedAt: Date,
  affiliateLink: String, // Optional, validated via regex
  youtubeChannel: String, // YouTube channel URL or ID
  videos: [{ type: ObjectId, ref: 'Video' }], // References to videos
  streams: [{ type: ObjectId, ref: 'Stream' }], // References to live streams
  balance: Number, // Track earnings from affiliate links
}