Feature: Replay of session on Dec 11 at 07:17:52 PM

@user1 @web
Scenario: User interacts with the web page named "Mercado Libre Colombia - Envíos Gratis en el día"

	Given I navigate to page "https://www.mercadolibre.com.co/"
	And I click on tag with id "cb1-edit"
	And I input "black nike shoes"
	And I click on tag with xpath "/html[1]/body[1]/header[1]/div[1]/div[2]/form[1]/button[1]"
	And I hit enter
