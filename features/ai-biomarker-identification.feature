Feature: Identifying the test of each value
  As a user importing lab reports from any lab, in any language
  I want each value filed under its LOINC test
  So that my trends and alerts are correct without fixing names by hand

  Each value gets its LOINC code in this order: a test I chose before for
  the same wording and unit; the one test in the LOINC catalog that clearly
  fits the printed name, its sample and its unit; the AI's confident choice
  among the tests that fit; else I choose in the review step.

  Background:
    Given I am logged in
    And an AI provider is configured

  Scenario: A known test from a lab never imported before is matched with no question
    Given a report from a new lab prints "S-ALT" in U/L
    When the report is analyzed
    Then the value should be saved as "Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma"
    And its LOINC code 1742-6 should be shown with it
    And it should carry no label that asks for a check
    And the AI should not be asked which test it is

  Scenario: A value several tests fit is decided by the AI
    Given a report prints "Glucosio" in mg/dL, which fits glucose in serum or plasma and glucose in blood
    And the AI is sure it is glucose in serum or plasma
    When the report is analyzed
    Then the value should be saved as "Glucose [Mass/volume] in Serum or Plasma"
    And it should carry no label that asks for a check

  Scenario: The AI is asked once per report, only about the values it must decide
    Given a report prints "S-ALT" in U/L and "Glucosio" in mg/dL
    When the report is analyzed
    Then the AI should be asked once, about "Glucosio" only

  Scenario: A value the AI is unsure of shows the tests to choose from
    Given a report prints "Glucosio" in mg/dL
    And the AI is not sure which test it is
    When the report is analyzed
    Then the row should say "No test chosen", labelled "Choose a test"
    And its test list should offer the tests that fit, each with its LOINC name and code
    When I choose "Glucose [Mass/volume] in Blood"
    Then the value should be saved as "Glucose [Mass/volume] in Blood"
    And it should carry no label that asks for a check

  Scenario: A value with no test chosen blocks Continue
    Given the AI is not sure which test "Glucosio" in mg/dL is
    When I try to continue from review
    Then I should be told that Glucosio needs a test: choose one or "Not a LOINC test"

  Scenario: I can search the whole LOINC catalog for the test
    Given a value the AI is not sure of
    When I search its test list for "Hemoglobin" and choose "Hemoglobin [Mass/volume] in Blood"
    Then the value should be saved as "Hemoglobin [Mass/volume] in Blood"

  Scenario: Choose the test from the keyboard
    Given a value the AI is not sure of
    When I open its test list from the keyboard, type "Hemoglobin" and press Enter
    Then the value should be saved as the first test found

  Scenario: A test I chose is remembered once I save, and not asked again
    Given I chose "Glucose [Mass/volume] in Blood" for "Glucosio" in mg/dL and saved the import
    When I import another report that prints "Glucosio" in mg/dL
    Then the value should be saved as "Glucose [Mass/volume] in Blood"
    And the AI should not be asked which test it is
    And the learned names in Settings should list "glucosio" in mg/dL with that test

  Scenario: The AI's choice is remembered once I save it
    Given the AI chose "Glucose [Mass/volume] in Serum or Plasma" for "Glucosio" in mg/dL
    When I save the import
    Then the learned names in Settings should list "glucosio" in mg/dL with that test

  Scenario: A choice is not remembered when the import is not saved
    Given the AI chose a test for "Glucosio" in mg/dL
    When I leave the import without saving
    Then the learned names in Settings should not list "glucosio"

  Scenario: The same wording in another unit is a different question
    Given I chose "Glucose [Mass/volume] in Blood" for "Glucosio" in mg/dL and saved the import
    When I import a report that prints "Glucosio" in mmol/L
    Then the value should not be saved as "Glucose [Mass/volume] in Blood"

  Scenario: "Not a LOINC test" saves the value under its printed name
    Given a report prints "Zorblatina" in mg/dL, which no LOINC test fits
    And the row is labelled "Not identified"
    When I choose "Not a LOINC test" for it and save the import
    Then the timeline should show the value as "Zorblatina"
    And a later report printing "Zorblatina" in mg/dL should be saved as "Not a LOINC test" without asking

  Scenario: A value with no unit is never matched on its name alone
    Given a report prints "Proteine (urine)" without a unit
    When the report is analyzed
    Then the value should be saved as "Not a LOINC test", labelled "No unit in report"
    And the AI should not be asked which test it is
    And I should be able to continue without giving it a unit

  Scenario: Editing the printed name reads it again
    Given the AI is not sure which test "Glucosio" in mg/dL is
    When I rename it to "ALT" and change its unit to U/L
    Then the value should be saved as "Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma"

  Scenario: A test I chose stays when I rename the value
    Given I chose "Glucose [Mass/volume] in Blood" for a value
    When I rename it
    Then it should still be saved as "Glucose [Mass/volume] in Blood"

  Scenario: Remove a learned name
    Given I chose "Glucose [Mass/volume] in Blood" for "Glucosio" in mg/dL and saved the import
    When I remove it from the learned names in Settings
    Then a later import of "Glucosio" in mg/dL should ask the AI again

  Scenario: A test given twice, once as a share the app cannot read, is saved once
    Given a report gives "S-ALT" in U/L and again per 100 of something ("/100 HPF")
    When the report is analyzed
    Then the value in U/L should be saved as "Alanine aminotransferase [Enzymatic activity/volume] in Serum or Plasma"
    And the other value should be labelled "Not saved", with how to keep it
    And Continue should not be blocked by it
    And the confirmation should list it as not saved

  Scenario: A value set aside needs no fixing
    Given a value of a test given twice was left out
    When I clear its number
    Then Continue should not be blocked by it

  Scenario: A test I choose is never left out
    Given a value of a test given twice was left out
    When I choose its test myself
    Then it should no longer be labelled "Not saved"

  Scenario: Review fits a phone screen
    Given I review the values on a phone-sized screen
    Then the table should scroll on its own, not the page
    And the test each value is saved as should be shown in full

  # Covered by unit tests: a 24-hour urine value and a serum value of one
  # substance get different codes, and a learned "Not a LOINC test" wins
  # over the local match
  Scenario: The AI cannot be asked which test a value is
    Given the AI answers the extraction but fails when asked to choose tests
    When the report is analyzed
    Then the values it would decide should offer their tests to choose from
    And the analysis notes should say the tests could not be chosen automatically
