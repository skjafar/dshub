use super::{
    colors,
    session::{ImportTarget, Session},
};
use crate::model::*;
use eframe::egui;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Row {
    name: String,
    data_type: DataType,
    array: bool,
    count: usize,
    writable: bool,
}
pub fn rows(text: &str, space: Space) -> Result<Vec<Row>, Vec<String>> {
    Ok(parse_map(text, space)?
        .into_iter()
        .filter(|e| e.array_size.is_none() || e.name.ends_with("[0]"))
        .map(|e| Row {
            name: e.name.split('[').next().unwrap().into(),
            data_type: e.data_type,
            array: e.array_size.is_some(),
            count: e.array_size.unwrap_or(1),
            writable: e.writable,
        })
        .collect())
}
pub fn generate(rows: &[Row], space: Space) -> String {
    let mut text = String::new();
    let mut boundary = false;
    for row in rows {
        if space == Space::Register && row.writable && !boundary {
            text.push_str("// Read/Write\n");
            boundary = true;
        }
        text.push_str(&format!(
            "{} {}{};\n",
            row.data_type,
            row.name,
            if row.array {
                format!("[{}]", row.count)
            } else {
                String::new()
            }
        ));
    }
    text
}
pub fn show(
    ui: &mut egui::Ui,
    rows: &mut Vec<Row>,
    draft: &mut Profile,
    space: Space,
    session: &mut Session,
    pane: &str,
) {
    let target = ImportTarget::Map {
        pane: pane.to_string(),
        space,
    };
    if let Some(import) = session.take_import(&target) {
        match import
            .map_err(|e| vec![e])
            .and_then(|text| self::rows(&text, space))
        {
            Ok(imported) => *rows = imported,
            Err(errors) => session.notice = errors.join(" · "),
        }
    }
    let original = rows.clone();
    ui.horizontal_wrapped(|ui| {
        if ui.button("Add entry").clicked() {
            let mut n = 1;
            while rows.iter().any(|r| r.name == format!("NEW_ENTRY_{n}")) {
                n += 1;
            }
            rows.push(Row {
                name: format!("NEW_ENTRY_{n}"),
                data_type: DataType::Uint32,
                array: false,
                count: 1,
                writable: space == Space::Parameter
                    || (space == Space::Register && rows.last().is_some_and(|r| r.writable)),
            });
        }
        if ui.button("Import map / header").clicked() {
            session.pick_file(target.clone(), "Map or header", &["map", "h", "txt"]);
        }
        let text = generate(rows, space);
        let parsed = parsed_map(&text, space);
        let valid = parsed.errors.is_empty();
        if ui
            .add_enabled(valid, egui::Button::new("Export map"))
            .clicked()
        {
            session.export(text, "entries.map", "map");
        }
        if ui
            .add_enabled(valid, egui::Button::new("Export C header"))
            .clicked()
        {
            session.export(
                crate::map_files::header(&parsed.entries, space),
                "dshub_map.h",
                "h",
            );
        }
    });
    ui.weak("Addresses follow row order and array length. Read-only registers precede writable registers.");
    let mut remove = None;
    let mut movement = None;
    let mut address = 0usize;
    let len = rows.len();
    egui::ScrollArea::both()
        .id_salt("map-table")
        .show(ui, |ui| {
            egui::Grid::new("map-entries")
                .striped(true)
                .spacing(egui::vec2(10., 6.))
                .show(ui, |ui| {
                    for label in [
                        "Address",
                        "Name",
                        "Type",
                        "Array",
                        "Length",
                        "Access",
                        "Details",
                        "Order / Remove",
                    ] {
                        ui.strong(label);
                    }
                    ui.end_row();
                    for (index, row) in rows.iter_mut().enumerate() {
                        let row_top = ui.cursor().top();
                        ui.dnd_drag_source(ui.id().with(("map-row", index)), index, |ui| {
                            ui.monospace(format!("≡ {address}"));
                        });
                        address += if row.array { row.count } else { 1 };
                        let old_name = row.name.clone();
                        ui.add_sized([220., 22.], egui::TextEdit::singleline(&mut row.name));
                        egui::ComboBox::from_id_salt(("type", index))
                            .width(90.)
                            .selected_text(row.data_type)
                            .show_ui(ui, |ui| {
                                for ty in DataType::DECLARABLE {
                                    ui.selectable_value(&mut row.data_type, ty, ty);
                                }
                            });
                        ui.checkbox(&mut row.array, "");
                        ui.add_enabled(
                            row.array,
                            egui::DragValue::new(&mut row.count).range(1..=65536),
                        );
                        if space == Space::Register {
                            egui::ComboBox::from_id_salt(("access", index))
                                .width(100.)
                                .selected_text(if row.writable {
                                    "Read/write"
                                } else {
                                    "Read-only"
                                })
                                .show_ui(ui, |ui| {
                                    ui.selectable_value(&mut row.writable, false, "Read-only");
                                    ui.selectable_value(&mut row.writable, true, "Read/write");
                                });
                        } else {
                            ui.label(if space == Space::Parameter {
                                "Read/write"
                            } else {
                                "Read-only"
                            });
                        }
                        if space != Space::SysRegister {
                            let metadata = if space == Space::Register {
                                &mut draft.registers_metadata
                            } else {
                                &mut draft.parameters_metadata
                            };
                            if old_name != row.name && !metadata.contains_key(&row.name) {
                                if let Some(value) = metadata.remove(&old_name) {
                                    metadata.insert(row.name.clone(), value);
                                }
                            }
                            ui.push_id(("details", index), |ui| {
                                ui.menu_button("Details…", |ui| {
                                    let meta = metadata.entry(row.name.clone()).or_default();
                                    ui.label("Unit");
                                    ui.text_edit_singleline(&mut meta.unit);
                                    ui.label("Description");
                                    ui.text_edit_multiline(&mut meta.description);
                                    let mut delete = None;
                                    for (i, value) in meta.value_list.iter_mut().enumerate() {
                                        ui.horizontal(|ui| {
                                            ui.add(
                                                egui::TextEdit::singleline(&mut value.value)
                                                    .desired_width(60.)
                                                    .hint_text("Value"),
                                            );
                                            ui.add(
                                                egui::TextEdit::singleline(&mut value.label)
                                                    .desired_width(140.)
                                                    .hint_text("Label"),
                                            );
                                            if ui.small_button("×").clicked() {
                                                delete = Some(i);
                                            }
                                        });
                                    }
                                    if let Some(i) = delete {
                                        meta.value_list.remove(i);
                                    }
                                    if ui.button("Add value label").clicked() {
                                        meta.value_list.push(ValueLabel {
                                            value: "0".into(),
                                            label: String::new(),
                                        });
                                    }
                                });
                            });
                        } else {
                            ui.weak("Protocol");
                        }
                        ui.horizontal(|ui| {
                            if ui.add_enabled(index > 0, egui::Button::new("Up")).clicked() {
                                movement = Some((index, index - 1));
                            }
                            if ui
                                .add_enabled(index + 1 < len, egui::Button::new("Down"))
                                .clicked()
                            {
                                movement = Some((index, index + 1));
                            }
                            if ui.small_button("Remove").clicked() {
                                remove = Some(index);
                            }
                        });
                        let row_rect = egui::Rect::from_min_max(
                            egui::pos2(ui.min_rect().left(), row_top),
                            egui::pos2(ui.min_rect().right(), ui.min_rect().bottom()),
                        );
                        let response = ui.interact(
                            row_rect,
                            ui.id().with(("row-drop", index)),
                            egui::Sense::hover(),
                        );
                        if let Some(source) = response.dnd_hover_payload::<usize>() {
                            if *source < original.len()
                                && original[*source].writable == row.writable
                                && *source != index
                            {
                                let y = if *source < index {
                                    row_rect.bottom()
                                } else {
                                    row_rect.top()
                                };
                                ui.painter().line_segment(
                                    [
                                        egui::pos2(row_rect.left(), y),
                                        egui::pos2(row_rect.right(), y),
                                    ],
                                    egui::Stroke::new(2_f32, colors::role(ui, Role::Accent)),
                                );
                                if response.dnd_release_payload::<usize>().is_some() {
                                    movement = Some((*source, index));
                                }
                            }
                        }
                        ui.end_row();
                    }
                });
        });
    if let Some(i) = remove {
        rows.remove(i);
    }
    if let Some((a, b)) = movement {
        move_row(rows, a, b);
    }
    if space == Space::Register {
        rows.sort_by_key(|r| r.writable);
    }
    if *rows != original {
        *draft.map_mut(space) = generate(rows, space);
    }
    let parsed = draft.parsed(space);
    if parsed.errors.is_empty() {
        ui.weak(format!(
            "{} rows · {} addresses",
            rows.len(),
            parsed.entries.len()
        ));
    }
    for error in &parsed.errors {
        ui.colored_label(colors::role(ui, Role::Error), error);
    }
}

