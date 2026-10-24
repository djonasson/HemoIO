Feature: Change password
  As a HemoIO user
  I want to change my password from Settings
  So that I can replace a weak password, or change it routinely, without losing my data

  Scenario: Changing the password
    Given I am logged into the application
    And I am on the Security tab of Settings
    When I enter my current password
    And I enter and confirm a new strong password
    And I click "Change password"
    Then I should see "Password changed. Use your new password next time you unlock HemoIO."
    And the password fields should be empty
    When I lock the application
    Then my old password should no longer unlock HemoIO
    And my new password should unlock HemoIO

  Scenario: My data stays readable after the change
    Given I am logged into the application
    And I have lab results with a note
    And I have saved an API key for my AI provider
    When I change my password
    And I lock the application and unlock it with my new password
    Then I should see my lab results
    And I should see my note
    And my AI provider should still have its saved API key

  Scenario: The current password is wrong
    Given I am logged into the application
    And I am on the Security tab of Settings
    When I enter an incorrect current password
    And I enter and confirm a new strong password
    And I click "Change password"
    Then I should see "Current password is incorrect"
    And the current password field should have focus
    And my new password should still be entered
    When I lock the application
    Then my old password should still unlock HemoIO

  Scenario: The confirmation does not match
    Given I am logged into the application
    And I am on the Security tab of Settings
    When I enter my current password
    And I enter a new strong password with a different confirmation
    Then I should see "Passwords do not match"
    And I should not be able to click "Change password"

  Scenario: The new password is too weak
    Given I am logged into the application
    And I am on the Security tab of Settings
    When I enter my current password
    And I enter and confirm the new password "weak"
    Then I should see which password requirements are not met
    And I should not be able to click "Change password"

  Scenario: The new password is the same as the current one
    Given I am logged into the application
    And I am on the Security tab of Settings
    When I enter my current password
    And I enter and confirm my current password as the new password
    Then I should see "New password must be different from your current password"
    And I should not be able to click "Change password"

  Scenario: A user who set up HemoIO before password changes existed
    Given I set up HemoIO with an earlier version of the app
    And I have lab results
    When I change my password
    And I lock the application and unlock it with my new password
    Then I should see my lab results
    And my old password should no longer unlock HemoIO

  Scenario: Changing the password with the keyboard only
    Given I am logged into the application
    And I am on the Security tab of Settings
    When I fill in the form using only the keyboard
    And I press Enter
    Then I should see "Password changed. Use your new password next time you unlock HemoIO."

  Scenario: Backups are not affected
    Given I am logged into the application
    When I am on the Security tab of Settings
    Then I should be told that existing backup files keep their own backup password
