Feature: Session on Oct 21 at 08:09:42 AM

@user1 @web
Scenario: User interacts with the web page named "Bambi (cantante) - Wikipedia, la enciclopedia libre"

	Given I navigate to page https://es.wikipedia.org/wiki/Bambi_(cantante)
	Then I click on tag "a" with href "https://www.google.com/search?sca_esv=3830138d5daf0584&rlz=1C5CHFA_enCO938CO938&q=disinginuity&nfpr=1&sa=X&ved=2ahUKEwjgn5uVyJ-JAxV5RzABHYM6KvsQvgUoAXoECAwQAg"
	Then I click on tag "textarea" with id "APjFqb"
	Then I click on tag "img" with xpath "//*[@id="radix-:rp8:"]/div[1]/div[1]/img[1]"
	Then I click on tag "div" with xpath "//*[@id="radix-:rp9:"]/div[7]"
