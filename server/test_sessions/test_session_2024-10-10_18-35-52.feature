Feature: Session on Oct 10 at 06:35:52 PM

@user1 @web
Scenario: User interacts with the web page named "Wikipedia"

	Given I navigate to page https://www.wikipedia.org/
	Then I click on tag "fieldset" with xpath "//*[@id="search-form"]/fieldset[1]"
	Then I click on tag "input" with id "searchInput"
	Then I click on tag "button" with xpath "//*[@id="search-form"]/fieldset[1]/button[1]"
	Then I click on tag "div" with xpath "//*[@id="search"]/div[4]"
	Then I click on tag "div" with xpath "//*[@id="mw-content-text"]/div[2]"
	Then I click on tag "div" with id "searchText"
	Then I click on tag "input" with id "ooui-php-1"
	Then I click on tag "ul" with xpath "//*[@id="mw-content-text"]/div[2]/div[4]/ul[1]"
