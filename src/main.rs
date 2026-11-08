#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() -> eframe::Result<()> {
    dshub::diagnostics::init();
    eframe::run_native(
        "DSHub",
        eframe::NativeOptions {
            // EGL swap waits can block event handling when Wayland hides a workspace.
            glow_options: eframe::egui_glow::GlowConfiguration {
                vsync: !(cfg!(target_os = "linux")
                    && std::env::var_os("WAYLAND_DISPLAY").is_some()),
                ..Default::default()
            },
            viewport: eframe::egui::ViewportBuilder::default()
                .with_inner_size([1440.0, 900.0])
                .with_min_inner_size([700.0, 500.0])
                .with_icon(
                    eframe::icon_data::from_png_bytes(include_bytes!("../assets/icon.png"))
                        .expect("bundled icon"),
                ),
            ..Default::default()
        },
        Box::new(|cc| Ok(Box::new(dshub::ui::Desktop::new(cc)))),
    )
}
