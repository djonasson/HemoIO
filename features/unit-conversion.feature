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
