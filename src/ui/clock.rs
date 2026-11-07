//! Local wall-clock formatting for timestamps (Unix milliseconds).
use jiff::{tz::TimeZone, Timestamp};
use std::sync::OnceLock;

fn zone() -> &'static TimeZone {
    static ZONE: OnceLock<TimeZone> = OnceLock::new();
    ZONE.get_or_init(TimeZone::system)
}

fn zoned(unix_ms: f64) -> Option<jiff::Zoned> {
    Timestamp::from_millisecond(unix_ms as i64)
        .ok()
        .map(|t| t.to_zoned(zone().clone()))
}

/// `14:03:27.512` in the local time zone.
pub fn time_of_day(unix_ms: f64) -> String {
    zoned(unix_ms).map_or_else(String::new, |z| z.strftime("%H:%M:%S%.3f").to_string())
}

/// `14:03:27` in the local time zone, for axis ticks.
pub fn short_time(unix_ms: f64) -> String {
    zoned(unix_ms).map_or_else(String::new, |z| z.strftime("%H:%M:%S").to_string())
}

/// `2026-11-07 14:03:27.512 +01:00`, for exports and tooltips.
pub fn full(unix_ms: f64) -> String {
    zoned(unix_ms).map_or_else(String::new, |z| {
        z.strftime("%Y-%m-%d %H:%M:%S%.3f %:z").to_string()
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_have_fixed_widths() {
        let ms = 1_762_520_607_512.;
        assert_eq!(time_of_day(ms).len(), "14:03:27.512".len());
        assert!(time_of_day(ms).ends_with(".512"));
        assert_eq!(short_time(ms).len(), 8);
        assert!(full(ms).starts_with("2025-11-0"));
    }
}
