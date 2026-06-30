// ONVIF WS-Discovery responder simulator.
//
// Lets you live-test the connector's ONVIF discovery (apps/connector-tauri's
// onvif.rs) with NO real cameras on the LAN. It listens for the WS-Discovery
// Probe the connector multicasts and answers — exactly like a real camera —
// with one unicast ProbeMatch per simulated device. The connector parses those
// answers and the discovered devices flow through the API to the dashboard's
// "add camera" panel.
//
// Two ways to drive it:
//
//   1. Loopback (single host, recommended for dev). Point the connector at this
//      sim instead of the real multicast group:
//
//        ONVIF_DISCOVERY_ENDPOINT=127.0.0.1:3702 <run the connector>
//        pnpm exec tsx tools/onvif-sim.ts            # listens on 0.0.0.0:3702
//
//      The connector unicasts its Probe to 127.0.0.1:3702; the sim replies to
//      the Probe's source port; the connector collects the devices. No multicast
//      involved, so it works reliably on one machine.
//
//   2. Real LAN multicast. Run the connector unmodified (it multicasts to
//      239.255.255.250:3702) and start the sim with --multicast so it joins the
//      group and answers as if it were a camera on the segment:
//
//        pnpm exec tsx tools/onvif-sim.ts --multicast
//
// Customise the fleet with --devices N or a JSON file via --config (see --help).
//
// No dependencies: Node built-ins only. Run with tsx (a root devDependency):
//   pnpm exec tsx tools/onvif-sim.ts --help

import dgram from "node:dgram";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";

const WS_DISCOVERY_GROUP = "239.255.255.250";
const DEFAULT_PORT = 3702;

interface SimDevice {
  /** Host/IP the connector will turn into an RTSP URL. */
  address: string;
  /** ONVIF /name/ scope — shows as the device label in the dashboard. */
  name: string;
  /** ONVIF /hardware/ scope — vendor/model string. */
  hardware: string;
  /** Optional ONVIF /location/ scope. Purely cosmetic for the sim. */
  location?: string;
}

const { values } = parseArgs({
  options: {
    host: { type: "string", default: "0.0.0.0" },
    port: { type: "string", default: String(DEFAULT_PORT) },
    devices: { type: "string", default: "3" },
    config: { type: "string" },
    multicast: { type: "boolean", default: false },
    delay: { type: "string", default: "0" },
    help: { type: "boolean", default: false },
  },
});

if (values.help) {
  process.stdout.write(
    `ONVIF WS-Discovery responder simulator\n\n` +
      `Usage: tsx tools/onvif-sim.ts [options]\n\n` +
      `  --host <addr>      Bind address (default 0.0.0.0)\n` +
      `  --port <n>         Bind/listen port (default ${DEFAULT_PORT})\n` +
      `  --devices <n>      Number of synthetic cameras to advertise (default 3)\n` +
      `  --config <file>    JSON file: array of {address,name,hardware,location?}\n` +
      `                     overriding the generated fleet\n` +
      `  --multicast        Join ${WS_DISCOVERY_GROUP} to answer real multicast\n` +
      `                     probes (for testing on a real LAN). Off = loopback.\n` +
      `  --delay <ms>       Wait this long before replying (simulate slow cameras)\n` +
      `  --help             Show this help\n\n` +
      `Loopback: run the connector with ONVIF_DISCOVERY_ENDPOINT=127.0.0.1:${DEFAULT_PORT}.\n`,
  );
  process.exit(0);
}

const port = Number(values.port);
const delayMs = Number(values.delay);

function generateFleet(count: number): SimDevice[] {
  // A handful of believable defaults, then Camera N for any beyond that.
  const presets: Array<Omit<SimDevice, "address">> = [
    { name: "Front Door", hardware: "Acme NVT-2000", location: "Entrance" },
    { name: "Loading Dock", hardware: "Acme NVT-2000", location: "Rear" },
    { name: "Parking Lot", hardware: "Hikvision DS-2CD", location: "Lot A" },
    { name: "Lobby", hardware: "Dahua IPC-HFW", location: "Ground Floor" },
    { name: "Warehouse", hardware: "Axis P3265", location: "Bay 3" },
  ];
  return Array.from({ length: count }, (_, i) => {
    const preset = presets[i] ?? {
      name: `Camera ${i + 1}`,
      hardware: "Generic ONVIF NVT",
      location: undefined,
    };
    // .11, .12, ... in a stable, obviously-fake subnet.
    return { address: `192.168.50.${11 + i}`, ...preset };
  });
}

function loadFleet(): SimDevice[] {
  if (values.config) {
    const raw = readFileSync(values.config, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error(`--config ${values.config} must be a non-empty JSON array`);
    }
    for (const d of parsed) {
      if (!d || typeof d.address !== "string" || typeof d.name !== "string") {
        throw new Error(`--config entries need at least string "address" and "name"`);
      }
    }
    return parsed as SimDevice[];
  }
  const count = Number(values.devices);
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`--devices must be a positive integer, got ${values.devices}`);
  }
  return generateFleet(count);
}

