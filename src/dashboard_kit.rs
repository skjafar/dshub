//! Layout for bundled dashboards: widgets sized to their content and arranged
//! in rows, columns and titled groups on a regular grid, so panels line up
//! without hand-placed coordinates.
use crate::model::*;

/// Space between widgets inside a group.
pub const GAP: f32 = 12.;
/// Space between groups on the canvas.
pub const SECTION: f32 = 16.;
/// A group's padding around its widgets.
pub const PADDING: f32 = 12.;
/// A group's title row.
pub const HEADER: f32 = 40.;
/// The narrowest widget the canvas keeps.
pub const MIN_WIDTH: f32 = 120.;
/// One title row on a widget.
const TITLE: f32 = 30.;

/// Laid-out widgets with positions relative to the block's top left.
#[derive(Debug, Clone, Default)]
pub struct Block {
    pub widgets: Vec<Widget>,
    pub width: f32,
    pub height: f32,
}
impl Block {
    /// One widget at `width`, as tall as its content needs.
    pub fn fit(w: Widget, width: f32) -> Self {
        let height = height(&w, width);
        Self::sized(w, width, height)
    }
    pub fn sized(mut w: Widget, width: f32, height: f32) -> Self {
        // The canvas widens anything narrower, which would overlap neighbours.
        assert!(width >= MIN_WIDTH, "{} narrower than {MIN_WIDTH}", w.label);
        w.width = width;
        w.height = height;
        w.position = Some([0., 0.]);
        Self {
            widgets: vec![w],
            width,
            height,
        }
    }
    /// Empty space, for alignment.
    pub fn space(width: f32, height: f32) -> Self {
        Self {
            widgets: vec![],
            width,
            height,
        }
    }
    fn shifted(self, dx: f32, dy: f32) -> impl Iterator<Item = Widget> {
        self.widgets.into_iter().map(move |mut w| {
            let [x, y] = w.position.unwrap_or([0., 0.]);
            w.position = Some([x + dx, y + dy]);
            w
        })
    }
    /// A block that is one group fills the space it is given.
    fn stretch(&mut self, width: Option<f32>, height: Option<f32>) {
        if let [w] = self.widgets.as_mut_slice() {
            if w.kind == WidgetKind::Container {
                if let Some(width) = width {
                    w.width = width;
                    self.width = width;
                }
                if let Some(height) = height {
                    w.height = height;
                    self.height = height;
                }
            }
        }
    }
    /// The widgets, placed at the canvas origin.
    pub fn into_widgets(self) -> Vec<Widget> {
        self.widgets
    }
}

/// Blocks side by side; groups take the row's height.
pub fn row(blocks: Vec<Block>, gap: f32) -> Block {
    let height = blocks.iter().map(|b| b.height).fold(0., f32::max);
    let mut out = Block::default();
    let mut x = 0.;
    for mut b in blocks {
        b.stretch(None, Some(height));
        let width = b.width;
        out.widgets.extend(b.shifted(x, 0.));
        x += width + gap;
    }
    out.width = (x - gap).max(0.);
    out.height = height;
    out
}
/// Blocks stacked; groups take the column's width.
pub fn column(blocks: Vec<Block>, gap: f32) -> Block {
    let width = blocks.iter().map(|b| b.width).fold(0., f32::max);
    let mut out = Block::default();
    let mut y = 0.;
    for mut b in blocks {
        b.stretch(Some(width), None);
        let height = b.height;
        out.widgets.extend(b.shifted(0., y));
        y += height + gap;
    }
    out.width = width;
    out.height = (y - gap).max(0.);
    out
}
/// Blocks in rows of `columns`.
pub fn grid(blocks: Vec<Block>, columns: usize, gap: f32) -> Block {
    let mut rows = vec![];
    let mut blocks = blocks.into_iter().peekable();
    while blocks.peek().is_some() {
        rows.push(row(blocks.by_ref().take(columns).collect(), gap));
    }
    column(rows, gap)
}
/// The width of `n` of `of` equal columns across `width`.
pub fn span(width: f32, of: usize, n: usize, gap: f32) -> f32 {
    let one = (width - gap * (of - 1) as f32) / of as f32;
    (one * n as f32 + gap * (n - 1) as f32).floor()
}
/// A titled group around `inner`.
pub fn group(label: &str, inner: Block) -> Block {
    let mut g = Widget::new(WidgetKind::Container);
    g.label = label.into();
    g.padding = PADDING;
    g.spacing = GAP;
    let (width, height) = (
        inner.width + PADDING * 2.,
        inner.height + PADDING * 2. + HEADER,
    );
    g.children = inner.into_widgets();
    Block::sized(g, width, height)
}
/// The inner width of a group `width` wide.
pub fn inner(width: f32) -> f32 {
    width - PADDING * 2.
}

