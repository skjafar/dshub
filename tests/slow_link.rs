//! Polling faster than a slow device answers must not bury operator requests.
use dshub::{
    commands, poll,
    runtime::{AppHandle, Event},
    types::*,
};
use std::{
    process::{Child, Command, Stdio},
    time::{Duration, Instant},
};

struct Emulator(Child);
impl Drop for Emulator {
    fn drop(&mut self) {
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "launches the Python emulator and binds TCP 2009 / UDP 2011"]
async fn a_manual_read_is_answered_promptly_while_polling_outruns_the_device() {
    // 20 ms per reply: the link serves 50 requests a second.
    let _emulator = Emulator(
        Command::new("python3")
            .args([
                "-u",
                "emulator/dshub_emulator.py",
                "--local",
                "--latency-ms",
                "20",
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::inherit())
            .spawn()
            .expect("Python emulator"),
    );
    tokio::time::sleep(Duration::from_millis(800)).await;
    let app = AppHandle::new();
    commands::connect_device(
        "127.0.0.1".into(),
        DEFAULT_TCP_PORT,
        InterfaceType::Tcp,
        None,
        app.clone(),
        app.state(),
    )
    .await
    .unwrap();
    // 14 registers every 50 ms ask for 280 requests a second.
    for address in 0..14 {
        poll::subscribe_address(
            poll::DataSource::Register,
            address,
            format!("R{address}"),
            50,
            app.clone(),
            app.state(),
        )
        .await
        .unwrap();
    }
    // Let the backlog build, as it would in a long session.
    tokio::time::sleep(Duration::from_secs(3)).await;
    let (depth, _) = app.state().queue_depth().expect("connected");
    assert!(depth <= 16, "queue holds one read per address, not {depth}");

    app.drain();
    let asked = Instant::now();
    commands::read_parameter(6, "MOTOR_X_KP".into(), app.state())
        .await
        .unwrap();
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            if app
                .drain()
                .iter()
                .any(|e| matches!(e, Event::Parameter(r) if r.address == 6))
            {
                return;
            }
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .expect("the manual read was answered");
    assert!(
        asked.elapsed() < Duration::from_millis(700),
        "manual read took {:?} behind the polls",
        asked.elapsed()
    );
    commands::disconnect_device(app.state()).await.unwrap();
}
