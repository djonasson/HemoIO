Feature: Biomarker Dictionary
  As a user
  I want to browse and learn about biomarkers
  So that I can understand my lab results better

  Background:
    Given I am logged into the application
    And I navigate to the Biomarkers page

  # Browsing by LOINC class
  Scenario: View biomarker groups by LOINC class
    Then I should see the biomarkers grouped by their LOINC class
    And the groups should include "Chemistry"
    And the groups should include "Hematology"
    And the groups should include "Urinalysis"
    And the groups should include "Fertility"

  Scenario: Browse the biomarkers of a class
    When I open the "Hematology" group
    Then I should see biomarkers of that class
    And I should see "White Blood Cell Count"
    And I should see "Red Blood Cell Count"
    And I should see "Hemoglobin"
    And I should see "Hematocrit"
    And I should see "Platelet Count"
    And I should not see a chemistry test such as "Glucose"

  Scenario: Browse chemistry biomarkers
    When I open the "Chemistry" group
    Then I should see "Glucose"
    And I should see "Creatinine"
    And I should see "Blood Urea Nitrogen"
    And I should see "Sodium"
    And I should see "Total Cholesterol"

  Scenario: The list shows the tests HemoIO describes and the tests I have values for
    Given I have values for a LOINC test HemoIO has no description of
    When I navigate to the Biomarkers page
    Then the list should include the tests HemoIO describes
    And it should include the test I have values for, under its LOINC class

  # Searching
  Scenario: Search for a biomarker by name
    When I type "glucose" in the search field
    Then I should see "Glucose" in the results
    And results should be filtered to match my search

  Scenario: Search for a biomarker by abbreviation
    When I type "WBC" in the search field
    Then I should see "White Blood Cell Count" in the results

  Scenario: Extra spaces in a search do not change the results
    When I type "  white   blood cell " in the search field
    Then I should see "White Blood Cell Count" in the results

  Scenario: Search finds tests across the whole LOINC catalog
    When I type the name of a LOINC test that HemoIO has no description of and I have no values for
    Then I should see that test in the results, named by LOINC

  Scenario: Search for a test by its LOINC code
    When I type the LOINC code "14749-6" in the search field
    Then I should see "Glucose" first in the results, the test that code is part of

  Scenario: Search with no results
    When I type "xyz123" in the search field
    Then I should see a message indicating no results found

  Scenario: Clear search
    Given I have searched for "glucose"
    When I clear the search field
    Then I should see all groups again

  # Viewing Biomarker Details
  Scenario: View biomarker detail
    When I click on "Glucose" in the list
    Then I should see the biomarker detail view
    And I should see the biomarker name "Glucose"
    And I should see the standard reference range
    And I should see the unit of measurement
    And I should see a description of what the biomarker measures

  Scenario: User sees the sample in biomarker details
    Given I am viewing the biomarker dictionary
    When I select a biomarker
    Then I should see its sample, from its LOINC test, with a descriptive label

  Scenario: User sees LOINC code in biomarker details
    Given I am viewing the biomarker dictionary
    When I select a biomarker
    Then I should see the LOINC code displayed
    And LOINC's own name for the code beside it
    And the LOINC code should link to the LOINC website

  Scenario: A test HemoIO has no description of
    When I open a LOINC test HemoIO has no description of
    Then I should see LOINC's name for it
    And I should be told that there is no description yet
    And no standard reference range should be shown

  Scenario: View what high values mean
    Given I am viewing the detail for "Glucose"
    Then I should see information about what high values may indicate
    And common causes should be listed

  Scenario: View what low values mean
    Given I am viewing the detail for "Glucose"
    Then I should see information about what low values may indicate
    And common causes should be listed

  Scenario: View the other LOINC codes of the test
    Given I am viewing the detail for "Glucose"
    Then I should see the other LOINC codes my glucose values may be recorded under, such as glucose in mmol/L
    And each should show its LOINC name and code

  Scenario: View personal target if set
    Given I have set a personal target for "Glucose"
    When I view the detail for "Glucose"
    Then I should see both the standard range and my personal target
    And my personal target should be highlighted

  Scenario: Set a personal target from the detail
    Given I have no personal target for "Glucose"
    When I view the detail for "Glucose"
    Then I should see that the standard range is used
    When I edit the personal target to 70 - 90
    Then I should see my personal target 70 - 90 mg/dL
    And it should still be set after I sign in again

  # Navigation
  Scenario: Return to category list from detail
    Given I am viewing the detail for a biomarker
    When I click the back button
    Then I should return to the group or search results
    And my search and scroll position should be kept

  Scenario: A biomarker page opened from another page starts at the top
    Given I have scrolled down the trend chart for "Glucose"
    When I open its reference page
    Then the page for "Glucose" should start at the top, with its back button in view

  Scenario: Back from a biomarker page opened from another page
    Given I opened the page for "Glucose" from its trend chart
    When I click the back button
    Then I should see the biomarker list from the top, with nothing searched
    And the search field should have keyboard focus

  Scenario: Choosing Biomarkers in the menu shows the list
    Given I am viewing the detail for "LDL Cholesterol"
    When I choose Biomarkers in the menu
    Then I should see the biomarker list


  # Integration with Lab Results
  Scenario: View my results for a biomarker
    Given I have lab results containing "Glucose" values
    When I view the detail for "Glucose"
    Then I should see a summary of my historical values
    And I should see my latest value with its date and status
    And I should see how many results I have
    And I should have a link to view the trend chart

  Scenario: My results read like the timeline
    Given my latest "Glucose" value is "< 80" mg/dL, with a reference range of 70-100 mg/dL
    When I view the detail for "Glucose"
    Then its status should read "Cannot be compared with the reference range", as on the timeline
    And a value the lab marked should show the mark and read "Flagged high by the lab" when the mark gives its status
    And a test whose results are all words, which are not charted, should offer no link to a trend

  Scenario: Biomarker with no personal data
    Given I have no lab results containing "Ferritin" values
    When I view the detail for "Ferritin"
    Then I should see reference information
    And I should see a message that I have no recorded values

  # Accessibility
  Scenario: Navigate dictionary with keyboard
    When I use Tab to navigate through the dictionary
    Then I should be able to reach all interactive elements
    And focus indicators should be visible

  Scenario: Screen reader compatibility
    Then all biomarker information should have appropriate ARIA labels
    And groups should be properly announced
    And search results should be announced when updated

