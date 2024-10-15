Feature: Session on Oct 11 at 11:14:15 AM

@user1 @web
Scenario: User interacts with the web page named "Wikipedia"

	Given I navigate to page https://www.wikipedia.org/
	Then I click on tag "button" with xpath "//*[@id="search-form"]/fieldset[1]/button[1]"
	Then I click on tag "a" with href "https://en.wikipedia.org/wiki/Console_application"
	Then I click on tag "div" with xpath "//*[@id="mw-content-text"]/div[1]/div[3]"
