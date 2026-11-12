use eframe::egui;

pub const LICENSE: &str = concat!(
    "Inter\n\n",
    include_str!("../../assets/fonts/LICENSE-Inter.txt"),
    "\n\nJetBrains Mono\n\n",
    include_str!("../../assets/fonts/LICENSE-JetBrainsMono.txt"),
    "\n\nDejaVu\n\n",
    include_str!("../../assets/fonts/LICENSE-DejaVu.txt"),
    "\n\nPhosphor Icons\n\nMIT License. Copyright (c) 2023 Phosphor Icons.\n",
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
    fonts.font_data.insert(
        "phosphor".into(),
        egui_phosphor::Variant::Regular.font_data().into(),
    );
    // Bundled faces first, then the icon font (private-use code points only);
    // egui's defaults and DejaVu cover remaining symbols.
    let defaults =
        |family: egui::FontFamily| fonts.families.get(&family).cloned().unwrap_or_default();
    let proportional = defaults(egui::FontFamily::Proportional);
    let monospace = defaults(egui::FontFamily::Monospace);
    let chain = |first: &[&str], rest: &[String]| {
        first
            .iter()
            .map(|s| s.to_string())
            .chain(std::iter::once("phosphor".to_string()))
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
        ctx.run_ui(Default::default(), |ui| {
            ui.ctx().fonts_mut(|fonts| {
                for family in [
                    egui::FontFamily::Proportional,
                    egui::FontFamily::Monospace,
                    egui::FontFamily::Name(SEMIBOLD.into()),
                ] {
                    let id = egui::FontId::new(16., family);
                    let icons = [
                        super::super::icons::CLOSE,
                        super::super::icons::WARNING,
                        super::super::icons::DRAG,
                        super::super::icons::GEAR,
                        super::super::icons::CHECK,
                        super::super::icons::INFO,
                        egui_phosphor::regular::ARROW_UP_LEFT,
                    ]
                    .concat();
                    for symbol in "●○×−—…·\u{2009}".chars().chain(icons.chars()) {
                        assert!(
                            fonts.has_glyph(&id, symbol),
                            "Missing glyph: {symbol} in {:?}",
                            id.family
                        );
                    }
                }
            });
        })
        .drop_without_applying_deltas();
    }
}
