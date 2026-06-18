# Integration Samples

This directory contains payloads for integration rehearsal.

## Kafka

Outbound from the trading client to central trading:

- `kafka/order-command.json`
- `kafka/cancel-command.json`
- `kafka/stock-query.json`

Inbound from central trading to the trading client:

- `kafka/stock-quote.json`
- `kafka/stock-quote-batch.json`
- `kafka/trade-report-buyer.json`
- `kafka/trade-report-seller.json`
- `kafka/order-report-accepted.json`
- `kafka/order-report-rejected.json`
- `kafka/order-report-canceled.json`

## Trade management

- `management/review-request.json`
- `management/review-approved.json`
- `management/review-rejected.json`

These examples match `KAFKA_CONTRACT.md` and `MANAGEMENT_CONTRACT.md`.