fn move_row(rows: &mut Vec<Row>, from: usize, to: usize) {
    if from < rows.len() && to < rows.len() && rows[from].writable == rows[to].writable {
        let row = rows.remove(from);
        rows.insert(to, row);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn table_edits_generate_maps_and_headers_with_arrays_and_access() {
        let mut table = rows(
            "uint32_t FLAGS;\n// Read/Write\nfloat AXIS[3];",
            Space::Register,
        )
        .unwrap();
        assert_eq!(table.len(), 2);
        table[1].name = "POSITION".into();
        table[1].count = 4;
        table[0].data_type = DataType::Int32;
        let map = generate(&table, Space::Register);
        let entries = parse_map(&map, Space::Register).unwrap();
        assert_eq!(entries.len(), 5);
        assert!(!entries[0].writable);
        assert!(entries[1].writable);
        assert_eq!(entries[4].name, "POSITION[3]");
        assert_eq!(entries[4].address, 4);
        let header = crate::map_files::header(&entries, Space::Register);
        assert!(header.contains("float POSITION[4];"));
        assert_eq!(parse_map(&header, Space::Register).unwrap().len(), 5);
        table[1].name = "FLAGS".into();
        assert!(parse_map(&generate(&table, Space::Register), Space::Register).is_err());
    }
}

#[cfg(test)]
mod reorder_tests {
    use super::*;
    #[test]
    fn refinement_map_reordering_cannot_cross_access_boundary() {
        let mut table = rows(
            "uint32_t INPUT;\n// Read/Write\nuint32_t OUTPUT;",
            Space::Register,
        )
        .unwrap();
        let before = generate(&table, Space::Register);
        move_row(&mut table, 0, 1);
        assert_eq!(generate(&table, Space::Register), before);
    }
}
