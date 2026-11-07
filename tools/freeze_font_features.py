"""Remap a font's cmap so its default glyphs use the given single-substitution features."""
import sys
from fontTools.ttLib import TTFont
src, dst, *features = sys.argv[1:]
font = TTFont(src)
gsub = font["GSUB"].table
subs = {}
for record in gsub.FeatureList.FeatureRecord:
    if record.FeatureTag in features:
        for index in record.Feature.LookupListIndex:
            lookup = gsub.LookupList.Lookup[index]
            for table in lookup.SubTable:
                if lookup.LookupType == 7:
                    table = table.ExtSubTable
                mapping = getattr(table, "mapping", None)
                if mapping:
                    subs.update(mapping)
changed = 0
for cmap in font["cmap"].tables:
    for code, glyph in list(cmap.cmap.items()):
        if glyph in subs:
            cmap.cmap[code] = subs[glyph]
            changed += 1
font.save(dst)
print(f"{dst}: remapped {changed} code points via {features}")
