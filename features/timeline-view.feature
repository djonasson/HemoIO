Feature: Timeline View
  As a user
  I want to view my lab results in a chronological timeline
  So that I can track my health history over time

  Background:
    Given I have completed the first-run setup
    And I am logged into the application

  # Timeline Display
  Scenario: View empty timeline
    Given I have no lab results saved
    When I navigate to the Timeline view
    Then I should see an empty state message
    And I should see a call-to-action to import lab results
    And clicking the import button should navigate to the Import view

  Scenario: View timeline with lab results
    Given I have the following lab results saved:
      | date       | labName           | biomarkerCount |
      | 2024-01-15 | Quest Diagnostics | 5              |
      | 2024-03-20 | LabCorp           | 8              |
      | 2024-06-10 | Quest Diagnostics | 6              |
    When I navigate to the Timeline view
    Then I should see 3 lab result cards
    And the results should be sorted by date with newest first
    And each card should display the lab date
    And each card should display the lab name
    And each card should display the number of biomarkers

  Scenario: Expand lab result card to see test values
    Given I have a lab result from "Quest Diagnostics" on "2024-01-15"
    And it contains the following test values:
      | biomarker   | value | unit  | status |
      | Hemoglobin  | 14.5  | g/dL  | normal |
      | Glucose     | 125   | mg/dL | high   |
      | Creatinine  | 0.9   | mg/dL | normal |
    When I navigate to the Timeline view
    And I expand the lab result card
    Then I should see a table with all test values
    And the table should show biomarker name, value, and unit
    And the table should show reference ranges where available

  # Abnormal Value Indicators
  Scenario: Display visual indicators for abnormal values
    Given I have a lab result with the following values:
      | biomarker   | value | unit  | refLow | refHigh | status |
      | Hemoglobin  | 11.0  | g/dL  | 12.0   | 17.5    | low    |
      | Glucose     | 150   | mg/dL | 70     | 100     | high   |
      | Creatinine  | 1.0   | mg/dL | 0.7    | 1.3     | normal |
    When I navigate to the Timeline view
    And I expand the lab result card
    Then values below the reference range should have a low indicator icon
    And values above the reference range should have a high indicator icon
    And values within the reference range should have a normal indicator
    And abnormal values should be visually distinguished not just by color
    And the lab result card should show a badge with the abnormal count

  # Filtering
  Scenario: Filter timeline by date range
    Given I have lab results from the following dates:
      | date       |
      | 2024-01-15 |
      | 2024-03-20 |
      | 2024-06-10 |
      | 2024-09-05 |
    When I navigate to the Timeline view
    And I set the date filter from "2024-03-01" to "2024-07-01"
    Then I should see only 2 lab result cards
    And I should see results from "2024-03-20" and "2024-06-10"
    And I should not see results from "2024-01-15" or "2024-09-05"

  Scenario: Search timeline by lab name
    Given I have lab results from the following labs:
      | labName           | date       |
      | Quest Diagnostics | 2024-01-15 |
      | LabCorp           | 2024-03-20 |
      | Quest Diagnostics | 2024-06-10 |
    When I navigate to the Timeline view
    And I enter "Quest" in the search field
    Then I should see only 2 lab result cards
    And all visible results should be from "Quest Diagnostics"

  Scenario: Clear filters
    Given I have multiple lab results
    And I have applied date and search filters
    When I click the clear filters button
    Then all filters should be reset
    And I should see all lab results

  # Deletion
  Scenario: Delete a lab result with confirmation
    Given I have a lab result from "Quest Diagnostics" on "2024-01-15"
    When I navigate to the Timeline view
    And I click the delete button on the lab result card
    Then I should see a confirmation dialog
    And the dialog should warn that this action cannot be undone
    When I confirm the deletion
    Then the lab result should be removed from the timeline
    And I should see a success notification

  Scenario: Cancel lab result deletion
    Given I have a lab result from "Quest Diagnostics" on "2024-01-15"
    When I navigate to the Timeline view
    And I click the delete button on the lab result card
    And I cancel the deletion in the confirmation dialog
    Then the lab result should remain in the timeline

  # Accessibility
  Scenario: Timeline is keyboard accessible
    Given I have multiple lab results
    When I navigate to the Timeline view
    Then I should be able to navigate between cards using Tab
    And I should be able to expand cards using Enter or Space
    And I should be able to access all card actions via keyboard

  Scenario: Screen reader announces abnormal values
    Given I have a lab result with abnormal values
    When I navigate to the Timeline view using a screen reader
    Then the abnormal count badge should be announced
    And individual abnormal values should have accessible labels
    And the status (high/low/normal) should be announced for each value
