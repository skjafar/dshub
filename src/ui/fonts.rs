use eframe::egui;

pub const LICENSE: &str = concat!(
    "Inter\n\n",
    include_str!("../../assets/fonts/LICENSE-Inter.txt"),
    "\n\nJetBrains Mono\n\n",
    include_str!("../../assets/fonts/LICENSE-JetBrainsMono.txt"),
    "\n\nDejaVu\n\n",
    include_str!("../../assets/fonts/LICENSE-DejaVu.txt"),
);

/// Headings and emphasis; egui has no font weights of its own.
pub const SEMIBOLD: &str = "semibold";

pub fn install(ctx: &egui::Context) {
    let mut fonts = egui::FontDefinitions::default();
    for (name, bytes) in [
        (
            "inter",
            &include_bytes!("../../assets/fonts/Inter-Regular.ttf")[..],
        ),
        (
            "inter-semibold",
            &include_bytes!("../../assets/fonts/Inter-SemiBold.ttf")[..],
        ),
        (
            "jetbrains-mono",
            &include_bytes!("../../assets/fonts/JetBrainsMono-Regular.ttf")[..],
        ),
        (
            "dshub-symbols",
            &include_bytes!("../../assets/fonts/DejaVuSans.ttf")[..],
        ),
    ] {
        fonts
            .font_data
            .insert(name.into(), egui::FontData::from_static(bytes).into());
    }
    // Bundled faces first; egui's defaults and DejaVu cover remaining symbols.
    let defaults =
        |family: egui::FontFamily| fonts.families.get(&family).cloned().unwrap_or_default();
    let proportional = defaults(egui::FontFamily::Proportional);
    let monospace = defaults(egui::FontFamily::Monospace);
    let chain = |first: &[&str], rest: &[String]| {
        first
            .iter()
            .map(|s| s.to_string())
            .chain(rest.iter().cloned())
            .chain(std::iter::once("dshub-symbols".to_string()))
            .collect::<Vec<_>>()
    };
    fonts.families.insert(
        egui::FontFamily::Proportional,
        chain(&["inter"], &proportional),
    );
    fonts.families.insert(
        egui::FontFamily::Monospace,
        chain(&["jetbrains-mono"], &monospace),
    );
    fonts.families.insert(
        egui::FontFamily::Name(SEMIBOLD.into()),
        chain(&["inter-semibold", "inter"], &proportional),
    );
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
                for family in [
                    egui::FontFamily::Proportional,
                    egui::FontFamily::Monospace,
                    egui::FontFamily::Name(SEMIBOLD.into()),
                ] {
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
