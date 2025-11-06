Feature: Replay of session on Oct 29 at 02:29:13 AM

@user1 @web
Scenario: User interacts with the web page named "Mercado Libre Colombia - Envíos Gratis en el día"

	Given I set the viewport to 1054x669
	And I set zoom ratio to 1
	Given I navigate to page "https://www.mercadolibre.com.co/"
	And I click on element with xpath "/html/body/div[5]/div/div/div[2]/div/div/div[2]/button[2]"
	And I click on element with xpath "/html/body/main/div/div[1]/div[1]/section/div[2]/button[2]"
	And I click on element with xpath "/html/body/main/div/div[1]/div[1]/section/div[2]/button[2]"
	And I click on element with xpath "/html/body/main/div/div[1]/section[1]/div/section/div[2]/button[2]"
	And I click on element with xpath "/html/body/main/div/div[1]/section[1]/div/section/div[2]/button[1]"
	And I click on element with xpath "/html/body/header/div/div[2]/form/input"
	And I type "hola" into field with xpath "/html/body/header/div/div[2]/form/input"
	And I click on element with xpath "/html/body/header/div/div[2]/form/button"
	And I type "hola" into field with xpath "/html/body/header/div/div[2]/form/input"
	And I press the "Enter" key on element with xpath "/html/body/header/div/div[2]/form/input"
	And I set the viewport to 500x535
