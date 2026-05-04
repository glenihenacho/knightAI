# Pairing & validation flow

```
 Dashboard            API                 Connector (on-prem)
    |                  |                         |
    |-- POST /pairings -|                         |
    |<-- code XXXX-XXXX-|                         |
    |                  |                         |
    | (operator types code into connector UI)    |
    |                  |<--- POST /redeem -------|
    |                  |---- 200 + token ------->|
    |                  |                         |
    |-- POST /cameras --|                         |
    |   (rtspUrl)       |                         |
    |                  |--- enqueue cmd          |
    |                  |                         |
    |                  |<-- GET /commands/next --|  (long-poll)
    |                  |--- 200 validate_rtsp -->|
    |                  |                         |---- TCP/RTSP probe
    |                  |                         |---- snapshot capture
    |                  |<--- PUT /uploads/:k ----|
    |                  |<--- POST /result -------|
    |                  |                         |
    |-- GET /cameras --|                         |
    |<-- camera.online,|                         |
    |     snapshotKey  |                         |
```

## Why polling, not push?

Customer networks rarely allow inbound connections. The connector establishes
outbound HTTPS only, long-polling for commands. The control plane therefore
never needs a route into the customer environment.

## Tokens

- **Pairing code** — short-lived (10m), single-use, displayed in dashboard.
- **Connector token** — long-lived bearer token, scoped to a single
  `connectorId`. Stored only on the customer machine and as a hash on the API.
  Revocable.

## Failure modes worth designing for early

- Connector reboot mid-command → command stays `in_flight`; expire & requeue
  after `lease_ms`.
- Camera credentials wrong → `validate_rtsp` returns `reachable: false` with
  `error`. Camera state goes to `error`, not `offline`.
- Connector offline > N minutes → mark `offline`, surface in dashboard.
