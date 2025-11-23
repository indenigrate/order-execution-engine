# Order Execution Engine

A backend engine that processes market orders, routes them to the best Decentralized Exchange (DEX) based on price, and streams real-time updates via WebSockets.

## Public Deployment & Video
* **Live Demo URL:** []
* **Demo Video:** []

## Design Decisions

### Order Type Strategy
I chose **Market Orders** to prioritize speed of execution and immediate liquidity, which is critical for a routing engine demonstration. To extend this system for **Limit** or **Sniper** orders, the worker logic would be modified to check a target price or launch time trigger before proceeding to the "Routing" phase.

### Architecture
* **WebSockets over HTTP:** The system uses a single WebSocket connection for both order submission and status updates. This reduces network overhead and ensures the client never misses an update due to connection latency.
* **Queue-Based Concurrency:** BullMQ is used to decouple the API from the execution logic. This ensures the server remains responsive even under high load, processing orders at a controlled rate.
* **Redis Pub/Sub:** A dedicated Redis channel is created for each order ID. This allows the worker to publish updates asynchronously without blocking the main thread.

## Tech Stack
* **Runtime:** Node.js, TypeScript
* **Framework:** Fastify (Chosen for high-performance WebSocket support)
* **Database:** PostgreSQL (Persistence), Redis (Queue & Real-time Pub/Sub)
* **ORM:** Prisma
* **Queue:** BullMQ

## Local Setup Instructions

1.  **Prerequisites**
    Ensure Docker and Node.js are installed.

2.  **Start Infrastructure**
    Run the following command to start PostgreSQL and Redis containers:
    ```bash
    docker-compose up -d
    ```

3.  **Install Dependencies**
    ```bash
    npm install
    ```

4.  **Initialize Database**
    Generate the Prisma client and push the schema to the database:
    ```bash
    npx prisma generate
    npx prisma migrate dev --name init
    ```

5.  **Run the Server**
    ```bash
    npm run dev
    ```
    The server will start at `http://localhost:3000`.

## API Usage

### WebSocket Endpoint
**URL:** `ws://localhost:3000/api/orders/connect`

**Request Payload:**
Send this JSON immediately after connecting:
```json
{
  "action": "execute_order",
  "tokenIn": "SOL",
  "tokenOut": "USDC",
  "amountIn": 5
}
```

**Response Stream:**

1.  **Pending:** Order received and queued.
2.  **Routing:** Comparing prices between Raydium and Meteora.
3.  **Building:** Constructing the transaction.
4.  **Submitted:** Transaction sent to the network.
5.  **Confirmed:** Transaction successful (includes TX Hash).

## Testing

Run the unit and integration test suite (covers routing logic and queue behavior):

```bash
npm test
```