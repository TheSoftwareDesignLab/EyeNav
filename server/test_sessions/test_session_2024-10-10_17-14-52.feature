Feature: Session on Oct 10 at 05:14:52 PM

@user1 @web
Scenario: User interacts with the web page named "Search our Doodle Library Collection - Google Doodles"

	Given I navigate to page https://doodles.google/search/
	Then I click on tag "button" with xpath "//*[@id="content"]/div[1]/div[1]/div[1]/form[1]/div[1]/div[2]/button[1]"
