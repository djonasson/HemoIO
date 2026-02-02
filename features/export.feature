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
