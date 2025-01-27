type User {
  id: ID!
  username: String!
  email: String!
  affiliateLink: String
  youtubeChannel: String
  videos: [Video!]
  streams: [Stream!]
  chats: [Chat!] # Chats the user is involved in
  posts: [Post!] # Posts the user has created
  groups: [Group!] # Groups the user is part of
  createdAt: String!
  updatedAt: String!
}

type Chat {
  id: ID!
  participants: [User!]!
  messages: [Message!]!
  createdAt: String!
  updatedAt: String!
}

type Message {
  sender: User!
  content: String!
  timestamp: String!
}

type Post {
  id: ID!
  content: String!
  author: User!
  likes: [User!]!
  comments: [Comment!]!
  createdAt: String!
  updatedAt: String!
  feedType: String! # 'universal', 'group', or 'individual'
  group: Group # Optional, for group-specific posts
}

type Comment {
  author: User!
  content: String!
  timestamp: String!
}

type Group {
  id: ID!
  name: String!
  description: String!
  members: [User!]!
  posts: [Post!]!
  createdAt: String!
  updatedAt: String!
}

type Video {
  id: ID!
  title: String!
  description: String!
  youtubeVideoId: String!
  thumbnail: String!
  user: User!
  createdAt: String!
}

type Stream {
  id: ID!
  title: String!
  description: String!
  youtubeStreamId: String!
  isLive: Boolean!
  user: User!
  createdAt: String!
}

type Ad {
  id: ID!
  affiliateLink: String!
  user: User!
  clicks: Int!
  createdAt: String!
}

type Query {
  users: [User!]
  user(id: ID!): User
  videos: [Video!]
  video(id: ID!): Video
  streams: [Stream!]
  stream(id: ID!): Stream
  ads: [Ad!]
  ad(id: ID!): Ad
  chats: [Chat!]
  chat(id: ID!): Chat
  posts(feedType: String, groupId: ID): [Post!] # Filter posts by feedType or group
  post(id: ID!): Post
  groups: [Group!]
  group(id: ID!): Group
}

type Subscription {
  messageAdded(chatId: ID!): Message
  postAdded(feedType: String, groupId: ID): Post
}

type Mutation {
  registerUser(username: String!, email: String!, password: String!): User
  loginUser(email: String!, password: String!): AuthPayload
  updateAffiliateLink(userId: ID!, affiliateLink: String!): User
  addVideo(userId: ID!, title: String!, description: String!, youtubeVideoId: String!, thumbnail: String!): Video
  addStream(userId: ID!, title: String!, description: String!, youtubeStreamId: String!, isLive: Boolean!): Stream
  addAd(userId: ID!, affiliateLink: String!): Ad
  incrementAdClicks(adId: ID!): Ad
  sendMessage(chatId: ID!, senderId: ID!, content: String!): Chat
  createPost(authorId: ID!, content: String!, feedType: String!, groupId: ID): Post
  likePost(postId: ID!, userId: ID!): Post
  addComment(postId: ID!, authorId: ID!, content: String!): Post
  createGroup(name: String!, description: String!, creatorId: ID!): Group
  joinGroup(groupId: ID!, userId: ID!): Group
}

type AuthPayload {
  token: String!
  user: User!
}


























