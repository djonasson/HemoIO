Feature: Ollama Local AI Integration
  As a privacy-conscious user
  I want to use a local AI model for lab report analysis
  So that my health data never leaves my device

  Background:
    Given I have completed the initial setup

  # Setup Wizard Scenarios

  Scenario: Select Ollama as AI provider during setup
    Given I am on the AI configuration step
    When I select "Ollama (Local)" as the AI provider
    Then I should not be prompted for an API key
    And I should see a connection status indicator
    And I should see "No API key required" message

  Scenario: Ollama running shows available models
    Given Ollama is running locally
    And I have models "llama3.2:8b" and "llava:13b" installed
    When I select "Ollama (Local)" as the AI provider
    Then I should see "Ollama connected" status
    And I should see a model selection dropdown
    And I should see "llama3.2:8b" in the available models

  Scenario: Ollama not running shows helpful message
    Given Ollama is not running locally
    When I select "Ollama (Local)" as the AI provider
    Then I should see "Ollama not detected" status
    And I should see instructions to start Ollama
    And the model selection should be disabled

  Scenario: Auto-detect best available model for text analysis
    Given Ollama is running locally
    And I have models "llama3.2:8b", "llama3.2:3b", and "mistral:7b" installed
    When I select "Ollama (Local)" as the AI provider
    Then the model "llama3.2:8b" should be auto-selected
    Because it is the highest-ranked text model available

  Scenario: Detect vision model availability
    Given Ollama is running locally
    And I have models "llama3.2:8b" and "llava:13b" installed
    When I view the Ollama configuration
    Then I should see that vision analysis is available
    And I should see "llava:13b" as the vision model

  # Settings Page Scenarios

  Scenario: Configure Ollama in settings
    Given I am on the settings page
    And I am viewing AI configuration
    When I select "Ollama (Local)" as the AI provider
    Then I should not need to enter an API key
    And I should see the connection status
    And I should be able to select a model

  Scenario: Change Ollama model in settings
    Given I am using Ollama as my AI provider
    And I have models "llama3.2:8b" and "mistral:7b" installed
    When I change the model to "mistral:7b"
    Then the model should be saved
    And future analysis should use "mistral:7b"

  Scenario: Test Ollama connection in settings
    Given I am using Ollama as my AI provider
    And Ollama is running locally
    When I click "Test Connection"
    Then I should see a success message
    And the connection test should complete within 5 seconds

  Scenario: Handle Ollama becoming unavailable
    Given I am using Ollama as my AI provider
    And Ollama was previously running
    When Ollama stops running
    And I try to analyze a lab report
    Then I should see an error message about Ollama being unavailable
    And I should see instructions to restart Ollama

  # Lab Report Analysis Scenarios

  Scenario: Analyze text-based lab report with Ollama
    Given I am using Ollama as my AI provider
    And I have a text model "llama3.2:8b" available
    When I upload a text-based PDF lab report
    And the analysis completes
    Then I should see extracted biomarkers
    And I should see "llama3.2:8b" as the model used
    And the analysis should happen locally

  Scenario: Analyze lab report with vision model
    Given I am using Ollama as my AI provider
    And I have a vision model "llava:13b" available
    And vision mode is enabled
    When I upload an image-based lab report
    And the analysis completes
    Then I should see extracted biomarkers
    And the OCR step should be skipped
    And the image should be analyzed directly by the vision model

  Scenario: Fallback to OCR when no vision model available
    Given I am using Ollama as my AI provider
    And I have only text model "llama3.2:8b" available
    When I upload an image-based lab report
    And the analysis completes
    Then the OCR step should be used for text extraction
    And the text model should analyze the extracted text
    And I should see extracted biomarkers

  Scenario: Handle large PDF with vision model
    Given I am using Ollama as my AI provider
    And I have a vision model "llava:13b" available
    When I upload a 5-page PDF lab report
    Then each page should be analyzed separately
    And the results should be combined
    And I should see biomarkers from all pages

  # Error Handling Scenarios

  Scenario: Handle Ollama timeout during analysis
    Given I am using Ollama as my AI provider
    When I analyze a lab report
    And the analysis takes longer than the configured timeout
    Then I should see a timeout error message
    And I should be offered to retry with a longer timeout

  Scenario: Handle invalid model response
    Given I am using Ollama as my AI provider
    When I analyze a lab report
    And the model returns invalid JSON
    Then I should see an error about response parsing
    And I should be able to retry the analysis

  Scenario: Handle model not found
    Given I am using Ollama as my AI provider
    And my configured model has been removed from Ollama
    When I try to analyze a lab report
    Then I should see an error about the model not being available
    And I should be prompted to select a different model

  # Custom Base URL Scenarios

  Scenario: Configure custom Ollama URL
    Given I am on the settings page
    And I am configuring Ollama
    When I set a custom base URL "http://192.168.1.100:11434"
    And I test the connection
    Then the connection should use the custom URL
    And the models from that server should be displayed

  Scenario: Use default localhost URL
    Given I am configuring Ollama for the first time
    Then the default base URL should be "http://localhost:11434"
    And I should not need to change it for local Ollama
