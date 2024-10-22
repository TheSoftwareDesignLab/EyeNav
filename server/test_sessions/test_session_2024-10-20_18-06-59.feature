Feature: Session on Oct 20 at 06:06:59 PM

@user1 @web
Scenario: User interacts with the web page named "ChatGPT"

	Given I navigate to page https://chatgpt.com/
	Then I click on tag "div" with xpath "/html/body/div[1]/div[2]/main[1]/div[1]/div[1]/div[1]/div[2]/div[1]/div[1]/div[1]/div[4]/form[1]/div[1]/div[1]/div[2]"
	Then I click on tag "p" with xpath "//*[@id="prompt-textarea"]/p[1]"
