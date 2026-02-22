# Chat Platform — Backend

A real-time chat platform backend built with NestJS, featuring WebSocket messaging, WebRTC voice/video calls, friend management, and online presence tracking.

## Tech Stack

| Category            | Technology                                   |
| ------------------- | -------------------------------------------- |
| **Framework**       | NestJS v11                                   |
| **Runtime**         | Node.js (ES2023)                             |
| **Language**        | TypeScript v5.7                              |
| **Database**        | PostgreSQL                                   |
| **ORM**             | Drizzle ORM v0.45                            |
| **Cache**           | Redis (ioredis v5.8)                         |
| **WebSockets**      | Socket.IO v4.8 + Redis Adapter               |
| **Authentication**  | JWT (access + refresh tokens), bcrypt        |
| **Validation**      | Zod v4 + nestjs-zod                          |
| **Security**        | Helmet, CORS                                 |
| **WebRTC**          | Coturn TURN server (signaling via Socket.IO) |
| **Package Manager** | pnpm                                         |

## Features

### Authentication & Security

- JWT-based auth with access tokens (7d) and refresh tokens (15d)
- Token family rotation with reuse detection
- Password hashing with bcrypt (12 rounds)
- Redis session caching
- IP address and user agent tracking
- Global auth guard with `@Public()` opt-out decorator
- Helmet security headers and CORS protection

### Real-Time Messaging

- WebSocket-based messaging via Socket.IO
- Room-based conversation channels
- Message CRUD (send, edit, delete with soft deletes)
- Typing indicators (`typing:start`, `typing:stop`)
- Read receipts
- Message reactions (add/remove)
- Message attachments (image, file, audio, video)

### Voice & Video Calls

- WebRTC signaling via WebSocket events
- Audio and video call support
- Group call support
- Call lifecycle management (initiate, accept, reject, end)
- ICE candidate exchange
- Participant join/leave events
- Call state management in Redis
- TURN server integration (Coturn)

### Friend System

- Send, accept, reject, and cancel friend requests
- Friend list with pagination
- Remove friends
- Incoming/outgoing request tracking with counts

### Conversations

- Direct messages (1:1)
- Group conversations
- Conversation member management (add, remove, leave)
- Member roles (owner, admin, member)
- Conversation CRUD

### Online Presence

- Real-time online/offline status tracking
- Online friends list broadcasting
- Presence update events
- Socket-to-user mapping via Redis

### Infrastructure

- Redis adapter for Socket.IO horizontal scaling
- Cursor-based pagination for efficient large dataset queries
- Database connection pooling (max 20 connections)
- Drizzle migrations with migration history

## Database Schema

| Table                   | Description                                           |
| ----------------------- | ----------------------------------------------------- |
| `users`                 | User accounts                                         |
| `refresh_tokens`        | JWT refresh token tracking                            |
| `friend_requests`       | Friend request workflow (pending, accepted, rejected) |
| `friends`               | Established friend relationships                      |
| `conversations`         | Direct and group conversations                        |
| `conversation_members`  | Membership with roles (owner, admin, member)          |
| `messages`              | Messages (text, image, file, audio, video, system)    |
| `message_attachments`   | File attachments on messages                          |
| `message_reactions`     | Emoji reactions                                       |
| `message_read_receipts` | Per-user read receipts                                |
| `deleted_messages`      | Soft delete tracking                                  |

## API Reference

All endpoints are prefixed with `/api/v1`. Authenticated unless marked with `@Public()`.

### Auth — `/auth`

| Method | Endpoint    | Description                     |
| ------ | ----------- | ------------------------------- |
| POST   | `/register` | Register a new user             |
| POST   | `/login`    | Login with credentials          |
| POST   | `/refresh`  | Refresh access + refresh tokens |
| POST   | `/logout`   | Logout and invalidate tokens    |
| GET    | `/me`       | Get current authenticated user  |

### Users — `/users`

| Method | Endpoint       | Description                |
| ------ | -------------- | -------------------------- |
| GET    | `/suggestions` | Paginated user suggestions |

### Friends — `/friends`

| Method | Endpoint                      | Description                 |
| ------ | ----------------------------- | --------------------------- |
| GET    | `/`                           | Paginated friend list       |
| DELETE | `/:friendId`                  | Remove a friend             |
| POST   | `/requests`                   | Send a friend request       |
| GET    | `/requests/incoming`          | Paginated incoming requests |
| GET    | `/requests/incoming/count`    | Incoming request count      |
| GET    | `/requests/outgoing`          | Paginated outgoing requests |
| POST   | `/requests/:requestId/accept` | Accept a friend request     |
| POST   | `/requests/:requestId/reject` | Reject a friend request     |
| DELETE | `/requests/:requestId/cancel` | Cancel an outgoing request  |

### Conversations — `/conversations`

