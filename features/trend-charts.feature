Feature: Trend Charts
  As a health-conscious user
  I want to visualize my biomarker values over time
  So that I can identify trends and patterns in my health data

  Background:
    Given the application is set up and unlocked
    And I have multiple lab results imported over time

  Scenario: View single biomarker trend chart
    When I navigate to the Trends view
    And I select "Hemoglobin" from the biomarker dropdown
    Then I should see a line chart displaying hemoglobin values over time
    And the x-axis should show dates in chronological order
    And the y-axis should show values with the appropriate unit

  Scenario: Reference range displayed on chart
    Given I am viewing the trend chart for "Glucose"
    Then I should see a shaded band indicating the normal reference range
    And the band should span from the lower reference value to the upper reference value
    And the band should be visually distinct from the data line

  Scenario: Identify values outside reference range
    Given I am viewing the trend chart for a biomarker with abnormal values
    Then data points outside the reference range should be highlighted
    And high values should be indicated with a red marker
    And low values should be indicated with an orange marker
    And normal values should use the standard blue color

  Scenario: Filter trend chart by date range
    When I navigate to the Trends view
    And I select a biomarker
    And I set the start date to "2024-01-01"
    And I set the end date to "2024-06-30"
    Then the chart should only display data points within that date range
    And the x-axis should adjust to show the filtered range

  Scenario: View trend direction indicator
    Given I am viewing the trend chart for "Hemoglobin"
    And I have at least 3 data points
    Then I should see a trend direction indicator
    And it should show "increasing", "decreasing", or "stable" based on the data

  Scenario: View rate of change statistic
    Given I am viewing the trend chart for "Glucose"
    And I have at least 2 data points with different dates
    Then I should see the rate of change displayed
    And it should show the average change per time period

  Scenario: Compare multiple biomarkers
    When I navigate to the Trends view
    And I click "Compare Markers"
    And I select "LDL Cholesterol" as the first marker
    And I select "HDL Cholesterol" as the second marker
    Then I should see both biomarkers plotted on the same chart
    And each biomarker should have a distinct color
    And the legend should identify each line

  Scenario: Handle different units on multi-marker chart
    Given I am comparing "Hemoglobin" (g/dL) and "Glucose" (mg/dL)
    Then the chart should use dual y-axes
    And the left y-axis should show g/dL scale
    And the right y-axis should show mg/dL scale
    And each data series should reference its appropriate axis

  Scenario: View chart with single data point
    Given I have only one value for "Vitamin D"
    When I view the trend chart for "Vitamin D"
    Then I should see the single data point displayed
    And a message should indicate "More data needed for trend analysis"

  Scenario: Handle missing data gracefully
    Given I have lab results with gaps in dates
    When I view the trend chart
    Then the chart should connect available data points
    And gaps should not show fabricated data

  Scenario: Hover to see data point details
    Given I am viewing a trend chart with data points
    When I hover over a data point
    Then I should see a tooltip showing:
      | Field         |
      | Date          |
      | Value         |
      | Reference Range |
      | Lab Name      |

  Scenario: Chart accessibility
    Given I am viewing a trend chart
    Then the chart should have appropriate ARIA labels
    And screen readers should be able to access the data values
    And keyboard navigation should allow focusing on data points

  Scenario: Empty state when no biomarker selected
    When I navigate to the Trends view
    And no biomarker is selected
    Then I should see a message prompting me to select a biomarker
    And I should see a dropdown to select from available biomarkers

  Scenario: Empty state when biomarker has no data
    When I navigate to the Trends view
    And I select a biomarker that has no recorded values
    Then I should see a message indicating no data is available
    And I should see a suggestion to import lab results

  Scenario: View trend statistics summary
    Given I am viewing the trend chart for "Glucose"
    And I have multiple data points
    Then I should see a statistics summary showing:
      | Statistic     |
      | Minimum value |
      | Maximum value |
      | Average value |
      | Latest value  |
      | Trend direction |

  Scenario: Responsive chart sizing
    Given I am viewing a trend chart
    When I resize the browser window
    Then the chart should resize appropriately
    And all data points should remain visible
    And the legend should remain readable
