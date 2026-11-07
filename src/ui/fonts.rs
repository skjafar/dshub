use eframe::egui;

pub const LICENSE: &str = include_str!("../../assets/fonts/LICENSE-DejaVu.txt");

pub fn install(ctx: &egui::Context) {
    let mut fonts = egui::FontDefinitions::default();
    fonts.font_data.insert(
        "dshub-symbols".into(),
        egui::FontData::from_static(include_bytes!("../../assets/fonts/DejaVuSans.ttf")).into(),
    );
    for family in [egui::FontFamily::Proportional, egui::FontFamily::Monospace] {
        fonts
            .families
            .entry(family)
            .or_default()
            .push("dshub-symbols".into());
    }
    ctx.set_fonts(fonts);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_fonts_cover_all_ui_symbols() {
        let ctx = egui::Context::default();
        install(&ctx);
        let _ = ctx.run(Default::default(), |ctx| {
            ctx.fonts(|fonts| {
                for family in [egui::FontFamily::Proportional, egui::FontFamily::Monospace] {
                    let id = egui::FontId::new(16., family);
                    for symbol in "●○≡←→↑↓↖↗↙↘⚠×−—…·".chars() {
                        assert!(
                            fonts.has_glyph(&id, symbol),
                            "Missing glyph: {symbol} in {:?}",
                            id.family
                        );
                    }
                }
            });
        });
    }
}
