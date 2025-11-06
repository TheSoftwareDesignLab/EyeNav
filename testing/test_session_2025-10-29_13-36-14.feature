Feature: Replay of session on Oct 29 at 01:36:14 PM

@user1 @web
Scenario: User interacts with the web page named "Mercado Libre Colombia - Envíos Gratis en el día"

	Given I set the viewport to 1054x669
	And I set zoom ratio to 1
	Given I navigate to page "https://www.mercadolibre.com.co/"
	And I click on element with xpath "/html/body/div[5]/div/div/div[2]/div/div/div[2]/button[2]"
	And I click on element with xpath "/html/body/main/div/div[1]/div[1]/section/div[2]/button[2]"
	And I click on element with xpath "/html/body/main/div/div[1]/div[1]/section/div[2]/button[1]"
	And I click on element with xpath "/html/body/main/div/div[1]/section[1]/div/section/div[2]/button[2]"
	And I click on element with xpath "/html/body/main/div/div[1]/section[1]/div/section/div[2]/button[1]"
	And I set the viewport to 742x669
	And I set the viewport to 625x669
	And I click on element with xpath "/html/body/header/div/div[1]/button"
	And I click on element with xpath "/html/body/header/div/div[1]/nav/div/ul[2]/li[6]/details/summary"
	And I click on element with xpath "/html/body/header/div/div[1]/nav/div/ul[2]/li[6]/details/ul/li[3]/details/summary"
	And I click on element with xpath "/html/body/header/div/div[1]/nav/div/ul[2]/li[6]/details/ul/li[3]/details/ul/li[1]/a"
