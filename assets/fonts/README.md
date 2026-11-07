# Bundled fonts

| File | Source | Licence |
|---|---|---|
| `Inter-Regular.ttf`, `Inter-SemiBold.ttf` | Inter 4 variable font, instanced at `wght=400` / `wght=600`, `opsz=14` | SIL OFL 1.1 (`LICENSE-Inter.txt`) |
| `JetBrainsMono-Regular.ttf` | JetBrains Mono Regular | SIL OFL 1.1 (`LICENSE-JetBrainsMono.txt`) |
| `DejaVuSans.ttf` | DejaVu Sans, fallback for symbols | `LICENSE-DejaVu.txt` |

egui renders without OpenType shaping, so features cannot be switched on at run time. Inter's
digits are remapped to its tabular (`tnum`) glyphs so numbers keep a stable width everywhere.

Regenerate (fontTools):

```sh
U="U+0020-007E,U+00A0-017F,U+0370-03FF,U+2000-206F,U+2070-209F,U+20AC,U+2116,U+2122,U+2190-21FF,U+2200-22FF,U+2300-23FF,U+25A0-25FF,U+2600-26FF,U+2713-2717"
fonttools varLib.instancer InterVariable.ttf wght=400 opsz=14 -o inter400.ttf
pyftsubset inter400.ttf --unicodes="$U" --layout-features='kern,liga,calt,tnum,case' --output-file=inter400-sub.ttf
python3 -I tools/freeze_font_features.py inter400-sub.ttf Inter-Regular.ttf tnum
# Repeat with wght=600 for Inter-SemiBold.ttf
pyftsubset JetBrainsMono-Regular.ttf --unicodes="$U" --layout-features='kern' --output-file=JetBrainsMono-Regular.ttf
```
