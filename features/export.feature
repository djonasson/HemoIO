Feature: Export Lab Results
  As a user
  I want to export my lab results in various formats
  So that I can share them with healthcare providers or keep personal records

  Background:
    Given I am logged into the application
    And I have lab results in my account

  # CSV Export
  Scenario: Export all results to CSV
    When I click the "Export" button
    And I select "CSV" format
    And I click "Export"
    Then a CSV file should be downloaded
    And the file should contain all my lab results
    And each row should include date, lab name, biomarker, value, unit, and reference range

  Scenario: Export filtered results to CSV
    When I click the "Export" button
    And I select "CSV" format
    And I set the date range to "Last 6 months"
    And I click "Export"
    Then a CSV file should be downloaded
    And the file should only contain results from the last 6 months

  Scenario: Export specific biomarkers to CSV
    When I click the "Export" button
    And I select "CSV" format
    And I select only "Glucose" and "Hemoglobin" biomarkers
    And I click "Export"
    Then a CSV file should be downloaded
    And the file should only contain Glucose and Hemoglobin values

  # JSON Export
  Scenario: CSV export gives each value's LOINC code
    Given I have values identified by LOINC codes and a value saved as "Not a LOINC test"
    When I export my results to CSV
    Then each row should name its test as the app does
    And a LOINC column should give the code of each identified value
    And the code should be written so a spreadsheet keeps it as text, not as a date
    And it should be empty for the value that is not a LOINC test

  Scenario: A choice of biomarkers that no longer have values exports nothing
    Given I have lab results from "2024-01-15" and "2024-02-20"
    And only the lab result from "2024-01-15" has a glucose value
    When I choose to export only "Glucose" values and cancel the export
    And I delete the lab result from "2024-01-15"
    And I open the export dialog again
    Then the preview should count no test values
    And I should be told that the biomarkers I chose have no values now
    And the export button should be disabled
    When I clear the choice
    Then the export button should be enabled

  Scenario: Export all data to JSON
    When I click the "Export" button
    And I select "JSON" format
    And I click "Export"
    Then a JSON file should be downloaded
    And the file should contain all my lab results
    And the file should include schema version information

  Scenario: JSON export includes notes
    Given I have notes attached to lab results
    When I export to JSON format
    Then the exported file should include all my notes

  Scenario: Export includes changes made since the app was opened
    Given I have lab results from "2024-01-15" and "2024-02-20"
    When I delete the lab result from "2024-01-15"
    And I export to JSON format
    Then the exported file should contain only the lab result from "2024-02-20"

  # Export Dialog
  Scenario: Export dialog shows available options
    When I click the "Export" button
    Then I should see the export dialog
    And I should see format options: "CSV" and "JSON"
    And I should see date range filter
    And I should see biomarker selection

  Scenario: Cancel export
    When I click the "Export" button
    And I click "Cancel"
    Then the export dialog should close
    And no file should be downloaded

  # Error Handling
  Scenario: Export with no data
    Given I have no lab results
    When I click the "Export" button
    Then I should see a message "No data to export"
    And the export button should be disabled

  Scenario: Export progress indicator
    When I initiate an export
    Then I should see a progress indicator
    And the export button should be disabled during export

  # Accessibility
  Scenario: Export dialog is keyboard accessible
    When I open the export dialog
    Then I can navigate all options using keyboard
    And I can close the dialog with Escape key
    And I can initiate export with Enter key

  Scenario: Export dialog has proper ARIA labels
    When I open the export dialog
    Then all form controls should have accessible labels
    And the dialog should have a proper title
