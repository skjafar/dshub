use crate::model::{Widget, WidgetKind};
use eframe::egui::{self, Pos2, Rect, Vec2};

pub const FRAME: &str = "dshub-canvas-frame";
#[derive(Clone, Default)]
pub struct Frame {
    pub groups: Vec<Group>,
    pub containers: Vec<(String, Rect, usize)>,
    pub drag: Option<Drag>,
    pub dropped: bool,
    pub resize: Option<(String, Option<String>, Rect)>,
    pub resize_released: bool,
}
#[derive(Clone)]
pub struct Group {
    pub parent: Option<String>,
    pub origin: Pos2,
    pub width: f32,
}
#[derive(Clone)]
pub struct Drag {
    pub id: String,
    pub parent: Option<String>,
    pub rect: Rect,
    pub start: Vec2,
}
pub fn find<'a>(widgets: &'a [Widget], id: &str) -> Option<&'a Widget> {
    for w in widgets {
        if w.id == id {
            return Some(w);
        }
        if let Some(found) = find(&w.children, id) {
            return Some(found);
        }
    }
    None
}
fn take(widgets: &mut Vec<Widget>, id: &str) -> Option<Widget> {
    if let Some(i) = widgets.iter().position(|w| w.id == id) {
        return Some(widgets.remove(i));
    }
    for w in widgets {
        if let Some(found) = take(&mut w.children, id) {
            return Some(found);
        }
    }
    None
}
fn destination<'a>(widgets: &'a mut Vec<Widget>, id: Option<&str>) -> Option<&'a mut Vec<Widget>> {
    let Some(id) = id else {
        return Some(widgets);
    };
    for w in widgets {
        if w.id == id && w.kind == WidgetKind::Container {
            return Some(&mut w.children);
        }
        if let Some(found) = destination(&mut w.children, Some(id)) {
            return Some(found);
        }
    }
    None
}
pub fn target(frame: &Frame, widgets: &[Widget], pointer: Pos2) -> Option<String> {
    let dragged = frame.drag.as_ref().and_then(|d| find(widgets, &d.id));
    frame
        .containers
        .iter()
        .filter(|(id, rect, depth)| {
            *depth < 8
                && rect.shrink(16.).contains(pointer)
                && !dragged.is_some_and(|w| w.id == *id || find(&w.children, id).is_some())
        })
        .max_by_key(|(_, _, depth)| *depth)
        .map(|(id, _, _)| id.clone())
}
pub fn transfer(widgets: &mut Vec<Widget>, id: &str, parent: Option<&str>, position: Vec2) -> bool {
    let Some(w) = find(widgets, id) else {
        return false;
    };
    if parent.is_some_and(|p| p == id || find(&w.children, p).is_some()) {
        return false;
    }
    if parent.is_some_and(|p| !find(widgets, p).is_some_and(|w| w.kind == WidgetKind::Container)) {
        return false;
    }
    let mut w = take(widgets, id).unwrap();
    w.position = Some([position.x.max(0.), position.y.max(0.)]);
    destination(widgets, parent).unwrap().push(w);
    true
}
#[derive(Debug)]
pub struct DropPlan {
    pub position: Vec2,
    pub line: Option<[Pos2; 2]>,
    pub shifts: Vec<(String, [f32; 2])>,
    pub valid: bool,
}
/// Preview only: neighbors remain fixed until a valid release is committed.
pub fn plan(
    widgets: &[Widget],
    id: &str,
    parent: Option<&str>,
    pointer: Pos2,
    desired: Vec2,
    width: f32,
) -> DropPlan {
    let moving = find(widgets, id).expect("dragged widget exists");
    let siblings = parent
        .and_then(|p| find(widgets, p))
        .map_or(widgets, |p| &p.children);
    let mut result = DropPlan {
        position: desired.max(Vec2::ZERO),
        line: None,
        shifts: vec![],
        valid: true,
    };
    let anchor = siblings
        .iter()
        .filter(|w| w.id != id && w.position.is_some())
        .filter(|w| rect(w).distance_sq_to_pos(pointer) <= 24. * 24.)
        .min_by(|a, b| {
            rect(a)
                .distance_sq_to_pos(pointer)
                .total_cmp(&rect(b).distance_sq_to_pos(pointer))
        });
    let mut above = false;
    let mut side = None;
    if let Some(anchor) = anchor {
        let r = rect(anchor);
        let distances = [
            (pointer.y - r.top()).abs(),
            (pointer.x - r.left()).abs(),
            (pointer.x - r.right()).abs(),
            (pointer.y - r.bottom()).abs(),
        ];
        let edge = (0..4)
            .min_by(|a, b| distances[*a].total_cmp(&distances[*b]))
            .unwrap();
        match edge {
            0 => {
                result.position = r.min.to_vec2();
                result.line = Some([r.left_top(), r.right_top()]);
                above = true;
            }
            1 => {
                side = Some((r, 1));
                result.position = Vec2::new(r.left() - moving.width - 8., r.top());
                result.line = Some([r.left_top(), r.left_bottom()]);
            }
            2 => {
                side = Some((r, 2));
                result.position = Vec2::new(r.right() + 8., r.top());
                result.line = Some([r.right_top(), r.right_bottom()]);
            }
            _ => {
                result.position = Vec2::new(r.left(), r.bottom() + 8.);
                result.line = Some([r.left_bottom(), r.right_bottom()]);
            }
        }
    }
    let placed = Rect::from_min_size(
        result.position.to_pos2(),
        Vec2::new(moving.width, moving.height),
    );
    result.valid = result.position.x >= 0. && result.position.y >= 0. && placed.right() <= width;
    for sibling in siblings
        .iter()
        .filter(|w| w.id != id && w.position.is_some())
    {
        let r = rect(sibling);
        let shares_column = r.right() + 7. > placed.left() && r.left() - 7. < placed.right();
        if above && shares_column && r.top() >= placed.top() {
            result
                .shifts
                .push((sibling.id.clone(), [r.left(), r.top() + moving.height + 8.]));
        } else if r.expand(3.5).intersects(placed.expand(3.5)) {
            result.valid = false;
        }
    }
    // A shifted wide item may meet another column; reject instead of moving that column.
    for (shifted_id, pos) in &result.shifts {
        let w = find(siblings, shifted_id).unwrap();
        let shifted = Rect::from_min_size(Pos2::new(pos[0], pos[1]), Vec2::new(w.width, w.height));
        for other in siblings
            .iter()
            .filter(|w| w.id != id && w.id != *shifted_id)
        {
            let other_rect =
                if let Some((_, p)) = result.shifts.iter().find(|(id, _)| id == &other.id) {
                    Rect::from_min_size(Pos2::new(p[0], p[1]), Vec2::new(other.width, other.height))
                } else {
                    rect(other)
                };
            if shifted.expand(3.5).intersects(other_rect.expand(3.5)) {
                result.valid = false;
            }
        }
    }
    if !result.valid {
        if let Some((anchor, edge)) = side {
            let alternate = Vec2::new(
                if edge == 1 {
                    anchor.left()
                } else {
                    anchor.right() - moving.width
                },
                anchor.top(),
            );
            for position in [result.position, alternate] {
                let placed =
                    Rect::from_min_size(position.to_pos2(), Vec2::new(moving.width, moving.height));
                if placed.left() < 0. || placed.right() > width {
                    continue;
                }
                let conflicts: Vec<_> = siblings
                    .iter()
                    .filter(|w| w.id != id && rect(w).expand(3.5).intersects(placed.expand(3.5)))
                    .collect();
                if conflicts.len() != 1 {
                    continue;
                }
                let neighbor = conflicts[0];
                let r = rect(neighbor);
                let options = if edge == 1 {
                    [placed.left() - r.width() - 8., placed.right() + 8.]
                } else {
                    [placed.right() + 8., placed.left() - r.width() - 8.]
                };
                for x in options {
                    let shifted = Rect::from_min_size(Pos2::new(x, r.top()), r.size());
                    if shifted.left() < 0. || shifted.right() > width {
                        continue;
                    }
                    if siblings.iter().any(|w| {
                        w.id != id
                            && w.id != neighbor.id
                            && rect(w).expand(3.5).intersects(shifted.expand(3.5))
                    }) {
                        continue;
                    }
                    result.position = position;
                    result.shifts = vec![(neighbor.id.clone(), [x, r.top()])];
                    result.valid = true;
                    return result;
                }
            }
        }
    }
    result
}
pub fn commit(widgets: &mut Vec<Widget>, id: &str, parent: Option<&str>, plan: &DropPlan) -> bool {
    if !plan.valid || !transfer(widgets, id, parent, plan.position) {
        return false;
    }
    let siblings = destination(widgets, parent).unwrap();
    for (id, position) in &plan.shifts {
        if let Some(w) = siblings.iter_mut().find(|w| &w.id == id) {
            w.position = Some(*position);
        }
    }
    true
}
pub fn restore(widgets: &mut Vec<Widget>, drag: &Drag) {
    if let Some(siblings) = destination(widgets, drag.parent.as_deref()) {
        if let Some(w) = siblings.iter_mut().find(|w| w.id == drag.id) {
            w.position = Some([drag.start.x, drag.start.y]);
        }
    }
}
fn rect(w: &Widget) -> Rect {
    let [x, y] = w.position.unwrap_or([0., 0.]);
    Rect::from_min_size(Pos2::new(x, y), Vec2::new(w.width, w.height))
}
/// The active item occupies its requested slot; intersecting siblings cascade down.
/// Children only collide with siblings, never with their own containing frame.
pub fn settle(widgets: &mut [Widget], priority: Option<&str>, skip: Option<&str>) {
    let mut order: Vec<_> = (0..widgets.len())
        .filter(|i| widgets[*i].position.is_some() && Some(widgets[*i].id.as_str()) != skip)
        .collect();
    order.sort_by(|a, b| {
        let a = &widgets[*a];
        let b = &widgets[*b];
        (Some(a.id.as_str()) != priority)
            .cmp(&(Some(b.id.as_str()) != priority))
            .then_with(|| rect(a).top().total_cmp(&rect(b).top()))
    });
    let mut placed: Vec<Rect> = vec![];
    for i in order {
        let w = &mut widgets[i];
        let mut r = rect(w);
        r = Rect::from_min_size(r.min.max(Pos2::ZERO), r.size());
        loop {
            let bottom = placed
                .iter()
                .filter(|p| p.expand(3.5).intersects(r.expand(3.5)))
                .map(|p| p.bottom() + 8.)
                .max_by(f32::total_cmp);
            let Some(y) = bottom else {
                break;
            };
            r = Rect::from_min_size(Pos2::new(r.left(), y), r.size());
        }
        w.position = Some([r.left(), r.top()]);
        placed.push(r);
    }
    for w in widgets {
        settle(&mut w.children, priority, skip);
    }
}
/// Resolve only intersecting siblings, choosing the smallest free axial displacement.
/// If no bounded placement exists, restore the resized item instead of disturbing the layout.
pub fn finish_resize(
    widgets: &mut Vec<Widget>,
    id: &str,
    parent: Option<&str>,
    width: f32,
    before: Rect,
) -> bool {
    let Some(siblings) = destination(widgets, parent) else {
        return false;
    };
    let Some(index) = siblings.iter().position(|w| w.id == id) else {
        return false;
    };
    let resized = rect(&siblings[index]);
    let mut positions: Vec<_> = siblings.iter().map(rect).collect();
    let mut valid = resized.left() >= 0. && resized.right() <= width;
    for i in 0..siblings.len() {
        if i == index || !positions[i].expand(3.5).intersects(resized.expand(3.5)) {
            continue;
        }
        let r = positions[i];
        let mut candidates = [
            Vec2::new(resized.left() - r.right() - 8., 0.),
            Vec2::new(resized.right() - r.left() + 8., 0.),
            Vec2::new(0., resized.top() - r.bottom() - 8.),
            Vec2::new(0., resized.bottom() - r.top() + 8.),
        ];
        candidates.sort_by(|a, b| a.length_sq().total_cmp(&b.length_sq()));
        if let Some(candidate) =
            candidates
                .into_iter()
                .map(|delta| r.translate(delta))
                .find(|candidate| {
                    candidate.left() >= 0.
                        && candidate.top() >= 0.
                        && candidate.right() <= width
                        && !positions.iter().enumerate().any(|(j, other)| {
                            j != i && candidate.expand(3.5).intersects(other.expand(3.5))
                        })
                })
        {
            positions[i] = candidate;
        } else {
            valid = false;
            break;
        }
    }
    if valid {
        for (w, r) in siblings.iter_mut().zip(positions) {
            w.position = Some([r.left(), r.top()]);
        }
    } else {
        let w = &mut siblings[index];
        w.position = Some([before.left(), before.top()]);
        w.width = before.width();
        w.height = before.height();
    }
    valid
}
/// Whether `id` is the widget being dragged this frame. Reads the frame in
/// place; cloning it per widget made dashboard frames quadratic in size.
pub fn is_dragging(ctx: &egui::Context, id: &str) -> bool {
    let mut dragging = false;
    with_frame(ctx, |frame| {
        dragging = frame.drag.as_ref().is_some_and(|drag| drag.id == id);
    });
    dragging
}

