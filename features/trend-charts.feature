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

  Scenario: A censored value is drawn open at its bound
    Given I have Glucose results of "< 60" mg/dL and then twice 95 mg/dL
    When I view the Glucose trend
    Then the "< 60" point should be drawn open, at its bound, not as a measurement
    And its label should read "< 60 mg/dL"
    And the trend should read "Stable", from the measured values only, not rising from 60

  Scenario: A censored value proving the values turned breaks the trend
    Given I have Glucose results of 110, 120, 130 and 140 mg/dL, and then "< 60" mg/dL
    When I view the Glucose trend
    Then the trend should not read "Increasing", as the values surely fell

  Scenario: The statistics read values as printed
    Given my latest Glucose result is "> 100" mg/dL, with a reference range of 70-100 mg/dL
    When I view the Glucose trend
    Then the latest and highest values should read "> 100"
    And the latest value should not be coloured as normal, as its status cannot be told

  Scenario: An interval reads as its ends on the chart, in the line's unit
    Given I have a urine red blood cell count of "5-10" per microscope field
    When I view its trend, drawn in RBC/HPF
    Then the point should read "5-10 RBC/HPF", not its midpoint 7.5

  Scenario: The comparison reads values as printed
    Given I compare Glucose, with a result of "< 10" mg/dL, with another biomarker
    Then the comparison's tooltip should read "< 10 mg/dL"
    And the "< 10" point should be drawn open

  Scenario: Identify values outside reference range
    Given I am viewing the trend chart for a biomarker with abnormal values
    Then data points outside the reference range should be highlighted
    And high values should be indicated with a red marker
    And low values should be indicated with an orange marker
    And normal values should use the standard green color

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
    Given I am viewing the trend chart for "LDL Cholesterol"
    When I click "Compare Markers"
    Then "LDL Cholesterol" should already be selected as the first marker
    When I select "HDL Cholesterol" as the second marker
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

  Scenario: Glucose in mg/dL and in mmol/L is one line
    Given I have glucose values in mg/dL and others in mmol/L
    When I navigate to the Trends view
    Then "Glucose" should be offered once in the biomarker dropdown
    When I select "Glucose" from the biomarker dropdown
    Then every glucose value should be plotted on one line in mg/dL, the standard unit
    When I choose mmol/L as my preferred unit
    Then every glucose value should be plotted in mmol/L

  Scenario: Values in a unit the chart cannot convert get a line of their own
    Given I have hemoglobin values in g/dL and one in a unit that cannot be converted to g/dL
    When I view the hemoglobin trend chart
    Then only the values in g/dL should be plotted
    And I should be told that one value in the other unit is shown on a line of its own
    And that value should be offered as its own line, named with its unit
    And that line's reference link and notes should name the test without the unit

  Scenario: Units spelled differently, and values with no unit, on lines of their own
    Given I have hemoglobin values in g/dL, one in "xyz/L", one in "XYZ/L" and one with no unit
    When I view the hemoglobin trend chart
    Then the values in "xyz/L" and "XYZ/L" should be one line of their own
    And the value with no unit should be offered as "Hemoglobin with no unit"

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

  Scenario: Open a biomarker's reference page from its trend
    Given I am viewing the trend chart for "Glucose"
    When I choose to view the reference information for "Glucose"
    Then I should see the Biomarkers page showing the detail for "Glucose"
    And I should be able to go from there to the biomarker list

  Scenario: Reference page of another biomarker after switching
    Given I am viewing the trend chart for "Glucose"
    When I select "Hemoglobin" from the biomarker dropdown
    And I choose to view the reference information for "Hemoglobin"
    Then I should see the Biomarkers page showing the detail for "Hemoglobin"

  Scenario: Open the reference page by keyboard
    Given I am viewing the trend chart for "Glucose"
    When I tab to the reference link and press Enter
    Then I should see the Biomarkers page showing the detail for "Glucose"

  Scenario: The reference link works while I am typing a unit
    Given I am viewing the trend chart for "Glucose"
    And I have typed a unit Glucose does not support as my preferred unit
    When I choose to view the reference information for "Glucose"
    Then I should see the Biomarkers page showing the detail for "Glucose"

  Scenario: The reference link for a test with a single unit
    Given I am viewing the trend chart for "Red Cell Distribution Width", which has a single unit
    Then I should not be offered a choice of unit
    But I should be offered its reference page

  Scenario: No reference link for a value saved as not a LOINC test
    Given I have values saved as "Not a LOINC test"
    When I view the trend chart for that test, named as the report prints it
    Then I should not be offered a reference page

  Scenario: Values of a test that is not a LOINC test trend by name and unit
    Given I have values saved as "Not a LOINC test" under one printed name in two units
    When I navigate to the Trends view
    Then each unit should be offered as a line of its own

  Scenario: Choosing Trends in the menu starts the page over
    Given I am viewing the trend chart for "Glucose"
    When I choose Trends in the menu
    Then no biomarker should be selected

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

  Scenario: Trend statistics follow dark mode
    Given the app is in dark mode
    When I view the trend statistics for "Glucose"
    Then the reference range box should be dark, not a light box

  Scenario: Responsive chart sizing
    Given I am viewing a trend chart
    When I resize the browser window
    Then the chart should resize appropriately
    And all data points should remain visible
    And the legend should remain readable
