#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() -> eframe::Result<()> {
    env_logger::init();
    eframe::run_native(
        "DSHub",
        eframe::NativeOptions {
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
