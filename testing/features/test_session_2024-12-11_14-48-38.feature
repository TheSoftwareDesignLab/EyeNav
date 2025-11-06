Feature: Replay of session on Oct 29 at 12:47:30 AM

@user1 @web
Scenario: User interacts with the web page named "prueba | Definición | Diccionario de la lengua española | RAE - ASALE"

	Given I set the viewport to 1536x730
	And I set zoom ratio to 1.25
	Given I navigate to page "https://dle.rae.es/prueba#UVZCH0c"
	And I click on element with xpath "/html/body/div[1]/article/div/div/div[1]/nav/ul/li[2]/a"
	And I click on element with xpath "/html/body/div[1]/article/div/div/div[1]/nav/ul/li[1]/a"
	And I click on element with xpath "/html/body/div[1]/article/div/div/div[1]/nav/ul/li[2]/a"
	And I click on element with xpath "/html/body/div[1]/article/div/div/div[1]/nav/ul/li[1]/a"
	And I click on element with xpath "/html/body/nav/div/form/div[1]/div/div/div[1]/input"
	And I type "prueba mil 2" into field with xpath "/html/body/nav/div/form/div[1]/div/div/div[1]/input"
	And I type "prueba mil 2" into field with xpath "/html/body/nav/div/form/div[1]/div/div/div[1]/input"
	And I press the "Enter" key on element with xpath "/html/body/nav/div/form/div[1]/div/div/div[1]/input"
	And I click on element with xpath "/html/body/nav/div/form/div[1]/div/button"
	And I click on element with xpath "/html/body/nav/div/form/div[1]/div/div/div[2]/select"
	And I click on element with xpath "/html/body/nav/div/form/div[1]/div/div/div[2]/select"
