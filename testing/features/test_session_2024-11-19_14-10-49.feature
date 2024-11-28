Feature: Replay of session on Nov 19 at 02:10:49 PM

@user1 @web
Scenario: User interacts with the web page named "Wikipedia, the free encyclopedia"

	Given I navigate to page "https://en.wikipedia.org/wiki/Main_Page"
	And I click on tag with selector a with href "/wiki/Samantha_Harvey_(author)"
	And I click on tag with selector a with href "/wiki/Ditton,_Kent"
	And I click on tag with selector "input" with id "searchInput"
	And I input "hello world"
	And I click on tag with selector a with href "https://en.wikipedia.org/w/index.php?title=Special%3ASearch&search=%22Hello%2C+World%21%22+program&wprov=acrw1_0"
	And I click on tag with selector a with href "/wiki/Computer_program"
	And I go back
	And I scroll down
	And I scroll down
	And I scroll up
	And I scroll up