| Method | Endpoint                      | Description                 |
| ------ | ----------------------------- | --------------------------- |
| GET    | `/`                           | Paginated conversation list |
| POST   | `/`                           | Create a conversation       |
| GET    | `/:id`                        | Get a conversation          |
| GET    | `/:id/details`                | Get conversation details    |
| PUT    | `/:id`                        | Update a conversation       |
| DELETE | `/:id`                        | Delete a conversation       |
| GET    | `/:id/members`                | List members                |
| POST   | `/:id/members`                | Add members                 |
| DELETE | `/:id/members/:memberId`      | Remove a member             |
| POST   | `/:id/leave`                  | Leave a conversation        |
| PATCH  | `/:id/members/:memberId/role` | Update member role          |

### Messages — `/conversations/:conversationId/messages`

| Method | Endpoint | Description               |
| ------ | -------- | ------------------------- |
| POST   | `/`      | Send a message            |
| GET    | `/`      | Paginated message history |

## WebSocket Events

### Connection

- JWT authentication required on handshake
- Auto-joins `user:{userId}` room on connect

### Messaging

| Event                | Direction        | Description               |
| -------------------- | ---------------- | ------------------------- |
| `conversation:join`  | Client -> Server | Join a conversation room  |
| `conversation:leave` | Client -> Server | Leave a conversation room |
| `message:send`       | Client -> Server | Send a new message        |
| `message:edit`       | Client -> Server | Edit a message            |
| `message:delete`     | Client -> Server | Delete a message          |
| `message:read`       | Client -> Server | Mark messages as read     |
| `typing:start`       | Client -> Server | Start typing indicator    |
| `typing:stop`        | Client -> Server | Stop typing indicator     |
| `reaction:add`       | Client -> Server | Add a reaction            |
| `reaction:remove`    | Client -> Server | Remove a reaction         |

### Presence

| Event             | Direction        | Description                    |
| ----------------- | ---------------- | ------------------------------ |
| `userOnline`      | Server -> Client | A friend came online           |
| `userOffline`     | Server -> Client | A friend went offline          |
| `onlineFriends`   | Server -> Client | Initial list of online friends |
| `presenceUpdated` | Server -> Client | Presence status change         |

### Call Signaling

| Event                     | Direction        | Description                |
| ------------------------- | ---------------- | -------------------------- |
| `call:initiate`           | Client -> Server | Start a call               |
| `call:incoming`           | Server -> Client | Incoming call notification |
| `call:accept`             | Client -> Server | Accept a call              |
| `call:reject`             | Client -> Server | Reject a call              |
| `call:offer`              | Bidirectional    | WebRTC SDP offer           |
| `call:answer`             | Bidirectional    | WebRTC SDP answer          |
| `call:ice-candidate`      | Bidirectional    | ICE candidate exchange     |
| `call:end`                | Client -> Server | End a call                 |
| `call:ended`              | Server -> Client | Call ended notification    |
| `call:participant-joined` | Server -> Client | Participant joined         |
| `call:participant-left`   | Server -> Client | Participant left           |

## Getting Started

### Prerequisites

- Node.js >= 18
- pnpm
- PostgreSQL
- Redis

### Setup

1. **Clone the repository**

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Start infrastructure** (Redis + Coturn via Docker)

   ```bash
   docker compose up -d
   ```

4. **Configure environment variables** — create a `.env` file:

   ```env
   NODE_ENV=development
   HOST=localhost
   PORT=8080

   DATABASE_URL=postgres://user:password@localhost:5432/chat_platform

   REDIS_HOST=localhost
   REDIS_PORT=6379

   JWT_ACCESS_SECRET=your-access-secret
   JWT_ACCESS_EXPIRES_IN=7d
   JWT_REFRESH_SECRET=your-refresh-secret
   JWT_REFRESH_EXPIRES_IN=15d

   ALLOWED_ORIGINS=http://localhost:3000
   ```

5. **Run database migrations**

   ```bash
   pnpm db:migrate
   ```

6. **Start the development server**
   ```bash
   pnpm dev
   ```

### Scripts

| Script             | Description                          |
| ------------------ | ------------------------------------ |
| `pnpm dev`         | Start in development mode with watch |
| `pnpm start:prod`  | Start in production mode             |
| `pnpm db:generate` | Generate Drizzle migrations          |
| `pnpm db:migrate`  | Run database migrations              |
| `pnpm db:studio`   | Open Drizzle Studio GUI              |
| `pnpm test`        | Run unit tests                       |
| `pnpm test:e2e`    | Run end-to-end tests                 |
| `pnpm test:cov`    | Run tests with coverage              |
| `pnpm lint`        | Lint the codebase                    |

## Architecture

```
Client (Browser)
    │
    ├── REST API (/api/v1/*)
    │       │
    │       └── NestJS Controllers → Services → Drizzle ORM → PostgreSQL
    │
    └── WebSocket (Socket.IO)
            │
            ├── Redis Adapter (horizontal scaling)
            ├── Messaging (rooms, typing, reactions, read receipts)
            ├── Presence (online/offline tracking)
            └── Call Signaling (WebRTC SDP + ICE)
                    │
                    └── Coturn TURN Server (NAT traversal)

Infrastructure:
    ├── PostgreSQL — persistent data
    ├── Redis — sessions, socket tracking, presence, call state
    └── Coturn — TURN/STUN for WebRTC
```
