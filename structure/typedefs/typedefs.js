import { gql } from "apollo-server-express";

const typeDefs = gql`
  type User {
    id: ID!
    username: String!
    email: String!
    bio: String
    affiliateLinks: [AffiliateLink!]!
    youtubeChannel: String
    profilePhoto: String
    videos: [Video!]
    streams: [Stream!]
    chats: [Chat!] # Chats the user is involved in
    posts: [Post!] # Posts the user has created
    groups: [Group!] # Groups the user is part of
    createdAt: String!
    updatedAt: String!
  }

  type AffiliateLink {
    id: ID!
    url: String!
    title: String
    description: String
    clicks: Int
  }

  type Neighborhood {
    id: ID!
    name: String!
    description: String
    type: String!
    owner: User!
    members: [NeighborhoodMember]
    joinRequests: [JoinRequest]
    rules: String
    createdAt: String!
    updatedAt: String!
  }

  type NeighborhoodMember {
    user: User!
    role: String!
    joinedAt: String!
  }

  type JoinRequest {
    user: User!
    requestedAt: String!
    status: String!
  }

  extend type Query {
    neighborhoods: [Neighborhood]
    neighborhood(id: ID!): Neighborhood
    myNeighborhoods: [Neighborhood]
    discoverNeighborhoods: [Neighborhood] # Public neighborhoods to discover
  }

  extend type Mutation {
    createNeighborhood(
      name: String!
      description: String
      type: String
    ): Neighborhood
    updateNeighborhood(
      id: ID!
      name: String
      description: String
      rules: String
    ): Neighborhood
    deleteNeighborhood(id: ID!): Boolean

    joinNeighborhood(neighborhoodId: ID!): Neighborhood
    leaveNeighborhood(neighborhoodId: ID!): Boolean

    # For neighborhood owners/moderators
    approveJoinRequest(neighborhoodId: ID!, userId: ID!): Neighborhood
    rejectJoinRequest(neighborhoodId: ID!, userId: ID!): Neighborhood
    removeMember(neighborhoodId: ID!, userId: ID!): Neighborhood

    # Invite system (optional for later)
    inviteToNeighborhood(neighborhoodId: ID!, username: String!): Boolean
  }

  type Chat {
    id: ID!
    name: String!
    participants: [User!]!
    messages: [Message!]!
    createdAt: String!
    updatedAt: String!
  }

  type Message {
    id: ID!
    content: String!
    imageUrl: String
    videoUrl: String
    fileUrl: String
    fileName: String
    fileType: String
    room: String!
    neighborhood: Neighborhood
    createdAt: String!
    sender: User!
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
    id: ID!
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
    # User queries
    users: [User!]
    user(id: ID!): User
    me: User
    userByUsername(username: String!): User

    # Video queries
    videos: [Video!]
    video(id: ID!): Video

    # Stream queries
    streams: [Stream!]
    stream(id: ID!): Stream

    # Ad queries
    ads: [Ad!]
    ad(id: ID!): Ad

    # Chat queries
    chats: [Chat!]
    chat(id: ID!): Chat

    # Message queries
    messages(room: String): [Message!]
    message(id: ID!): Message

    # Post queries
    posts(feedType: String, groupId: ID): [Post!]
    post(id: ID!): Post

    # Group queries
    groups: [Group!]
    group(id: ID!): Group

    neighborhoodMessages(neighborhoodId: ID!): [Message]
    neighborhoodVideos(neighborhoodId: ID!): [Video]
  }

  type Subscription {
    messageAdded(room: String!): Message
    postAdded(feedType: String, groupId: ID): Post
  }

  type Mutation {
    # Auth mutations
    registerUser(
      username: String!
      email: String!
      password: String!
    ): AuthPayload!
    loginUser(username: String!, password: String!): AuthPayload!

    updateProfile(bio: String, profilePhoto: String): User!

    # Affiliate mutations
    addAffiliateLink(url: String!, title: String, description: String): User!
    updateAffiliateLink(
      linkId: ID!
      url: String
      title: String
      description: String
    ): User!
    removeAffiliateLink(linkId: ID!): User!

    # Video mutations
    addVideo(
      title: String!
      description: String!
      youtubeVideoId: String!
      thumbnail: String!
    ): Video!

    # Stream mutations
    addStream(
      title: String!
      description: String!
      youtubeStreamId: String!
      isLive: Boolean!
    ): Stream!

    # Ad mutations
    addAd(affiliateLink: String!): Ad!
    incrementAdClicks(adId: ID!): Ad!

    # Chat mutations
    createChat(name: String!, participantIds: [ID!]!): Chat!
    joinChat(chatId: ID!): Chat!
    leaveChat(chatId: ID!): Boolean!

    # Message mutations
    sendMessage(
      content: String!
      room: String!
      imageUrl: String
      videoUrl: String
      fileUrl: String
      fileName: String
      fileType: String
    ): Message!
    deleteMessage(messageId: ID!): Boolean!

    # Post mutations
    createPost(content: String!, feedType: String!, groupId: ID): Post!
    likePost(postId: ID!): Post!
    unlikePost(postId: ID!): Post!
    addComment(postId: ID!, content: String!): Post!

    # Group mutations
    createGroup(name: String!, description: String!): Group!
    joinGroup(groupId: ID!): Group!
    leaveGroup(groupId: ID!): Group!
  }

  type AuthPayload {
    token: String!
    user: User!
  }
`;

export default typeDefs;
