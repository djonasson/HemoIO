Feature: Restore From the Folder Copy
  As a user who keeps my lab data in a synced folder
  I want HemoIO to offer the folder copy when this browser has lost my data
  So that a browser that forgot my data does not make me lose it

  Background:
    Given the browser supports the File System Access API
    And I store my data in a folder that holds a copy of my lab results

  Scenario: Offer to restore when the browser has lost its data
    Given this browser no longer has any of my lab data
    When I unlock HemoIO
    Then I should be asked whether to restore my data from the folder
    And I should see how many lab results, test values and notes the copy holds
    And I should see when the copy was saved
    And the folder copy should not have been changed

  Scenario: Restore the folder copy
    Given this browser no longer has any of my lab data
    And I unlock HemoIO
    When I choose to restore from the folder
    Then my lab results from the folder copy should be on the timeline
    And the next save to the folder should hold the restored results

  Scenario: Decide later
    Given this browser no longer has any of my lab data
    And I unlock HemoIO
    When I choose "Not now"
    Then the dialog should close
    And nothing should be written to the folder until I unlock again
    And I should be asked again the next time I unlock

  Scenario: Start over and replace the folder copy
    Given this browser no longer has any of my lab data
    And I unlock HemoIO
    When I choose to replace the folder copy
    Then I should be asked to confirm that the folder copy will be replaced
    When I confirm
    Then HemoIO should save to the folder again

  Scenario: Folder copy saved with another password
    Given the folder copy was saved with a different password
    And this browser no longer has any of my lab data
    When I unlock HemoIO
    Then I should be told the folder copy cannot be opened with my password
    And I should not be offered a restore
    And the folder copy should not have been changed

  Scenario: Folder copy is damaged
    Given the folder copy is damaged
    And this browser no longer has any of my lab data
    When I unlock HemoIO
    Then I should be told the folder copy cannot be read
    And the folder copy should not have been changed

  Scenario: Folder copy from a newer version of HemoIO
    Given the folder copy was saved by a newer version of HemoIO
    And this browser no longer has any of my lab data
    When I unlock HemoIO
    Then I should be told the folder copy was saved by a newer version

  Scenario: Browser still has its data
    Given this browser still has my lab data
    When I unlock HemoIO
    Then I should not be asked to restore from the folder
    And HemoIO should save to the folder as usual

  Scenario: Empty folder copy
    Given the folder copy holds no lab results or notes
    And this browser no longer has any of my lab data
    When I unlock HemoIO
    Then I should not be asked to restore from the folder

  Scenario: Folder access granted after reopening the browser
    Given this browser no longer has any of my lab data
    And HemoIO needs my permission to use the folder again
    When I unlock HemoIO
    Then nothing should be written to the folder
    When I grant folder access in Settings
    Then I should be asked whether to restore my data from the folder

  Scenario: The dialog is accessible
    Given this browser no longer has any of my lab data
    When I unlock HemoIO
    Then the restore dialog should have a title that screen readers announce
    And I can choose every option with the keyboard
