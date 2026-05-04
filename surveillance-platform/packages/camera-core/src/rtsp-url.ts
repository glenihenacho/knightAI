export interface ParsedRtspUrl {
  protocol: "rtsp" | "rtsps";
  username?: string;
  password?: string;
  host: string;
  port: number;
  path: string;
}

export class RtspUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RtspUrlError";
  }
}

export function parseRtspUrl(input: string): ParsedRtspUrl {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new RtspUrlError("not a valid URL");
  }

  if (url.protocol !== "rtsp:" && url.protocol !== "rtsps:") {
    throw new RtspUrlError(`unsupported protocol "${url.protocol}", expected rtsp: or rtsps:`);
  }
  if (!url.hostname) {
    throw new RtspUrlError("missing host");
  }

  const protocol = url.protocol === "rtsps:" ? "rtsps" : "rtsp";
  const port = url.port ? Number(url.port) : protocol === "rtsps" ? 322 : 554;

  return {
    protocol,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    host: url.hostname,
    port,
    path: `${url.pathname}${url.search}`,
  };
}

export function redactRtspUrl(input: string): string {
  try {
    const parsed = parseRtspUrl(input);
    const auth = parsed.username ? `${parsed.username}:***@` : "";
    return `${parsed.protocol}://${auth}${parsed.host}:${parsed.port}${parsed.path}`;
  } catch {
    return "rtsp://***";
  }
}
