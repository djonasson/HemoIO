Feature: Save Errors
  As a user keeping my lab results in this browser
  I want to be told at once when something I did could not be saved
  So that I never believe data is stored when it will be gone after I lock the app

  Everything is stored in the browser's own database. The browser can refuse
  a change: its storage is full, the connection to it was lost, it stopped
  responding, or it cancelled the change before keeping it. The app then
  shows what was not saved and why, keeps showing only what is stored, and
  never names my results, values or notes in the message.

  Background:
    Given the application is set up and unlocked

  # Importing

  Scenario: An import the browser has no room for is not saved
    Given I have reviewed an imported lab report
    And the browser's storage is full
    When I click "Save Results"
    Then I should see "Import not saved" saying the storage has no room left
    And I should still be on the confirm step with my reviewed values
    And the timeline should show no lab results
    When the browser's storage has room again
    And I click "Save Results" again
    Then I should see that the import was saved
    And after I lock and unlock the app the lab result is still there

  Scenario: An import the browser cancels before keeping it is not shown
    Given I have reviewed an imported lab report
    And the browser cancels every change before keeping it
    When I click "Save Results"
    Then I should see "Import not saved"
    And the timeline should show no lab results
    And after I lock and unlock the app there are still no lab results

  Scenario: Saving an import cannot be started twice
    Given I have reviewed an imported lab report
    When I click "Save Results"
    Then the button shows that it is saving until the save finishes

  Scenario: An import saves all of its files or none of them
    Given I import two lab reports at once
    When the browser refuses to store the second one
    Then neither lab report is saved
    And saving again later does not create duplicates

  # Notes

  Scenario: A note that cannot be saved stays in the editor
    Given I have lab results imported
    And the browser cancels every change before keeping it
    When I add a note to a lab result
    Then I should see "Note not saved" in the editor
    And the note editor should still hold what I wrote
    And the note should not be listed
    And after I lock and unlock the app the lab result has no notes

  Scenario: An edit to a note that cannot be saved keeps the note as it was
    Given I have a lab result with a note
    And the browser cancels every change before keeping it
    When I change the note's text and save it
    Then I should see "Note not saved" in the editor
    And after I cancel the edit the note shows its original text

  Scenario: A note that cannot be deleted stays
    Given I have a lab result with a note
    And the browser cancels every change before keeping it
    When I delete the note
    Then I should see "Note not deleted"
    And the note should still be listed

  # Changing and deleting results

  Scenario: A lab result that cannot be deleted stays
    Given I have lab results imported
    And the browser cancels every change before keeping it
    When I delete a lab result
    Then I should see "Lab result not deleted"
    And the lab result should still be on the timeline
    And after I lock and unlock the app it is still there

  # Preferences

  Scenario: A preferred unit that cannot be saved goes back
    Given I am viewing the trend for "Glucose"
    And the browser cancels every change before keeping it
    When I choose "mmol/L" as the preferred unit
    Then I should see "Preferred unit not saved"
    And the trend should be shown in "mg/dL" again

  Scenario: A display setting that cannot be saved goes back
    Given I am on the Display settings
    And the browser cancels every change before keeping it
    When I choose the date format "YYYY-MM-DD"
    Then I should see "Date format not saved"
    And the date format should be "MM/DD/YYYY" again
    And I should not see "Preferences saved"

  Scenario: An AI setting that cannot be saved goes back
    Given I am on the AI Configuration settings
    And the browser cancels every change before keeping it
    When I choose a different AI provider
    Then I should see "AI setting not saved"
    And the previous provider should be selected again

  # Alerts

  Scenario: An alert acknowledgement that cannot be saved shows the alert again
    Given I have an out-of-range result
    And the browser cancels every change before keeping it
    When I acknowledge its alert
    Then I should see that the acknowledgement could not be saved
    And the alert should be shown again

  # Restoring

  Scenario: A restore that cannot be saved keeps the current data
    Given I have lab results imported
    And the browser cancels every change before keeping it
    When I restore a backup with other lab results
    Then I should see "Restore failed"
    And the timeline should still show my current lab results

  # Errors that are not storage errors

  Scenario: A save that never finishes is stopped
    Given the browser's storage stops responding
    When I save a change
    Then after a while I should see that the browser's storage did not respond
    And the change should not be shown as saved
    And the change is not saved later

  Scenario: A lost connection to the storage asks for a reload
    Given the connection to the browser's storage was lost
    When I save a change
    Then I should see that the connection was lost and that I should reload the page

  Scenario: Save errors never show my health data
    Given a save fails for any reason
    Then the message should not contain lab names, test names, values, notes or file names
