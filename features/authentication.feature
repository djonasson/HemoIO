Feature: Authentication
  As a user
  I want to secure my health data with a password
  So that only I can access my sensitive lab results

  Background:
    Given the application has been set up previously

  Scenario: User unlocks the application with correct password
    Given I am on the login screen
    When I enter my correct password
    And I click the unlock button
    Then I should be redirected to the dashboard
    And my session should be active

  Scenario: User fails to unlock with incorrect password
    Given I am on the login screen
    When I enter an incorrect password
    And I click the unlock button
    Then I should see an error message "Incorrect password"
    And I should remain on the login screen

  Scenario: User locks the application
    Given I am logged in
    When I click the lock button
    Then I should be redirected to the login screen
    And my session should be cleared

  Scenario: Session is cleared on page close
    Given I am logged in
    When I close the browser tab
    And I reopen the application
    Then I should see the login screen
    And my session should not be active

  Scenario: Password field shows/hides password
    Given I am on the login screen
    When I enter my password
    Then the password should be hidden by default
    When I click the show password button
    Then the password should be visible
    When I click the hide password button
    Then the password should be hidden again

  Scenario: Login screen is accessible
    Given I am on the login screen
    Then the password field should have an accessible label
    And the unlock button should be keyboard accessible
    And focus should start on the password field
