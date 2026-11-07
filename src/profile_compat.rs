//! Version-one Profile compatibility with the former desktop application.
use crate::model::*;
use serde_json::{json, Value};
fn binding(v: &Value, p: &Profile) -> Option<Binding> {
    if !v.is_object() {
        return None;
    }
    let space: Space = serde_json::from_value(v["space"].clone()).ok()?;
    let address = u16::try_from(v["address"].as_u64()?).ok()?;
    if v.get("snapshot").is_some_and(Value::is_null) {
        return Some(Binding {
            space,
            address,
            name: String::new(),
            data_type: DataType::Unknown,
            array_size: None,
        });
    }
    if let Some(snapshot) = v.get("snapshot").filter(|v| v.is_object()) {
        Some(Binding {
            space,
            address,
            name: snapshot["name"].as_str()?.into(),
            data_type: snapshot["type"].as_str()?.into(),
            array_size: snapshot["arraySize"].as_u64().map(|v| v as usize),
        })
    } else {
        p.entry_at(space, address).map(|e| Binding::new(space, &e))
    }
}
fn widget(v: &Value, p: &Profile, depth: usize) -> Option<Widget> {
    if depth > 8 {
        return None;
    }
    let kind = match v["kind"].as_str()? {
        "valueRead" => WidgetKind::ValueRead,
        "gauge" => WidgetKind::Gauge,
        "progressBar" => WidgetKind::ProgressBar,
        "encoderDisplay" => WidgetKind::EncoderDisplay,
        "ledIndicator" => WidgetKind::LedIndicator,
        "stateLED" => WidgetKind::StateLed,
        "statusMatrix" => WidgetKind::StatusMatrix,
        "button" => WidgetKind::Button,
        "dropdown" => WidgetKind::Dropdown,
        "valueWrite" => WidgetKind::ValueWrite,
        "directionalControl" => WidgetKind::DirectionalControl,
        "dataTable" => WidgetKind::DataTable,
        "alarmList" => WidgetKind::AlarmList,
        "deviceInfo" => WidgetKind::DeviceInfo,
        "container" => WidgetKind::Container,
        "miniPlot" => WidgetKind::MiniPlot,
        _ => return None,
    };
    let mut w = Widget::new(kind);
    let c = &v["config"];
    w.id = v["id"]
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(unique_id);
    w.label = c["label"].as_str().unwrap_or(kind.title()).into();
    w.binding = binding(&c["binding"], p);
    w.min = c["min"].as_f64().unwrap_or(0.);
    w.max = c["max"].as_f64().unwrap_or(100.);
    w.factor = c["conversionFactor"].as_f64().unwrap_or(1.);
    w.unit = c["unit"]
        .as_str()
        .or_else(|| c["primaryUnit"].as_str())
        .unwrap_or_default()
        .into();
    w.value = c
        .get("value")
        .map(|v| {
            v.as_str()
                .map(str::to_string)
                .unwrap_or_else(|| v.to_string())
        })
        .unwrap_or("0".into());
    w.format = serde_json::from_value(c["format"].clone()).unwrap_or_default();
    w.directions = serde_json::from_value(c["directions"].clone()).unwrap_or_default();
    w.on_value = c["onValue"].as_f64().unwrap_or(1.);
    w.on_label = c["onLabel"].as_str().unwrap_or("On").into();
    w.off_label = c["offLabel"].as_str().unwrap_or("Off").into();
    w.show_inactive = c["showInactive"].as_bool().unwrap_or(true);
    w.confirm = c["confirmationRequired"].as_bool().unwrap_or(false);
    w.decimals = c["decimals"].as_u64().unwrap_or(3).min(9) as usize;
    w.show_raw = c["showRawValue"].as_bool().unwrap_or(false);
    w.secondary_unit = c["secondaryUnit"].as_str().unwrap_or_default().into();
    w.vertical = c["orientation"] == "vertical";
    w.poll_ms = c["pollInterval"].as_u64().unwrap_or(250).max(50);
    w.time_span = c["timeSpan"].as_f64().unwrap_or(60.).clamp(1., 3600.);
    w.padding = c["padding"].as_f64().unwrap_or(8.) as f32;
    w.spacing = c["spacing"].as_f64().unwrap_or(8.) as f32;
    if c["target"]["kind"] == "command" {
        w.command = c["target"]["code"]
            .as_u64()
            .and_then(|v| u16::try_from(v).ok());
    } else if c["target"]["kind"] == "address" {
        w.binding = binding(&c["target"], p);
    }
    if let Some(values) = c["options"].as_array() {
        w.options = values
            .iter()
            .filter_map(|o| {
                Some(ValueLabel {
                    value: o.get("value")?.to_string(),
                    label: o["label"].as_str()?.into(),
                })
            })
            .collect();
    }
    if let Some(rules) = c["thresholds"].as_array() {
        w.thresholds = rules
            .iter()
            .filter_map(|r| {
                Some(Threshold {
                    op: r["comparator"].as_str()?.into(),
                    value: r["value"].as_f64()?,
                    role: r["role"].as_str()?.into(),
                    label: r["label"].as_str().unwrap_or_default().into(),
                })
            })
            .collect();
    }
    let rows = c["rows"].as_array().or_else(|| c["alarms"].as_array());
    if let Some(rows) = rows {
        w.rows = rows
            .iter()
            .filter_map(|r| binding(&r["binding"], p))
            .collect();
        for row in rows {
            if let Some(b) = binding(&row["binding"], p) {
                let thresholds = row["thresholds"]
                    .as_array()
                    .map(|rules| {
                        rules
                            .iter()
                            .filter_map(|r| {
                                Some(Threshold {
                                    op: r["comparator"].as_str()?.into(),
                                    value: r["value"].as_f64()?,
                                    role: r["role"].as_str()?.into(),
                                    label: r["label"].as_str().unwrap_or_default().into(),
                                })
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                w.row_styles.insert(
                    b.name.clone(),
                    RowStyle {
                        label: row["label"].as_str().unwrap_or(&b.name).into(),
                        format: serde_json::from_value(row["format"].clone()).unwrap_or_default(),
                        thresholds,
                    },
                );
            }
        }
    }
    if let Some(source) = c["series"].as_object() {
        w.binding = binding(
            &json!({"space":source.get("space"),"address":source.get("address"),"snapshot":source.get("snapshot")}),
            p,
        );
    }
    if let Some(children) = c["childWidgets"].as_array() {
        w.children = children
            .iter()
            .filter_map(|v| widget(v, p, depth + 1))
            .collect();
    }
    w.width = (v["layout"]["w"].as_f64().unwrap_or(3.) * 80.) as f32;
    w.height = (v["layout"]["h"].as_f64().unwrap_or(2.) * 60.) as f32;
    Some(w)
}
pub fn import_dashboards(value: &Value, p: &Profile) -> Vec<Dashboard> {
    value["dashboards"]
        .as_array()
        .map(|ds| {
            ds.iter()
                .filter_map(|d| {
                    Some(Dashboard {
                        id: d["id"]
                            .as_str()
                            .map(str::to_string)
                            .unwrap_or_else(unique_id),
                        name: d["name"].as_str()?.into(),
                        widgets: d["widgets"]
                            .as_array()?
                            .iter()
                            .filter_map(|v| widget(v, p, 0))
                            .collect(),
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}
fn export_binding(b: &Binding) -> Value {
    let mut snapshot = json!({"name":b.name,"type":b.data_type,"isArray":b.array_size.is_some()});
    if let Some(size) = b.array_size {
        snapshot["arraySize"] = json!(size);
    }
    json!({"space":b.space,"address":b.address,"snapshot":snapshot})
}
fn export_rules(rules: &[Threshold]) -> Vec<Value> {
    rules.iter().map(|r|json!({"id":unique_id(),"comparator":r.op,"value":r.value,"role":r.role,"label":r.label})).collect()
}
fn export_widgets(widgets: &[Widget]) -> Vec<Value> {
    let (mut x, mut y, mut row_height) = (0u32, 0u32, 0u32);
    widgets
        .iter()
        .map(|w| {
            let mut v = export_widget(w);
            let width = ((w.width / 80.).ceil() as u32).clamp(1, 12);
            let height = ((w.height / 60.).ceil() as u32).max(1);
            if x + width > 12 {
                x = 0;
                y += row_height;
                row_height = 0;
            }
            v["layout"] = json!({"x":x,"y":y,"w":width,"h":height});
            x += width;
            row_height = row_height.max(height);
            v
        })
        .collect()
}
fn export_widget(w: &Widget) -> Value {
    let kind = match w.kind {
        WidgetKind::ValueRead => "valueRead",
        WidgetKind::Gauge => "gauge",
        WidgetKind::ProgressBar => "progressBar",
        WidgetKind::EncoderDisplay => "encoderDisplay",
        WidgetKind::LedIndicator => "ledIndicator",
        WidgetKind::StateLed => "stateLED",
        WidgetKind::StatusMatrix => "statusMatrix",
        WidgetKind::Button => "button",
        WidgetKind::Dropdown => "dropdown",
        WidgetKind::ValueWrite => "valueWrite",
        WidgetKind::DirectionalControl => "directionalControl",
        WidgetKind::DataTable => "dataTable",
        WidgetKind::AlarmList => "alarmList",
        WidgetKind::DeviceInfo => "deviceInfo",
        WidgetKind::Container => "container",
        WidgetKind::MiniPlot => "miniPlot",
    };
    let thresholds = export_rules(&w.thresholds);
    let rows:Vec<_>=w.rows.iter().map(|b|{let style=w.row_styles.get(&b.name);json!({"label":style.map(|s|s.label.as_str()).unwrap_or(&b.name),"binding":export_binding(b),"format":style.map(|s|s.format).unwrap_or(w.format),"thresholds":style.map(|s|export_rules(&s.thresholds)).unwrap_or_else(||thresholds.clone())})}).collect();
    let target = if let Some(code) = w.command {
        json!({"kind":"command","code":code})
    } else if let Some(b) = &w.binding {
        let mut v = export_binding(b);
        v["kind"] = json!("address");
        v
    } else {
        Value::Null
    };
    let config = json!({"label":w.label,"binding":w.binding.as_ref().map(export_binding),"format":w.format,"thresholds":thresholds,"min":w.min,"max":w.max,"unit":w.unit,"conversionFactor":w.factor,"primaryUnit":w.unit,"secondaryUnit":w.secondary_unit,"showRawValue":w.show_raw,"decimals":w.decimals,"orientation":if w.vertical{"vertical"}else{"horizontal"},"target":target,"value":w.value.parse::<f64>().unwrap_or(0.),"options":w.options.iter().map(|o|json!({"value":o.value.parse::<f64>().unwrap_or(0.),"label":o.label})).collect::<Vec<_>>(),"confirmationRequired":w.confirm,"rows":rows,"alarms":rows,"showInactive":w.show_inactive,"onValue":w.on_value,"onLabel":w.on_label,"offLabel":w.off_label,"directions":w.directions,"layout":"8way","series":w.binding.as_ref().map(export_binding),"pollInterval":w.poll_ms,"timeSpan":w.time_span,"padding":w.padding,"spacing":w.spacing,"childWidgets":export_widgets(&w.children)});
    json!({"id":w.id,"kind":kind,"config":config,"layout":{"x":0,"y":0,"w":(w.width/80.).max(1.) as u32,"h":(w.height/60.).max(1.) as u32}})
}
pub fn export_dashboards(ds: &[Dashboard]) -> Value {
    json!({"dashboards":ds.iter().map(|d|json!({"id":d.id,"name":d.name,"widgets":export_widgets(&d.widgets)})).collect::<Vec<_>>()})
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn all_widget_kinds_roundtrip_through_the_version_one_dashboard_shape() {
        let mut p = default_profiles().remove(1);
        p.dashboards[0].widgets.clear();
        for kind in WidgetKind::ALL {
            let mut w = Widget::new(kind);
            w.binding = Some(Binding::new(
                Space::Register,
                &p.entries(Space::Register)[0],
            ));
            w.directions.push(DirectionTarget {
                direction: "up".into(),
                command: 20,
                label: "Jog X".into(),
            });
            w.rows.push(w.binding.clone().unwrap());
            p.dashboards[0].widgets.push(w);
        }
        let exported = export_dashboards(&p.dashboards);
        let imported = import_dashboards(&exported, &p);
        assert_eq!(imported[0].widgets.len(), 16);
        assert_eq!(imported[0].widgets[10].directions[0].command, 20);
        assert!(imported[0].widgets[15]
            .binding
            .as_ref()
            .unwrap()
            .matches(&p));
        assert!(
            exported["dashboards"][0]["widgets"][0]["config"]["binding"]["snapshot"]
                .get("arraySize")
                .is_none(),
            "optional snapshot members must be omitted instead of null for the original validator"
        );
        assert_ne!(
            exported["dashboards"][0]["widgets"][0]["layout"],
            exported["dashboards"][0]["widgets"][1]["layout"]
        );
    }
    #[test]
    fn an_explicitly_unknown_snapshot_is_not_implicitly_rebound() {
        let p = default_profiles().remove(1);
        let b = binding(&json!({"space":"register","address":0,"snapshot":null}), &p).unwrap();
        assert!(!b.matches(&p));
    }
}
