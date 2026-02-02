Feature: Alerts
  As a health-conscious user
  I want to see alerts for abnormal biomarker values
  So that I can quickly identify values that need attention

  Background:
    Given the application is set up and unlocked
    And I have lab results with biomarker values

  Scenario: View out-of-range alerts summary
    Given I have biomarkers with values outside their reference ranges
    When I navigate to a view with the alerts component
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

  Scenario: Group alerts by biomarker
    Given I have multiple abnormal values for the same biomarker over time
    When I view the alerts
    Then alerts should be grouped by biomarker name
    And I should see how many occurrences are abnormal

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

  Scenario: Acknowledge alert persistently
    Given I have an alert for an abnormal value
    When I click "Acknowledge" on the alert
    Then the alert should be marked as acknowledged
    And it should remain hidden until the next abnormal value for that biomarker

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

  Scenario: Alert badge in navigation
    Given I have 3 abnormal biomarker values
    When I view the navigation bar
    Then the Alerts link should show a badge with "3"
    And the badge should be visually prominent

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