/// The height a widget's content needs at `width`.
pub fn height(w: &Widget, width: f32) -> f32 {
    let title = if w.label.trim().is_empty() { 0. } else { TITLE };
    // Cards add their margin; text size scales a widget's rows.
    let card = 12.;
    let scale = w.text_size.clamp(0.5, 4.);
    let rows = match w.kind {
        WidgetKind::Button => return 32. * scale.max(1.),
        WidgetKind::Label => {
            // Wrapped lines at an average glyph width of the body font.
            let per_line = (width / (7.2 * scale)).max(1.);
            let lines: f32 = w
                .label
                .lines()
                .map(|l| (l.chars().count() as f32 / per_line).ceil().max(1.))
                .sum();
            return (lines.max(1.) * 18. * scale + 6.).ceil();
        }
        WidgetKind::Container => {
            return w
                .children
                .iter()
                .map(|c| c.position.unwrap_or([0., 0.])[1] + c.height)
                .fold(0., f32::max)
                + PADDING * 2.
                + HEADER
        }
        WidgetKind::ValueRead => title + 48.,
        WidgetKind::StateLed | WidgetKind::LedIndicator | WidgetKind::Dropdown => title + 26.,
        WidgetKind::ProgressBar => title + if w.show_value { 40. } else { 14. },
        WidgetKind::ValueWrite => title + if w.show_value { 56. } else { 28. },
        WidgetKind::EncoderDisplay => card + title + 48. + if w.show_raw { 26. } else { 0. },
        WidgetKind::Gauge => card + title + 112.,
        WidgetKind::StatusMatrix => {
            card + title + 28. * (w.bit_count.clamp(8, 32) as f32 / 8.).ceil()
        }
        WidgetKind::DirectionalControl => {
            // Rows of the 3×3 compass that hold a direction.
            let rows = (0..3)
                .filter(|r| w.directions.iter().any(|d| d.direction.cell().1 == *r))
                .count()
                .max(1) as f32;
            card + title + rows * 34. + (rows - 1.) * 6.
        }
        WidgetKind::DataTable | WidgetKind::AlarmList => {
            card + title + 4. + 26. * w.rows.len().max(1) as f32
        }
        WidgetKind::DeviceInfo => card + title + 90.,
        WidgetKind::MiniPlot => card + title + 160.,
    };
    (rows * scale).ceil()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rows_and_columns_place_without_overlap() {
        let a = Block::fit(Widget::new(WidgetKind::Button), 120.);
        let b = Block::fit(Widget::new(WidgetKind::Gauge), 200.);
        let r = row(vec![a.clone(), b], GAP);
        assert_eq!(r.width, 332.);
        assert_eq!(r.widgets[1].position, Some([132., 0.]));
        let g = group("G", r);
        assert_eq!(g.width, 332. + PADDING * 2.);
        let c = column(vec![g, a], SECTION);
        assert_eq!(
            c.widgets[1].position.unwrap()[1],
            c.widgets[0].height + SECTION
        );
        assert_eq!(span(1000., 4, 2, 16.), 492.);
    }
}
