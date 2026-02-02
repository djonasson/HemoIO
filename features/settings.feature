Feature: Application Settings
  As a user
  I want to customize application settings
  So that the app works the way I prefer

  Background:
    Given I am logged into the application
    And I navigate to the Settings page

  # Display Settings
  Scenario: View display settings
    When I click on the Preferences tab
    Then I should see the Display Preferences section
    And I should see theme selection options
    And I should see date format options

  Scenario: Change theme to dark mode
    Given I am on the Preferences tab
    When I select "Dark" theme
    Then the application should switch to dark mode
    And my preference should be saved

  Scenario: Change theme to light mode
    Given I am on the Preferences tab
    And the current theme is "Dark"
    When I select "Light" theme
    Then the application should switch to light mode
    And my preference should be saved

  Scenario: Use system theme preference
    Given I am on the Preferences tab
    When I select "System" theme
    Then the application should match my system theme preference

  Scenario: Change date format
    Given I am on the Preferences tab
    When I select a different date format
    Then dates throughout the app should display in the new format

  # AI Configuration
  Scenario: View AI settings
    When I click on the AI Configuration tab
    Then I should see the AI provider selection
    And I should see the API key input field

  Scenario: Configure OpenAI provider
    Given I am on the AI Configuration tab
    When I select "OpenAI" as the provider
    And I enter a valid API key
    And I click Save
    Then my AI configuration should be saved
    And the API key should be masked for security

  Scenario: Configure Anthropic provider
    Given I am on the AI Configuration tab
    When I select "Anthropic" as the provider
    And I enter a valid API key
    And I click Save
    Then my AI configuration should be saved

  Scenario: Test AI connection
    Given I have configured an AI provider with a valid API key
    When I click "Test Connection"
    Then I should see a success message if the connection works
    Or I should see an error message if the connection fails

  Scenario: API key is securely stored
    Given I have saved an API key
    When I return to the AI Configuration tab
    Then the API key should be masked (showing only last 4 characters)
    And I should have the option to update it

  # Personal Target Ranges
  Scenario: View personal targets section
    When I click on the Data tab
    Then I should see the Personal Target Ranges section
    And I should see a list of biomarkers I can customize

  Scenario: Set personal target range for a biomarker
    Given I am viewing the Personal Target Ranges section
    When I select a biomarker to customize
    And I enter a custom low value
    And I enter a custom high value
    And I save the personal target
    Then my personal target should be saved
    And it should be used instead of the standard reference range

  Scenario: Clear personal target range
    Given I have set a personal target for a biomarker
    When I click "Reset to Default" for that biomarker
    Then my personal target should be removed
    And the standard reference range should be used again

  Scenario: Personal targets show in timeline
    Given I have set personal targets for some biomarkers
    When I view my lab results in the timeline
    Then abnormal values should be determined by my personal targets
    And I should see an indicator that personal targets are being used

  # Data Management
  Scenario: View data statistics
    Given I am on the Data tab
    Then I should see the total number of lab results
    And I should see the total number of test values
    And I should see the total number of notes

  # Settings Persistence
  Scenario: Settings persist after logout
    Given I have customized my settings
    When I lock the application
    And I unlock the application again
    Then my settings should still be applied

  Scenario: Settings persist after page reload
    Given I have customized my settings
    When I reload the page
    And I unlock the application
    Then my settings should still be applied
