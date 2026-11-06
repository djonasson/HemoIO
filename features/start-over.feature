Feature: Start Over
  As a user who wants to begin again in this browser
  I want to delete HemoIO's data from this browser and return to first run
  So that I can set HemoIO up afresh, or from a folder copy made by another setup

  Start over removes everything HemoIO keeps in this browser: lab results,
  notes, settings, the password lock and the folder choice. It never touches
  the folder: the folder copy and the folder's dated backups stay as they are.
  To use a folder made by another setup, start over, then choose "I already
  have a folder copy".

  Background:
    Given I am logged into the application
    And I have lab results in this browser

  Scenario: I start over after confirming, and first run is shown
    Given I am on the Security tab of Settings
    When I choose "Start over"
    And I type START OVER to confirm
    And I confirm "Start over"
    Then I should see the first-run setup
    And nothing of HemoIO's should be left in this browser's local storage
    And unlocking should no longer be offered

  Scenario: The word must be typed exactly
    Given I am on the Security tab of Settings
    When I choose "Start over"
    Then the "Start over" confirmation should be unavailable
    When I type "start over" in lower case
    Then the "Start over" confirmation should still be unavailable
    When I type START OVER
    Then the "Start over" confirmation should be available

  Scenario: The dialog offers to export a backup first
    Given I am on the Security tab of Settings
    When I choose "Start over"
    Then I should be told my folder copy and folder backups are not touched
    And I should be offered to export a backup first
    When I choose "Export a backup"
    Then the Data tab of Settings should open, where I can export a backup
    And my lab results should still be in this browser

  Scenario: Cancelling changes nothing
    Given I am on the Security tab of Settings
    When I choose "Start over"
    And I type START OVER to confirm
    And I press Escape
    Then the dialog should close
    And focus should return to the "Start over" button
    And my lab results should still be in this browser

  Scenario: My folder copy and folder backups are unchanged afterwards
    Given my data is stored in a local folder
    And the folder holds dated backups
    When I start over
    Then I should see the first-run setup
    And my folder copy should not have changed
    And my folder's dated backups should not have changed

  Scenario: Another open tab returns to setup
    Given HemoIO is open in a second tab
    When I start over in the first tab
    Then the second tab should show the first-run setup without being reloaded

  Scenario: The "another setup" message points to Start over
    Given my data is stored in a local folder
    And my folder holds a copy made by another HemoIO setup, with a different key
    And this browser no longer has any of my lab data
    When I unlock HemoIO
    Then I should be told to set HemoIO up again from that folder's copy
    And I should be told to choose Start over in Settings > Security, then "I already have a folder copy"

  Scenario: The dialog is accessible
    Given I am on the Security tab of Settings
    Then "Start over" should have a heading
    When I choose "Start over"
    Then I should see a dialog titled "Start over?"
    And the confirmation field should be labelled "Type START OVER to confirm"
    And "Cancel" should have focus
    And the "Start over" confirmation should say what it does in words, not by color alone
