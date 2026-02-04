Feature: Progressive Web App
  As a user
  I want to install HemoIO as a PWA
  So that I can access it quickly and use it offline

  Background:
    Given the app is loaded in a PWA-capable browser

  @pwa @install
  Scenario: Install prompt appears for new visitors
    Given I have not previously dismissed the install prompt
    And I have not already installed the app
    When the browser fires the beforeinstallprompt event
    Then I should see the install prompt
    And the prompt should show "Install HemoIO"
    And there should be an "Install App" button

  @pwa @install
  Scenario: Install prompt can be dismissed
    Given I see the install prompt
    When I click the dismiss button
    Then the install prompt should disappear
    And the prompt should not appear again for 7 days

  @pwa @install
  Scenario: Successfully install the app
    Given I see the install prompt
    When I click the "Install App" button
    Then the browser's native install dialog should appear
    When I accept the installation
    Then the install prompt should disappear
    And the app should be installed

  @pwa @install
  Scenario: Install prompt does not appear when already installed
    Given the app is already installed
    When I open the app
    Then I should not see the install prompt

  @pwa @update
  Scenario: Update prompt appears when new version is available
    Given the app is loaded
    And a new version of the service worker is available
    When the service worker detects the update
    Then I should see the update prompt
    And the prompt should show "Update Available"
    And there should be an "Update Now" button

  @pwa @update
  Scenario: Update the app to new version
    Given I see the update prompt
    When I click the "Update Now" button
    Then the new service worker should be activated
    And the page should reload with the new version

  @pwa @update
  Scenario: Dismiss update prompt
    Given I see the update prompt
    When I click the "Later" button
    Then the update prompt should disappear
    And I can continue using the current version

  @pwa @update
  Scenario: Update check on app visibility
    Given the app is installed
    And a new version was deployed while the app was in the background
    When I switch back to the app
    Then the app should check for updates
    And I should see the update prompt if an update is available

  @pwa @offline
  Scenario: App works offline after installation
    Given the app is installed
    And the service worker has cached the app resources
    When I go offline
    And I open the app
    Then the app should load from cache
    And I should be able to view my saved data
