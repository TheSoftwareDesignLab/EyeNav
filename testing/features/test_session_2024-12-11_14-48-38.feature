Feature: Replay of session on Dec 11 at 02:48:38 PM

@user1 @web
Scenario: User interacts with the web page named "Amazon.com. Spend less. Smile more."

	Given I navigate to page "https://www.amazon.com/"
	And I click on tag with id "twotabsearchtextbox"
	And I input "nike black shoes"
	And I click on tag with id "nav-search-submit-button"
	And I scroll down
	And I click on tag with xpath "/html[1]/body[1]/div[1]/div[1]/div[1]/div[1]/div[1]/span[1]/div[1]/div[9]/div[1]/div[1]/span[1]/div[1]/div[1]/div[1]/span[1]/a[1]/div[1]"
