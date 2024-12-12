Feature: Replay of session on Dec 11 at 03:12:05 PM

@user1 @web
Scenario: User interacts with the web page named "Google"

	Given I navigate to page "https://www.google.com/"
	And I click on tag with id "APjFqb"
	And I input "hello world program"
	And I hit enter
	And I click on tag with xpath "/html[1]/body[1]/div[3]/div[1]/div[4]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/a[1]/div[1]"
