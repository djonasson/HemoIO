Feature: Local Directory Storage
  As a user who wants to sync my lab data across devices
  I want to store my encrypted data in a local folder
  So that I can use my preferred file sync service

  Background:
    Given the browser supports the File System Access API
    And I am on the setup wizard storage step

  Scenario: Select folder in setup wizard
    When I select the "Local Directory" storage option
    And I click "Choose Folder"
    And I select a folder from my file system
    Then I should see the selected folder name displayed
    And the "Next" button should be enabled

  Scenario: Option hidden in unsupported browsers
    Given the browser does not support the File System Access API
    When I view the storage options
    Then I should not see the "Local Directory" option

  Scenario: Cancel folder selection
    When I select the "Local Directory" storage option
    And I click "Choose Folder"
    And I cancel the folder picker
    Then no folder should be selected
    And the "Next" button should be disabled

  Scenario: Change selected folder
    When I select the "Local Directory" storage option
    And I select a folder named "Folder1"
    And I click "Change"
    And I select a folder named "Folder2"
    Then I should see "Folder2" displayed as the selected folder

  Scenario: Complete setup with filesystem storage
    When I complete the setup wizard with "Local Directory" storage
    Then the storage provider should be saved as "filesystem"
    And my data should be stored in the selected folder

  Scenario: App requests permission on reload
    Given I have completed setup with filesystem storage
    And the browser session has been closed and reopened
    When I open the app
    Then I should see a "Grant Access" button
    And I should be prompted to grant folder access

  Scenario: User grants permission after reload
    Given I have completed setup with filesystem storage
    And the browser is prompting for folder permission
    When I click "Grant Access"
    And I approve the permission request
    Then the folder should show as connected
    And I should be able to access my data

  Scenario: User denies permission
    Given I have completed setup with filesystem storage
    And the browser is prompting for folder permission
    When I deny the permission request
    Then I should see "Select New Folder" button
    And I should be prompted to select a different folder

  Scenario: View storage settings
    Given I have completed setup with filesystem storage
    When I navigate to Settings > Data
    Then I should see "Local Directory" as my storage type
    And I should see the selected folder name
    And I should see a "Change" button

  Scenario: Change folder in settings
    Given I have completed setup with filesystem storage
    And I am on the Settings page
    When I click "Change" next to the folder name
    And I select a new folder
    Then the new folder name should be displayed
    And future data should be stored in the new folder

  Scenario: Switch from local storage to filesystem in settings
    Given I have completed setup with local storage
    And I am on the Settings page
    When I click on "Local Directory" option
    Then I should see a confirmation modal
    And I should see instructions for migrating data
    When I click "Select Folder & Switch"
    And I select a folder
    Then the storage should be changed to filesystem
    And the selected folder should be displayed

  Scenario: Switch from filesystem to local storage in settings
    Given I have completed setup with filesystem storage
    And I am on the Settings page
    When I click on "Local Storage" option
    Then I should see a confirmation modal
    And I should see instructions for migrating data
    When I click "Switch Storage"
    Then the storage should be changed to local storage
    And "Local Storage" should show as active

  Scenario: Cancel storage switch
    Given I am on the Settings page
    When I click on a different storage option
    And I see the confirmation modal
    And I click "Cancel"
    Then the modal should close
    And the storage should remain unchanged
