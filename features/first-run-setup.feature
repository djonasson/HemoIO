Feature: First-Run Setup Wizard
  As a new user
  I want to configure my HemoIO application
  So that I can start securely storing my lab results

  Where the browser can open folders (the File System Access API), first run
  begins by asking how to start: set HemoIO up anew, or from a folder copy
  (see setup-from-folder.feature). The password step is then reached by
  choosing "Set up HemoIO". Elsewhere setup begins on the password step.

  Scenario: New user sees setup wizard on first launch
    Given I am a new user
    And the application has no existing data
    When I open the application
    Then I should see the setup wizard
    And I should see a welcome message

  Scenario: Where folders can be used, first run asks how to start
    Given I am a new user
    And the browser supports the File System Access API
    When I open the application
    Then I should be asked "How would you like to start?"
    And I should be offered "Set up HemoIO" and "I already have a folder copy"
    And "Set up HemoIO" should have focus
    When I choose "Set up HemoIO"
    Then I should be on the password step of the setup wizard

  Scenario: Where folders cannot be used, setup starts on the password step
    Given I am a new user
    And the browser does not support the File System Access API
    When I open the application
    Then I should be on the password step of the setup wizard
    And I should not be offered "I already have a folder copy"

  Scenario: User creates a password
    Given I am on the password step of the setup wizard
    When I enter a password "MySecurePass123!"
    And I confirm the password "MySecurePass123!"
    Then the passwords should match
    And the password strength indicator should show strong
    When I click next
    Then I should proceed to the storage step

  Scenario: User sees password requirements
    Given I am on the password step of the setup wizard
    Then I should see the password requirements
    And the requirements should include minimum 8 characters
    And the requirements should include at least one uppercase letter
    And the requirements should include at least one lowercase letter
    And the requirements should include at least one number

  Scenario: User cannot proceed with weak password
    Given I am on the password step of the setup wizard
    When I enter a password "weak"
    And I confirm the password "weak"
    Then I should see a warning about weak password
    And the next button should be disabled

  Scenario: User sees error when passwords do not match
    Given I am on the password step of the setup wizard
    When I enter a password "MySecurePass123!"
    And I confirm the password "DifferentPass456!"
    Then I should see an error "Passwords do not match"
    And the next button should be disabled

  Scenario: User selects local storage
    Given I am on the storage step of the setup wizard
    Then local storage should be selected by default
    When I click next
    Then I should proceed to the AI configuration step

  Scenario: User configures AI provider with API key
    Given I am on the AI configuration step
    When I select "OpenAI" as my AI provider
    And I enter my API key "sk-test-key-12345"
    And I click next
    Then I should see the setup completion step

  Scenario: User skips AI configuration
    Given I am on the AI configuration step
    When I click "Skip for now"
    Then I should see the setup completion step
    And I should be informed that AI features will be disabled

  Scenario: User completes setup wizard
    Given I am on the setup completion step
    When I click "Get Started"
    Then the setup should be marked as complete
    And I should be redirected to the dashboard
    And my password-derived key should be in memory

  Scenario: User can go back in wizard steps
    Given I am on the storage step of the setup wizard
    When I click the back button
    Then I should return to the password step
    And my previously entered password should still be filled

  Scenario: Setup wizard is accessible
    Given I am on the setup wizard
    Then all form fields should have accessible labels
    And all steps should be navigable via keyboard
    And the current step should be announced to screen readers
    And the progress indicator should be accessible

  Scenario: Setup persists password hash securely
    Given I have completed the setup wizard with password "MySecurePass123!"
    When I close the application
    And I reopen the application
    Then I should see the login screen
    And my actual password should not be stored anywhere
    And only the password verification hash should be stored

  Scenario: Setting up in two tabs makes one setup
    Given I have opened HemoIO in two tabs of a new browser
    When I finish setup in both tabs at the same time, with the same password
    Then only one password lock should be created
    And both tabs should open HemoIO with that lock
    And the tab that finished second should tell me the choices made in it were not saved

  Scenario: The tab whose password does not open the first setup is told to unlock
    Given I have opened HemoIO in two tabs of a new browser
    When I finish setup in both tabs at the same time, with different passwords
    Then only one password lock should be created
    And the tab that finished second should show the login screen
    And it should tell me "HemoIO was set up in another tab. Unlock with that password."

  Scenario: A tab still on setup leaves it once another tab has finished
    Given I have opened HemoIO in two tabs of a new browser
    And I have begun setup in the second tab
    When I finish setup in the first tab
    Then the second tab should show the login screen without being reloaded
    And it should tell me that HemoIO was set up in another tab, and that the choices made in it were not saved

  Scenario: Setup tells me when this browser already holds data
    Given this browser holds HemoIO data from an earlier setup
    And the password lock of that setup is gone
    When I open the application
    Then before anything else I should see "This browser already holds HemoIO data"
    And I should be told "It was saved by an earlier setup whose password lock is gone, so this setup can't open it."
    And "Keep it aside and set up anew" should be the default choice
    And, where folders can be used, I should also be offered "I already have a folder copy"

  Scenario: I can keep the existing data aside and set up anew
    Given setup tells me this browser already holds HemoIO data
    When I choose "Keep it aside and set up anew"
    And I finish setup
    Then the data should be kept aside, not deleted
    And I should be told how many stored records can't be opened

  Scenario: I can clear the existing data, after confirming
    Given setup tells me this browser already holds HemoIO data
    When I choose "Clear it and set up anew…"
    Then I should be asked to confirm before anything is cleared
    When I cancel
    Then nothing should be cleared
    When I choose "Clear it and set up anew…" again
    And I confirm with "Clear and set up anew"
    Then the data should be cleared
    And the earlier setup's storage choice and folder should be forgotten
    And setup should go on to its first step
    And after I finish setup no records should be kept aside

  Scenario: Pressing Get Started twice sets up once
    Given I am on the setup completion step
    When I press Get Started twice quickly
    Then the password lock should be created only once
    And I should be taken to the dashboard
