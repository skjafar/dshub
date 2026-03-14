use if_addrs::{get_if_addrs, IfAddr};
use std::net::{Ipv4Addr, SocketAddrV4};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
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
            let _ = app.emit("scanComplete", ());
            return;
        }
    };

    if let Err(e) = socket.set_broadcast(true) {
        log::error!("Failed to enable UDP broadcast: {}", e);
        let _ = app.emit("scanComplete", ());
        return;
    }

    // Broadcast discovery request on every non-loopback IPv4 interface
    match get_if_addrs() {
        Ok(interfaces) => {
            for iface in interfaces {
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
            Ok(Ok((n, _src))) => {
                if let Some(device) = parse_discovery_response(&buf[..n]) {
                    log::info!(
                        "Device discovered: {} at {}",
                        device.board_name,
                        device.ip_address
                    );
                    let _ = app.emit("deviceDiscovered", &device);
                }
            }
            Ok(Err(e)) => {
                log::error!("Discovery receive error: {}", e);
                break;
            }
            Err(_) => break, // timeout
        }
    }

    log::info!("Discovery scan complete");
    let _ = app.emit("scanComplete", ());
}

fn parse_discovery_response(data: &[u8]) -> Option<DiscoveredDevice> {
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

    // MAC address: 6 bytes at offset 20
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

    Some(DiscoveredDevice {
        ip_address,
        board_name,
        mac_address,
        device_id,
        board_type,
        firmware_version,
        tcp_port,
        udp_port,
    })
}
