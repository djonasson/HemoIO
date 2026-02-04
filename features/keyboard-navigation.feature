Feature: Keyboard Navigation
  As a user
  I want to navigate the app using keyboard shortcuts
  So that I can use the app efficiently without a mouse

  Background:
    Given the app is loaded

  @keyboard @accessibility
  Scenario: Submit wizard step with Enter key on password fields
    Given I am on the password setup step
    When I fill in a valid password
    And I press Enter
    Then I should advance to the next step

  @keyboard @accessibility
  Scenario: Submit wizard step with Enter key on non-input pages
    Given I am on the storage selection step
    When I press Enter
    Then I should advance to the next step

  @keyboard @accessibility
  Scenario: Submit wizard step with Enter key on AI configuration
    Given I am on the AI configuration step
    When I press Enter
    Then I should advance to the next step

  @keyboard @accessibility
  Scenario: Submit login form with Enter key
    Given I am on the login screen
    When I enter my password
    And I press Enter
    Then I should be logged in

  @keyboard @accessibility
  Scenario: Enter key does not submit when button is disabled
    Given I am on the password setup step
    And I have not filled in a valid password
    When I press Enter
    Then I should remain on the current step

  @keyboard @accessibility
  Scenario: Enter key in text inputs submits form
    Given I am filling out a form with text inputs
    When I press Enter in the last input field
    Then the form should be submitted

  @keyboard @accessibility
  Scenario: Tab navigation through wizard steps
    Given I am on any wizard step
    When I press Tab repeatedly
    Then focus should move through all interactive elements
    And focus should eventually reach the Next button

  @keyboard @accessibility
  Scenario: Escape key closes modals
    Given a modal is open
    When I press Escape
    Then the modal should close
