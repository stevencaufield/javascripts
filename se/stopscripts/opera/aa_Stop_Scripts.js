// ==UserScript==
// @name        SE Stop Scripts
// @author      Naruki Bigglesworth
// @namespace   com.naruki.sensibleerection.stop.scripts
// @description Block inline and loaded scripts, and reveal them to the user
// @include     http://sensibleerection.com/*
// @include     http://*.sensibleerection.com/*
// @version     1
// @run-at      document-start
// ==/UserScript==

var luserScript = "<script><!--\nvar lusers_display = 0;\nfunction lusers_toggle (set) {\n	if (set == 1) {\n		lusers_display = 0;\n	}\n	else if (set == 0) {\n		lusers_display = 1;\n	}\n	var lusers = document.getElementById('lusers');\n	var x = 80;\n	var y = 170;\n	if (window && window.event && window.event.clientX) {\n		x = window.event.clientX;\n	}\n	if (window && window.event && window.event.clientY) {\n		y = window.event.clientY;\n	}\n	if (lusers_display) {\n		lusers.style.display='none';\n		lusers_display = 0;\n	}\n	else {\n		lusers.style.display='block';\n		lusers.style.left=x;\n		lusers.style.top=y;\n		lusers_display = 1;\n	}\n	return true;\n}\n//--></script>";
var badScriptCount = 0;

window.opera.addEventListener('BeforeScript', function (e) {
  // don't cancel necessary scripts!
  if (scriptTxt.parentNode == document.body) {
    // allows:
    //   the MM_jumpMenu script for message viewing
    //   the MM_reloadPage script for reloading a really old browser
    return;
  }
  
  // see if the script is from SE or from users
  var script = e.element;
  var scriptTxt = script.outerHTML;
  if (scriptTxt === luserScript) {
    //console.log("  Ignoring SE script: " + scriptTxt);
    return; // SE scripts can be ignored
  }
  // cancel all remaining scripts!
  e.preventDefault();
  e.stopPropagation();

  badScriptCount++;
  // expose all other scripts!
  var mySpan = document.createElement("pre");
  mySpan.appendChild(document.createTextNode(scriptTxt));
  mySpan.style.border = "1px dotted blue";
  mySpan.style.color = "red";
  script.parentNode.replaceChild(mySpan, script);
  console.log("Stopped: " + scriptTxt);
}, false);

window.setTimeout(function () {
  if (badScriptCount > 0) {
    alert("Found " + badScriptCount + " embedded scripts, yo. Stopped those mothers.");
  }
}, 500);
