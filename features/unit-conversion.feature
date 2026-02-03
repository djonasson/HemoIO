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
    And the preference should be saved

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

  # Duplicate Value Detection (Same Measurement in Different Units)
  Scenario: Detect equivalent values in different units
    Given a lab report contains creatinine as both 67 µmol/L and 0.76 mg/dL
    When the values are analyzed
    Then they should be recognized as the same measurement
    And only one value should be kept
    And no duplicate conflict warning should be shown

  Scenario: Detect equivalent urine creatinine values
    Given a lab report contains urine creatinine as both 3780 µmol/L and 0.42 g/L
    When the values are analyzed
    Then they should be recognized as equivalent after unit conversion
    And the values should be merged without conflict

  Scenario: Detect equivalent protein/creatinine ratio values
    Given a lab report contains protein/creatinine ratio as both 15 mg/mmolcreat. and 132 mg/gcreat.
    When the values are analyzed
    Then they should be recognized as equivalent measurements
    And the values should be merged without conflict

  Scenario: Flag genuinely different duplicate values as conflict
    Given a lab report contains creatinine as both 67 µmol/L and 1.5 mg/dL
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
