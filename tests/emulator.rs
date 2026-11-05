//! Exercises the production backend against the repository's Python device.
use dshub::{
    commands,
    model::*,
    poll,
    runtime::{AppHandle, Event},
    types::*,
};
use std::{
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
async fn wait(app: &AppHandle, predicate: impl Fn(&Event) -> bool) -> Event {
    tokio::time::timeout(Duration::from_secs(8), async {
        loop {
            for event in app.drain() {
                if predicate(&event) {
                    return event;
                }
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("Expected device event did not arrive")
}
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "launches the Python emulator and binds TCP 2009 / UDP 2011"]
async fn native_backend_tcp_udp_control_reads_writes_commands_and_subscriptions() {
    let emulator = Emulator(
        Command::new("python3")
            .args(["-u", "emulator/dshub_emulator.py"])
            .stdout(Stdio::null())
            .stderr(Stdio::inherit())
            .spawn()
            .expect("Python emulator"),
    );
    tokio::time::sleep(Duration::from_millis(800)).await;
    let app = AppHandle::new();
    for interface in [InterfaceType::Tcp, InterfaceType::Udp] {
        commands::connect_device(
            "127.0.0.1".into(),
            interface.clone(),
            Some("Test emulator".into()),
            app.clone(),
            app.state(),
        )
        .await
        .unwrap();
        app.drain();
        commands::take_control(app.state()).await.unwrap();
        let control = wait(&app, |e| {
            e.name == "sysRegisterUpdate" && e.payload["address"] == 2
        })
        .await;
        assert_eq!(
            control.payload["value"],
            if interface == InterfaceType::Tcp {
                1
            } else {
                2
            }
        );
        commands::write_register(10, 1234, app.state())
            .await
            .unwrap();
        let event = wait(&app, |e| {
            e.name == "registerUpdate" && e.payload["address"] == 10
        })
        .await;
        assert_eq!(event.payload["valid"], true);
        assert_eq!(event.payload["value"], 1234);
        commands::read_register(10, "MOTOR_X_SETPOINT".into(), app.state())
            .await
            .unwrap();
        let event = wait(&app, |e| {
            e.name == "registerUpdate" && e.payload["address"] == 10
        })
        .await;
        assert_eq!(event.payload["value"], 1234);
        let float = 2.75f32.to_bits() as i32;
        commands::write_parameter(6, float, app.state())
            .await
            .unwrap();
        let event = wait(&app, |e| {
            e.name == "parameterUpdate" && e.payload["address"] == 6
        })
        .await;
        assert_eq!(event.payload["valid"], true);
        commands::read_parameter(6, "MOTOR_X_KP".into(), app.state())
            .await
            .unwrap();
        let event = wait(&app, |e| {
            e.name == "parameterUpdate" && e.payload["address"] == 6
        })
        .await;
        assert_eq!(event.payload["value"], float);
        commands::send_sys_command(0, 0, app.state()).await.unwrap();
        let event = wait(&app, |e| {
            e.name == "commandResponse" && e.payload["command"] == 0
        })
        .await;
        assert_eq!(event.payload["valid"], true);
        commands::write_register(0, 999, app.state()).await.unwrap();
        let event = wait(&app, |e| {
            e.name == "registerUpdate" && e.payload["address"] == 0
        })
        .await;
        assert_eq!(
            event.payload["valid"], false,
            "read-only writes must be reported refused"
        );
        let id = poll::subscribe_address(
            poll::DataSource::SysRegister,
            3,
            "COUNTER_1HZ".into(),
            50,
            app.clone(),
            app.state(),
        )
        .await
        .unwrap();
        let event = wait(&app, |e| {
            e.name == "sysRegisterUpdate" && e.payload["address"] == 3
        })
        .await;
        assert_eq!(event.payload["valid"], true);
        poll::unsubscribe_address(id, app.clone(), app.state())
            .await
            .unwrap();
        commands::disconnect_device(app.state()).await.unwrap();
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
    // Existing profile files remain a portable boundary between applications.
    let p = default_profiles().remove(1);
    assert!(p.sys_commands.iter().any(|c| c.code == 0));
    assert_eq!(
        Profile::import(&p.export().to_string())
            .unwrap()
            .parameters_map,
        p.parameters_map
    );
    drop(emulator);
}
