Feature: Session on Oct 11 at 11:34:52 AM

@user1 @web
Scenario: User interacts with the web page named "Wikipedia"

	Given I navigate to page https://www.wikipedia.org/
	Then I click on tag "button" with xpath "//*[@id="search-form"]/fieldset[1]/button[1]"