pub fn with_frame(ctx: &egui::Context, f: impl FnOnce(&mut Frame)) {
    ctx.data_mut(|d| {
        let frame = d.get_temp_mut_or_default::<Frame>(egui::Id::new(FRAME));
        f(frame);
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    fn item(kind: WidgetKind, id: &str, x: f32, y: f32) -> Widget {
        let mut w = Widget::new(kind);
        w.id = id.into();
        w.width = 120.;
        w.height = 60.;
        w.position = Some([x, y]);
        w
    }
    #[test]
    fn insertion_pushes_siblings_and_containers_without_overlap() {
        let mut items = vec![
            item(WidgetKind::Container, "a", 0., 0.),
            item(WidgetKind::Container, "b", 0., 30.),
            item(WidgetKind::ValueRead, "c", 0., 90.),
        ];
        settle(&mut items, Some("b"), None);
        assert_eq!(items[1].position, Some([0., 30.]));
        for a in 0..items.len() {
            for b in a + 1..items.len() {
                assert!(!rect(&items[a]).intersects(rect(&items[b])));
            }
        }
        let positions: Vec<_> = items.iter().map(|w| w.position).collect();
        settle(&mut items, Some("b"), None);
        assert_eq!(
            positions,
            items.iter().map(|w| w.position).collect::<Vec<_>>()
        );
    }
    #[test]
    fn transfer_between_containers_and_back_preserves_widget_and_prevents_cycles() {
        let mut items = vec![
            item(WidgetKind::Container, "a", 0., 0.),
            item(WidgetKind::Container, "b", 200., 0.),
        ];
        items[0]
            .children
            .push(item(WidgetKind::Button, "child", 0., 0.));
        assert!(transfer(
            &mut items,
            "child",
            Some("b"),
            Vec2::new(10., 20.)
        ));
        assert!(items[0].children.is_empty());
        assert_eq!(items[1].children[0].id, "child");
        assert!(!transfer(&mut items, "b", Some("child"), Vec2::ZERO));
        assert!(transfer(&mut items, "child", None, Vec2::new(400., 0.)));
        assert!(items[1].children.is_empty());
        assert_eq!(items[2].id, "child");
    }
}

#[cfg(test)]
mod insertion_tests {
    use super::*;
    fn widget(id: &str, x: f32, y: f32) -> Widget {
        let mut w = Widget::new(WidgetKind::Container);
        w.id = id.into();
        w.width = 120.;
        w.height = 60.;
        w.position = Some([x, y]);
        w
    }
    #[test]
    fn previews_do_not_move_neighbors_and_only_above_commit_pushes_down() {
        let mut items = vec![
            widget("a", 0., 0.),
            widget("b", 0., 100.),
            widget("moving", 200., 200.),
        ];
        let preview = plan(
            &items,
            "moving",
            None,
            Pos2::new(60., 101.),
            Vec2::new(0., 100.),
            400.,
        );
        assert!(preview.valid);
        assert_eq!(items[1].position, Some([0., 100.]));
        assert!(commit(&mut items, "moving", None, &preview));
        assert_eq!(find(&items, "a").unwrap().position, Some([0., 0.]));
        assert_eq!(find(&items, "b").unwrap().position, Some([0., 168.]));
        assert_eq!(find(&items, "moving").unwrap().position, Some([0., 100.]));
    }
    #[test]
    fn blocked_side_insert_resists_without_displacing_items() {
        let mut items = vec![
            widget("a", 0., 0.),
            widget("b", 128., 0.),
            widget("moving", 0., 200.),
        ];
        let preview = plan(
            &items,
            "moving",
            None,
            Pos2::new(119., 30.),
            Vec2::ZERO,
            248.,
        );
        assert!(!preview.valid);
        assert!(!commit(&mut items, "moving", None, &preview));
        assert_eq!(items[0].position, Some([0., 0.]));
        assert_eq!(items[1].position, Some([128., 0.]));
        let left = plan(&items, "moving", None, Pos2::new(1., 30.), Vec2::ZERO, 248.);
        assert!(!left.valid, "left edge must resist insertion");
    }
    #[test]
    fn free_side_insert_keeps_neighbors_fixed() {
        let mut items = vec![widget("a", 0., 0.), widget("moving", 0., 200.)];
        let preview = plan(
            &items,
            "moving",
            None,
            Pos2::new(119., 30.),
            Vec2::ZERO,
            400.,
        );
        assert!(preview.valid);
        assert!(preview.shifts.is_empty());
        assert!(commit(&mut items, "moving", None, &preview));
        assert_eq!(find(&items, "a").unwrap().position, Some([0., 0.]));
        assert_eq!(find(&items, "moving").unwrap().position, Some([128., 0.]));
    }
}

#[cfg(test)]
mod side_insertion_tests {
    use super::*;
    #[test]
    fn insertion_moves_only_the_neighbor_that_has_side_space() {
        for (left, right, width, shifted_id, expected_x) in [
            (0., 128., 400., "right", 256.),
            (128., 256., 376., "left", 0.),
        ] {
            let mut items: Vec<_> = [
                ("left", left, 0.),
                ("right", right, 0.),
                ("moving", 0., 200.),
            ]
            .into_iter()
            .map(|(id, x, y)| {
                let mut w = Widget::new(WidgetKind::Container);
                w.id = id.into();
                w.width = 120.;
                w.height = 60.;
                w.position = Some([x, y]);
                w
            })
            .collect();
            let preview = plan(
                &items,
                "moving",
                None,
                Pos2::new(left + 119., 30.),
                Vec2::ZERO,
                width,
            );
            assert!(preview.valid);
            assert_eq!(preview.shifts, vec![(shifted_id.into(), [expected_x, 0.])]);
            assert_eq!(items[0].position, Some([left, 0.]));
            assert_eq!(items[1].position, Some([right, 0.]));
            assert!(commit(&mut items, "moving", None, &preview));
            assert_eq!(
                find(&items, shifted_id).unwrap().position,
                Some([expected_x, 0.])
            );
        }
    }
}

#[cfg(test)]
mod resize_tests {
    use super::*;
    #[test]
    fn resize_moves_neighbor_only_by_required_distance_on_either_axis() {
        for vertical in [false, true] {
            let mut a = Widget::new(WidgetKind::Container);
            a.id = "a".into();
            a.position = Some([0., 0.]);
            a.width = 120.;
            a.height = 60.;
            let before = rect(&a);
            let mut b = a.clone();
            b.id = "b".into();
            b.position = Some(if vertical { [0., 68.] } else { [128., 0.] });
            if vertical {
                a.height += 20.;
            } else {
                a.width += 20.;
            }
            let mut items = vec![a, b];
            assert!(finish_resize(&mut items, "a", None, 400., before));
            assert_eq!(
                items[1].position,
                Some(if vertical { [0., 88.] } else { [148., 0.] })
            );
        }
    }
}

/// A narrow magnetic band, evaluated against unsnapped pointer geometry.
pub fn soft_snap(raw: f32, targets: impl Iterator<Item = f32>) -> f32 {
    targets
        .filter(|t| t.is_finite() && (*t - raw).abs() <= 8.)
        .min_by(|a, b| (a - raw).abs().total_cmp(&(b - raw).abs()))
        .unwrap_or(raw)
}

#[cfg(test)]
mod snap_tests {
    use super::*;
    #[test]
    fn refinement_soft_snap_can_be_overridden() {
        assert_eq!(soft_snap(195., [200., 300.].into_iter()), 200.);
        assert_eq!(soft_snap(205., [200., 300.].into_iter()), 200.);
        assert_eq!(soft_snap(211., [200., 300.].into_iter()), 211.);
    }
}
