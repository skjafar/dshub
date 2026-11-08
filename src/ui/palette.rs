//! Command palette (Ctrl+K): open panes, jump to entries, send commands and
//! reach the application's windows from the keyboard.
use super::{theme, PaneKind};
use crate::model::*;
use eframe::egui::{self, RichText};

/// What a palette row does when chosen.
#[derive(Debug, Clone)]
pub enum Choice {
    Pane(PaneKind),
    Entry(Space, Entry),
    Command(SysCommand),
    Window(&'static str),
    Theme,
}

pub struct Item {
    pub label: String,
    pub detail: String,
    pub choice: Choice,
}

/// Every palette row for the active Profile.
pub fn items(profile: &Profile) -> Vec<Item> {
    let mut items = vec![];
    for kind in PaneKind::ALL {
        items.push(Item {
            label: format!("Open {}", kind.title()),
            detail: "Pane".into(),
            choice: Choice::Pane(kind),
        });
    }
    for (label, window) in [
        ("Preferences", "preferences"),
        ("Profiles", "profiles"),
        ("Workspaces", "workspaces"),
        ("Guide", "guide"),
    ] {
        items.push(Item {
            label: label.into(),
            detail: "Window".into(),
            choice: Choice::Window(window),
        });
    }
    items.push(Item {
        label: "Switch light / dark theme".into(),
        detail: "Appearance".into(),
        choice: Choice::Theme,
    });
    for s in Space::ALL {
        for e in profile.parsed(s).entries.iter() {
            items.push(Item {
                label: e.name.clone(),
                detail: format!("{} {}", s.title(), e.address),
                choice: Choice::Entry(s, e.clone()),
            });
        }
    }
    for c in profile.commands() {
        items.push(Item {
            label: format!("Send {}", c.name),
            detail: format!("Command {}", c.code),
            choice: Choice::Command(c),
        });
    }
    items
}

/// Rows matching every word of `query`, in their catalogue order.
pub fn filter<'a>(items: &'a [Item], query: &str) -> Vec<&'a Item> {
    let words: Vec<String> = query.split_whitespace().map(|w| w.to_lowercase()).collect();
    items
        .iter()
        .filter(|item| {
            let haystack = format!("{} {}", item.label, item.detail).to_lowercase();
            words.iter().all(|w| haystack.contains(w))
        })
        .collect()
}

/// Draws the palette; returns the chosen row, and whether it should close.
pub fn show(
    ctx: &egui::Context,
    query: &mut String,
    selected: &mut usize,
    profile: &Profile,
) -> (Option<Choice>, bool) {
    let items = items(profile);
    let matches = filter(&items, query);
    *selected = (*selected).min(matches.len().saturating_sub(1));
    let mut chosen = None;
    let (up, down, enter) = ctx.input_mut(|i| {
        (
            i.consume_key(egui::Modifiers::NONE, egui::Key::ArrowUp),
            i.consume_key(egui::Modifiers::NONE, egui::Key::ArrowDown),
            i.consume_key(egui::Modifiers::NONE, egui::Key::Enter),
        )
    });
    if up {
        *selected = selected.saturating_sub(1);
    }
    if down && *selected + 1 < matches.len() {
        *selected += 1;
    }
    if enter {
        chosen = matches.get(*selected).map(|item| item.choice.clone());
    }
    let response = egui::Modal::new(egui::Id::new("command-palette")).show(ctx, |ui| {
        ui.set_width(460.);
        let field = ui.add(
            egui::TextEdit::singleline(query)
                .hint_text("Type a pane, entry or command")
                .desired_width(f32::INFINITY),
        );
        field.request_focus();
        if field.changed() {
            *selected = 0;
        }
        ui.add_space(4.);
        let palette = theme::of(ui);
        egui::ScrollArea::vertical()
            .max_height(320.)
            .auto_shrink([false, true])
            .show_rows(ui, 24., matches.len(), |ui, range| {
                for i in range {
                    let item = matches[i];
                    let row = ui
                        .horizontal(|ui| {
                            let label = ui.selectable_label(i == *selected, &item.label);
                            ui.with_layout(
                                egui::Layout::right_to_left(egui::Align::Center),
                                |ui| {
                                    ui.label(
                                        RichText::new(&item.detail)
                                            .small()
                                            .color(palette.text_weak),
                                    );
                                },
                            );
                            label
                        })
                        .inner;
                    if i == *selected && (up || down) {
                        row.scroll_to_me(None);
                    }
                    if row.clicked() {
                        chosen = Some(item.choice.clone());
                    }
                }
            });
        if matches.is_empty() {
            ui.label(RichText::new("Nothing matches.").color(palette.text_weak));
        }
    });
    let close = chosen.is_some() || response.should_close();
    (chosen, close)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn palette_matches_every_word_across_label_and_detail() {
        let profile = default_profiles().remove(1);
        let items = items(&profile);
        let entry = &profile.parsed(Space::Register).entries[0];
        let query = format!("{} registers", entry.name.to_lowercase());
        let found = filter(&items, &query);
        assert!(found
            .iter()
            .any(|i| matches!(&i.choice, Choice::Entry(Space::Register, e) if e == entry)));
        assert!(filter(&items, "open plot")
            .iter()
            .any(|i| matches!(i.choice, Choice::Pane(PaneKind::Plot))));
        assert!(filter(&items, "no such thing at all").is_empty());
    }
}
