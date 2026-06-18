# Integration Readiness Checklist

This checklist tracks what the trading client can prepare before the central
trading system and trade management system provide their final connection
details.

## Already prepared

- Trade management review adapter:
  - Calls `POST /api/trade-management/orders/review`.
  - Sends `reviewId`, `orderId`, `accountId`, `fundAccountNo`,
    `securityAccountNo`, `stockCode`, `side`, `price`, `quantity`, `amount`,
    and `clientTime`.
  - Accepts both approved and rejected business results in HTTP 200 responses.

- Central trading Kafka adapter:
  - Publishes `central.order.command`.
  - Publishes `central.cancel.command`.
  - Publishes `central.stock.query`.
  - Consumes `client.stock.quote`.
  - Consumes `client.trade.report`.
  - Consumes `client.order.report`.

- Kafka connection options:
  - Plain broker connections.
  - SSL on/off.
  - Optional SSL CA/cert/key files.
  - SASL username/password with configurable mechanism.

- Runtime safety:
  - Outbound order/cancel/stock query validation before Kafka send.
  - Inbound quote/trade/order report validation before local database update.
  - Invalid JSON is ignored and recorded instead of crashing the consumer.
  - Handler errors are recorded and logged without stopping the consumer loop.
  - Duplicate trade reports are ignored before order quantity is updated.
  - Overfilled trade reports are rejected before local state is changed.

- Observability:
  - `GET /api/client/central/kafka/status` returns enabled/started/ready state.
  - The status response includes broker/topic config without secrets.
  - The status response includes produced/received/invalid counters.
  - The status response includes last produced topic/time and last received
    topic/time.
  - The status response includes last error and last invalid message reason.

- Local rehearsal:
  - `npm run mock:central-kafka` starts a mock central trading Kafka service.
  - The mock consumes order/cancel/stock query commands and publishes matching
    order reports, trade reports, and stock quotes.
  - Sample payloads are in `integration-samples/`.

## Waiting for external information

- Central trading system:
  - Kafka broker addresses.
  - Whether SSL is required.
  - Whether SASL is required.
  - SASL mechanism, username, and password if required.
  - Certificate files or CA file if required.
  - Topic names if they differ from `KAFKA_CONTRACT.md`.
  - Producer permissions for command topics.
  - Consumer permissions for report topics.
  - Whether order reports always echo our `orderId`.
  - Whether trade reports send `buyerOrderId`, `sellerOrderId`, or `orderId`.
  - Final status enum values.
  - Expected behavior for repeated trade reports and replayed Kafka messages.

- Trade management system:
  - HTTP base URL.
  - Whether authentication headers or signatures are required.
  - CORS policy for browser-origin requests.
  - Final reject code list.
  - Whether business rejection always returns HTTP 200 with `approved: false`.

- Business ownership:
  - Who releases frozen funds after `REJECTED`, `EXPIRED`, or `CANCELED`.
  - Who releases frozen holdings after `REJECTED`, `EXPIRED`, or `CANCELED`.
  - Who updates holdings and available cash after trades.
  - Whether the trading client should call account-system settlement APIs after
    Kafka reports are consumed.

## Local rehearsal flow

1. Start a Kafka broker.
2. Configure `.env` with the broker address and `KAFKA_ENABLED=true`.
3. Create the local MySQL schema from `database/schema.sql`.
4. Start this backend:

```bash
npm run dev
```

5. Start the mock central Kafka service in another terminal:

```bash
npm run mock:central-kafka
```

6. Configure the browser:

```js
localStorage.setItem("clientApiBase", "http://localhost:8090");
localStorage.setItem("centralKafkaEnabled", "true");
localStorage.removeItem("centralTradingApiBase");
location.reload();
```

7. Check Kafka status:

```text
GET http://localhost:8090/api/client/central/kafka/status
```

8. Submit an order from the UI and confirm:
  - `central.order.command` is produced.
  - `client.order.report` is consumed.
  - `client.trade.report` is consumed.
  - Local `order_record` and `trade_record` are updated.

## Definition of ready for real integration

- Kafka status endpoint returns `ready: true`.
- Management review endpoint returns both approved and rejected sample responses
  in the agreed format.
- Central trading receives one valid order command from us.
- We receive one valid accepted order report from central trading.
- We receive one valid rejected order report from central trading.
- We receive one valid partial trade report from central trading.
- We receive one valid full trade report from central trading.
- We receive one valid cancel report from central trading.
- We receive one valid single-stock quote from central trading.
- Duplicate trade report replay does not change local traded quantity twice.
- Invalid JSON or invalid payloads do not crash the consumer.
