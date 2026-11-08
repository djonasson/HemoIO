Feature: Unit Conversion
  As a user
  I want biomarker values to be converted between different units
  So that I can view my results in my preferred measurement system

  Background:
    Given the application is configured with biomarker reference data

  Scenario: Convert glucose from mg/dL to mmol/L
    Given a glucose value of 100 mg/dL
    When I convert it to mmol/L
    Then the result should be approximately 5.55 mmol/L

  Scenario: Convert glucose from mmol/L to mg/dL
    Given a glucose value of 5.55 mmol/L
    When I convert it to mg/dL
    Then the result should be approximately 100 mg/dL

  Scenario: Convert cholesterol from mg/dL to mmol/L
    Given a total cholesterol value of 200 mg/dL
    When I convert it to mmol/L
    Then the result should be approximately 5.17 mmol/L

  Scenario: Convert hemoglobin from g/dL to g/L
    Given a hemoglobin value of 14 g/dL
    When I convert it to g/L
    Then the result should be 140 g/L

  Scenario: Convert creatinine from mg/dL to µmol/L
    Given a creatinine value of 1.0 mg/dL
    When I convert it to µmol/L
    Then the result should be approximately 88.4 µmol/L

  Scenario: Convert vitamin D from ng/mL to nmol/L
    Given a vitamin D value of 30 ng/mL
    When I convert it to nmol/L
    Then the result should be approximately 75 nmol/L

  Scenario: Convert TSH between equivalent units
    Given a TSH value of 2.5 mIU/L
    When I convert it to µIU/mL
    Then the result should be 2.5 µIU/mL

  Scenario: No conversion needed for same unit
    Given a glucose value of 100 mg/dL
    When I convert it to mg/dL
    Then the result should be 100 mg/dL

  Scenario: Reference ranges are converted along with values
    Given a glucose value of 100 mg/dL with reference range 70-100 mg/dL
    When I convert to mmol/L
    Then the value should be approximately 5.55 mmol/L
    And the reference range should be approximately 3.9-5.6 mmol/L

  Scenario: User sets preferred unit for a biomarker
    Given I am viewing my glucose results in mg/dL
    When I set my preferred unit to mmol/L
    Then all glucose values should display in mmol/L
    And the timeline and the alerts should show glucose in mmol/L
    And the preference should be saved

  Scenario: User types a unit the biomarker cannot be shown in
    Given I am viewing my glucose results in mg/dL
    When I type "stones" as my preferred unit
    Then I should see "Unit not supported for Glucose"
    And glucose values should still display in mg/dL

  Scenario: A preferred unit applies to every LOINC code of the test
    Given I have glucose values recorded under the mg/dL and the mmol/L LOINC codes
    When I set my preferred unit for "Glucose" to mmol/L
    Then every glucose value should be shown in mmol/L, in Trends and in the Timeline

  Scenario: Unsupported unit conversion returns error
    Given a glucose value of 100 mg/dL
    When I attempt to convert it to an unsupported unit "stones"
    Then I should receive an error indicating unsupported conversion

  Scenario: Handle precision appropriately
    Given a glucose value of 99.7 mg/dL
    When I convert it to mmol/L
    Then the result should be displayed with appropriate decimal places
    And should not show excessive precision

  # International Alias Support
  Scenario: Convert using Italian biomarker alias
    Given a creatinine value labeled "P-Creatinina (metodo enzimatico)" at 67 µmol/L
    When I convert it to mg/dL
    Then the result should be approximately 0.76 mg/dL
    And the biomarker should be recognized as Creatinine

  Scenario: Convert urine creatinine with Italian alias
    Given a urine creatinine value labeled "U-Creatinina" at 3780 µmol/L
    When I convert it to g/L
    Then the result should be approximately 0.43 g/L

  Scenario: Convert protein/creatinine ratio with Italian alias
    Given a protein/creatinine ratio labeled "U-Proteine/Creatinina" at 15 mg/mmol
    When I convert it to mg/g
    Then the result should be approximately 133 mg/g

  Scenario: A ratio in mg/mmol trends with the same ratio in mg/g
    Given a protein/creatinine ratio saved as "Protein/Creatinine [Ratio] in Urine", LOINC's own test for mg/mmol, at 15 mg/mmol
    And one saved as "Protein/Creatinine [Mass Ratio] in Urine" at 120 mg/g
    When I view the protein/creatinine ratio trend
    Then both values should be plotted on one line in mg/g

  # Duplicate Value Detection (Same Measurement in Different Units)
  Scenario: Detect equivalent values in different units
    Given a lab report contains creatinine as both 67 µmol/L and 0.76 mg/dL
    And the AI knows the LOINC test of each
    When the values are analyzed
    Then they should be recognized as the same measurement
    And only one value should be kept
    And no duplicate conflict warning should be shown

  Scenario: Detect equivalent urine creatinine values
    Given a lab report contains urine creatinine as both 3780 µmol/L and 0.42 g/L
    And the AI knows the LOINC test of each
    When the values are analyzed
    Then they should be recognized as equivalent after unit conversion
    And the values should be merged without conflict

  Scenario: Merge a protein/creatinine ratio given in mg/mmol and in mg/g
    Given a lab report contains protein/creatinine ratio as both 15 mg/mmolcreat. and 132 mg/gcreat.
    When the values are analyzed
    Then they should be recognized as one measurement, although LOINC has a test of its own for the ratio in mg/mmol
    And only the value in mg/g should be kept
    And no duplicate conflict warning should be shown

  Scenario: Merge the values an Italian report gives in two units
    Given a lab report gives uric acid as 247 µmol/L and 4.15 mg/dL, iron as 38.4 µmol/L and 214 µg/dL, vitamin D (25-OH) as 81.5 nmol/L and 32.6 ng/mL, reticulocytes as 16.7 ‰ and 1.67 %, urine urea per litre ("Urea/L (urine)") as 117 mmol/L and 7 g/L, and HbA1c as 42 mmol/mol Hb and 6.0 %
    When the values are analyzed
    And the AI knows the LOINC test of each value
    Then each should be recognized as one measurement in two units
    And only one value of each should be kept
    And no duplicate conflict warning should be shown

  Scenario: Merge a value once I choose its test
    Given a lab report gives creatinine under a blood heading as 67 µmol/L and 0.76 mg/dL, so blood and serum creatinine both fit
    And the AI knows the test of the mg/dL value but is not sure of the µmol/L one
    When the values are analyzed
    Then both values should be kept, with no duplicate conflict warning
    When I choose "Creatinine [Moles/volume] in Serum or Plasma" for the µmol/L value
    Then it should be marked "Not saved", as the same measurement as 0.76 mg/dL
    And the confirmation should say it is not saved
    When I save the import and import the same report again
    Then the µmol/L value should be merged with the mg/dL one without asking

  Scenario: Keep every value of a test I choose when its values conflict
    Given a lab report gives creatinine under a blood heading as 0.76 mg/dL and as 1.5 mg/dL, and as 67 µmol/L
    And the AI knows the test of the mg/dL values but is not sure of the µmol/L one
    When the values are analyzed
    Then the two mg/dL values should be flagged as a duplicate conflict
    When I choose "Creatinine [Moles/volume] in Serum or Plasma" for the µmol/L value
    Then no value should be marked "Not saved": I settle the conflict, as the analysis leaves me to

  Scenario: Read the units Italian reports write for ratios to creatinine and cells per 100 white cells
    Given a lab report gives a nephrin/creatinine ratio in "mg/g cr", the albumin/creatinine ratio in "mg/gcr" and nucleated red cells under a name LOINC lacks ("Normoblasti") in "/100WBC"
    When the values are reviewed
    Then each unit should be read as a unit of its test
    And none should be labelled "Unit doesn't fit the test"
    And once I choose "Not a LOINC test" for the values no test was found for, nothing should stop me from saving them

  Scenario: Keep a share and an absolute count of the same cells apart
    Given a lab report gives nucleated red cells as 0 /100 WBC and as 0 10^9/L, and reticulocytes as 81.3 10^9/L and as 1.67 %
    When the values are analyzed
    Then both values of each should be kept, as two different tests
    And no duplicate conflict warning should be shown

  Scenario: Keep separate urine samples and 24-hour amounts apart
    Given a lab report gives creatinine from a 24-hour collection, as 13746 µmol/24h and 1.55 g/24h, and from a spot sample, as 4367 µmol/L and 0.49 g/L
    And the AI knows the LOINC test of each value
    When the values are analyzed
    Then one value should be kept for the 24-hour amount and one for the spot sample
    And no duplicate conflict warning should be shown

  Scenario: Keep an English report's white cell counts and percentages apart
    Given an English lab report names both the count and the percentage of each white cell type alike, as "Neutrophils" in 10^9/L and in %
    When the values are analyzed
    Then each count and each percentage should be kept, as two different tests
    And no duplicate conflict warning should be shown

  Scenario: Tell a 24-hour collection named once from its concentration
    Given a lab report names the creatinine of a 24-hour urine collection "Creatinina (urine, 24h)" for its concentration, 4582 µmol/L and 0.51 g/L, and for its 24-hour amount, 13746 µmol/24h and 1.55 g/24h
    And the AI knows the LOINC test of each value
    When the values are analyzed
    Then one value should be kept for the concentration and one for the 24-hour amount
    And no duplicate conflict warning should be shown

  Scenario: Tell a 24-hour collection's concentration from its 24-hour amount
    Given a lab report gives, for one 24-hour urine collection, "Creatinina/L (urine 24h)" as 4582 µmol/L and 0.51 g/L, and "Creatinina 24h (urine)" as 13746 µmol/24h and 1.55 g/24h
    And the AI knows the LOINC test of each value
    When the values are analyzed
    Then one value should be kept for the concentration and one for the 24-hour amount
    And no duplicate conflict warning should be shown

  Scenario: Keep values of an unknown test in two units apart
    Given a lab report gives a test no LOINC test fits in mg/L and in µmol/L
    When the values are analyzed
    Then both values should be kept, as nothing says they are one test
    And no duplicate conflict warning should be shown

  Scenario: Flag genuinely different duplicate values as conflict
    Given a lab report contains creatinine as both 67 µmol/L and 1.5 mg/dL
    And the AI knows the LOINC test of each
    When the values are analyzed
    Then they should be recognized as conflicting values
    And a duplicate conflict warning should be shown
    And the user should choose which value to keep

  # Additional Biomarker Conversions
  Scenario: Convert hematocrit from percentage to ratio
    Given a hematocrit value of 45%
    When I convert it to L/L
    Then the result should be 0.45 L/L

  Scenario: Convert eGFR with European notation
    Given an eGFR value of 90 mL/min/1,73m²
    When the unit is normalized
    Then it should be recognized as mL/min/1.73m²

  Scenario: Convert enzymes between U/L and IU/L
    Given an ALT value of 35 U/L
    When I convert it to IU/L
    Then the result should be 35 IU/L
    And the units should be recognized as equivalent

  Scenario: Convert TPO antibodies between unit variants
    Given a TPO antibodies value of 150 IU/mL
    When I convert it to kIU/L
    Then the result should be 150 kIU/L
    And the units should be recognized as equivalent

  # Units converted by what UCUM knows, with each substance's molar mass and charge
  Scenario: Show a substance measured in mass and in moles on one line
    Given I have vitamin D3 values of 32.6 ng/mL and 81.5 nmol/L, and cortisol values of 15 µg/dL and 410 nmol/L, each saved under its LOINC test for that kind of unit
    When I view the trend of each
    Then both values of each should be on one line, converted by the substance's molar mass

  Scenario: Show a value in equivalents with values in moles
    Given I have carbon dioxide values of 25 mEq/L and 27 mmol/L
    When I view the carbon dioxide trend
    Then both values should be on one line in mEq/L

  Scenario: Show two spellings of one international unit on one line
    Given I have FSH values of 6.2 mIU/mL and 7.4 mUI/mL, and 8 IU/L
    When I view the FSH trend
    Then all three values should be on one line, as one mIU/mL is one IU/L

  Scenario: Convert a white cell count given per microlitre
    Given I have white blood cell counts of 6.5 10^9/L and 7200 cells/µL
    When I view the white blood cell trend
    Then both values should be on one line in 10^9/L, the second as 7.2
