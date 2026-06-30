// ONVIF camera discovery via WS-Discovery.
//
// WS-Discovery is a SOAP-over-UDP multicast protocol: we send one Probe to the
// well-known group 239.255.255.250:3702 asking for NetworkVideoTransmitter
// devices, and ONVIF cameras on the same L2 segment answer (unicast) with a
// ProbeMatch carrying their service address(es) and scopes (name/hardware).
//
// We deliberately hand-parse the responses instead of pulling a SOAP/XML crate:
// the only fields we need are XAddrs and Scopes, and camera firmware XML is
// small and predictable. Multicast does not cross subnets/VLANs or guest-WiFi
// AP isolation — discovery only sees cameras on the connector's own LAN.

use anyhow::{anyhow, Result};
use serde::Serialize;
use std::collections::HashSet;
use std::time::Duration;
use tokio::net::UdpSocket;
use tokio::time::{timeout, Instant};

// The IANA-assigned WS-Discovery group: real ONVIF cameras listen here.
const DEFAULT_DISCOVERY_ENDPOINT: &str = "239.255.255.250:3702";

/// Where the Probe is sent. Defaults to the real multicast group; an operator
/// can point it at a unicast `host:port` via `ONVIF_DISCOVERY_ENDPOINT` to run
/// discovery against a local simulator (see tools/onvif-sim.ts) with no cameras
/// on the LAN. An empty/unset value keeps the production multicast behaviour.
fn discovery_endpoint() -> String {
    std::env::var("ONVIF_DISCOVERY_ENDPOINT")
        .ok()
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| DEFAULT_DISCOVERY_ENDPOINT.to_string())
}

#[derive(Serialize, Clone)]
pub struct OnvifDevice {
    /// Host/IP pulled from the ONVIF service URL — what goes into an RTSP URL.
    pub address: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hardware: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub xaddr: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct DiscoverResult {
    pub devices: Vec<OnvifDevice>,
}

/// Send one WS-Discovery probe and collect ProbeMatch answers until `timeout_ms`
/// elapses. Deduplicates by host so a camera advertising several service URLs
/// shows up once.
pub async fn discover(timeout_ms: u64) -> Result<DiscoverResult> {
    let socket = UdpSocket::bind("0.0.0.0:0")
        .await
        .map_err(|e| anyhow!("bind discovery socket: {e}"))?;
    // Some stacks require broadcast enabled before sending to a group address.
    let _ = socket.set_broadcast(true);

    let message_id = format!("urn:uuid:{}", uuid::Uuid::new_v4());
    let probe = probe_envelope(&message_id);
    let endpoint = discovery_endpoint();
    socket
        .send_to(probe.as_bytes(), endpoint.as_str())
        .await
        .map_err(|e| anyhow!("send probe to {endpoint}: {e}"))?;

    let budget = Duration::from_millis(timeout_ms.clamp(1_000, 15_000));
    let start = Instant::now();
    let mut devices: Vec<OnvifDevice> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let mut buf = vec![0u8; 65_535];

    loop {
        let Some(remaining) = budget.checked_sub(start.elapsed()) else {
            break;
        };
        match timeout(remaining, socket.recv_from(&mut buf)).await {
            Ok(Ok((n, _src))) => {
                let xml = String::from_utf8_lossy(&buf[..n]);
                if let Some(device) = parse_probe_match(&xml) {
                    if seen.insert(device.address.clone()) {
                        devices.push(device);
                    }
                }
            }
            // A socket error ends the scan but isn't fatal to the connector.
            Ok(Err(_)) => break,
            // Overall budget elapsed.
            Err(_) => break,
        }
    }

    Ok(DiscoverResult { devices })
}

fn probe_envelope(message_id: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?><e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope" xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery" xmlns:dn="http://www.onvif.org/ver10/network/wsdl"><e:Header><w:MessageID>{message_id}</w:MessageID><w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To><w:Action e:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action></e:Header><e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body></e:Envelope>"#
    )
}

fn parse_probe_match(xml: &str) -> Option<OnvifDevice> {
    let xaddrs = extract_element(xml, "XAddrs")?;
    // XAddrs is a space-separated list of service URLs; the first is enough to
    // identify the camera.
    let xaddr = xaddrs.split_whitespace().next()?.to_string();
    let address = host_from_url(&xaddr)?;
    let scopes = extract_element(xml, "Scopes").unwrap_or_default();
    Some(OnvifDevice {
        address,
        name: scope_value(&scopes, "/name/"),
        hardware: scope_value(&scopes, "/hardware/"),
        xaddr: Some(xaddr),
    })
}

/// Text content of the first `<...:Local>` element, namespace prefix ignored.
/// Relies on the content not containing `</` (true for URLs and scope lists).
fn extract_element(xml: &str, local: &str) -> Option<String> {
    let open = format!("{local}>");
    let start = xml.find(&open)? + open.len();
    let rest = &xml[start..];
    let end = rest.find("</")?;
    let value = rest[..end].trim();
    if value.is_empty() {
        None
    } else {
        Some(value.to_string())
    }
}

/// Extract the segment after an ONVIF scope key, e.g. for key "/name/" in
/// "onvif://www.onvif.org/name/Front%20Door" returns "Front Door".
fn scope_value(scopes: &str, key: &str) -> Option<String> {
    for token in scopes.split_whitespace() {
        if let Some(idx) = token.find(key) {
            let raw = &token[idx + key.len()..];
            if !raw.is_empty() {
                return Some(raw.replace("%20", " "));
            }
        }
    }
    None
}

fn host_from_url(raw: &str) -> Option<String> {
    url::Url::parse(raw).ok()?.host_str().map(|h| h.to_string())
}
