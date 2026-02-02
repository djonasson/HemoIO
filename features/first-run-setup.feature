Feature: First-Run Setup Wizard
  As a new user
  I want to configure my HemoIO application
  So that I can start securely storing my lab results

  Scenario: New user sees setup wizard on first launch
    Given I am a new user
    And the application has no existing data
    When I open the application
    Then I should see the setup wizard
    And I should see a welcome message

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
