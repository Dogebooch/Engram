/**
 * Pulmonary Embolism picture-mnemonic seed data.
 *
 * Hand-authored from the user's Obsidian key at
 * `P:/Obsidian/DigDoug/0-Inbox/Pulmonary Embolism Picture Mnemonic Symbols.md`,
 * with positions estimated against the Sketchy-style painting that's already
 * loaded as the Picmonic's backdrop.
 *
 * Coordinate space: 1920×1080 (matches `STAGE_WIDTH` / `STAGE_HEIGHT`).
 * Origin is top-left. Positions are best-effort — drag/resize in edit mode
 * to refine.
 *
 * Temporary file. Removed alongside `apply-pe-seed.ts` after the labeled
 * mnemonic is finalized.
 */

export interface SeedBullet {
  description: string;
  meaning: string;
  encoding: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SeedFact {
  name: string;
  bullets: SeedBullet[];
}

export interface SeedSection {
  name: string;
  facts: SeedFact[];
}

export const PE_SEED: SeedSection[] = [
  {
    name: "Etiology",
    facts: [
      {
        name: "PE: clot travels to pulmonary artery and gets stuck",
        bullets: [
          {
            description: "Bird's nest in Lung Tree",
            meaning: "embolus lodged in pulmonary vasculature",
            encoding: "nest looks fibrotic; tree resembles lungs/pulmonary tree; distal areas dead",
            x: 110, y: 80, width: 200, height: 180,
          },
        ],
      },
      {
        name: "Proximal DVTs (iliac, femoral, popliteal) embolize more than distal",
        bullets: [
          {
            description: "Buttons popping off coat near proximal pants",
            meaning: "clot breaking off proximal vein and embolizing",
            encoding: "buttons pop near proximal pants; veins drawn on pants",
            x: 0, y: 540, width: 180, height: 360,
          },
        ],
      },
    ],
  },
  {
    name: "Pathophysiology",
    facts: [
      {
        name: "Virchow's triad: stasis, endothelial injury, hypercoagulable state",
        bullets: [
          {
            description: "Broken 3-wheeled wheelchair with V on the back",
            meaning: "Virchow's triad — stasis + vascular injury",
            encoding: "V = Virchow; broken = endothelial injury; wheelchair = immobility/stasis",
            x: 380, y: 470, width: 320, height: 280,
          },
          {
            description: "Large planks behind the V-wheelchair",
            meaning: "hypercoagulable state",
            encoding: "planks look fibrotic, like a clot",
            x: 230, y: 360, width: 220, height: 320,
          },
        ],
      },
    ],
  },
  {
    name: "Presenting Symptoms",
    facts: [
      {
        name: "Most common: dyspnea, pleuritic chest pain, cough",
        bullets: [
          {
            description: "Royalist blowing puff of air (in tree)",
            meaning: "dyspnea",
            encoding: "puff of air from royalist's mouth = shortness of breath",
            x: 200, y: 60, width: 220, height: 260,
          },
          {
            description: "Shark-tooth necklace on royalist",
            meaning: "pleuritic chest pain",
            encoding: "sharp tooth, on the chest = sharp chest pain",
            x: 540, y: 220, width: 220, height: 240,
          },
          {
            description: "Royalist coughing (in window)",
            meaning: "cough",
            encoding: "looks like he's coughing — common presenting symptom of PE",
            x: 540, y: 165, width: 230, height: 290,
          },
        ],
      },
      {
        name: "Hemoptysis (rarer; suggests pulmonary infarction)",
        bullets: [
          {
            description: "Bloody rag",
            meaning: "hemoptysis (bloody cough)",
            encoding: "rag stained with blood from coughing",
            x: 200, y: 650, width: 220, height: 220,
          },
        ],
      },
    ],
  },
  {
    name: "Risk Factors",
    facts: [
      {
        name: "Risk factors for DVT: immobilization, family history, travel, etc.",
        bullets: [
          {
            description: "Wheelchair, family portrait, globe, cancer crab",
            meaning: "DVT risk factors (immobility, FHx, travel, malignancy)",
            encoding: "wheelchair = immobility; portrait = FHx; globe = travel; crab = cancer",
            x: 380, y: 470, width: 320, height: 280,
          },
        ],
      },
    ],
  },
  {
    name: "Signs",
    facts: [
      {
        name: "Common vital sign abnormalities: tachypnea, tachycardia, low SpO2",
        bullets: [
          {
            description: "Clock medallion over chest",
            meaning: "tachypnea",
            encoding: "clock = stopwatch-fast respiratory rate",
            x: 575, y: 320, width: 110, height: 110,
          },
          {
            description: "Heart-shaped pocket watch held high",
            meaning: "tachycardia",
            encoding: "heart-shaped clock = fast heart rate",
            x: 720, y: 200, width: 130, height: 130,
          },
          {
            description: "Glowing red ring (SpO2 monitor)",
            meaning: "decreased O2 saturation",
            encoding: "red ring = pulse-ox showing concerning low value",
            x: 760, y: 280, width: 80, height: 80,
          },
        ],
      },
      {
        name: "Massive PE: hypotension, syncope, obstructive shock",
        bullets: [
          {
            description: "Fainting royalist",
            meaning: "syncope",
            encoding: "passed out from massive PE",
            x: 800, y: 540, width: 180, height: 240,
          },
          {
            description: "Lightning-bolt shield",
            meaning: "obstructive shock",
            encoding: "lightning = shock; shield = obstruction",
            x: 720, y: 600, width: 150, height: 170,
          },
          {
            description: "Blood pressure cuff",
            meaning: "hypotension",
            encoding: "BP cuff measuring low pressure",
            x: 600, y: 760, width: 140, height: 140,
          },
        ],
      },
      {
        name: "Massive PE: ↑PVR, R-sided heart failure, ↑JVP, LE edema",
        bullets: [
          {
            description: "Floppy heart balloon, horse stomping right side",
            meaning: "right-sided heart failure",
            encoding: "horse stomping the right ventricle of a balloon heart",
            x: 660, y: 470, width: 380, height: 340,
          },
          {
            description: "Blue JVP jugs",
            meaning: "elevated JVP",
            encoding: "blue jugs = jugular venous pressure jugs",
            x: 840, y: 760, width: 130, height: 160,
          },
          {
            description: "Big floppy pant legs",
            meaning: "lower-extremity edema",
            encoding: "swollen, floppy pants = pitting edema",
            x: 690, y: 800, width: 220, height: 250,
          },
        ],
      },
      {
        name: "PE may show DVT findings (swelling, tenderness, erythema)",
        bullets: [
          {
            description: "Red, hot, swollen, painful leg",
            meaning: "signs of DVT",
            encoding: "red = erythema; fire = inflammation/heat; swollen = edema; pain on face",
            x: 380, y: 470, width: 280, height: 260,
          },
        ],
      },
    ],
  },
  {
    name: "Testing / Diagnostics",
    facts: [
      {
        name: "ABG: hypoxemia + primary respiratory alkalosis",
        bullets: [
          {
            description: "Red syringe weathervane",
            meaning: "ABG (arterial blood gas)",
            encoding: "bright red blood from radial artery = ABG; on the rooftop",
            x: 1000, y: 0, width: 140, height: 200,
          },
          {
            description: "Blue-faced doll attached to the ABG",
            meaning: "hypoxemia on ABG",
            encoding: "blue face = cyanosis/hypoxemia",
            x: 880, y: 110, width: 130, height: 240,
          },
        ],
      },
      {
        name: "A-a gradient elevated due to V/Q mismatch",
        bullets: [
          {
            description: "Big A roof + little 'a' on the effigy",
            meaning: "A-a gradient",
            encoding: "big A = alveolar; little a = arterial; grouped near the ABG",
            x: 880, y: 0, width: 320, height: 320,
          },
        ],
      },
      {
        name: "CXR: usually nonspecific; helps differentiate other lung pathology",
        bullets: [
          {
            description: "Skull and X-bones flag (on the ground)",
            meaning: "Chest X-ray",
            encoding: "X-bones = X-ray; on ground = not super useful",
            x: 380, y: 870, width: 260, height: 180,
          },
        ],
      },
      {
        name: "Pleural effusions are common in PE",
        bullets: [
          {
            description: "Puffy pleural shirt with water around it",
            meaning: "pleural effusion",
            encoding: "lung-shaped chest, water around shirt; near the CXR flag",
            x: 460, y: 770, width: 320, height: 200,
          },
        ],
      },
      {
        name: "ECG abnormal but nonspecific (tachycardia, ST changes, S1Q3T3)",
        bullets: [
          {
            description: "Door with grid-like paper outside",
            meaning: "ECG findings",
            encoding: "grid paper = EKG strip; group all ECG findings here",
            x: 1380, y: 100, width: 240, height: 240,
          },
          {
            description: "Door writing: 'Securité, eQualité, fraTernité'",
            meaning: "S1, Q3, T3",
            encoding: "specific S1Q3T3 finding embedded in the words",
            x: 990, y: 470, width: 160, height: 240,
          },
        ],
      },
      {
        name: "ECG may show right heart strain in massive PE",
        bullets: [
          {
            description: "Aristocrat straining on right side of door",
            meaning: "right heart strain",
            encoding: "straining on the R = R-heart strain; heart-shaped door handles",
            x: 1190, y: 470, width: 220, height: 350,
          },
        ],
      },
    ],
  },
  {
    name: "Differential Diagnosis",
    facts: [
      {
        name: "DDx: ACS, pneumonia, pneumothorax (Ddx door)",
        bullets: [
          {
            description: "'Ddx' sign on door",
            meaning: "differential diagnosis for PE",
            encoding: "Ddx door represents the DDx — actual ddx in DVT video",
            x: 1620, y: 80, width: 220, height: 280,
          },
        ],
      },
    ],
  },
  {
    name: "Workup",
    facts: [
      {
        name: "PERC rules out low-risk patients",
        bullets: [
          {
            description: "Guy holding 'They get all the PERKS' sign",
            meaning: "PERC criteria",
            encoding: "PERKS = PERC criteria to rule out low-risk patients",
            x: 1010, y: 770, width: 280, height: 290,
          },
        ],
      },
      {
        name: "Wells' Criteria (or revised Geneva) when PERC can't rule out",
        bullets: [
          {
            description: "Well with 3 buckets",
            meaning: "Wells' Criteria",
            encoding: "well + buckets = Wells' Criteria",
            x: 1300, y: 760, width: 240, height: 320,
          },
        ],
      },
      {
        name: "High Wells (>4) → CTA to confirm PE",
        bullets: [
          {
            description: "High bucket in well",
            meaning: "high Wells' score",
            encoding: "bucket pulled up high = high score",
            x: 1320, y: 770, width: 100, height: 130,
          },
          {
            description: "Black cat with yin-yang necklace",
            meaning: "CT (CAT) scan with contrast",
            encoding: "CAT = CT; yin-yang = contrast (white on black)",
            x: 1310, y: 660, width: 130, height: 150,
          },
        ],
      },
      {
        name: "CTA shows filling defects in pulmonary vasculature",
        bullets: [
          {
            description: "Dark/grey branch on white tree",
            meaning: "filling defect on CTA",
            encoding: "white tree = contrast in vessels; grey branch = filling defect",
            x: 1500, y: 360, width: 360, height: 460,
          },
        ],
      },
      {
        name: "Pulmonary infarction → wedge-shaped enhancement on CTA",
        bullets: [
          {
            description: "Wedge-shaped guillotine blade",
            meaning: "wedge-shaped infarct on CTA",
            encoding: "guillotine blade = wedge shape",
            x: 1730, y: 480, width: 170, height: 230,
          },
        ],
      },
      {
        name: "Low Wells (<4) → D-dimer; <500 rules out PE",
        bullets: [
          {
            description: "Well bucket on the ground",
            meaning: "low Wells' score",
            encoding: "bucket low/on ground = low score",
            x: 1290, y: 970, width: 180, height: 110,
          },
          {
            description: "Twigs with pairs of D-shaped leaves",
            meaning: "D-Dimer",
            encoding: "D-shaped leaves = D-dimer; pairs = fibrin degradation products",
            x: 1230, y: 650, width: 200, height: 180,
          },
        ],
      },
      {
        name: "V/Q scan if CTA inconclusive or contraindicated (pregnancy, CKD, contrast allergy)",
        bullets: [
          {
            description: "'Vive le République' banner",
            meaning: "V/Q scan",
            encoding: "Vive le République = V/Q",
            x: 1700, y: 870, width: 220, height: 200,
          },
          {
            description: "Pregnant lady",
            meaning: "test of choice in pregnancy",
            encoding: "pregnancy = contraindication to CTA contrast",
            x: 1740, y: 760, width: 180, height: 250,
          },
        ],
      },
      {
        name: "Stable patients: anticoagulation is mainstay",
        bullets: [
          {
            description: "Anti-clot bottle",
            meaning: "anticoagulation",
            encoding: "labeled bottle = anti-coag medication",
            x: 1280, y: 540, width: 90, height: 140,
          },
        ],
      },
      {
        name: "Likely PE → start anticoag before CTA",
        bullets: [
          {
            description: "Anti-clot bottle inside high Wells bucket near CT cat",
            meaning: "anticoag before CTA in high-Wells patients",
            encoding: "bottle + bucket + cat all grouped = start anticoag with high Wells",
            x: 1260, y: 540, width: 200, height: 350,
          },
        ],
      },
      {
        name: "High bleed risk / contraindication → IVC filter",
        bullets: [
          {
            description: "IVC-filter-shaped window bars",
            meaning: "IVC filter",
            encoding: "vertical bars on window = IVC filter geometry",
            x: 1390, y: 320, width: 200, height: 250,
          },
        ],
      },
      {
        name: "Hemodynamically unstable: address shock with IV fluids first",
        bullets: [
          {
            description: "Ivy-covered street lamp",
            meaning: "IV fluid administration",
            encoding: "ivy = IV; lamp post = pole/stand",
            x: 940, y: 380, width: 130, height: 320,
          },
        ],
      },
      {
        name: "Unstable: bedside echo / ultrasound for presumptive dx (R heart strain)",
        bullets: [
          {
            description: "Echo megaphone",
            meaning: "bedside echo / ultrasound",
            encoding: "megaphone = echo; sits next to right heart strain symbols",
            x: 870, y: 580, width: 220, height: 220,
          },
        ],
      },
      {
        name: "Unstable patients: initiate tPA (systemic thrombolytic)",
        bullets: [
          {
            description: "Stick explosion blowing up clot-looking sticks",
            meaning: "systemic thrombolytics ('clot buster')",
            encoding: "explosion = clot buster; near right heart strain area",
            x: 760, y: 770, width: 280, height: 220,
          },
        ],
      },
      {
        name: "Contraindication to systemic thrombolytics: active bleeding",
        bullets: [
          {
            description: "Blood seeping over a person's pants",
            meaning: "active bleeding (contraindication to tPA)",
            encoding: "blood on pants = active bleeding",
            x: 700, y: 750, width: 190, height: 240,
          },
        ],
      },
      {
        name: "Catheter-directed thrombolysis or embolectomy if not tPA candidate",
        bullets: [
          {
            description: "Very long fuse on the bomb",
            meaning: "catheter-directed thrombolysis",
            encoding: "fuse = catheter delivering thrombolytic to the clot",
            x: 920, y: 800, width: 180, height: 220,
          },
          {
            description: "The actual red bomb itself",
            meaning: "embolectomy",
            encoding: "bomb resembles a clot pulled out by catheter",
            x: 1080, y: 870, width: 130, height: 150,
          },
        ],
      },
    ],
  },
];
