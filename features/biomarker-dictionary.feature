Feature: Biomarker Dictionary
  As a user
  I want to browse and learn about biomarkers
  So that I can understand my lab results better

  Background:
    Given I am logged into the application
    And I navigate to the Biomarkers page

  # Browsing by Category
  Scenario: View biomarker categories
    Then I should see a list of biomarker categories
    And categories should include "Complete Blood Count"
    And categories should include "Metabolic Panel"
    And categories should include "Lipid Panel"
    And categories should include "Thyroid Function"
    And categories should include "Iron Studies"
    And categories should include "Vitamins"

  Scenario: Browse biomarkers in a category
    When I click on the "Complete Blood Count" category
    Then I should see biomarkers in that category
    And I should see "White Blood Cell Count (WBC)"
    And I should see "Red Blood Cell Count (RBC)"
    And I should see "Hemoglobin"
    And I should see "Hematocrit"
    And I should see "Platelet Count (PLT)"

  Scenario: Browse metabolic panel biomarkers
    When I click on the "Metabolic Panel" category
    Then I should see biomarkers in that category
    And I should see "Glucose"
    And I should see "Creatinine"
    And I should see "BUN"
    And I should see "Sodium"
    And I should see "Potassium"

  Scenario: Browse lipid panel biomarkers
    When I click on the "Lipid Panel" category
    Then I should see biomarkers in that category
    And I should see "Total Cholesterol"
    And I should see "LDL Cholesterol"
    And I should see "HDL Cholesterol"
    And I should see "Triglycerides"

  # Searching
  Scenario: Search for a biomarker by name
    When I type "glucose" in the search field
    Then I should see "Glucose" in the results
    And results should be filtered to match my search

  Scenario: Search for a biomarker by abbreviation
    When I type "WBC" in the search field
    Then I should see "White Blood Cell Count (WBC)" in the results

  Scenario: Search for a biomarker by its abbreviation in the plural
    When I type "WBCs" in the search field
    Then I should see "White Blood Cell Count (WBC)" in the results

  Scenario: Extra spaces in a search do not change the results
    When I type "  white   blood cell " in the search field
    Then I should see "White Blood Cell Count (WBC)" in the results

  Scenario: Search with no results
    When I type "xyz123" in the search field
    Then I should see a message indicating no results found

  Scenario: Clear search
    Given I have searched for "glucose"
    When I clear the search field
    Then I should see all categories again

  # Viewing Biomarker Details
  Scenario: View biomarker detail
    When I click on "Glucose" in the list
    Then I should see the biomarker detail view
    And I should see the biomarker name "Glucose"
    And I should see the standard reference range
    And I should see the unit of measurement
    And I should see a description of what the biomarker measures

  Scenario: User sees specimen type in biomarker details
    Given I am viewing the biomarker dictionary
    When I select a biomarker with specimen type metadata
    Then I should see the specimen type displayed
    And the specimen type should use a descriptive label

  Scenario: User sees LOINC code in biomarker details
    Given I am viewing the biomarker dictionary
    When I select a biomarker with a LOINC code
    Then I should see the LOINC code displayed
    And LOINC's own name for the code beside it
    And the LOINC code should link to the LOINC website

  Scenario: Every biomarker's LOINC code is a LOINC code for that test
    Given the biomarker dictionary
    Then every LOINC code it gives should exist in LOINC
    And LOINC's name for it should describe that test, measured in that specimen

  Scenario: View what high values mean
    Given I am viewing the detail for "Glucose"
    Then I should see information about what high values may indicate
    And common causes should be listed

  Scenario: View what low values mean
    Given I am viewing the detail for "Glucose"
    Then I should see information about what low values may indicate
    And common causes should be listed

  Scenario: View related biomarkers
    Given I am viewing the detail for "Glucose"
    Then I should see related biomarkers
    And I should be able to click to view their details

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
    Then I should return to the category or search results
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

  Scenario: Navigate between biomarker details
    Given I am viewing the detail for "Glucose"
    When I click on a related biomarker "HbA1c"
    Then I should see the detail view for "HbA1c"

  # Integration with Lab Results
  Scenario: View my results for a biomarker
    Given I have lab results containing "Glucose" values
    When I view the detail for "Glucose"
    Then I should see a summary of my historical values
    And I should see my latest value with its date and status
    And I should see how many results I have
    And I should have a link to view the trend chart

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
    And categories should be properly announced
    And search results should be announced when updated

  # Values filed under the wrong test by earlier versions
  Scenario: A backup from before urea and urine red cells had their own tests
    Given I restore a backup in which urea was filed as blood urea nitrogen and a urine red cell count as urine blood
    Then urea should be listed as Urea, not as Blood Urea Nitrogen
    And the urine red cell count should be listed as Urine Red Blood Cells

  Scenario: Values an earlier version filed under the wrong test
    Given an earlier version stored a urine red cell count as urine blood
    When I unlock the application
    Then the red cell count should be listed as Urine Red Blood Cells

