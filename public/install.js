(() => {
  const dialog=document.getElementById('installDialog'),button=document.getElementById('installApp');let promptEvent=null;
  document.getElementById('installHelp').addEventListener('click',()=>dialog.showModal());
  document.getElementById('closeInstall').addEventListener('click',()=>dialog.close());
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();promptEvent=e;button.hidden=false;});
  button.addEventListener('click',async()=>{if(!promptEvent)return;await promptEvent.prompt();await promptEvent.userChoice;promptEvent=null;button.hidden=true;});
  window.addEventListener('appinstalled',()=>{promptEvent=null;button.hidden=true;dialog.close();});
})();
