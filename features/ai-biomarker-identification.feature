Feature: AI biomarker identification
  As a user importing lab reports in any language
  I want each value filed under the right test
  So that my trends and alerts are correct without fixing names by hand

  Background:
    Given I am logged in
    And an AI provider is configured

  Scenario: The AI identifies the test of each value
    Given the AI identifies "Creatinina/L (urine 24h)" in µmol/L as Urine Creatinine
    When the report is analyzed
    Then the value should be saved as Urine Creatinine
    And it should carry no label that asks for a check

  Scenario: The unit does not fit the test the AI chose
    Given the AI identifies a value in g/24h as Urine Creatinine
    When the report is analyzed
    Then the row should be labelled "Unit doesn't fit"
    And Continue should be blocked until I choose a fitting unit, another test, or "Not in dictionary"

  Scenario: The printed name suggests a different test
    Given the AI identifies "Creatinina 24h" in µmol/L as Urine Creatinine
    When the report is analyzed
    Then the value should be saved as Urine Creatinine
    And the row should be labelled "Name suggests 24-Hour Urine Creatinine"

  Scenario: The model identifies no tests
    Given the AI returns no test for any value
    When the report is analyzed
    Then the analysis notes should say the model did not identify the tests
    And values matched by their name should be labelled "Matched by name only"
    And values with no match should be labelled "Not identified"

  Scenario: Change the test a value is saved as
    Given a value is saved as Urine Creatinine
    When I change its test to 24-Hour Urine Creatinine
    Then the value should be saved as 24-Hour Urine Creatinine
    And its unit choices should be those of 24-Hour Urine Creatinine

  Scenario: Editing the printed name keeps the test
    Given the AI identified a value as Urine Urea
    When I edit its printed name
    Then it should still be saved as Urine Urea

  Scenario: A confirmed name is learned
    Given I saved "Zorblatina (urine)" as Urine Urea
    When I import a report where the AI gives no test for "Zorblatina (urine)"
    Then the value should be saved as Urine Urea
    And the row should be labelled "Matched by name only"

  Scenario: Remove a learned name
    Given I saved "Zorblatina (urine)" as Urine Urea
    When I remove it from the learned names in Settings
    Then a later import of "Zorblatina (urine)" should not be identified by it

  Scenario: Saving as "Not in dictionary" forgets a learned name
    Given I saved "Zorblatina (urine)" as Urine Urea
    When I save it as "Not in dictionary" in a later import
    Then the learned name should be removed

  Scenario: The matching model cannot load
    Given the AI gives no test for a name no alias knows
    And the matching model cannot be downloaded
    When the report is analyzed
    Then the value should be labelled "Not identified"
    And the analysis notes should say the matching model could not load
