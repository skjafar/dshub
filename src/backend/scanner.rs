use crate::runtime::{AppHandle, Event};
use if_addrs::{get_if_addrs, IfAddr};
use std::net::{Ipv4Addr, SocketAddrV4};
use std::time::Duration;
use tokio::net::UdpSocket;

use crate::types::*;

pub async fn scan_devices(app: AppHandle) {
    // Build 5-byte discovery request: [magic LE 4 bytes][request cmd]
    let mut request = [0u8; 5];
    request[..4].copy_from_slice(&DS_DISCOVERY_MAGIC.to_le_bytes());
    request[4] = DS_DISCOVERY_REQUEST;

    let socket = match UdpSocket::bind("0.0.0.0:0").await {
        Ok(s) => s,
        Err(e) => {
            log::error!("Failed to bind discovery socket: {}", e);
            app.emit(Event::ScanComplete);
            return;
        }
    };

    if let Err(e) = socket.set_broadcast(true) {
        log::error!("Failed to enable UDP broadcast: {}", e);
        app.emit(Event::ScanComplete);
        return;
    }

    // This machine's addresses: a reply from one of them is a local device.
    let mut own: Vec<std::net::IpAddr> = vec![];
    // Broadcast discovery request on every non-loopback IPv4 interface
    match get_if_addrs() {
        Ok(interfaces) => {
            for iface in interfaces {
                own.push(iface.ip());
                if let IfAddr::V4(v4) = iface.addr {
                    if v4.ip.is_loopback() {
                        continue;
                    }

                    // Use the broadcast address provided by the OS, or calculate it
                    let broadcast: Ipv4Addr = match v4.broadcast {
                        Some(b) => b,
                        None => {
                            let ip = u32::from(v4.ip);
                            let mask = u32::from(v4.netmask);
                            Ipv4Addr::from(ip | !mask)
                        }
                    };

                    let dest = SocketAddrV4::new(broadcast, DISCOVERY_PORT);
                    log::info!(
                        "Broadcasting discovery on {} ({}) → {}",
                        iface.name,
                        v4.ip,
                        broadcast
                    );

                    if let Err(e) = socket.send_to(&request, dest).await {
                        log::error!("Broadcast error on {}: {}", broadcast, e);
                    }
                }
            }
        }
        Err(e) => {
            log::error!("Failed to enumerate network interfaces: {}", e);
        }
    }

    // Collect responses for 5 seconds
    let mut buf = [0u8; 256];
    let deadline = tokio::time::Instant::now() + Duration::from_secs(5);

    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            break;
        }

        match tokio::time::timeout(remaining, socket.recv_from(&mut buf)).await {
            Ok(Ok((n, source))) => {
                if let Some(device) =
                    parse_discovery_response(&buf[..n], source.ip()).map(|d| same_machine(d, &own))
                {
                    log::info!(
                        "Device discovered: {} at {}",
                        device.board_name,
                        device.ip_address
                    );
                    app.emit(Event::DeviceDiscovered(device));
                }
            }
            // Windows surfaces an ICMP port-unreachable from one interface as a
            // reset on the next receive; other replies may still be on the way.
            Ok(Err(e)) if e.kind() == std::io::ErrorKind::ConnectionReset => {}
            Ok(Err(e)) => {
                log::error!("Discovery receive error: {}", e);
                break;
            }
            Err(_) => break, // timeout
        }
    }

    log::info!("Discovery scan complete");
    app.emit(Event::ScanComplete);
}

/// Parses a discovery reply received from `source`. The Device is reached at
/// the address the reply came from; the address inside the reply is only a
/// claim, kept when it differs so the interface can say so.
fn parse_discovery_response(data: &[u8], source: std::net::IpAddr) -> Option<DiscoveredDevice> {
    if data.len() < 32 {
        return None;
    }

    let magic = u32::from_le_bytes([data[0], data[1], data[2], data[3]]);
    let command = data[4];

    if magic != DS_DISCOVERY_MAGIC || command != DS_DISCOVERY_RESPONSE {
        return None;
    }

    let board_type = data[5];
    let firmware_version = u16::from_le_bytes([data[6], data[7]]);
    let device_id = u32::from_le_bytes([data[8], data[9], data[10], data[11]]);
    let ip_raw = u32::from_le_bytes([data[12], data[13], data[14], data[15]]);
    let tcp_port = u16::from_le_bytes([data[16], data[17]]);
    let udp_port = u16::from_le_bytes([data[18], data[19]]);

    // The MAC address occupies 20–25; 26–27 are reserved (PROTOCOL.md).
    let mac_address = format!(
        "{:02x}:{:02x}:{:02x}:{:02x}:{:02x}:{:02x}",
        data[20], data[21], data[22], data[23], data[24], data[25]
    );

    // IP from little-endian uint32
    let ip_address = format!(
        "{}.{}.{}.{}",
        ip_raw & 0xFF,
        (ip_raw >> 8) & 0xFF,
        (ip_raw >> 16) & 0xFF,
        (ip_raw >> 24) & 0xFF
    );

    // Board name: null-terminated ASCII starting at offset 28
    let name_bytes = &data[28..];
    let end = name_bytes
        .iter()
        .position(|&b| b == 0)
        .unwrap_or(name_bytes.len());
    let board_name = String::from_utf8_lossy(&name_bytes[..end]).to_string();
    let board_name = if board_name.is_empty() {
        format!("Device_{}", device_id)
    } else {
        board_name
    };

    let source = source.to_string();
    let claimed_ip = (ip_address != source).then_some(ip_address);
    Some(DiscoveredDevice {
        ip_address: source,
        claimed_ip,
        board_name,
        mac_address,
        device_id,
        board_type,
        firmware_version,
        tcp_port,
        udp_port,
    })
}

