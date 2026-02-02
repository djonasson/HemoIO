Feature: Import Wizard
  As a user
  I want to import lab report documents
  So that I can track my health data without manual entry

  Background:
    Given I am logged into HemoIO
    And I navigate to the Import page

  # Upload Step
  Scenario: User sees the upload interface
    Then I should see a file upload area
    And I should see instructions for uploading
    And the supported file types should be listed

  Scenario: User uploads a single PDF file
    When I drag and drop a PDF file onto the upload area
    Then the file should appear in the upload list
    And I should see the file name and size
    And I should be able to remove the file

  Scenario: User uploads a single image file
    When I select an image file using the file picker
    Then the file should appear in the upload list
    And I should see a thumbnail preview

  Scenario: User uploads multiple files
    When I select multiple PDF files
    Then all files should appear in the upload list
    And I should see the total count of files

  Scenario: User tries to upload unsupported file type
    When I try to upload a .exe file
    Then I should see an error message about unsupported file type
    And the file should not be added to the upload list

  Scenario: User removes a file from upload list
    Given I have uploaded a file
    When I click the remove button on the file
    Then the file should be removed from the list

  Scenario: User proceeds to analysis step
    Given I have uploaded at least one valid file
    When I click the "Analyze" button
    Then I should proceed to the analysis step

  # Analysis Step
  Scenario: User sees analysis in progress
    Given I have submitted files for analysis
    Then I should see a progress indicator
    And I should see the current file being processed
    And I should see the processing stage

  Scenario: Analysis completes successfully
    Given all files have been analyzed
    Then I should automatically proceed to the review step
    And I should see a summary of extracted values

  Scenario: Analysis fails for a file
    Given a file cannot be analyzed
    Then I should see an error message for that file
    And I should be able to skip that file
    And I should be able to proceed with successfully analyzed files

  # Review Step
  Scenario: User reviews extracted values
    Given the analysis has completed
    Then I should see a list of extracted biomarkers
    And each value should show the extracted result
    And each value should show a confidence indicator
    And I should see the reference range if detected

  Scenario: User sees confidence indicators
    Given I am on the review step
    Then high confidence values should be marked in green
    And medium confidence values should be marked in yellow
    And low confidence values should be marked in red

  Scenario: User edits an extracted value
    Given I see an incorrectly extracted value
    When I click on the value to edit it
    Then I should be able to change the value
    And I should be able to change the unit
    And I should see a list of matching biomarkers

  Scenario: User adds a missing value
    Given the AI missed a value from the report
    When I click "Add Value"
    Then I should be able to select a biomarker
    And I should be able to enter the value and unit

  Scenario: User removes an extracted value
    Given I see an incorrectly extracted value
    When I click the remove button
    Then the value should be removed from the list

  Scenario: User sets the lab date
    Given I am on the review step
    Then I should see a date picker for the lab date
    And the detected date should be pre-filled if found
    And I should be able to change the date

  Scenario: User sets the lab name
    Given I am on the review step
    Then I should see a field for the lab name
    And the detected lab name should be pre-filled if found
    And I should be able to change the lab name

  # Confirm Step
  Scenario: User sees confirmation summary
    Given I have reviewed all values
    When I proceed to the confirm step
    Then I should see a summary of all values to be saved
    And I should see the lab date and name
    And I should see the total number of values

  Scenario: User confirms and saves the import
    Given I am on the confirm step
    When I click "Save Results"
    Then the lab result should be saved to the database
    And I should see a success message
    And I should be redirected to the timeline view

  Scenario: User goes back to make changes
    Given I am on the confirm step
    When I click the "Back" button
    Then I should return to the review step
    And my previous edits should be preserved

  # Edge Cases
  Scenario: No values extracted from document
    Given the AI could not extract any values
    Then I should see a message explaining the issue
    And I should have the option to manually enter values
    And I should have the option to try a different file

  Scenario: Session timeout during long analysis
    Given the analysis is taking a long time
    When my session times out
    Then I should see a session timeout message
    And I should be able to log back in
    And my uploaded files should be preserved

  # Accessibility
  Scenario: Import wizard is accessible
    Then all form fields should have accessible labels
    And all steps should be navigable via keyboard
    And progress should be announced to screen readers
    And error messages should be announced
