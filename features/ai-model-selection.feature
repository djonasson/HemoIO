Feature: AI Model Selection
  As a user analyzing lab reports with a cloud AI provider
  I want the model I choose in Settings to be the one used for analysis
  So that I control quality and cost, and never depend on a model the app guessed for me

  Background:
    Given I am logged into the application
    And I have configured Anthropic as my AI provider with an API key

  Scenario: Models are loaded from my account
    When I open the AI Configuration tab in Settings
    Then I should see the models available to my API key
    And no model should be selected until I choose one

  Scenario: The chosen model is used for the next import
    Given I have selected the model "claude-sonnet-5-5" in Settings
    When I go to Import without reloading the page
    And I analyze a lab report
    Then the analysis request should use the model "claude-sonnet-5-5"

  Scenario: Changing the model applies to the following import
    Given I have analyzed a lab report using the model "claude-sonnet-5-5"
    When I select the model "claude-opus-5-5" in Settings
    And I analyze another lab report
    Then the analysis request should use the model "claude-opus-5-5"

  Scenario: The chosen model is remembered after reloading
    Given I have selected the model "claude-sonnet-5-5" in Settings
    When I reload the page and unlock the application
    And I open the AI Configuration tab in Settings
    Then the model "claude-sonnet-5-5" should be selected

  Scenario: Import asks me to choose a model when none is selected
    Given I have not selected a model
    When I go to Import
    Then I should see that a model must be selected in Settings
    And no analysis request should be sent

  Scenario: Analysis works with models that think before answering
    Given I have selected the model "claude-sonnet-5-5" in Settings
    When I analyze a lab report
    And the AI response contains reasoning before the extracted results
    Then the extracted values should be shown for review
