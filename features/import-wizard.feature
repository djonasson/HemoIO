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
    Then I should see a summary of extracted values
    And I should be able to continue to the review step

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

  Scenario: User sees specimen type for identified values
    Given the analysis has completed
    When values are identified as LOINC tests
    Then each identified value should display the specimen of its test
    And a value with no test should show the specimen its name gives, if any

  Scenario: User sees LOINC code in tooltip
    Given the analysis has completed
    When I hover over an identified value's name
    Then I should see the LOINC code in a tooltip
    And LOINC's own name for the code beside it
    And the tooltip should include the test's description when HemoIO has one, on a line of its own

  Scenario: Keyboard users see the LOINC tooltip too
    Given the analysis has completed
    When I move the keyboard focus to an identified value's name
    Then I should see the LOINC code and LOINC's name in a tooltip

  Scenario: A long file name never squeezes the confidence badge
    Given I am on the review step on a phone-sized screen
    And a file has a long name
    Then the file's confidence badge shows its full text
    And the badge sits below the file name, which keeps the width to be read

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
    And its test should be read again from the new name and unit

  Scenario: User adds a missing value
    Given the AI missed a value from the report
    When I click "Add Biomarker"
    Then I should be able to enter its name, value and unit
    And its test should be found from the name and unit I typed

  Scenario: User adds a value of a test that has no unit
    Given the AI missed the specific gravity of the urine
    When I add it with no unit and choose the test "Specific gravity of Urine"
    Then I should be able to continue without giving it a unit

  Scenario: A value printed without a unit, saved as a test measured in one, needs its unit
    Given the report prints "Glucose" without a unit
    And the AI is sure it is "Glucose [Mass/volume] in Serum or Plasma"
    When I try to continue to the confirmation
    Then I should be told that the value is missing its unit
    When I choose its test and give it the unit mg/dL
    Then I should be able to continue

  Scenario: A value whose number is cleared must be filled in before saving
    Given I am editing a value of 14.5 g/dL on the review step
    When I clear its number
    And I try to continue to the confirmation
    Then I should be told that the value is missing its number
    When I type the negative number -0.5 in its place
    Then the field should show -0.5
    And the confirmation should show the value as -0.5

  Scenario: An interval with a cleared end must be filled in before saving
    Given the AI read a value of "5-10" from a report
    And I chose "Not a LOINC test" for it
    And I am editing that value on the review step, shown with its low and high ends
    When I clear either end of the interval
    And I try to continue to the confirmation
    Then I should be told that the value is missing its number
    When I fill in both ends again
    Then I should be able to continue to the confirmation
    And the confirmation should show the value as the interval "5-10"

  Scenario: An interval is saved as its two ends
    Given the AI read a value of "5-10" per microscope field from a report
    When I save the import
    Then the timeline should show the value as "5-10", not as its midpoint 7.5

  Scenario: A value's method is saved
    Given the AI read a value of 95 mg/dL measured by the "Enzymatic" method
    When I save the import
    Then the timeline should show "Enzymatic" with the value

  Scenario: A result printed as a word is kept as printed
    Given the AI read "Batteri" as "Assenti" from a urine report
    Then the review should show the value as "Assenti (0)", the word with the number it stands for
    And it should have no unit
    When I save the import
    Then the timeline should show the value as "Assenti", not as 0

  Scenario: A result printed as crosses is kept as printed
    Given the AI read "Emoglobina" in urine as "++"
    Then the review should show the value as "++ (2)"
    When I save the import
    Then the timeline should show the value as "++"

  Scenario: A word's number changed on review is saved as the number typed
    Given the AI read "Batteri" as "Assenti" from a urine report
    When I edit its number to 3
    Then the review should show the value as 3, without the word
    And the value should be saved as 3
    When I edit its number back to 0
    Then the review should show the value as "Assenti (0)" again

  Scenario: A value printed beyond what the lab can measure keeps its comparator
    Given the AI read Glucose as "< 10" mg/dL with a reference range of 70-100 mg/dL
    Then the review should show the value as "< 10", never as a plain 10
    When I save the import
    Then the timeline should show the value as "< 10"
    And it should be marked below the reference range, as every value below 10 is

  Scenario: The comparator of a value can be changed on review
    Given I am editing a value on the review step
    When I choose the comparator "<" for it
    Then the review should show the value with "<" before its number

  Scenario: The lab's own high or low mark is kept
    Given the AI read a value the lab marked "H"
    Then the review should show "H" beside the value, read out as "flagged high by the lab"
    When I save the import
    Then the timeline should show "H" beside the value, read out as "flagged high by the lab"

  Scenario: The lab's mark can be changed or cleared on review
    Given the AI read a value the lab marked "L"
    When I clear the lab's mark while editing the value
    Then the review should show no mark beside the value
    And the value should be saved with no mark

  Scenario: A dash or a plus is no lab mark
    Given the AI gave "-" or "+" as a value's mark, as reports write an empty cell
    Then the value should have no mark

  Scenario: A reference range printed in another unit is compared in the value's unit
    Given the AI read Glucose as 90 mg/dL with a reference range of 3.9-5.6 mmol/L
    When I save the import
    Then the timeline should show the value within its reference range, the range converted to mg/dL
    And not above it, as 90 compared with 5.6 unconverted would read

  Scenario: A range in the value's unit follows a unit corrected on review
    Given the AI read Glucose as 150 mg/dL with a reference range of 70-100, printed with no unit of its own
    When I correct the value's unit to mmol/L on review
    Then the range should read 70-100 mmol/L, its numbers kept as printed
    And a range printed in a unit of its own should keep that unit

  Scenario: A converted range is compared at full precision
    Given the AI read Calcium as 10.3 mg/dL with a reference range of 2.1-2.6 mmol/L
    When I save the import
    Then the range should be compared as 8.4168-10.4208 mg/dL, not rounded to 8.4-10
    And the value should read within its reference range

  Scenario: Numbers keep every decimal the report printed
    Given I am editing a value on the review step
    When I type 1.015, or 0.005
    Then the field should keep every decimal
    And the value should be saved and shown with every decimal

  Scenario: A value set aside as the same measurement names the saved value as it reads
    Given two values of one test are the same measurement, the saved one printed as "< 100" mg/dL
    Then the review should say the other is "the same measurement as < 100 mg/dL, which is saved"

  Scenario: User enters a name that is not a LOINC test
    Given I am editing a value on the review step
    When I type a name that no LOINC test fits
    Then the name should be kept as I typed it
    And the value should be labelled "Not identified"
    When I choose "Not a LOINC test" for it
    Then the value should be saved under the name I typed

  Scenario: Renaming a value keeps the unit it was measured in
    Given I am editing a value of 95 mg/dL on the review step
    When I rename it to "Zorblatina"
    Then its unit should still be "mg/dL"
    And when I try to continue I should be asked to choose its test or "Not a LOINC test"

  Scenario: User must set a missing lab date
    Given a reviewed file has no lab date
    When I try to continue
    Then I should be asked to enter the lab date

  Scenario: User sees every problem that stops the import
    Given the review has more problems than the message shows at first
    When I try to continue
    Then I should see the first problems and how many more there are
    When I choose to show the rest
    Then I should see every problem
    When I try to continue again
    Then I should again see the first problems and how many more there are

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

  Scenario: A reference range with only one end
    Given I am on the review step
    When I give a value a reference range with only a high end of 17.5
    Then the review should show its range as "≤ 17.5" in the value's unit
    And the confirm step should show it the same way
    When I give it only a low end of 12 instead
    Then the review and the confirm step should show "≥ 12" in the value's unit

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
