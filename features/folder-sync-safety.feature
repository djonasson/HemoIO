Feature: Folder Sync Safety
  As a user who keeps my lab data in a local folder
  I want the folder sync to never throw away the copy in my folder
  So that losing the browser's data does not also lose my folder copy

  Background:
    Given I am logged into the application
    And my data is stored in a local folder

  Scenario: An empty browser does not overwrite the folder copy
    Given my lab results have been synced to my folder
    When the browser loses all of its stored data
    And I unlock the app again
    Then I should see that the folder sync was skipped to protect my folder copy
    And my folder copy should still hold my lab results

  Scenario: Sync starts again once the results are back
    Given my lab results have been synced to my folder
    And the folder sync was skipped because the browser has no lab results
    When I restore my lab results from a backup
    Then the message about the skipped folder sync should go away
    And my folder copy should be updated

  Scenario: The previous folder copy is kept next to the new one
    Given my lab results have been synced to my folder
    When I add more lab results
    Then my folder should hold a new copy with all of my lab results
    And my folder should keep the copy from before, as the previous copy

  Scenario: Opening the app without changes keeps the previous copy
    Given my lab results have been synced to my folder
    And I have added more lab results since
    When I lock and unlock the app without changing anything
    And I add more lab results again
    Then the previous copy should be the one from just before that last change

  Scenario: A folder copy saved with another password is not replaced
    Given my folder holds a copy that my current password cannot open
    When I add lab results
    Then I should see that the folder sync was skipped because the folder copy cannot be opened
    And I should be told to choose a different folder to keep syncing
    And the copy in my folder should be left as it was

  Scenario: The first sync to an empty folder writes a copy
    Given my folder holds no copy yet
    When I add lab results
    Then my folder should hold a copy of my lab results
    And there should be no previous copy yet
    And no message about a skipped folder sync should be shown
