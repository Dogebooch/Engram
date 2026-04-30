import { describe, expect, it } from "vitest";
import { buildAnkiCsv, buildAnkiRows, csvCell, rowsToCsv } from "./anki";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const C = "33333333-3333-3333-3333-333333333333";

describe("csvCell", () => {
  it("passes plain text unchanged", () => {
    expect(csvCell("hello")).toBe("hello");
  });
  it("quotes commas", () => {
    expect(csvCell("a, b")).toBe('"a, b"');
  });
  it("quotes newlines", () => {
    expect(csvCell("a\nb")).toBe('"a\nb"');
  });
  it("escapes embedded quotes", () => {
    expect(csvCell('he said "hi"')).toBe('"he said ""hi"""');
  });
});

describe("buildAnkiRows", () => {
  it("emits one row per real Fact in order", () => {
    const notes = `# Risk Factors
## Stasis
* {sym:${A}} red wheel → vascular injury; rhymes with weal
## Trauma
* {sym:${B}} broken bone → physical injury
# Treatment
## Heparin
* {sym:${C}} hep cat → anticoagulation
`;
    const rows = buildAnkiRows({
      picmonicName: "VTE",
      notes,
      imagePath: "vte.png",
    });
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual([
      "VTE",
      "Risk Factors",
      "Stasis",
      "red wheel → vascular injury → rhymes with weal",
      "vte.png",
    ]);
    expect(rows[1][2]).toBe("Trauma");
    expect(rows[2][1]).toBe("Treatment");
  });

  it("excludes Unassigned and zero-symbol facts", () => {
    const notes = `## Stasis
## Empty
## Unassigned
* {sym:${A}} loose
`;
    const rows = buildAnkiRows({
      picmonicName: "X",
      notes,
      imagePath: "x.png",
    });
    expect(rows).toHaveLength(0);
  });

  it("joins multi-symbol facts with ¶", () => {
    const notes = `## Multi
* {sym:${A}} apple → red fruit
* {sym:${B}} banana → yellow fruit; encodes potassium
`;
    const rows = buildAnkiRows({
      picmonicName: "P",
      notes,
      imagePath: "p.png",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0][3]).toBe(
      "apple → red fruit ¶ banana → yellow fruit → encodes potassium",
    );
  });
});

describe("rowsToCsv", () => {
  it("includes header and CRLF line endings", () => {
    const csv = rowsToCsv([["a", "b", "c", "d", "e"]]);
    expect(csv.startsWith("picmonic_name,section,fact_name,symbol_descriptions,image_path\r\n")).toBe(
      true,
    );
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("escapes special chars in cells", () => {
    const csv = buildAnkiCsv({
      picmonicName: "He, said",
      notes: `## F
* {sym:${A}} a "quoted" → b
`,
      imagePath: "x.png",
    });
    expect(csv).toContain('"He, said"');
    expect(csv).toContain('"a ""quoted"" → b"');
  });
});
