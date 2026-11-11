/* Мобильная навигация RH: затемнение, закрытие панели и блокировка прокрутки фона */
(function(){
"use strict";
function init(){
 const sidebar=document.getElementById("sidebar"),toggle=document.getElementById("menuToggle");
 if(!sidebar||!toggle)return;
 let overlay=document.getElementById("mobileNavOverlay");
 if(!overlay){overlay=document.createElement("button");overlay.type="button";overlay.id="mobileNavOverlay";overlay.className="mobile-nav-overlay";overlay.setAttribute("aria-label","Закрыть меню");overlay.hidden=true;document.body.appendChild(overlay)}
 const sync=()=>{const open=sidebar.classList.contains("open")&&innerWidth<=760;overlay.hidden=!open;document.body.classList.toggle("mobile-nav-active",open);toggle.setAttribute("aria-expanded",String(open))};
 toggle.setAttribute("aria-controls","sidebar");toggle.setAttribute("aria-expanded","false");
 toggle.addEventListener("click",()=>requestAnimationFrame(sync));
 overlay.addEventListener("click",()=>{sidebar.classList.remove("open");sync()});
 sidebar.addEventListener("click",e=>{if(e.target.closest("a")){sidebar.classList.remove("open");sync()}});
 document.addEventListener("keydown",e=>{if(e.key==="Escape"){sidebar.classList.remove("open");sync()}});
 window.addEventListener("hashchange",()=>{sidebar.classList.remove("open");sync()});
 window.addEventListener("resize",sync);sync();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
})();