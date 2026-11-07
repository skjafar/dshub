//! DSHub visual theme: tonal surfaces, ghost borders, a restrained cyan accent
//! and a compact type scale (`.impeccable.md`, CLAUDE.md design direction).
use super::fonts::SEMIBOLD;
use eframe::egui::{
    self, epaint::Shadow, Color32, CornerRadius, FontFamily, FontId, Margin, Stroke, TextStyle,
};

/// Colour tokens for one theme. Surfaces step from the deepest well (inputs,
/// plot backgrounds) up to hovered controls; depth comes from tone, not shadow.
#[derive(Clone, Copy)]
pub struct Palette {
    /// Inputs, plot and table wells.
    pub well: Color32,
    /// Application background behind panes.
    pub base: Color32,
    /// Pane content and windows.
    pub surface: Color32,
    /// Cards, widgets and table stripes.
    pub raised: Color32,
    /// Resting controls.
    pub control: Color32,
    /// Hovered controls.
    pub hover: Color32,
    pub text: Color32,
    pub text_weak: Color32,
    pub accent: Color32,
    /// Separators and resting outlines.
    pub ghost: Color32,
    /// Outlines that must be noticed (focus, hover).
    pub ghost_strong: Color32,
}

const fn rgb(hex: u32) -> Color32 {
    Color32::from_rgb((hex >> 16) as u8, (hex >> 8) as u8, hex as u8)
}

pub const DARK: Palette = Palette {
    well: rgb(0x111214),
    base: rgb(0x151618),
    surface: rgb(0x1b1c1f),
    raised: rgb(0x222327),
    control: rgb(0x2a2c30),
    hover: rgb(0x34363b),
    text: rgb(0xe4e6e9),
    text_weak: rgb(0x9aa1ab),
    accent: rgb(0x5cd2dc),
    ghost: Color32::from_rgba_premultiplied(30, 32, 36, 38),
    ghost_strong: Color32::from_rgba_premultiplied(60, 64, 70, 70),
};

pub const LIGHT: Palette = Palette {
    well: rgb(0xffffff),
    base: rgb(0xeceef1),
    surface: rgb(0xf6f7f9),
    raised: rgb(0xeef0f3),
    control: rgb(0xe3e6ea),
    hover: rgb(0xd6dae0),
    text: rgb(0x1a1d21),
    text_weak: rgb(0x5a636e),
    accent: rgb(0x0e6973),
    ghost: Color32::from_rgba_premultiplied(0, 0, 0, 28),
    ghost_strong: Color32::from_rgba_premultiplied(0, 0, 0, 56),
};

pub fn palette(dark: bool) -> Palette {
    if dark {
        DARK
    } else {
        LIGHT
    }
}

/// The palette matching the current visuals.
pub fn of(ui: &egui::Ui) -> Palette {
    palette(ui.visuals().dark_mode)
}

/// Section labels: small, weak, uppercase.
pub fn caption(ui: &egui::Ui, text: &str) -> egui::RichText {
    egui::RichText::new(text.to_uppercase())
        .size(10.5)
        .color(of(ui).text_weak)
}

