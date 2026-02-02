Feature: Application loads successfully

  As a user
  I want to open the HemoIO application
  So that I can start managing my lab results

  Scenario: Application displays the home page
    Given I open the application
    Then I should see the HemoIO title
