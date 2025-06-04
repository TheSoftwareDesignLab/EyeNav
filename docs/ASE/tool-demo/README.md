# Paper Title

- **Venue:** [<venue>](<venueURL>) 

## Description
This repo contains the latex structure for the **<Paper Title>** <Paper Type>.


## Structure 

* preamble: contains all package and command definitions. Everything should be set by now, but if something needs defining this is the place to do it (look inside to see the structure)
* bibfiles
    * local.bib: contains all local bib references i.e., references used for this paper specifically. Most references should be added here
    * bib folder: this folder contains many references used for multiple purposes, in particular the _compsci.bib_ file contains many references on software engineering, programming languages, and adaptive systems. Check here if the reference exists before adding it to the _local.bib_ file
* Acronym.tex: contains all Acronyms used in the paper (look into the file for example of the definition). Acronyms are used with the \ac{ACRONYM} command
* Pointers to objects in the text (e.g., images, tables, code, sections, code-line, ....) are referenced using the fancyref package using the command \fref{} respectively starting with (img:, tab:, lst:, sec:, ln:, ....)


## Useful commands

* _\authorcomment[TYPE]{AUTHOR}{COMMENT}_ is used to leave annotation inlined with the text. Comments only appear in draft mode (the option in the documentclass in the _main.tex_ file) and are invisible otherwise. TYPE can be comment, missing, idea, note, and author.
   * Frequent authors ( _i.e.,_ Mario, Camilo, Alejandro, Anamaria, Michael and Laura ) have custom annotation commands: \MARIO{}, \CAMILO{}, \ALEJO{}, \ANA{}, \MICHAEL{} and \LAURA{} that has 1 optional parameter (_i.e.,_ TYPE) and one mandatory parameter (_i.e.,_ COMMENT). If first parameter is not provided it, TYPE value "comment" would be assigned.
* _\ie \eg \cf_ are used respectively for the abbreviations i.e., e.g., cf.
* listings are defined according to each specific language in the _preamble_ file and generate their own environment (e.g., _\ctxraits[....]{....}_ generates a contexts traits listing).
