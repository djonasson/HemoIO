Feature: Alerts
  As a health-conscious user
  I want to see alerts for abnormal biomarker values
  So that I can quickly identify values that need attention

  Background:
    Given the application is set up and unlocked
    And I have lab results with biomarker values

  Scenario: View out-of-range alerts summary
    Given I have biomarkers with values outside their reference ranges
    When I navigate to the Alerts view
    Then I should see an alerts summary panel
    And it should display the count of abnormal values

  Scenario: High value alert display
    Given I have a glucose value of 150 mg/dL (reference: 70-100)
    When I view the alerts
    Then I should see an alert for "Glucose"
    And it should be marked as "High"
    And it should show the value and reference range
    And the alert should have a red indicator

  Scenario: Low value alert display
    Given I have a hemoglobin value of 10 g/dL (reference: 12-17.5)
    When I view the alerts
    Then I should see an alert for "Hemoglobin"
    And it should be marked as "Low"
    And it should show the value and reference range
    And the alert should have an orange indicator

  Scenario: One alert card per test
    Given I have multiple abnormal values for the same biomarker over time
    When I view the alerts
    Then I should see one alert card for that biomarker
    And the card should show its latest abnormal value
    And the card should say how many results are abnormal and how many of them are new

  Scenario: Expand an alert card to see earlier results
    Given I have three abnormal glucose values on different dates
    When I view the alerts
    And I expand the glucose alert card
    Then I should see the two earlier glucose results, most recent first
    And each earlier result should show its date, value and lab

  Scenario: Open an earlier result in Trends
    Given I have two abnormal glucose values on different dates
    When I expand the glucose alert card
    And I click the earlier glucose result
    Then I should be navigated to the trend view for glucose
    And the earlier data point should be highlighted

  Scenario: Most recent values shown first
    Given I have multiple abnormal values across different dates
    When I view the alerts
    Then alerts should be sorted with most recent values first
    And each alert should show the date of the lab result

  Scenario: Trend alert for consistent direction
    Given I have 4 consecutive hemoglobin values that are decreasing
    When I view the alerts
    Then I should see a trend alert for "Hemoglobin"
    And it should indicate "Consistently decreasing"
    And it should show the timeframe of the trend

  Scenario: No alerts when all values are normal
    Given all my biomarker values are within reference ranges
    When I view the alerts
    Then I should see a success message
    And it should say "All values within normal range"

  Scenario: Nothing to check before any values are imported
    Given I have no lab results
    When I view the alerts
    Then it should say "No values to check yet"
    And I should not be told that all values are within normal range

  Scenario: Alert priority based on severity
    Given I have values that are:
      | Biomarker  | Value | Reference High | Severity |
      | Glucose    | 180   | 100            | Critical |
      | Hemoglobin | 11.5  | 12.0           | Warning  |
    When I view the alerts
    Then critical alerts should appear before warning alerts
    And critical alerts should have more prominent styling

  Scenario: Click alert to view details
    Given I have an alert for "Glucose"
    When I click on the glucose alert
    Then I should be navigated to the trend view for glucose
    And the relevant data point should be highlighted

  Scenario: Dismiss alert temporarily
    Given I have an alert for an abnormal value
    When I click the dismiss button on the alert
    Then the alert should be hidden from the current view
    And it should reappear on the next page load

  Scenario: Dismissing a card hides every result of that test
    Given I have two abnormal glucose values on different dates
    When I dismiss the glucose alert card
    Then no glucose alert should be shown
    And the alert count should no longer include either glucose result

  Scenario: Acknowledge alert persistently
    Given I have an alert for an abnormal value
    When I click "Acknowledge" on the alert
    Then the alert should be marked as acknowledged and hidden
    And it should remain hidden until a newer abnormal value for that biomarker

  Scenario: Acknowledging a card acknowledges every result of that test
    Given I have two abnormal glucose values on different dates
    When I acknowledge the glucose alert card
    Then no glucose alert should be shown
    And it should stay hidden after the next page load

  Scenario: A later abnormal result makes an acknowledged test new again
    Given I have acknowledged the alert card for two abnormal glucose values
    When a later lab result with an abnormal glucose value is added
    Then the glucose alert card should be shown again
    And it should count three results, one of them new
    And the earlier results should not be marked as new

  Scenario: No new alerts after acknowledging every alert
    Given I have one alert for an abnormal value
    When I acknowledge it
    Then I should see "No new alerts"
    And I should not be told that all values are within normal range

  Scenario: Filter alerts by category
    Given I have alerts from different biomarker categories
    When I filter alerts by "Metabolic"
    Then I should only see alerts for metabolic biomarkers
    And other category alerts should be hidden

  Scenario: Alert accessibility
    Given I have abnormal value alerts
    Then each alert should have an accessible role
    And screen readers should announce the alert severity
    And alerts should be navigable via keyboard
    And the earlier results of a card can be expanded and opened via keyboard

  Scenario: Alert badge in navigation
    Given I have 3 abnormal biomarker values
    When I view the navigation bar
    Then the Alerts link should show a badge with "3"
    And the badge should be visually prominent

  Scenario: Alert badge counts new results, not tests
    Given I have two abnormal glucose values and one abnormal hemoglobin value
    When I view the navigation bar
    Then the Alerts link should show a badge with "3"

  Scenario: Rapid improvement alert
    Given I had a high glucose value of 180 mg/dL last month
    And my latest glucose value is 95 mg/dL
    When I view the alerts
    Then I should see a positive trend alert
    And it should indicate "Improved: Glucose now within range"

  Scenario: Alert timestamp display
    Given I have an alert from a lab result dated "2024-06-15"
    When I view the alerts
    Then I should see the relative time (e.g., "2 months ago")
    And hovering should show the full date
