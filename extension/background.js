
chrome.action.onClicked.addListener((tab) => {
  console.log("EYENAV: (background) Icono de acción clickeado.");


  chrome.action.openPopup();
  

  chrome.runtime.sendMessage({ action: 'closeSidePanel' }, (response) => {
    

    if (chrome.runtime.lastError) {
      console.log("EYENAV: (background) Mensaje 'closeSidePanel' enviado. El panel lateral no estaba abierto.");
    } else {
      
      console.log("EYENAV: (background) El panel lateral respondió:", response.status);
    }
  });
});