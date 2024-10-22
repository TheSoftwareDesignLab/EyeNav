Feature: Session on Oct 20 at 06:16:00 PM

@user1 @web
Scenario: User interacts with the web page named "ChatGPT"

	Given I navigate to page https://chatgpt.com/c/67158d3b-dabc-8003-9655-76d2836448fc
	Then I click on tag "button" with xpath "/html/body/div[1]/div[2]/main[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/div[1]/span[1]/button[1]"
	Then I click on tag "svg" with xpath "/html/body/div[1]/div[2]/main[1]/div[1]/div[2]/div[1]/div[1]/div[1]/form[1]/div[1]/div[2]/div[2]/div[1]/div[3]/button[1]/svg[1]"
