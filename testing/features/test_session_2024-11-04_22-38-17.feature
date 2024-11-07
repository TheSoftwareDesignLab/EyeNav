Feature: Replay of session on Nov 04 at 10:38:17 PM

@user1 @web
Scenario: User interacts with the web page named "Wikipedia, the free encyclopedia"

	Given I navigate to page "https://en.wikipedia.org/wiki/Main_Page"
	And I click on tag with href "https://en.wikipedia.org/wiki/Campeche"
	And I click on tag with href "https://en.wikipedia.org/wiki/Yucat%C3%A1n_(state)"
	And I go back
	And I go forward
