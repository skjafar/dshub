//! Replays `tests/protocol-vectors.json` against the repository's Python device
//! over raw TCP frames, so the emulator and PROTOCOL.md cannot drift apart
//! unnoticed. The same vectors can be run against firmware on a bench.
use std::{
    io::{Read, Write},
    net::TcpStream,
    process::{Child, Command, Stdio},
    time::Duration,
};

struct Emulator(Child);
impl Drop for Emulator {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

fn frame(request: &[serde_json::Value]) -> [u8; 8] {
    let field = |i: usize| request[i].as_i64().expect("numeric request field");
    let mut bytes = [0u8; 8];
    bytes[0..2].copy_from_slice(&(field(0) as u16).to_le_bytes());
    bytes[2..4].copy_from_slice(&(field(1) as u16).to_le_bytes());
    bytes[4..8].copy_from_slice(&(field(2) as i32).to_le_bytes());
    bytes
}

#[test]
#[ignore = "launches the Python emulator and binds TCP 2009 / UDP 2011"]
fn emulator_conforms_to_protocol_vectors() {
    // A bench device is named explicitly; otherwise start the emulator.
    let bench = std::env::var("DSHUB_CONFORMANCE_ADDR").ok();
    let _emulator = bench.is_none().then(|| {
        let emulator = Emulator(
            Command::new("python3")
                .args(["-u", "emulator/dshub_emulator.py", "--local"])
                .stdout(Stdio::null())
                .stderr(Stdio::inherit())
                .spawn()
                .expect("Python emulator"),
        );
        std::thread::sleep(Duration::from_millis(800));
        emulator
    });
    let address = bench.unwrap_or("127.0.0.1:2009".into());
    let mut stream = TcpStream::connect(&address).expect("device TCP port");
    stream
        .set_read_timeout(Some(Duration::from_secs(2)))
        .unwrap();
    let vectors: serde_json::Value =
        serde_json::from_str(include_str!("protocol-vectors.json")).unwrap();
    let mut failures = vec![];
    for vector in vectors["vectors"].as_array().unwrap() {
        let name = vector["name"].as_str().unwrap();
        stream
            .write_all(&frame(vector["request"].as_array().unwrap()))
            .unwrap();
        let mut response = [0u8; 8];
        if let Err(e) = stream.read_exact(&mut response) {
            failures.push(format!("{name}: no response ({e})"));
            continue;
        }
        let actual = [
            i16::from_le_bytes([response[0], response[1]]) as i64,
            u16::from_le_bytes([response[2], response[3]]) as i64,
            i32::from_le_bytes([response[4], response[5], response[6], response[7]]) as i64,
        ];
        let expected = vector["response"].as_array().unwrap();
        for (i, field) in ["status", "address", "value"].iter().enumerate() {
            if let Some(want) = expected[i].as_i64() {
                if want != actual[i] {
                    failures.push(format!("{name}: {field} {} (expected {want})", actual[i]));
                }
            }
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n"));
}
