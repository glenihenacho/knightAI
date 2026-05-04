export interface RtspTemplate {
  vendor: string;
  model?: string;
  notes?: string;
  template: string;
  variables: ReadonlyArray<"username" | "password" | "host" | "port" | "channel" | "stream">;
}

export const RTSP_TEMPLATES: ReadonlyArray<RtspTemplate> = [
  {
    vendor: "Hikvision",
    template: "rtsp://{username}:{password}@{host}:{port}/Streaming/Channels/{channel}{stream}",
    variables: ["username", "password", "host", "port", "channel", "stream"],
    notes: "channel = 101 main, 102 sub",
  },
  {
    vendor: "Dahua",
    template: "rtsp://{username}:{password}@{host}:{port}/cam/realmonitor?channel={channel}&subtype={stream}",
    variables: ["username", "password", "host", "port", "channel", "stream"],
    notes: "subtype = 0 main, 1 sub",
  },
  {
    vendor: "Axis",
    template: "rtsp://{username}:{password}@{host}:{port}/axis-media/media.amp",
    variables: ["username", "password", "host", "port"],
  },
  {
    vendor: "Amcrest",
    template: "rtsp://{username}:{password}@{host}:{port}/cam/realmonitor?channel={channel}&subtype={stream}",
    variables: ["username", "password", "host", "port", "channel", "stream"],
  },
  {
    vendor: "Reolink",
    template: "rtsp://{username}:{password}@{host}:{port}/h264Preview_{channel}_main",
    variables: ["username", "password", "host", "port", "channel"],
    notes: "channel = 01 for first camera",
  },
  {
    vendor: "Generic ONVIF",
    template: "rtsp://{username}:{password}@{host}:{port}/onvif/profile1",
    variables: ["username", "password", "host", "port"],
  },
];

export function findTemplateByVendor(vendor: string): RtspTemplate | undefined {
  const needle = vendor.trim().toLowerCase();
  return RTSP_TEMPLATES.find((t) => t.vendor.toLowerCase() === needle);
}

export function renderTemplate(
  template: RtspTemplate,
  values: Partial<Record<RtspTemplate["variables"][number], string>>,
): string {
  let result = template.template;
  for (const variable of template.variables) {
    const value = values[variable];
    if (value === undefined) {
      throw new Error(`missing value for "${variable}" in ${template.vendor} template`);
    }
    result = result.replaceAll(`{${variable}}`, encodeURIComponent(value));
  }
  return result;
}
