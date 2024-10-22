Feature: Session on Oct 20 at 08:33:45 PM

@user1 @web
Scenario: User interacts with the web page named "Hot Sale 🔥 ¡Del 17 al 21 de Octubre! | Mercado Libre"

	Given I navigate to page https://www.mercadolibre.com.co/
	Then I click on tag "path" with xpath "/html/body/div[1]/div[1]/div[1]/div[1]/div[1]/nav[1]/div[1]/div[1]/span[1]/button[1]/svg[1]/path[1]"
	Then I click on tag "svg" with xpath "/html/body/div[1]/div[2]/main[1]/div[1]/div[2]/div[1]/div[1]/div[1]/form[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[2]/button[1]/svg[1]"
	Then I click on tag "p" with xpath "//*[@id="prompt-textarea"]/p[1]"
	Then I click on tag "div" with xpath "/html/body/div[1]/div[2]/main[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/article[4]/div[1]/div[1]/div[2]/div[1]/div[1]/div[1]/div[1]/div[1]/pre[1]/div[1]/div[3]"
	Then I click on tag "div" with xpath "/html/body/div[1]/div[2]/main[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/article[4]/div[1]"
	Then I click on tag "button" with xpath "/html/body/div[1]/div[2]/main[1]/div[1]/div[1]/div[1]/div[1]/div[1]/div[1]/article[4]/div[1]/div[1]/div[2]/div[1]/div[1]/div[1]/div[1]/div[1]/pre[1]/div[1]/div[2]/div[1]/div[1]/span[1]/button[1]"
