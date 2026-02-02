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
    And categories should include "Thyroid Panel"
    And categories should include "Iron Studies"
    And categories should include "Vitamins"

  Scenario: Browse biomarkers in a category
    When I click on the "Complete Blood Count" category
    Then I should see biomarkers in that category
    And I should see "White Blood Cells (WBC)"
    And I should see "Red Blood Cells (RBC)"
    And I should see "Hemoglobin"
    And I should see "Hematocrit"
    And I should see "Platelets"

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
    Then I should see "White Blood Cells (WBC)" in the results

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

  # Navigation
  Scenario: Return to category list from detail
    Given I am viewing the detail for a biomarker
    When I click the back button
    Then I should return to the category or search results

  Scenario: Navigate between biomarker details
    Given I am viewing the detail for "Glucose"
    When I click on a related biomarker "HbA1c"
    Then I should see the detail view for "HbA1c"

  # Integration with Lab Results
  Scenario: View my results for a biomarker
    Given I have lab results containing "Glucose" values
    When I view the detail for "Glucose"
    Then I should see a summary of my historical values
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
