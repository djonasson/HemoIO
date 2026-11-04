/**
 * LOINC's own names for the LOINC codes the biomarker dictionary uses
 *
 * This material contains content from LOINC (http://loinc.org). LOINC is
 * copyright © Regenstrief Institute, Inc. and the Logical Observation
 * Identifiers Names and Codes (LOINC) Committee and is available at no cost
 * under the license at http://loinc.org/license. LOINC® is a registered
 * United States trademark of Regenstrief Institute, Inc.
 *
 * The license asks that a LOINC code be shown with one of LOINC's names for
 * it; these are the long common names (LONG_COMMON_NAME), unchanged.
 */

/** The LOINC release the names are taken from */
export const LOINC_VERSION = '2.83';

/** The notice the LOINC license asks every product using LOINC to show */
export const LOINC_NOTICE =
  'This material contains content from LOINC (http://loinc.org). LOINC is copyright © Regenstrief Institute, Inc. ' +
  'and the Logical Observation Identifiers Names and Codes (LOINC) Committee and is available at no cost under the ' +
  'license at http://loinc.org/license. LOINC® is a registered United States trademark of Regenstrief Institute, Inc.';

/** LOINC long common names, by LOINC code */
const LOINC_NAMES: ReadonlyMap<string, string> = new Map([
  ['704-7', 'Basophils [#/volume] in Blood by Automated count'],
  ['706-2', 'Basophils/Leukocytes in Blood by Automated count'],
  ['711-2', 'Eosinophils [#/volume] in Blood by Automated count'],
  ['713-8', 'Eosinophils/Leukocytes in Blood by Automated count'],
  ['718-7', 'Hemoglobin [Mass/volume] in Blood'],
  ['731-0', 'Lymphocytes [#/volume] in Blood by Automated count'],
  ['736-9', 'Lymphocytes/Leukocytes in Blood by Automated count'],
  ['742-7', 'Monocytes [#/volume] in Blood by Automated count'],
  ['751-8', 'Neutrophils [#/volume] in Blood by Automated count'],
  ['770-8', 'Neutrophils/Leukocytes in Blood by Automated count'],
  ['777-3', 'Platelets [#/volume] in Blood by Automated count'],
  ['785-6', 'MCH [Entitic mass] by Automated count'],
  ['786-4', 'MCHC [Entitic Mass/volume] in Red Blood Cells by Automated count'],
  ['787-2', 'MCV [Entitic mean volume] in Red Blood Cells by Automated count'],
  ['788-0', 'Erythrocyte [DistWidth] in Blood by Automated count'],
  ['789-8', 'Erythrocytes [#/volume] in Blood by Automated count'],
  ['1742-6', 'Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma'],
  ['1751-7', 'Albumin [Mass/volume] in Serum or Plasma'],
  ['1755-8', 'Albumin [Mass/time] in 24 hour Urine'],
  ['1798-8', 'Amylase [Enzymatic activity/volume] in Serum or Plasma'],
  ['1834-1', 'Alpha-1-Fetoprotein [Mass/volume] in Serum or Plasma'],
  ['1920-8', 'Aspartate aminotransferase [Enzymatic activity/volume] in Serum or Plasma'],
  ['1968-7', 'Bilirubin.direct [Mass/volume] in Serum or Plasma'],
  ['1975-2', 'Bilirubin.total [Mass/volume] in Serum or Plasma'],
  ['1988-5', 'C reactive protein [Mass/volume] in Serum or Plasma'],
  ['2028-9', 'Carbon dioxide, total [Moles/volume] in Serum or Plasma'],
  ['2075-0', 'Chloride [Moles/volume] in Serum or Plasma'],
  ['2085-9', 'Cholesterol in HDL [Mass/volume] in Serum or Plasma'],
  ['2093-3', 'Cholesterol [Mass/volume] in Serum or Plasma'],
  ['2132-9', 'Cobalamin (Vitamin B12) [Mass/volume] in Serum or Plasma'],
  ['2160-0', 'Creatinine [Mass/volume] in Serum or Plasma'],
  ['2161-8', 'Creatinine [Mass/volume] in Urine'],
  ['2162-6', 'Creatinine [Mass/time] in 24 hour Urine'],
  ['2276-4', 'Ferritin [Mass/volume] in Serum or Plasma'],
  ['2284-8', 'Folate [Mass/volume] in Serum or Plasma'],
  ['2324-2', 'Gamma glutamyl transferase [Enzymatic activity/volume] in Serum or Plasma'],
  ['2345-7', 'Glucose [Mass/volume] in Serum or Plasma'],
  ['2350-7', 'Glucose [Mass/volume] in Urine'],
  ['2498-4', 'Iron [Mass/volume] in Serum or Plasma'],
  ['2500-7', 'Iron binding capacity [Mass/volume] in Serum or Plasma'],
  ['2502-3', 'Iron saturation [Mass Fraction] in Serum or Plasma'],
  ['2571-8', 'Triglyceride [Mass/volume] in Serum or Plasma'],
  ['2752-4', 'pH of Semen'],
  ['2756-5', 'pH of Urine'],
  ['2823-3', 'Potassium [Moles/volume] in Serum or Plasma'],
  ['2885-2', 'Protein [Mass/volume] in Serum or Plasma'],
  ['2888-6', 'Protein [Mass/volume] in Urine'],
  ['2890-2', 'Protein/Creatinine [Mass Ratio] in Urine'],
  ['2923-1', 'Retinol [Mass/volume] in Serum or Plasma'],
  ['2951-2', 'Sodium [Moles/volume] in Serum or Plasma'],
  ['2965-2', 'Specific gravity of Urine'],
  ['3016-3', 'Thyrotropin [Units/volume] in Serum or Plasma'],
  ['3024-7', 'Thyroxine (T4) free [Mass/volume] in Serum or Plasma'],
  ['3026-2', 'Thyroxine (T4) [Mass/volume] in Serum or Plasma'],
  ['3034-6', 'Transferrin [Mass/volume] in Serum or Plasma'],
  ['3051-0', 'Triiodothyronine (T3) Free [Mass/volume] in Serum or Plasma'],
  ['3053-6', 'Triiodothyronine (T3) [Mass/volume] in Serum or Plasma'],
  ['3084-1', 'Urate [Mass/volume] in Serum or Plasma'],
  ['3091-6', 'Urea [Mass/volume] in Serum or Plasma'],
  ['3092-4', 'Urea [Mass/volume] in Urine'],
  ['3094-0', 'Urea nitrogen [Mass/volume] in Serum or Plasma'],
  ['3160-9', 'Volume of Semen'],
  ['3167-4', 'Volume of 24 hour Urine'],
  ['4544-3', 'Hematocrit [Volume Fraction] of Blood by Automated count'],
  ['4548-4', 'Hemoglobin A1c/Hemoglobin.total in Blood'],
  ['5787-7', 'Epithelial cells [#/area] in Urine sediment by Microscopy high power field'],
  ['5797-6', 'Ketones [Mass/volume] in Urine by Test strip'],
  ['5799-2', 'Leukocyte esterase [Presence] in Urine by Test strip'],
  ['5802-4', 'Nitrite [Presence] in Urine by Test strip'],
  ['5821-4', 'Leukocytes [#/area] in Urine sediment by Microscopy high power field'],
  ['5905-5', 'Monocytes/Leukocytes in Blood by Automated count'],
  ['6690-2', 'Leukocytes [#/volume] in Blood by Automated count'],
  ['6768-6', 'Alkaline phosphatase [Enzymatic activity/volume] in Serum or Plasma'],
  ['6800-7', 'Spermatozoa Motile/Spermatozoa in Semen'],
  ['8099-4', 'Thyroperoxidase Ab [Units/volume] in Serum or Plasma'],
  ['9318-7', 'Albumin/Creatinine [Mass Ratio] in Urine'],
  ['9780-8', 'Spermatozoa [#/volume] in Semen'],
  ['10580-9', 'Liquefaction [Time] in Semen'],
  ['10613-8', 'Spermatozoa Viable/Spermatozoa in Semen'],
  ['10622-9', 'Spermatozoa Normal/Spermatozoa in Semen'],
  ['13457-7', 'Cholesterol in LDL [Mass/volume] in Serum or Plasma by calculation'],
  ['13458-5', 'Cholesterol in VLDL [Mass/volume] in Serum or Plasma by calculation'],
  ['13945-1', 'Erythrocytes [#/area] in Urine sediment by Microscopy high power field'],
  ['13978-2', 'Alpha 1 globulin/Protein.total in Serum or Plasma by Electrophoresis'],
  ['13980-8', 'Albumin/Protein.total in Serum or Plasma by Electrophoresis'],
  ['13981-6', 'Alpha 2 globulin/Protein.total in Serum or Plasma by Electrophoresis'],
  ['13982-4', 'Beta globulin/Protein.total in Serum or Plasma by Electrophoresis'],
  ['13983-2', 'Gamma globulin/Protein.total in Serum or Plasma by Electrophoresis'],
  ['14194-5', 'Spermatozoa Progressive/Spermatozoa in Semen'],
  ['14957-5', 'Microalbumin [Mass/volume] in Urine'],
  ['15069-8', 'Fructosamine [Moles/volume] in Serum or Plasma'],
  ['17849-1', 'Reticulocytes/Erythrocytes in Blood by Automated count'],
  ['17861-6', 'Calcium [Mass/volume] in Serum or Plasma'],
  ['19123-9', 'Magnesium [Mass/volume] in Serum or Plasma'],
  ['20405-7', 'Urobilinogen [Mass/volume] in Urine by Test strip'],
  ['20505-4', 'Bilirubin.total [Mass/volume] in Urine by Test strip'],
  ['30341-2', 'Erythrocyte [Sedimentation Rate] in Blood'],
  ['30392-5', 'Nucleated erythrocytes [#/volume] in Blood'],
  ['43396-1', 'Cholesterol non HDL [Mass/volume] in Serum or Plasma'],
  ['48999-7', 'Urea [Mass/time] in 24 hour Urine'],
  ['49137-3', 'Hemoglobin [Mass/volume] in Urine by Test strip'],
  ['58413-6', 'Nucleated erythrocytes/Leukocytes [Ratio] in Blood by Automated count'],
  ['60474-4', 'Reticulocytes [#/volume] in Blood by Automated count'],
  ['62292-8', '25-Hydroxyvitamin D3+25-Hydroxyvitamin D2 [Mass/volume] in Serum or Plasma'],
  ['98979-8', 'Glomerular filtration rate [Volume Rate/Area] in Serum, Plasma or Blood by Creatinine-based formula (CKD-EPI 2021)/1.73 sq M'],
  ['107184-4', 'Spermatozoa [#] in Semen'],
]);

/** LOINC's long common name for a code, if the dictionary uses the code */
export function loincName(code: string): string | undefined {
  return LOINC_NAMES.get(code);
}

/** A code as the license asks it be shown: with LOINC's name for it */
export function loincLabel(code: string): string {
  const name = loincName(code);
  return name ? `LOINC ${code}: ${name}` : `LOINC ${code}`;
}