/// A device on this machine that claims a loopback address is reached
/// there: it may serve only on loopback (as `--local` emulators did while
/// still answering discovery on every interface), and the claim names this
/// same machine, so nothing is redirected elsewhere.
fn same_machine(mut d: DiscoveredDevice, own: &[std::net::IpAddr]) -> DiscoveredDevice {
    let local = d
        .ip_address
        .parse::<std::net::IpAddr>()
        .is_ok_and(|ip| own.contains(&ip));
    let loopback = d
        .claimed_ip
        .as_deref()
        .and_then(|c| c.parse::<std::net::IpAddr>().ok())
        .is_some_and(|ip| ip.is_loopback());
    if local && loopback {
        d.ip_address = d.claimed_ip.take().unwrap();
    }
    d
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The datastream library's 44-byte `ds_discovery_response_t` layout.
    fn response(mac: [u8; 6], tcp_port: u16, udp_port: u16) -> Vec<u8> {
        let mut b = vec![];
        b.extend_from_slice(&DS_DISCOVERY_MAGIC.to_le_bytes());
        b.push(DS_DISCOVERY_RESPONSE);
        b.push(1);
        b.extend_from_slice(&0x0100u16.to_le_bytes());
        b.extend_from_slice(&7u32.to_le_bytes());
        b.extend_from_slice(&[10, 0, 0, 5]);
        b.extend_from_slice(&tcp_port.to_le_bytes());
        b.extend_from_slice(&udp_port.to_le_bytes());
        b.extend_from_slice(&mac);
        b.extend_from_slice(&[0, 0]);
        let mut name = [0u8; 16];
        name[..5].copy_from_slice(b"Board");
        b.extend_from_slice(&name);
        b
    }

    fn from(last: u8) -> std::net::IpAddr {
        std::net::IpAddr::V4(Ipv4Addr::new(10, 0, 0, last))
    }

    #[test]
    fn a_reply_is_reached_at_its_source_not_the_address_it_claims() {
        let d = parse_discovery_response(&response([0; 6], 2009, 2011), from(66)).unwrap();
        assert_eq!(d.ip_address, "10.0.0.66");
        assert_eq!(d.claimed_ip.as_deref(), Some("10.0.0.5"));
    }

    #[test]
    fn a_device_on_this_machine_claiming_loopback_is_reached_on_loopback() {
        let mut reply = response([0; 6], 2009, 2011);
        reply[12..16].copy_from_slice(&[127, 0, 0, 1]);
        let own = [from(66)];
        let d = same_machine(parse_discovery_response(&reply, from(66)).unwrap(), &own);
        assert_eq!(d.ip_address, "127.0.0.1");
        assert_eq!(d.claimed_ip, None);
        // From another machine, the claim is only shown, never followed.
        let d = same_machine(parse_discovery_response(&reply, from(67)).unwrap(), &own);
        assert_eq!(d.ip_address, "10.0.0.67");
        assert_eq!(d.claimed_ip.as_deref(), Some("127.0.0.1"));
    }

    #[test]
    fn mac_address_precedes_the_reserved_field() {
        let d = parse_discovery_response(&response([0x02, 0, 0, 0, 0, 0x01], 2009, 2011), from(5))
            .unwrap();
        assert_eq!(d.mac_address, "02:00:00:00:00:01");
        assert_eq!(d.ip_address, "10.0.0.5");
        assert_eq!(d.claimed_ip, None);
        assert_eq!(d.board_name, "Board");
    }

    #[test]
    fn reported_ports_are_preserved() {
        let d = parse_discovery_response(&response([0; 6], 3009, 3011), from(5)).unwrap();
        assert_eq!((d.tcp_port, d.udp_port), (3009, 3011));
    }
}
