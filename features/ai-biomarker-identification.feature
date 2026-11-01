Feature: AI biomarker identification
  As a user importing lab reports in any language
  I want each value filed under the right test
  So that my trends and alerts are correct without fixing names by hand

  Background:
    Given I am logged in
    And an AI provider is configured

  Scenario: The AI identifies the test of each value
    Given the AI identifies "Creatinina/L (urine 24h)" in µmol/L as Urine Creatinine
    When the report is analyzed
    Then the value should be saved as Urine Creatinine
    And it should carry no label that asks for a check

  Scenario: The unit does not fit the test the AI chose
    Given the AI identifies a value in mmol/24h as Glucose
    When the report is analyzed
    Then the row should be labelled "Unit doesn't fit"
    And Continue should be blocked until I choose a fitting unit, another test, or "Not in dictionary"

  Scenario: A test given twice, once in a unit no test is measured in, is saved once
    Given the AI identifies "Eritroblasti" twice as Nucleated Red Blood Cells Percentage, in % and in a unit no test is measured in
    When the report is analyzed
    Then the value in % should be saved as Nucleated Red Blood Cells Percentage
    And the other value should be labelled "Not saved", with how to keep it
    And Continue should not be blocked by it
    And the confirmation should list it as not saved

  Scenario: A value in a unit that doesn't fit still blocks when it is the only one of its line
    Given a report gives "Eritroblasti" once, in a unit no test is measured in
    When the report is analyzed
    Then Continue should be blocked until I choose a fitting unit, another test, or "Not in dictionary"

  Scenario: A value whose unit fits another test still blocks, as it may be another measurement
    Given the AI identifies "Sodio" in mmol/L and "Sodio" in mmol/24h both as Sodium
    When the report is analyzed
    Then the value in mmol/24h should not be left out
    And Continue should be blocked until I choose a fitting unit, another test, or "Not in dictionary"

  Scenario: A test I choose is never left out
    Given a value of a test given twice was left out
    When I choose its test myself
    Then it should no longer be labelled "Not saved"
    And Continue should be blocked until its unit fits the test I chose

  Scenario: The printed name suggests a different test
    Given the AI identifies "BUN" in mg/dL as Urea
    When the report is analyzed
    Then the value should be saved as Urea
    And the row should be labelled "Name suggests Blood Urea Nitrogen"

  Scenario: A name that is exactly another test is questioned, whatever its unit
    Given the AI identifies "Emoglobina" in % as Hematocrit
    When the report is analyzed
    Then the value should be saved as Hematocrit
    And the row should be labelled "Name suggests Hemoglobin"

  Scenario: An AI test in another specimen that measures something else is questioned
    Given the AI identifies "Sodio" in mmol/24h as 24-Hour Urine Urea
    When the report is analyzed
    Then the row should be labelled "Name suggests Sodium"

  Scenario: A plain name the AI files under another urine test suggests that name's urine test
    Given the AI identifies "Creatinina" in g/24h as 24-Hour Urine Urea
    When the report is analyzed
    Then the row should be labelled "Name suggests 24-Hour Urine Creatinine"

  Scenario: A urine dipstick value is not questioned by the blood count of its name
    Given the AI identifies "Eritrociti" in Ery/µL as Urine Blood
    When the report is analyzed
    Then the value should be saved as Urine Blood
    And the row should carry no label that asks for a check

  Scenario: A name that says its specimen questions a test of another specimen
    Given the AI identifies "Proteine (urine)" in g/dL as Total Protein
    When the report is analyzed
    Then the row should be labelled "Name suggests Urine Protein"

  Scenario: A dipstick pad's name is questioned when the AI files it as a cell count
    Given the AI identifies "Esterasi leucocitaria" in /µL as Urine WBC
    When the report is analyzed
    Then the row should be labelled "Name suggests Urine Leukocyte Esterase"

  Scenario: A serum name is questioned when the AI files it as a urine test
    Given the AI identifies "Urea plasmatica" in g/L as Urine Urea
    When the report is analyzed
    Then the row should be labelled "Name suggests Urea"

  Scenario: A percentage's name is questioned when the AI files it as the count
    Given the AI identifies "Neutrofili (%)" in 10^9/L as Neutrophils
    When the report is analyzed
    Then the row should be labelled "Name suggests Neutrophils Percentage"

  Scenario: A blood name is questioned when the AI files it as the urine test
    Given the AI identifies "Glicemia" in mg/dL as Urine Glucose
    When the report is analyzed
    Then the row should be labelled "Name suggests Glucose"

  # Covered by unit tests: an Italian plural followed by "(S)" is the serum,
  # a 24-hour name suggests its 24-hour test, and a unit that fits the
  # analyte's urine test suggests that test
  Scenario: A fasting name is questioned when the AI files it as the urine test
    Given the AI identifies "Glucosio (a digiuno)" in mg/dL as Urine Glucose
    When the report is analyzed
    Then the row should be labelled "Name suggests Glucose"

  Scenario: A semen name is questioned when the AI files it as the urine test
    Given the AI identifies "pH seminale" as Urine pH
    When the report is analyzed
    Then the row should be labelled "Name suggests Semen pH"

  Scenario: A unit that fits the name's test is suggested when the AI's test measures the same in urine
    Given the AI identifies "Leucociti" in 10^9/L as Urine WBC
    When the report is analyzed
    Then the row should be labelled "Unit doesn't fit"
    And the row should be labelled "Name suggests White Blood Cell Count"

  Scenario: A count's name in % is its percentage
    Given the AI gives no test for "Neutrofili" in %
    When the report is analyzed
    Then the value should be saved as Neutrophils Percentage

  Scenario: A urine test printed by the bare analyte is not questioned
    Given the AI identifies "Creatinina" in g/24h as 24-Hour Urine Creatinine
    When the report is analyzed
    Then the row should carry no label that asks for a check

  Scenario: A name the unit makes the AI's test is not questioned
    Given the AI identifies "Eritroblasti" in /100 WBC as Nucleated Red Blood Cells Percentage
    When the report is analyzed
    Then the row should carry no label that asks for a check

  Scenario: A value with no test may have no unit
    Given the AI gives no test for a value the report gives without a unit
    When I continue from review
    Then I should not be asked for its unit

  Scenario: A screening result without a unit is saved under its own name
    Given the report gives "Proteine < 15" in its urine screening, without a unit
    And the AI identifies it as Urine Protein, which is measured in a unit
    When the report is analyzed
    Then the value should be saved as "Not in dictionary", labelled "No unit in report"
    And I should be able to continue without giving it a unit

  Scenario: Review fits a phone screen
    Given I review the values on a phone-sized screen
    Then the table should scroll on its own, not the page
    And the test each value is saved as should be shown in full

  Scenario: A name qualified as another test is not its base test
    Given the AI gives no test for "Cholesterol (HDL)" in mg/dL
    When the report is analyzed
    Then the value should not be saved as Total Cholesterol
    # Without the matching model it is "Not in dictionary"; with it, the
    # model may identify HDL Cholesterol

  Scenario: A qualifier that restates the test is ignored
    Given the AI gives no test for "Emoglobina (HGB)" in g/dL
    When the report is analyzed
    Then the value should be saved as Hemoglobin

  Scenario: The model identifies no tests
    Given the AI returns no test for any value
    When the report is analyzed
    Then the analysis notes should say the model did not identify the tests
    And values matched by their name should be labelled "Matched by name only"
    And values with no match should be labelled "Not identified"

  Scenario: The AI's test is reported alike with another the unit fits
    Given the AI identifies both a creatinine concentration in mg/dL and a 24-hour amount in g/24h as Urine Creatinine
    When the report is analyzed
    Then the concentration should be saved as Urine Creatinine and the 24-hour amount as 24-Hour Urine Creatinine
    And no duplicate conflict warning should be shown

  Scenario: Change the test a value is saved as
    Given a value is saved as Urine Creatinine
    When I change its test to 24-Hour Urine Creatinine
    Then the value should be saved as 24-Hour Urine Creatinine
    And its unit choices should be those of 24-Hour Urine Creatinine

  Scenario: Change the test from the keyboard
    Given a value is saved as Urine Creatinine
    When I open its test list from the keyboard, type "24-Hour Urine Creatinine" and press Enter
    Then the value should be saved as 24-Hour Urine Creatinine

  Scenario: Enter chooses the test a name is exactly
    Given a value is saved as Urine Creatinine
    When I search the test list for "Urea" and press Enter
    Then the value should be saved as Urea, not another test whose name contains it

  Scenario: Editing the printed name keeps the test
    Given the AI identified a value as Urine Urea
    When I edit its printed name
    Then it should still be saved as Urine Urea

  Scenario: Editing the name of a value whose unit does not fit keeps the proposed test
    Given the AI identifies a value in mmol/24h as Glucose
    When I edit its printed name
    Then the row should still show "Proposed: Glucose", labelled "Unit doesn't fit"
    And Continue should still be blocked until I choose a fitting unit, another test, or "Not in dictionary"

  Scenario: A value saved as "Not in dictionary" stays there when renamed
    Given I saved a value as "Not in dictionary"
    When I rename it to a test in the dictionary
    Then it should still be saved as "Not in dictionary"

  Scenario: A renamed test the unit does not fit is proposed
    Given a value in mmol/24h is labelled "Not identified"
    When I rename it to Glucose
    Then the row should show "Proposed: Glucose", labelled "Unit doesn't fit"

  Scenario: A renamed value is read again when its unit changes
    Given a value in 10^9/L is labelled "Not identified"
    When I rename it to Neutrophils and then change its unit to %
    Then it should be saved as Neutrophils Percentage

  Scenario: A name typed in review is read as a printed name is
    Given a value is labelled "Not identified"
    When I rename it to "Cholesterol (HDL)"
    Then it should be saved as "Not in dictionary", labelled "Not identified"
    When I rename it to "Hemo-globin" and its unit is g/dL
    Then it should be saved as Hemoglobin

  Scenario: A name typed in review is read with my learned names
    Given I picked Urine Urea for "Zorblatina (urine)" in review and saved it
    And a later report misprints it as "Zorblatlna (urine)", labelled "Not identified"
    When I correct the name to "Zorblatina (urine)"
    Then it should be saved as Urine Urea

  Scenario: A row added in review reads my learned names
    Given I picked Urine Urea for "Zorblatina (urine)" in review and saved it
    When I add a row in review named "Zorblatina (urine)"
    Then it should be saved as Urine Urea

  Scenario: An emptied unit is one still to choose
    Given the AI identifies "Glicemia" in mg/dL as Glucose
    When I empty its unit, one letter at a time
    Then it should still be saved as Glucose
    And Continue should ask for its unit

  Scenario: A unit edit keeps the matching model's test while the unit fits it
    Given the matching model identified a value's test
    When I change its unit to one that test is measured in
    Then it should still be saved as that test
    When I change its unit to one it is not measured in
    Then the test should be proposed, labelled "Unit doesn't fit"
    # Covered by unit tests: the E2E pages never download the matching model

  Scenario: Undoing a typo in a name keeps the matching model's test
    Given the matching model identified a value's test
    When I make a typo in its name and undo it
    Then it should be saved as the matching model's test again
    # Covered by unit tests: the E2E pages never download the matching model

  Scenario: A name edited only in case or spacing is read as printed
    Given the report prints "Globuli rossi" in 10^6/µL, identified by its name as Red Blood Cell Count
    When I edit its name to "Globuli  rossi"
    Then it should still be saved as Red Blood Cell Count

  Scenario: Renaming a value the AI identified checks the new name
    Given the AI identifies "BUN" in mg/dL as Urea, labelled "Name suggests Blood Urea Nitrogen"
    When I rename it to "Urea"
    Then it should still be saved as Urea
    And it should carry no label that asks for a check

  Scenario: A screening value without a unit is identified once it has one
    Given the report gives "Proteine (urine)" without a unit, labelled "No unit in report"
    When I rename it to "Urine Protein" without a unit
    Then it should still be saved as "Not in dictionary"
    When I give it the unit mg/dL
    Then it should be saved as Urine Protein

  Scenario: A row added in review gets the unit of the name finally typed
    Given I add a row in review
    When I type its name "Urea 24h" letter by letter
    Then it should be saved as 24-Hour Urine Urea in g/24h

  Scenario: Renaming a value the AI did not identify updates its labels
    Given a value is labelled "Not identified"
    When I rename it to a test in the dictionary whose unit fits the value
    Then it should be saved as that test
    And it should carry no label that asks for a check

  Scenario: A test the AI chose is not learned
    Given the AI identified "Zorblatina (urine)" as Urine Urea and I saved it
    Then "Zorblatina (urine)" should not be among the learned names

  Scenario: A confirmed name is learned
    Given I picked Urine Urea for "Zorblatina (urine)" in review and saved it
    When I import a report where the AI gives no test for "Zorblatina (urine)"
    Then the value should be saved as Urine Urea
    And the row should be labelled "Matched by name only"

  Scenario: The AI's test differs from a learned name
    Given I picked Urine Urea for "Zorblatina (urine)" in review and saved it
    When I import a report where the AI identifies "Zorblatina (urine)" as Urine Protein
    Then the value should be saved as Urine Protein
    And the row should be labelled "Name suggests Urine Urea"

  Scenario: A learned name whose unit fits, when the AI's test does not fit the unit
    Given I picked Urine Urea for "Zorblatina (urine)" in review and saved it
    When I import a report where the AI identifies "Zorblatina (urine)" in mmol/L as Urine Protein
    Then the row should show "Proposed: Urine Protein", labelled "Unit doesn't fit"
    And it should be labelled "Name suggests Urine Urea"

  Scenario: A learned name is read with the value's unit
    Given I picked Urine Creatinine for "Zorblatina (urine)" in review and saved it
    When I import a report where the AI gives no test for "Zorblatina (urine)" in g/24h
    Then the value should be saved as 24-Hour Urine Creatinine
    And the row should be labelled "Matched by name only"

  Scenario: Remove a learned name
    Given I picked Urine Urea for "Zorblatina (urine)" in review and saved it
    When I remove it from the learned names in Settings
    Then a later import of "Zorblatina (urine)" should not be identified by it

  Scenario: Saving as "Not in dictionary" forgets a learned name
    Given I picked Urine Urea for "Zorblatina (urine)" in review and saved it
    When I save it as "Not in dictionary" in a later import
    Then the learned name should be removed

  Scenario: A value saved as "Not in dictionary" stays apart from the test its name is
    Given a value named "Hemoglobin" was saved as "Not in dictionary"
    When I look at it in the timeline
    Then it should not be described as Hemoglobin's test, with its specimen or LOINC code

  Scenario: The matching model cannot load
    Given the AI gives no test for a name no alias knows
    And the matching model cannot be downloaded
    When the report is analyzed
    Then the value should be labelled "Not identified"
    And the analysis notes should say the matching model could not load, that I can choose the tests in Saved as, and to reload the app before the next import if it happens again
