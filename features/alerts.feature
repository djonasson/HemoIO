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

  Scenario: A censored value is alerted only when its bound proves it out of range
    Given I have a Glucose result printed as "> 200" mg/dL, above the reference high of 100
    And a Hemoglobin result printed as "< 20" g/dL, whose reference range ends at 17.5
    When I view the alerts
    Then Glucose should be alerted as high at "> 200 mg/dL"
    And Hemoglobin should not be alerted, as it may be anywhere below 20

  Scenario: A censored value proving the values turned raises no trend alert
    Given I have Glucose results of 110, 120, 130 and 140 mg/dL, and then "< 60" mg/dL
    When I view the alerts
    Then Glucose should be alerted as low at "< 60 mg/dL"
    But no alert should say it is consistently increasing

  Scenario: A censored value between measured ones that went the other way raises no trend alert
    Given I have Glucose results of 110 and 120 mg/dL, then "> 200" mg/dL, then 130 and 140 mg/dL
    When I view the alerts
    Then no alert should say it is consistently increasing, as the values rose above 200 and fell back

  Scenario: A censored value is critical only when its bound proves it far enough out
    Given the lab marked a value of "< 30" low, with a reference low of 20
    When I view the alerts
    Then it should be alerted as a warning, not as critical, as it may be 25

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

  Scenario: Filter alerts by LOINC class
    Given I have alerts for tests of different LOINC classes
    When I filter alerts by "Chemistry"
    Then I should only see alerts for chemistry tests
    And alerts of other classes should be hidden

  Scenario: Glucose in mg/dL and in mmol/L is one alert card
    Given I have an out-of-range glucose value in mg/dL and a later one in mmol/L
    When I navigate to the Alerts view
    Then I should see one card for "Glucose"
    And it should count both results

  Scenario: Alerts name a test as LOINC does where HemoIO has no name for it
    Given I have an out-of-range value of a LOINC test HemoIO has no name for
    When I navigate to the Alerts view
    Then its card should name the test by its LOINC short name
    And that name should not say mass or moles when the test has codes of both

  Scenario: An alert states its value as Trends shows it
    Given I have an out-of-range glucose value recorded in mmol/L
    When I navigate to the Alerts view
    Then its card should state the value in mg/dL, the unit Trends shows glucose in

  Scenario: An alert about a value on a line of its own opens that line
    Given I have hemoglobin values in g/dL
    And on the same day an out-of-range hemoglobin value in a unit that cannot be converted to g/dL
    When I click the alert about the value in the other unit
    Then I should be navigated to the trend of hemoglobin in that unit
    And that value should be highlighted, not the value in g/dL of the same day

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
