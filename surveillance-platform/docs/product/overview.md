# Product overview

## Problem

Existing CCTV deployments are dumb: they record video to a local NVR but the footage is never analyzed. Customers want to layer agentic capabilities (search, alerts, summaries) on top of the cameras they already own without ripping and replacing hardware.

## Solution

A small connector application installed on the customer's network pairs with our cloud control plane. Operators add cameras through the dashboard by submitting an RTSP URL; the connector validates and pulls frames locally so credentials never leave the customer's network.

## Non-goals (initial release)

- Replacing the NVR / continuous recording.
- Cloud-recorded video archives.
- Multi-tenant ACLs beyond a single organization.