/// Applies the theme to every viewport sharing `ctx`.
pub fn apply(ctx: &egui::Context, dark: bool) {
    let p = palette(dark);
    let mut visuals = if dark {
        egui::Visuals::dark()
    } else {
        egui::Visuals::light()
    };
    let radius = CornerRadius::same(3);
    visuals.panel_fill = p.base;
    visuals.window_fill = p.surface;
    visuals.faint_bg_color = p.raised;
    visuals.extreme_bg_color = p.well;
    visuals.code_bg_color = p.raised;
    visuals.window_stroke = Stroke::new(1_f32, p.ghost_strong);
    visuals.window_corner_radius = CornerRadius::same(4);
    visuals.menu_corner_radius = CornerRadius::same(4);
    visuals.window_shadow = Shadow {
        offset: [0, 4],
        blur: 16,
        spread: 0,
        color: Color32::from_black_alpha(if dark { 90 } else { 30 }),
    };
    visuals.popup_shadow = Shadow {
        offset: [0, 2],
        blur: 8,
        spread: 0,
        color: Color32::from_black_alpha(if dark { 80 } else { 24 }),
    };
    visuals.selection.bg_fill = p.accent.gamma_multiply(if dark { 0.32 } else { 0.22 });
    visuals.selection.stroke = Stroke::new(1_f32, p.accent);
    visuals.hyperlink_color = p.accent;
    visuals.warn_fg_color = super::colors::rgb(dark, crate::model::Role::Warn);
    visuals.error_fg_color = super::colors::rgb(dark, crate::model::Role::Error);
    visuals.indent_has_left_vline = false;
    // Tables opt into stripes; key/value grids stay plain.
    visuals.striped = false;

    let w = &mut visuals.widgets;
    w.noninteractive.bg_fill = p.surface;
    w.noninteractive.weak_bg_fill = p.surface;
    w.noninteractive.bg_stroke = Stroke::new(1_f32, p.ghost);
    w.noninteractive.fg_stroke = Stroke::new(1_f32, p.text);
    w.inactive.bg_fill = p.control;
    w.inactive.weak_bg_fill = p.control;
    w.inactive.bg_stroke = Stroke::new(1_f32, p.ghost);
    w.inactive.fg_stroke = Stroke::new(1_f32, p.text);
    w.hovered.bg_fill = p.hover;
    w.hovered.weak_bg_fill = p.hover;
    w.hovered.bg_stroke = Stroke::new(1_f32, p.ghost_strong);
    w.hovered.fg_stroke = Stroke::new(1_f32, p.text);
    w.hovered.expansion = 0.;
    w.active.bg_fill = p.hover;
    w.active.weak_bg_fill = p.hover;
    w.active.bg_stroke = Stroke::new(1_f32, p.accent);
    w.active.fg_stroke = Stroke::new(1_f32, p.text);
    w.active.expansion = 0.;
    w.open.bg_fill = p.hover;
    w.open.weak_bg_fill = p.hover;
    w.open.bg_stroke = Stroke::new(1_f32, p.ghost_strong);
    w.open.fg_stroke = Stroke::new(1_f32, p.text);
    for v in [
        &mut w.noninteractive,
        &mut w.inactive,
        &mut w.hovered,
        &mut w.active,
        &mut w.open,
    ] {
        v.corner_radius = radius;
    }

    ctx.style_mut(|style| {
        style.visuals = visuals;
        style.text_styles = [
            (TextStyle::Small, FontId::new(11., FontFamily::Proportional)),
            (TextStyle::Body, FontId::new(13., FontFamily::Proportional)),
            (
                TextStyle::Button,
                FontId::new(13., FontFamily::Proportional),
            ),
            (
                TextStyle::Heading,
                FontId::new(16., FontFamily::Name(SEMIBOLD.into())),
            ),
            (
                TextStyle::Monospace,
                FontId::new(12.5, FontFamily::Monospace),
            ),
        ]
        .into();
        let s = &mut style.spacing;
        s.item_spacing = egui::vec2(8., 6.);
        s.button_padding = egui::vec2(8., 3.);
        s.interact_size = egui::vec2(36., 22.);
        s.window_margin = Margin::same(12);
        s.menu_margin = Margin::same(6);
        s.indent = 16.;
        s.combo_height = 280.;
        s.scroll = egui::style::ScrollStyle::thin();
    });
}

/// Draws a plot with grid lines and axis text in the weak text tone; egui_plot
/// derives both from the body text colour, which is too bright for a grid.
pub fn plot_tone<R>(ui: &mut egui::Ui, add: impl FnOnce(&mut egui::Ui) -> R) -> R {
    let weak = of(ui).text_weak;
    ui.scope(|ui| {
        ui.visuals_mut().override_text_color = Some(weak);
        add(ui)
    })
    .inner
}

/// Dock tab bars and pane bodies in the theme's tones: the active tab joins
/// its pane's surface, inactive tabs sit on the application background.
pub fn dock_style(ui: &egui::Ui) -> egui_dock::Style {
    let p = of(ui);
    let mut style = egui_dock::Style::from_egui(ui.style().as_ref());
    style.dock_area_padding = Some(Margin::same(4));
    style.main_surface_border_stroke = Stroke::NONE;
    style.separator.width = 1.;
    style.separator.extra_interact_width = 4.;
    style.separator.color_idle = p.ghost;
    style.separator.color_hovered = p.ghost_strong;
    style.separator.color_dragged = p.accent;
    style.tab_bar.bg_fill = p.base;
    style.tab_bar.height = 28.;
    style.tab_bar.hline_color = p.ghost;
    style.tab_bar.corner_radius = CornerRadius::ZERO;
    let tab = |bg: Color32, text: Color32, outline: Color32| egui_dock::TabInteractionStyle {
        outline_color: outline,
        corner_radius: CornerRadius {
            nw: 3,
            ne: 3,
            sw: 0,
            se: 0,
        },
        bg_fill: bg,
        text_color: text,
    };
    style.tab.active = tab(p.surface, p.text, p.ghost);
    style.tab.focused = tab(p.surface, p.text, p.ghost_strong);
    style.tab.hovered = tab(p.raised, p.text, Color32::TRANSPARENT);
    style.tab.inactive = tab(p.base, p.text_weak, Color32::TRANSPARENT);
    style.tab.active_with_kb_focus = style.tab.focused.clone();
    style.tab.focused_with_kb_focus = style.tab.focused.clone();
    style.tab.inactive_with_kb_focus = style.tab.hovered.clone();
    style.tab.hline_below_active_tab_name = false;
    style.tab.minimum_width = Some(72.);
    style.tab.tab_body.bg_fill = p.surface;
    style.tab.tab_body.stroke = Stroke::new(1_f32, p.ghost);
    style.tab.tab_body.corner_radius = CornerRadius {
        nw: 0,
        ne: 3,
        sw: 3,
        se: 3,
    };
    style.tab.tab_body.inner_margin = Margin::same(10);
    style.buttons.close_tab_color = p.text_weak;
    style.buttons.close_tab_active_color = p.text;
    style.buttons.close_tab_bg_fill = p.hover;
    style.overlay.selection_color = p.accent.gamma_multiply(0.35);
    style
}
