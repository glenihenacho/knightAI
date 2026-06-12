import client from "prom-client";

// The metric that matters most is listener lag — wall-clock between segment
// PUT and worker pickup. Everything downstream (missed events, stale
// dashboards) shows up there first. Alert if > 30s for 5 min.

export function createMetrics() {
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry });

  return {
    registry,
    segmentDuration: new client.Histogram({
      name: "worker_segment_processing_duration_ms",
      help: "Per-segment end-to-end: S3 fetch -> frames -> inference -> eval -> DB insert",
      buckets: [100, 250, 500, 1000, 2000, 4000, 8000, 16000],
      registers: [registry],
    }),
    inferenceDuration: new client.Histogram({
      name: "worker_inference_duration_ms",
      help: "Per-frame ONNX inference",
      labelNames: ["cameraId"] as const,
      buckets: [25, 50, 100, 200, 400, 800, 1600],
      registers: [registry],
    }),
    listenerLag: new client.Histogram({
      name: "worker_listener_lag_seconds",
      help: "Wall-clock between segment PUT and worker pickup",
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
      registers: [registry],
    }),
    eventsRaised: new client.Counter({
      name: "worker_event_raised_total",
      help: "Events inserted (post-dedup)",
      labelNames: ["triggerType", "severity"] as const,
      registers: [registry],
    }),
    activeCameras: new client.Gauge({
      name: "worker_active_cameras",
      help: "Cameras with segments processed in the last 5 minutes",
      registers: [registry],
    }),
    activeTracks: new client.Gauge({
      name: "worker_tracker_active_tracks",
      help: "Live tracks per camera",
      labelNames: ["cameraId"] as const,
      registers: [registry],
    }),
    throttled: new client.Counter({
      name: "worker_inference_throttled_total",
      help: "Segments processed slower than real time, or dropped from a full per-camera queue",
      registers: [registry],
    }),
    segmentsProcessed: new client.Counter({
      name: "worker_segments_processed_total",
      help: "Segments fully processed",
      registers: [registry],
    }),
    segmentFailures: new client.Counter({
      name: "worker_segment_failures_total",
      help: "Segments that errored (isolated; the worker moves on)",
      registers: [registry],
    }),
  };
}

export type Metrics = ReturnType<typeof createMetrics>;