const fleet = loadFleet();

// Percent-encode an ONVIF scope value. The connector's parser only reverses
// %20 -> space (onvif.rs scope_value), so spaces are the case that matters;
// encodeURIComponent also keeps the token whitespace-free for split_whitespace.
function encodeScope(value: string): string {
  return encodeURIComponent(value);
}

function extractMessageId(probe: string): string | null {
  // Probe header carries <w:MessageID>urn:uuid:...</w:MessageID>; namespace
  // prefix varies by stack, so match on the local element name.
  const m = probe.match(/MessageID>\s*([^<]+?)\s*</);
  return m ? m[1] : null;
}

function probeMatchEnvelope(device: SimDevice, relatesTo: string | null): string {
  const scopes = [
    `onvif://www.onvif.org/type/Network_Video_Transmitter`,
    `onvif://www.onvif.org/name/${encodeScope(device.name)}`,
    `onvif://www.onvif.org/hardware/${encodeScope(device.hardware)}`,
    ...(device.location ? [`onvif://www.onvif.org/location/${encodeScope(device.location)}`] : []),
  ].join(" ");
  const relatesToHeader = relatesTo ? `<w:RelatesTo>${relatesTo}</w:RelatesTo>` : "";
  return (
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope" ` +
    `xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing" ` +
    `xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" ` +
    `xmlns:dn="http://www.onvif.org/ver10/network/wsdl">` +
    `<e:Header>` +
    `<w:MessageID>urn:uuid:${randomUUID()}</w:MessageID>` +
    relatesToHeader +
    `<w:To>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</w:To>` +
    `<w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/ProbeMatches</w:Action>` +
    `</e:Header>` +
    `<e:Body>` +
    `<d:ProbeMatches>` +
    `<d:ProbeMatch>` +
    `<w:EndpointReference><w:Address>urn:uuid:${randomUUID()}</w:Address></w:EndpointReference>` +
    `<d:Types>dn:NetworkVideoTransmitter</d:Types>` +
    `<d:Scopes>${scopes}</d:Scopes>` +
    `<d:XAddrs>http://${device.address}/onvif/device_service</d:XAddrs>` +
    `<d:MetadataVersion>1</d:MetadataVersion>` +
    `</d:ProbeMatch>` +
    `</d:ProbeMatches>` +
    `</e:Body>` +
    `</e:Envelope>`
  );
}

function looksLikeProbe(message: string): boolean {
  // Answer only WS-Discovery Probes; ignore our own ProbeMatches and noise.
  return message.includes("Probe") && !message.includes("ProbeMatch");
}

const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });

socket.on("error", (err) => {
  process.stderr.write(`socket error: ${err.message}\n`);
  socket.close();
  process.exit(1);
});

socket.on("message", (msg, rinfo) => {
  const text = msg.toString("utf8");
  if (!looksLikeProbe(text)) return;
  const relatesTo = extractMessageId(text);
  process.stdout.write(`probe from ${rinfo.address}:${rinfo.port} -> answering ${fleet.length} device(s)\n`);

  const reply = () => {
    for (const device of fleet) {
      const envelope = probeMatchEnvelope(device, relatesTo);
      socket.send(envelope, rinfo.port, rinfo.address, (err) => {
        if (err) process.stderr.write(`  reply to ${device.address} failed: ${err.message}\n`);
        else process.stdout.write(`  -> ${device.name} (${device.address})\n`);
      });
    }
  };

  if (delayMs > 0) setTimeout(reply, delayMs);
  else reply();
});

socket.on("listening", () => {
  const a = socket.address();
  if (values.multicast) {
    try {
      socket.addMembership(WS_DISCOVERY_GROUP);
      process.stdout.write(`joined multicast group ${WS_DISCOVERY_GROUP}\n`);
    } catch (err) {
      process.stderr.write(
        `could not join ${WS_DISCOVERY_GROUP}: ${(err as Error).message}\n` +
          `(loopback mode still works via ONVIF_DISCOVERY_ENDPOINT)\n`,
      );
    }
  }
  process.stdout.write(
    `onvif-sim listening on ${a.address}:${a.port} with ${fleet.length} device(s):\n` +
      fleet.map((d) => `  - ${d.name} @ ${d.address} [${d.hardware}]`).join("\n") +
      `\n`,
  );
  if (!values.multicast) {
    process.stdout.write(`loopback mode: set ONVIF_DISCOVERY_ENDPOINT=127.0.0.1:${a.port} on the connector\n`);
  }
});

socket.bind(port, values.host);

process.on("SIGINT", () => {
  process.stdout.write(`\nshutting down\n`);
  socket.close(() => process.exit(0));
});
