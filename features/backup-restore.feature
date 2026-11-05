Feature: Backup and Restore
  As a user
  I want to backup and restore my data
  So that I can protect my data and transfer it between devices

  Background:
    Given I am logged into the application

  # Backup Type Selection
  Scenario: User can choose between standard and encrypted backup
    When I navigate to Settings
    Then I should see a backup type selector with "Standard" and "Encrypted" options
    And "Standard" should be selected by default

  Scenario: Standard backup description
    When I navigate to Settings
    And I select "Standard" backup type
    Then I should see a description mentioning it does not include API keys

  Scenario: Encrypted backup description
    When I navigate to Settings
    And I select "Encrypted" backup type
    Then I should see a description mentioning password protection and API key inclusion

  # Creating Standard Backups
  Scenario: Create a standard backup
    Given I have lab results and notes in my account
    When I navigate to Settings
    And I select "Standard" backup type
    And I click "Create Backup"
    Then a backup file with .json extension should be downloaded
    And the file name should include the current date
    And the backup should NOT include API keys

  Scenario: Backup includes all data types
    Given I have lab results, notes, and settings
    When I create a standard backup
    Then the backup should include all lab results
    And the backup should include all notes
    And the backup should include my settings (except API keys)

  Scenario: Backup with no data shows warning
    Given I have no data in my account
    When I navigate to Settings
    Then the backup button should be disabled
    And I should see a warning about no data to backup

  # Creating Encrypted Backups
  Scenario: Create an encrypted backup requires password
    Given I have lab results and notes in my account
    When I navigate to Settings
    And I select "Encrypted" backup type
    And I click "Create Encrypted Backup"
    Then I should see a password entry modal
    And I should be prompted to enter and confirm a password

  Scenario: Encrypted backup password strength indicator
    Given I am on the encrypted backup password modal
    When I type a password
    Then I should see a password strength indicator
    And I should see which requirements are met (length, uppercase, lowercase, number, special character)

  Scenario: Encrypted backup password must match
    Given I am on the encrypted backup password modal
    When I enter a password and a different confirmation
    Then I should see a "Passwords do not match" error
    And the Create Encrypted Backup button should be disabled

  Scenario: Create encrypted backup with valid password
    Given I have lab results, notes, and API key configured
    When I navigate to Settings
    And I select "Encrypted" backup type
    And I click "Create Encrypted Backup"
    And I enter a strong password and confirm it
    And I click "Create Encrypted Backup" in the modal
    Then a backup file with .hemoio extension should be downloaded
    And the file should contain encrypted data
    And the backup should include the API key (encrypted)

  # Restoring from Standard Backup
  Scenario: Restore from standard backup file
    Given I have a valid .json backup file
    When I navigate to Settings
    And I select the backup file
    Then I should see a restore confirmation dialog
    And the dialog should show the backup contents
    And I should have options to "Cancel" or "Restore"

  Scenario: Standard restore requires confirmation
    When I select a .json backup file to restore
    Then I should see a confirmation dialog
    And the dialog should warn about data replacement

  Scenario: Cancel standard restore operation
    When I select a backup file to restore
    And I click "Cancel" in the confirmation dialog
    Then the restore should be cancelled
    And my existing data should remain unchanged

  Scenario: Standard restore replaces existing data
    Given I have existing lab results
    And I have a .json backup file with different data
    When I restore from the backup file
    And I confirm the restore
    Then my existing data should be replaced
    And I should only see data from the backup

  # Restoring from Encrypted Backup
  Scenario: Encrypted backup auto-detected
    Given I have a valid .hemoio encrypted backup file
    When I navigate to Settings
    And I select the encrypted backup file
    Then I should see a password prompt modal
    And the modal should indicate this is an encrypted backup

  Scenario: Decrypt encrypted backup with correct password
    Given I have a valid .hemoio encrypted backup file
    When I navigate to Settings
    And I select the encrypted backup file
    And I enter the correct backup password
    And I click "Decrypt & Continue"
    Then I should see the restore confirmation dialog
    And the dialog should show an "Encrypted" badge
    And I should see "Includes API key" indicator

  Scenario: Decrypt encrypted backup with wrong password
    Given I have a valid .hemoio encrypted backup file
    When I navigate to Settings
    And I select the encrypted backup file
    And I enter an incorrect backup password
    And I click "Decrypt & Continue"
    Then I should see an error message about incorrect password
    And the backup should not be decrypted

  Scenario: Restore encrypted backup restores API key
    Given I have a valid .hemoio encrypted backup that includes an API key
    And I have not configured an API key on this device
    When I restore from the encrypted backup with the correct password
    Then I should see which AI provider and API key the backup would set
    And my data should be restored
    And my API key should be restored and functional
    And I should see a success message

  Scenario: Restoring a backup does not silently replace my AI configuration
    Given I have configured an API key on this device
    And I have an encrypted backup that includes a different API key
    When I restore from the encrypted backup
    Then I should see that restoring the AI configuration would replace my API key
    And restoring the AI configuration should be off by default
    When I restore without turning it on
    Then my data should be restored
    And my own API key should still be configured

  Scenario: Restoring a backup keeps my local Ollama setup unless I opt in
    Given I analyze lab reports with a local Ollama model, which needs no API key
    And I have an encrypted backup made on a device that uses a cloud AI provider
    When I restore from the encrypted backup
    Then restoring the AI configuration should be off by default
    And I should see that my current AI provider and model would be replaced

  # Error Handling
  Scenario: Restore with invalid file format
    When I try to restore from a non-JSON/non-hemoio file
    Then I should see an error message about invalid file type
    And my existing data should remain unchanged

  Scenario: Restore with invalid JSON structure
    When I try to restore from a .json file with invalid backup structure
    Then I should see an error message "Invalid backup file structure"
    And my existing data should remain unchanged

  Scenario: Restore with corrupted file
    When I try to restore from a corrupted backup file
    Then I should see an error message about corruption
    And my existing data should remain unchanged

  Scenario: Restore with incompatible version
    Given I have a backup file from a newer version
    When I try to restore from this file
    Then I should see a clear error message about version incompatibility

  Scenario: Restore encrypted backup with wrong password
    Given I have an encrypted .hemoio backup file
    When I try to restore and enter the wrong password
    Then I should see an error "Unable to decrypt backup. Please check your password."
    And I should be able to try again with a different password

  Scenario: File input accepts both .json and .hemoio
    When I navigate to Settings
    Then the file input should accept both .json and .hemoio files

  # Progress and Feedback
  Scenario: Backup progress indicator
    When I create a backup with a large dataset
    Then I should see a progress indicator
    And I should see the backup status

  Scenario: Restore progress indicator
    When I restore from a backup file
    Then I should see a progress indicator
    And I should see the restore status
    And I should not be able to navigate away during restore

  # Accessibility
  Scenario: Backup/Restore section is keyboard accessible
    When I navigate to Settings
    Then I can access backup/restore controls via keyboard
    And all buttons should be focusable
    And file selection should work with keyboard

  Scenario: Backup/Restore has proper ARIA labels
    When I navigate to Settings
    Then the backup button should have an accessible label
    And the restore section should have proper labels
    And progress indicators should announce updates

  Scenario: An older backup is refused
    Given I have a backup file made before tests were identified by LOINC
    When I choose it on the Data tab
    Then I should see that it cannot be restored and that I should re-import my reports
    And no restore dialog should open
    And my data should be unchanged

  Scenario: A backup naming a test HemoIO does not know is refused
    Given I have a backup file with a value whose test is neither a LOINC code nor "Not a LOINC test"
    When I choose it on the Data tab
    Then I should see that it holds tests HemoIO does not know and was not restored
    And no restore dialog should open
