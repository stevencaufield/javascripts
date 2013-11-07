// ==UserScript==
// @name           SEReplyMod
// @namespace      http://www.sensibleerection.com/sereplymod
// @description    Tweaks entry pages at SensibleErection.com
// @author         Naruki Bigglesworth
// @include        http://sensibleerection.com/entry.php/*
// @include        http://*.sensibleerection.com/entry.php/*
// @exclude        http://*.sensibleerection.com/profile.php/*
// ==/UserScript==
(function () { // begin anonymous function wrapper
// the center column division contains post and replies content
var mainDiv;
var postId, myUserId, myUserName, myEmail;
// list of all comments on page
var commentsArr = new Array();

/*==============================================================================
  BEGIN STYLESHEET ADJUSTMENTS
------------------------------------------------------------------------------*/
              // save vertical space
var styles  = '.scrollable { display:block; max-height:400px; overflow:auto; padding:5px 1em 5px 5px; }' +
              // separates post from comments
              '.underlined { border-style:solid; border-width:0px 0px 1px; }' +
              // plus or minus for hiding comments
              '.toggleButton { border:1px dotted gray; cursor:pointer; max-height:9px; width:9px; text-align:center; padding:0 0 0 2px; font-size:75%}' +
              // for moderation menu items
              ' .g { color:green; } .r { color:red; }' +
              // checkbox lists without the bullets
              '.options { list-style-type:none; }' +
              // styles for making left/right columns -- very persnickety
              '.left { float:left; width:49%; }' + '.right { float:left; width:49%; text-align:left; }' +
              // styles for the reply form preview box
              '.border { border-collapse:collapse; border:1px solid grey; padding:3px; width:100%; }' +
              '#preview { border:1px dashed yellow; background-color:#bbf; color:#000; top:0; left:0; padding:1em; overflow:auto; width:100%; }' +
              '.rightTxt { float:left; width:49%; text-align:right; }' +
              '.tall { height:20em; } .wide { width: 100%;}' +
              '.shortBtn { height:0.5em; background-color:transparent; padding:0 2px; margin:1px; } #btnLink { color:blue; text-decoration:underline; cursor:pointer;}' +
              '.errors { border-color: red;} .errors span { font-weight:bold; color:red;}' +
              '.warnings { border-color: blue;} .warnings span { font-weight:bold; color:blue;}' +
              // for temporarily blocked content, like EMBED
              '.hidden { display:inline-block; vertical-align:middle; text-align:center; cursor:pointer; overflow:hidden; border:1px dashed #6600CC; }';
var newSS       = document.createElement('style');
newSS.type      = 'text/css';
newSS.innerHTML = styles;
document.getElementsByTagName("head")[0].appendChild(newSS);
/*------------------------------------------------------------------------------
  END STYLESHEET ADJUSTMENTS
==============================================================================*/

/*------------------------------------------------------------------------------
  POSTing via AJAX should behave the same way as POSTing via a form, but it wasn't
  handling Unicode chars properly. They appeared as garbage unless you forced the
  browser to use Unicode encoding.
  
  Someone told me that UAs (the browser) automatically convert Unicode chars into
  HTML entities when submitting text, so that's what this function does.

  So far, it seems to work, but I suspect doubled characters will be hosed. I.e.,
  Unicode allows for a single character to be comprised of 2 symbols, not just 1.
  Don't have any to test with, so I don't know. If I run into any, I may need to
  adapt the info from the site:
  
  https://developer.mozilla.org/en/Core_JavaScript_1.5_Reference/Global_Objects/String/charCodeAt
*/
// now handles surrogate pairs?
function uni2ent(srcTxt) {
  var entTxt = '';

var logTxt = '';
  var c, hi, lo;
  var len = 0;
  for (var i=0, code; code=srcTxt.charCodeAt(i); i++) {
    var rawChar = srcTxt.charAt(i);
    if (code > 255) {
      // High surrogate (could change last hex to 0xDB7F to treat high private surrogates as single characters)
      if (0xD800 <= code && code <= 0xDBFF) {
        hi  = code;
        lo = srcTxt.charCodeAt(i+1);
        code = ((hi - 0xD800) * 0x400) + (lo - 0xDC00) + 0x10000;
        i++;
        rawChar += srcTxt.charAt(i+1);
      }
      // Low surrogate
      else if (0xDC00 <= code && code <= 0xDFFF) {
        hi  = srcTxt.charCodeAt(i-1);
        lo = code;
        code = ((hi - 0xD800) * 0x400) + (lo - 0xDC00) + 0x10000;
        rawChar = srcTxt.charAt(i-1) + rawChar;
      }
      c = "&#x" + code.toString(16).toUpperCase() + ";";

logTxt += '   Char['+rawChar+'] --> Entity['+c+']\n';
    }
    else {
      c = srcTxt.charAt(i);
    }
    entTxt += c;
    len++;
  }

if (logTxt != '') {
  GM_log('UNICODE CHANGES:\n' + logTxt + '\n\n');
}

  return entTxt;
}

/*------------------------------------------------------------------------------
  Pseudo-class object to hold key data of a comment
*/
function CommentObject( userId, alias, commentId, date, scoreAdj, isNew, commentTxt ) {
  this.userId     = userId;
  this.alias      = alias;
  this.commentId  = commentId;
  this.date       = date;
  this.scoreAdj   = scoreAdj;
  this.isNew      = isNew;
  this.commentTxt = commentTxt;
  this.modInfo    = new Array();
}
/* Class methods for sorting comparisons. E.g.:
    commentsArr.sort(CommentObject.compareDate);
*/
CommentObject.compareDate = function(r1, r2) {
  // cheating, I know
  return (r1.commentId - r2.commentId);
}
/*
  Sort mod score in desc. order.
  Break ties by asc. age (FIFO)
*/
CommentObject.compareMod = function(r1, r2) {
  var r = r2.scoreAdj - r1.scoreAdj;
  if (r==0) r = r1.commentId - r2.commentId;
  return r;
}

/*------------------------------------------------------------------------------
  Return the specified CommentObject

  commentId: the ID of the desire CommentObject
*/
function getCommentRecord(commentId) {
  for (var i=0, reply; reply = commentsArr[i]; i++) {
    if (commentId == reply.commentId) return reply;
  }
  return null;
}

/*------------------------------------------------------------------------------
  load the SE website cookies stored on the browser
*/
function getCookie(c_name) {
  if (document.cookie.length>0) {
    c_start=document.cookie.indexOf(c_name + "=");
    if (c_start!=-1) {
      c_start=c_start + c_name.length+1;
      c_end=document.cookie.indexOf(";",c_start);
      if (c_end==-1) c_end=document.cookie.length;
      return unescape(document.cookie.substring(c_start,c_end));
    } 
  }
  return "";
}

/*------------------------------------------------------------------------------
  insert a comment moderation dialog. submitting will not reload the screen.
*/
function showMod(evt) {
  // get original modAnchor
  var modAnchor = evt.target;
  modAnchorId = modAnchor.id;
  commentId = modAnchorId.replace("mod", "");
  // remove any existing mod form
  var dlg = document.getElementById('SEModDlg');
  if (dlg != null && typeof dlg != 'undefined') {
    dlg.parentNode.removeChild(dlg);
  }
  // create the drop down menu
  var formTxt = getModSelectHTML(false);
  var modForm = document.createElement('form');
  modForm.setAttribute('class', 'mod');
  modForm.innerHTML = formTxt;
  //
  // create a submit button
  var modBtn      = document.createElement('input');
  modBtn.type     = 'button';
  modBtn.value    = 'Moderate';
  modBtn.addEventListener('click', function() {
    // create the background form submission, using AJAX
    var modUrl = document.location.href;
    //var modData = 'comment_mod_type_id=' + modForm.comment_mod_type_id.value + '&parent_id=' + commentId;
    // can't use above format because of Firefox+GM using XPCNativeWrappers
    var modData = 'comment_mod_type_id=' + modForm.elements[0].value + '&parent_id=' + commentId;
    modData = encodeURI(modData);
    var cookieHeader = 'cookie_id=' + getCookie('cookie_id') + '; cookie_password=' + getCookie('cookie_password');
    GM_xmlhttpRequest({
      method: 'POST',
      url: modUrl,
      headers: {
        'Content-type': 'application/x-www-form-urlencoded',
        'User-agent'  : 'Mozilla/4.0 (compatible) Naruki',
        'Cookie'      : cookieHeader,
      },
      data: modData,
      onload: function(rsp) {
        //GM_log('Mod Request returned ' + rsp.status + ' ' + rsp.statusText + '\n\nPage data:\n' + rsp.responseText);
      }
    });
    // clean up
    // remove the mod form
    dlg.parentNode.removeChild(dlg);
    // remove link from this modAnchor
    modSpan = document.createElement('span');
    modSpan.innerHTML = "moderate";
    modAnchor.parentNode.replaceChild(modSpan, modAnchor);
    return false;
  }, false);
  //
  // create a cancel button
  var cancelBtn      = document.createElement('input');
  cancelBtn.type     = 'button';
  cancelBtn.value    = 'Cancel';
  cancelBtn.addEventListener('click', function() {
    dlg.parentNode.removeChild(dlg);
    return false;
  }, false);
  //
  //create the popup's title
  var ttl = document.createElement('b');
  ttl.appendChild(document.createTextNode('Moderate comment id '+commentId));
  //
  //create the popup frame
  dlg = document.createElement('div');
  dlg.id = 'SEModDlg';
  with (dlg.style) {
    border          = '1px solid #000';
    backgroundColor = '#bbf';
    color           = '#000';
    position        = 'relative';
    zIndex          = '10';
    top             = '0';
    left            = '0';
    padding         = '1em';
    overflow        = 'hidden';
  }
  // add title
  dlg.appendChild(ttl);
  dlg.appendChild(modForm);
  dlg.appendChild(modBtn);
  dlg.appendChild(cancelBtn);
  //
  //insert the dialog above the current comment
  pop = modAnchor.parentNode;
  while (pop.tagName != 'TABLE') {
    pop = pop.parentNode;
  }
  pop.parentNode.insertBefore(dlg, pop);
  return false;
}

/*------------------------------------------------------------------------------
  insert a comment reply dialog.
  submitting will (not?) reload the screen...
*/
function showReply(evt) {
  var resultTxt; // for rebuilding the output HTML
  var stack;  // for checking well-formedness of HTML
  var warns;  // for collecting warning messages
  var errors; // for collecting error messages
  var TypeForbidden     =-1; // tags that are not allowed inside BODY section
  var TypeSkipContent   = 0; // paired tags whose content must not be processed, just written (<STYLE>, <SCRIPT>, <!-- -->, etc.)
  var TypeText          = 1; // regular text, entities, etc.
  var TypeMustClose     = 2; // <a>, <div>, <table>, etc. -- absolutely must close tags
  var TypeCloseOptional = 3; // <p>, <li>, <td>, etc.     -- may close tags, but not necessary
  var TypeNoClose       = 4; // <img>, <br>, <hr>, etc.   -- cannot close these tags
  /*--------------------------------------------------------------------------
    helper class for validating HTML DOM nodes
  --------------------------------------------------------------------------*/
  function NodeObject(type, text) {
    this.type    = type;
    this.text    = text;
  }
  // get original modAnchor
  var replyAnchor = evt.target;
  var replyAnchorId = replyAnchor.id;                   // eg: reply123456
  var commentId = replyAnchorId.replace("reply", "");   // eg: 123456
  // remove any existing reply form
  var dlgTR = document.getElementById('SEReplyDialog');
  if (dlgTR != null && typeof dlgTR != 'undefined') {
    dlgTR.parentNode.removeChild(dlgTR);
  }
  //
  // we will insert the dialog just below the comment in the same table
  // create a new table row
  dlgTR = document.createElement('tr');
  // when we remove the dialog, this will be the node we delete
  dlgTR.id = 'SEReplyDialog';
  // add blank first TD, which is used for visual indent
  dlgTR.appendChild(document.createElement('td'));
  // the last TD will hold the reply dialog
  var replyTD = document.createElement('td');
  with (replyTD.style) {
    border          = '1px solid #000';
    backgroundColor = '#bbf';
    color           = '#000';
    position        = 'relative';
    zIndex          = '10';
    top             = '0';
    left            = '0';
    padding         = '0.5em';
    overflow        = 'auto';
  }
  // add TD to TR
  dlgTR.appendChild(replyTD);
  // to enable the RESET button, must set initial values before adding this to the DOM
  var victimComment = getCommentRecord(commentId);
  // prepare for innerHTML call to convert entities
  var quote = fixBreaks2Edit(victimComment.commentTxt.replace(/&/g, "\&amp;"));
  var commentText = "<blockquote><i>" + quote + "</i></blockquote>";
  // set parent comment as quoted initial value
  var frmHTML = createInputFormHTML().replace("</textarea>", (commentText.replace(/<br>/gi, "\n") + "</textarea>") );
  // pre-set the user alias
  frmHTML = frmHTML.replace("name='userAlias' value", "name='userAlias' value='"+myUserName+"'");
  // pre-set the user email
  frmHTML = frmHTML.replace("name='userEmail' value", "name='userEmail' value='"+myEmail+"'");
  var htmlTester = document.createElement('div');
  htmlTester.innerHTML = frmHTML;
  replyTD.appendChild(htmlTester);
  //
  // find the TR containing the comment
  tr = replyAnchor.parentNode;
  while (tr.tagName != 'TR') {
    tr = tr.parentNode;
  }
  // insert the reply dialog just AFTER the current comment row
  tr.parentNode.insertBefore(dlgTR, tr.nextSibling);
  // now that the dlgTR exists in the DOM, we can adjust various hard-to-reach properties
  //
  // add given alias to reply's title
  titl = document.getElementById('VictimAlias');
  titl.innerHTML = "<span title='UserID: "+victimComment.userId+"'>" +victimComment.alias+ "</span>";
  //
  // do the easy ones first
  document.getElementById('btnQuote'    ).addEventListener('click', function() { doAddTag('blockquote'); return false; }, false);
  document.getElementById('btnBold'     ).addEventListener('click', function() { doAddTag('strong'    ); return false; }, false);
  document.getElementById('btnItalic'   ).addEventListener('click', function() { doAddTag('em'        ); return false; }, false);
  document.getElementById('btnUnderline').addEventListener('click', function() { doAddTag('u'         ); return false; }, false);
  document.getElementById('btnSuper'    ).addEventListener('click', function() { doAddTag('sup'       ); return false; }, false);
  document.getElementById('btnSub'      ).addEventListener('click', function() { doAddTag('sub'       ); return false; }, false);
  document.getElementById('btnStrike'   ).addEventListener('click', function() { doAddTag('s'         ); return false; }, false);
  document.getElementById('btnPre'      ).addEventListener('click', function() { doAddTag('pre'       ); return false; }, false);
  document.getElementById('btnCode'     ).addEventListener('click', function() { doAddTag('code'      ); return false; }, false);
  document.getElementById('btnH1'       ).addEventListener('click', function() { doAddTag('h1'        ); return false; }, false);
  document.getElementById('btnH2'       ).addEventListener('click', function() { doAddTag('h2'        ); return false; }, false);
  document.getElementById('btnH3'       ).addEventListener('click', function() { doAddTag('h3'        ); return false; }, false);
  document.getElementById('btnH4'       ).addEventListener('click', function() { doAddTag('h4'        ); return false; }, false);
  document.getElementById('btnH5'       ).addEventListener('click', function() { doAddTag('h5'        ); return false; }, false);
  document.getElementById('btnH6'       ).addEventListener('click', function() { doAddTag('h6'        ); return false; }, false);
  // now handle the funky stuff
  document.getElementById('btnBig'  ).addEventListener('click', function() { doAddTag('font', 'size=7'     ); return false; }, false);
  document.getElementById('btnSmall').addEventListener('click', function() { doAddTag('font', 'size=1'     ); return false; }, false);
  document.getElementById('btnBlue' ).addEventListener('click', function() { doAddTag('font', 'color=blue' ); return false; }, false);
  document.getElementById('btnRed'  ).addEventListener('click', function() { doAddTag('font', 'color=red'  ); return false; }, false);
  document.getElementById('btnGreen').addEventListener('click', function() { doAddTag('font', 'color=green'); return false; }, false);  
  // these are more complex
  document.getElementById('btnLink' ).addEventListener('click', function() { doAddSpecialTag('a'  ); return false; }, false);
  document.getElementById('btnImg'  ).addEventListener('click', function() { doAddSpecialTag('img'); return false; }, false);
  document.getElementById('btnOList').addEventListener('click', function() { doAddSpecialTag('ol' ); return false; }, false);
  document.getElementById('btnUList').addEventListener('click', function() { doAddSpecialTag('ul' ); return false; }, false);
  document.getElementById('btnLItem').addEventListener('click', function() { doAddSpecialTag('li' ); return false; }, false);

  document.getElementById('btnSarcasm').addEventListener('click', function() { doAddSpecialTag('sarcasm' ); return false; }, false);

  // punish the bastard
  document.getElementById('btnBlink').addEventListener('click', function() { doAddTag('blink'); return false; }, false);
  //
  // see what the reply will look like
  var btnPreview = document.getElementById('btnPreview');
  btnPreview.addEventListener('click', function() {
    var snippet = document.getElementById('userHTML').value;
    var preview = document.getElementById('preview');
    preview.innerHTML = snippet.replace(/\n/g, "<br>"); // setting innerHTML forces interpretation of HTML [e.g., &amp; --> &]
    return false;
  }, false);
  //
  // scan reply for simple errors
  var btnValidate = document.getElementById('btnValidate');
  btnValidate.addEventListener('click', doValidate, false);
  //
  // replace submission text with validated text
  var btnReplace = document.getElementById('btnReplace'); 
  btnReplace.addEventListener('click', function() {
    var validTxt = document.getElementById('validatedResult');
    if (validTxt==null || typeof validTxt == 'undefined') return false;
    var sourceTxt     = document.getElementById('userHTML');
    var preview       = document.getElementById('preview');
    sourceTxt.value   = validTxt.value;
    preview.innerHTML = sourceTxt.value.replace(/\n/g, "<br>"); // setting innerHTML forces interpretation of HTML [e.g., &amp; --> &]
    return false;
  }, false);
  //
  // submit the reply
  var btnSubmit = document.getElementById('btnSubmit');
  btnSubmit.addEventListener('click', doSubmit, false);
  document.getElementById('parent_id').value = commentId;
  document.getElementById('score_adj').value = victimComment.scoreAdj;

  //
  // create a cancel button
  var cancelBtn = document.getElementById('btnCancel');
  cancelBtn.addEventListener('click', function() {
    dlgTR.parentNode.removeChild(dlgTR);
    return false;
  }, false);
  //
  // go ahead and preview
  var preview = document.getElementById('preview');
  preview.innerHTML = commentText.replace(/\n/g, "<br>"); // setting innerHTML forces interpretation of HTML [e.g., &amp; --> &]
  return false;

  /*----------------------------------------------------------------------------
    Generate text for the edit box, not preview
    - normalize BR tag+line feed pairs
    - convert single BR tags to line feeds
    - remove extra line feeds at end of string
  */
  function fixBreaks2Edit(theHtml) {
    theHtml = theHtml.replace(/(<br>)?[\r\n]+/gi, "\n");
    theHtml = theHtml.replace(/<br>/gi, "\n");
    theHtml = theHtml.replace(/\n+$/gi, "");
    return theHtml;
  }

  /*----------------------------------------------------------------------------
    create the HTML text to display various config options
    at this point, no saved settings will be loaded
  */
  function createInputFormHTML() {
    var frmHTML = "";
    frmHTML += "  <form id='SEReplyForm' name='SEReplyForm'>";
    frmHTML += "    <table border='0' width='100%'>";
    frmHTML += "      <tr>";
    frmHTML += "        <td>";
    frmHTML += "          <b>SE Inline Reply to <span id='VictimAlias'></span></b>";
    frmHTML += "        </td>";
    frmHTML += "      </tr>";
    frmHTML += "      <tr>";
    frmHTML += "        <td>";
    frmHTML += "          <button type='button' id='btnQuote'     class='shortBtn' title='Put blockquotes around selected text' >\"Q\"           </button>";
    frmHTML += "          <button type='button' id='btnBold'      class='shortBtn' title='Make selected text strong'            ><b>B</b>        </button>";
    frmHTML += "          <button type='button' id='btnItalic'    class='shortBtn' title='Emphasize selected text'              ><i>I</i>&nbsp;  </button>";
    frmHTML += "          <button type='button' id='btnUnderline' class='shortBtn' title='Underline selected text'              ><u>U</u>        </button>";
    frmHTML += "          <button type='button' id='btnSuper'     class='shortBtn' title='Make selected text superscript'       ><sup>Super</sup></button>";
    frmHTML += "          <button type='button' id='btnSub'       class='shortBtn' title='Make selected text subscript'         ><sub>Sub</sub>  </button>";
    frmHTML += "          <button type='button' id='btnStrike'    class='shortBtn' title='Make selected text look deleted'      ><s>Strike</s>   </button>";
    frmHTML += "          <button type='button' id='btnPre'       class='shortBtn' title='Put PRE block around selected text'   >&lt;Pre>        </button>";
    frmHTML += "          <button type='button' id='btnCode'      class='shortBtn' title='Make selected text inline code sample'>&lt;Code>       </button>";
    frmHTML += "          <button type='button' id='btnH1'        class='shortBtn' title='Put H1 around selected text'          >H1              </button>";
    frmHTML += "          <button type='button' id='btnH2'        class='shortBtn' title='Put H2 around selected text'          >H2              </button>";
    frmHTML += "          <button type='button' id='btnH3'        class='shortBtn' title='Put H3 around selected text'          >H3              </button>";
    frmHTML += "          <button type='button' id='btnH4'        class='shortBtn' title='Put H4 around selected text'          >H4              </button>";
    frmHTML += "          <button type='button' id='btnH5'        class='shortBtn' title='Put H5 around selected text'          >H5              </button>";
    frmHTML += "          <button type='button' id='btnH6'        class='shortBtn' title='Put H6 around selected text'          >H6              </button>";
    frmHTML += "        <br/>";
    frmHTML += "          <button type='button' id='btnBig'   class='shortBtn' style='font-size:120%' title='Make selected text bigger' >Big  </button>";
    frmHTML += "          <button type='button' id='btnSmall' class='shortBtn' style='font-size:60%'  title='Make selected text smaller'>Small</button>";
    frmHTML += "          <button type='button' id='btnBlue'  class='shortBtn' style='color:blue'     title='Make selected text blue'   >Blue </button>";
    frmHTML += "          <button type='button' id='btnRed'   class='shortBtn' style='color:red'      title='Make selected text red'    >Red  </button>";
    frmHTML += "          <button type='button' id='btnGreen' class='shortBtn' style='color:green'    title='Make selected text green'  >Green</button>";
    frmHTML += "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;";
    frmHTML += "          <button type='button' id='btnLink'  class='shortBtn' title='Put hyperlink tag around selected text' >A               </button>";
    frmHTML += "          <button type='button' id='btnImg'   class='shortBtn' title='Insert image with selected text as URL' >&lt;Img>        </button>";
    frmHTML += "          <button type='button' id='btnOList' class='shortBtn' title='Put numbered list around selected text' >#...            </button>";
    frmHTML += "          <button type='button' id='btnUList' class='shortBtn' title='Put unordered list around selected text'>*...            </button>";
    frmHTML += "          <button type='button' id='btnLItem' class='shortBtn' title='Make selected text a list item'         >item            </button>";
//  frmHTML += "          <button type='button' id='btn'      class='shortBtn' title='~ selected text'                        >                </button>";
    frmHTML += "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;";
    frmHTML += "          <button type='button' id='btnSarcasm' class='shortBtn' title='Will actually be visible.'             >Sarcasm</button>";
    frmHTML += "          <button type='button' id='btnBlink' class='shortBtn' title='Do NOT do this, pal. I am warning you.'>Blink</button>";
    frmHTML += "        </td>";
    frmHTML += "      </tr>";
    frmHTML += "      <tr>";
    frmHTML += "        <td>";
    frmHTML += "          <textarea id='userHTML' name='userHTML' class='wide tall'></textarea>";
    frmHTML += "        </td>";
    frmHTML += "      </tr>";
    frmHTML += "      <tr>";
    frmHTML += "        <td>";
    frmHTML += "          <label for='userAlias'>Who said that? </label><input type='text' id='userAlias' name='userAlias' value> ";
    frmHTML += "          <label for='userEmail'>Where to send complaints? </label><input type='text' id='userEmail' name='userEmail' value> ";
    frmHTML += "          <input type='checkbox' id='emailOnReply' name='emailOnReply'><label for='emailOnReply'> Want to receive complaints?</label>";
    frmHTML += "          <input id='parent_id'  type='hidden' value='0'/>";
    frmHTML += "          <input id='score_adj'  type='hidden' value='0'/>";
    frmHTML += "        </td>";
    frmHTML += "      </tr>";
    frmHTML += "      <tr>";
    frmHTML += "        <td>";
    frmHTML += "          <span class='left'>";
    frmHTML += "            <button type='button' id='btnPreview' >Preview </button>";
    frmHTML += "            <button type='button' id='btnValidate'>Validate</button>";
    frmHTML += "            <button type='button' id='btnReplace' >Replace </button>";
    frmHTML += "          </span>";
    frmHTML += "          <span class='rightTxt'>";
    frmHTML += "            <button type='reset'  id='btnReset' >Reset </button>";
    frmHTML += "            <button type='button' id='btnSubmit'>Submit</button>";
    frmHTML += "            <button type='button' id='btnCancel'>Cancel</button>";
    frmHTML += "          </span>";
    frmHTML += "        </td>";
    frmHTML += "      </tr>";
    frmHTML += "      <tr>";
    frmHTML += "        <td>";
    frmHTML += "          <div id='preview'>...</div>";
    frmHTML += "        </td>";
    frmHTML += "      </tr>";
    frmHTML += "    </table>";
    frmHTML += "  </form>";
    return frmHTML;
  }

  /*----------------------------------------------------------------------------
    search backwards to find the matching start tag from the stack
    if safely found, pop off it and all tags that follow it
    return any close tags </...> that need to be output
  */
  function removeTagPair(endTag) {
    if (endTag.type != TypeMustClose && endTag.type != TypeCloseOptional) return false;
    var okToPop = false;
    var searchTxt = endTag.text.replace("/", "");
    var closeTags = '';
    // first, get the index of the start tag
    var startIdx = stack.length - 1;
    while (startIdx >= 0) {
      searchTag = stack[startIdx];
      if (searchTxt == searchTag.text) {
        // yay! found it
        okToPop = true;
        break;
      }
      // BAD NESTING
      if (searchTag.type == TypeMustClose) {
        errors.push("Open tag ["+searchTag.text+"] requires a close tag -- but encountered ["+endTag.text+"] first. FIX IT.");
        // adding the missing close tag could be dangerous: for example, if the required close tag is later found and they try to pop it off
        // thus, do NOT add the missing close tag and hope this doesn't cause more errors later
      }
      // ok to continue after closing
      else if (searchTag.type == TypeCloseOptional) {
        // prepend a close tag
        closeTags = searchTag.text.replace("<", "</") + closeTags;
      }
      // ok to continue
      else if (searchTag.type == TypeText || searchTag.type == TypeNoClose) {
        // no op
      }
      startIdx--;
    }
    // if ok, then pop everything including the start tag
    while (okToPop && stack.length > startIdx) { stack.pop(); }
    return okToPop? closeTags : false;
  }

  /*----------------------------------------------------------------------------
    add the text to our result
    if it's a tag, check the stack for placement errors
  */
  function addNodeObject(obj) {
    if (obj.text == null) return;
    var isCloseTag = (obj.type != TypeText) && (obj.text[1] == '/');
    var lastIdx    = stack.length - 1;
    // if this will be first item on stack
    if (lastIdx < 0) {
      if (isCloseTag) {
        warns.push("Close tag ["+obj.text+"] found with no open tag.");
        // don't bother adding to stack
      }
      else {
        stack.push(obj);
      }
    }
    // if the new item is text
    else if (obj.type == TypeText) {
      // if the previous added item is also text
      if (stack[lastIdx].type == TypeText) {
        // merge them
        stack[lastIdx].text += obj.text;
      }
      else {
        // just add it to the stack
        stack.push(obj);
      }
    }
    // if the new item is no-close tag
    else if (obj.type == TypeNoClose) {
      if (isCloseTag) {
        // wtf? you can't close that!
        errors.push("Illegal close tag ["+obj.text+"] found.");
        // convert opening < to entity
        obj.text.replace("<", "&lt;");
        obj.type = TypeText;
      }
      else {
        stack.push(obj);
      }
    }
    // if the new item has optional close tag
    else if (obj.type == TypeCloseOptional) {
      if (isCloseTag) {
        // add any missing close tags
        tmpCloseTags = removeTagPair(obj);
        // failed, so pretend it's just text
        if (tmpCloseTags == false) {
          // convert opening < to entity
          obj.text.replace("<", "&lt;");
          obj.type = TypeText;
        }
        else {
          resultTxt += tmpCloseTags;
        }
      }
      else {
        stack.push(obj);
      }
    }
    // if the new item has required close tag
    else if (obj.type == TypeMustClose) {
      if (isCloseTag) {
        // add any missing close tags
        tmpCloseTags = removeTagPair(obj);
        // failed, so pretend it's just text
        if (tmpCloseTags == false) {
          // convert opening < to entity
          obj.text.replace("<", "&lt;");
          obj.type = TypeText;
        }
        else resultTxt += tmpCloseTags;
      }
      else {
        stack.push(obj);
      }
    }
    // this should never happen
    else {
      stack.push(obj);
      warns.push("Unknown object put on stack: "+obj.type+" ["+obj.text+"].");
    }
    resultTxt += obj.text;
  }

  /*----------------------------------------------------------------------------
    Given the HTML tag, including any attributes, determine which of the types
    it belongs to.
    
    fullTag: the text from open bracket to close bracket, inclusive: <...>
  */
  function getTagType(fullTag) {
    // get tag name
    myTagName = "|" + fullTag.toLowerCase().match(/!?[a-z]+/) + "|";
    // regex is failing for some reason
  //  if (myTagName.match(/^(\!doctype|base|body|frame|frameset|head|html|link|meta|noframes|title)$/) != null) {
    if (0 <= "|!doctype|base|body|frame|frameset|head|html|link|meta|noframes|title|".indexOf(myTagName)) {
      return TypeForbidden;
    }
  //  if (myTagName.match(/^(style|script)$/) != null) {
    if (0 <= "|style|script|".indexOf(myTagName)) {
      return TypeSkipContent;
    }
  //  if (myTagName.match(/^(area|basefont|br|col|hr|img|input|isindex|param)$/) != null) {
    if (0 <= "|area|basefont|br|col|hr|img|input|isindex|param|".indexOf(myTagName)) {
      return TypeNoClose;
    }
  //  if (myTagName.match(/^(colgroup|dd|dt|li|option|p|tbody|td|tfoot|th|thead|tr)$/) != null) {
    if (0 <= "|colgroup|dd|dt|li|option|p|tbody|td|tfoot|th|thead|tr|".indexOf(myTagName)) {
      return TypeCloseOptional
    }
  //  if (myTagName.match(/^(a|abbr|acronym|address|applet|b|bdo|big|blockquote|button|caption|center|cite|code|del|dfn|dir|div|dl|em|embed|fieldset|font|form|h[1-6]|i|iframe|ins|kbd|label|legend|map|menu|noembed|noscript|object|ol|optgroup|pre|q|s|samp|script|select|small|span|strike|strong|style|sub|sup|table|textarea|tt|u|ul|var)$/) != null) {
    if (0 <= "|a|abbr|acronym|address|applet|b|bdo|big|blockquote|button|caption|center|cite|code|del|dfn|dir|div|dl|em|embed|fieldset|font|form|h[1-6]|i|iframe|ins|kbd|label|legend|map|menu|noembed|noscript|object|ol|optgroup|pre|q|s|samp|script|select|small|span|strike|strong|style|sub|sup|table|textarea|tt|u|ul|var|".indexOf(myTagName)) {
      return TypeMustClose    
    }
    // unknown tag, pretend it's text
    return TypeText;
  }

  /*----------------------------------------------------------------------------
    Surround selected text with the specified HTML tag, including any attributes
    
    tag:        the name of the HTML tag to use
    attributes: [optional] a string containing any attributes, such as "src='http://...'"
  */
  function doAddTag(tag, attributes) {
    var txtArea = document.getElementById('userHTML');
    var s = txtArea.selectionStart;
    var e = txtArea.selectionEnd;
    var allTxt = txtArea.value;
    var subTxt = allTxt.substring(s, e); 
    var htmlTxt = '<' + tag;
    if (typeof attributes != 'undefined') {
      htmlTxt += ' ' + attributes;
    }
    htmlTxt += '>' + subTxt + '</' + tag + '>';
    txtArea.value = allTxt.substring(0, s) + htmlTxt + allTxt.substring(e, allTxt.length);
    e = s + htmlTxt.length;
    txtArea.focus();
    txtArea.selectionStart = s;
    txtArea.selectionEnd   = e;
  }

  /*----------------------------------------------------------------------------
    tag:  the name of the HTML tag to use
  */
  function doAddSpecialTag(tag) {
    var txtArea = document.getElementById('userHTML');
    var s = txtArea.selectionStart;
    var e = txtArea.selectionEnd;
    var allTxt = txtArea.value;
    var subTxt = allTxt.substring(s, e); 
    htmlTxt = '';
    switch (tag) {
      case 'a':
        if (subTxt.length < 1) subTxt = "http://www.google.com";
        href = window.prompt("Enter the URL of the site. Leave blank to use highlighted text.", subTxt);
        htmlTxt = "<a target='_blank' href='"+href+"'>"+subTxt+"</a>";
      break;
      //
      case 'img':
        if (subTxt.length < 1) subTxt = "http://sexypic.png";
        src = window.prompt("Enter the URL of the image. Leave blank to use highlighted text.", subTxt);
        htmlTxt = "<img src='"+src+"' alt='"+subTxt+"'>";
      break;
      //
      case 'ol':
      case 'ul':
        if (subTxt.length < 1) subTxt = "item 1";
        subTxt = subTxt.replace(/\n/g, "</li><li>");
        htmlTxt = "<"+tag+">\n<li>"+subTxt+"</li>\n</"+tag+">";
      break;
      //
      case 'li':
        if (subTxt.length < 1) subTxt = "item 1";
        subTxt = subTxt.replace(/\n/g, "</li>\n<li>");
        htmlTxt = "<li>"+subTxt+"</li>\n";
      break;
      //
      case 'sarcasm':
        if (subTxt.length < 1) subTxt = "witty comment";
        htmlTxt = "<font size='0.5em' color='gray'>&lt;Sarcasm></font>"+subTxt+"<font size='0.5em' color='gray'>&lt;/Sarcasm></font>";
      break;
      default: return;
    }
    txtArea.value = allTxt.substring(0, s) + htmlTxt + allTxt.substring(e, allTxt.length);
    e = s + htmlTxt.length;
    txtArea.focus();
    txtArea.selectionStart = s;
    txtArea.selectionEnd   = e;
  }

  /*----------------------------------------------------------------------------
    examine user entered text for obvious HTML problems
    this is a basic function that is easily fooled
    put cleaned up results in a read-only textarea
  */
  function doValidate() {
    var snippet = document.getElementById('userHTML').value;
    resultTxt = "";
    stack  = new Array();
    warns  = new Array();
    errors = new Array();
    var i=0, j=0;
    var nodeType, nodeText;
    while (i < snippet.length) {
      switch (snippet[i]) {
        case '<': // checking for HTML tags
          /*
            look for HTML comments of the form <!--optional text-->
            this is not 100% precise because:
              <!----> is technically invalid, since you must have something between the start and end, and
              <!-- --  > is technically valid, since white space before closing > is allowed, but fuck it
          */
          if (snippet.substr(i, 4) == '<!--') {
            nodeType = TypeSkipContent;
            j = snippet.indexOf('-->', (i+4)) + 3;
            if (j < 3) {
              errors.push("Unclosed comment found at position "+i+" ["+snippet.substr(i,20) +"...] -- Converting remainder of input text to comment.");
              snippet += "-->";
              j = snippet.length;
            }
            nodeText = snippet.substring(i, j);
            i = j;
            if (nodeText == null) warns.push("Got null text");
            addNodeObject(new NodeObject(nodeType, nodeText));
            continue;
          }
          // find any other kind of HTML tag
          j = snippet.indexOf('>', i) + 1;
          // if the closing > was not found...
          if (j < 1) {
            errors.push("Invalid tag start found at position "+i+" ["+snippet.substr(i,20) +"...]");
            nodeType = TypeText;
            // convert opening < to entity
            nodeText = "&lt;";
            if (nodeText == null) warns.push("Got null text");
            addNodeObject(new NodeObject(nodeType, nodeText));
            i++;
            continue;
          }
          nodeText = snippet.substring(i, j);
          // if there is another tag start character inside this tag...
          if (nodeText.match(/.</) != null) {
            errors.push("Invalid tag start found at position "+i+" ["+snippet.substr(i,20) +"...]");
            nodeType = TypeText;
            // convert opening < to entity
            nodeText = "&lt;";
            addNodeObject(new NodeObject(nodeType, nodeText));
            i++;
            continue;
          }
          // point to first character after tag
          i = j;
          nodeType = getTagType(nodeText);
          // can't allow these tags in the BODY
          if (nodeType == TypeForbidden) {
            errors.push("Illegal tag ["+nodeText+"] found at position "+i+".");
            nodeType = TypeText;
            // convert opening < to entity
            nodeText = nodeText.replace("<", "&lt;");
          }
          // contents are not HTML, so don't try to parse them
          else if (nodeType == TypeSkipContent) {
            // no matter what, this will be treated as text
            nodeType = TypeText;
            // remember start tag
            startTag = nodeText;
            // find end tag
            myTagName = startTag.toLowerCase().match(/[a-z]+/);
            endTag = "</" + myTagName + ">";
            j = snippet.toLowerCase().indexOf(endTag, i+1);
            // couldn't find it
            if (j < 0) {
              errors.push("Special start tag ["+startTag+"] at position "+i+" has no end tag -- Sanitizing remainder of text!");
              // sanitize rest of input
              nodeText = startTag + sanitizeInput(snippet.substr(i)) + endTag;
              i = snippet.length;
            }
            else {
              j += endTag.length;
              // get tags + contents as-is
              nodeText = startTag + snippet.substr(i, j);
              i = j;
            }
          }
          // didn't recognize this tag, convert it to text
          else if (nodeType == TypeText) {
            warns.push("Unknown tag ["+nodeText+"] found at position "+i+" -- making it visible.");
            // convert opening < to entity
            nodeText.replace("<", "&lt;");
          }
          // ready to add whatever we found
          if (nodeText == null) warns.push("Got null text");
          addNodeObject(new NodeObject(nodeType, nodeText));
        break;

        case '&': // checking for HTML entities
          // match valid HEX, Decimal, or Named entity pattern
          entity = snippet.match("^\&(#([xX][a-fA-F0-9]+|[0-9]+|[a-fA-F0-9]+);");
          // if we didn't find one
          if (entity == null) {
            warns.push("Invalid entity start [&] found at position "+i+" ["+snippet.substr(i,20) +"...]");
            // convert & to entity
            addNodeObject(new NodeObject(TypeText, "&amp;"));
            i++;
          }
          // found it
          else {
            if (entity == null) warns.push("Got null text");
            addNodeObject(new NodeObject(TypeText, entity));
            i += entity.length;
          }
        break;

        default: // this means we found some text
          j = snippet.indexOf('<', i);
          if (j < 0) j = snippet.length;
          k = snippet.substring(i,j).indexOf('&');
          j = (k<0)? j : j + k;
          // j now equals the beginning of a new tag/entity, or the end of the input
          txt = snippet.substring(i,j);
          i = j;
          addNodeObject(new NodeObject(TypeText, txt));
        break;
      }
    }

    var preview = document.getElementById('preview');
    preview.innerHTML = "";
    if (errors.length > 0) {
      var errNode = document.createElement('div');
      errNode.className = "errors";
      errNode.innerHTML = "<span>ERRORS</span>:<br>" + errors.join("\n").replace(/</g, "&lt;").replace(/\n/g, "<br> ");
      preview.appendChild(errNode);
    }
    if (warns.length > 0) {
      var warnNode = document.createElement('div');
      warnNode.className = "warnings";
      warnNode.innerHTML = "<span>WARNINGS</span>:<br>" + warns.join("\n").replace(/</g, "&lt;").replace(/\n/g, "<br> ");
      preview.appendChild(warnNode);
    }
    var resultNode = document.createElement('textarea');
    resultNode.id = 'validatedResult';
    resultNode.setAttribute('readOnly', true);
    resultNode.className = "wide tall";
    // WARNING: use "value", not "innerHTML" -- setting innerHTML converts entities!
    resultNode.value = resultTxt;
    preview.appendChild(resultNode);
    //
    return false;
  }

  /*----------------------------------------------------------------------------
    take user supplied text and submit it as a reply to another comment without
    reloading the page
    
    Note that replies to the entry itself use that form, and DO reload the page
    This is deliberate, so we can get a fresh look.
  */
  function doSubmit() {
    /* POSSIBLE FIELDS
        &name=Naruki
        &email=Naruki@UFie.org
        &email_replies=1
        &add_watch=74487 (postId)
        &comment=blah blah blah
        &submit=post (in there twice)
        &action=post (wtf?)
        &parent_id=1508279 (commentId)
        &score_adj=1
    */
    // get current reply contents
    var postableReplyTxt = encodeURIComponent( uni2ent( trim(document.getElementById('userHTML').value).replace(/(<\/?)blink>/gi, "$1s>") ) );
    var postableAlias    = encodeURIComponent( uni2ent( document.getElementById('userAlias').value ) );
    var postableEmail    = encodeURIComponent(document.getElementById('userEmail').value);
    var sendEmail        = document.getElementById('emailOnReply').selected?'&email_replies=1':'';
    var commentId        = document.getElementById('parent_id').value;
    var scoreAdj         = document.getElementById('score_adj').value;
    // create the background form submission, using AJAX
    var modUrl = document.location.href;
    var modData = '&name='          + postableAlias;
    modData    += '&email='         + postableEmail;
    modData    += sendEmail;
    modData    += '&comment='       + postableReplyTxt;
    modData    += '&submit=post';
    modData    += '&action=post';
    modData    += '&parent_id='     + commentId;
    modData    += '&score_adj='     + scoreAdj;
    var cookieHeader = 'cookie_id=' + getCookie('cookie_id') + '; cookie_password=' + getCookie('cookie_password');

    /*
      okay, encoding Unicode chars as HTML entities seems to fix the problem with POSTing via AJAX.
      Doing that means the charset I send is Latin-1, not Unicode, so no UTF-8 below.
    */
    GM_xmlhttpRequest({
      method: 'POST',
      url: modUrl,
      headers: {
        //'Content-type': 'application/x-www-form-urlencoded;',
        //'Content-type': 'application/x-www-form-urlencoded; charset=UTF-8;',
        'Content-type': 'application/x-www-form-urlencoded; charset=ISO-8859-1;',
        'User-agent'  : 'Mozilla/4.0 (compatible) Naruki',
        'Cookie'      : cookieHeader,
      },
      data: modData,
//      overrideMimeType: "text/html; charset=UTF-8;",
      onload: function(rsp) {
// ZZZ - use this to refresh the page without proper reload?
          GM_log('POST Reply returned: status=[' + rsp.status + ' ' + rsp.statusText + ']\n\nPage data:\n' + rsp.responseText);
      }
    });
    // clean up
    // remove any existing reply form
    var dlgTR = document.getElementById('SEReplyDialog');
    if (dlgTR != null && typeof dlgTR != 'undefined') {
      dlgTR.parentNode.removeChild(dlgTR);
    }
    return false;
  }
}

/*------------------------------------------------------------------------------
  popup info about selected comment
*/
function showReplyInfo(evt) {
  var replyInfoAnchor = evt.target;
  var replyInfoId = replyInfoAnchor.id; // eg: replyInfo123456
  var commentId = replyInfoId.replace("replyInfo", "");   // eg: 123456
  var reply = null;

  var replyUrl = "/comment.php/" + postId + "/" + commentId;
  GM_xmlhttpRequest({
      method: 'GET',
      url: replyUrl,
      headers: {
        'Content-type': 'application/x-www-form-urlencoded',
        'User-agent'  : 'Mozilla/4.0 (compatible) Naruki',
      },
      data: null,
      onload: updateModInfo,
  });
  return false;
}

function updateModInfo(rsp) {
  var replyPage = rsp.responseText.replace(/.+<body.+>/i, '').replace(/<\/body>.+/i, '');

  var hiddenDiv = document.getElementById('secretHiddenDiv');
  if (hiddenDiv == null) {
    hiddenDiv = document.createElement('div');
    hiddenDiv.id = 'secretHiddenDiv';
    hiddenDiv.style.display = 'none';
    document.body.appendChild(hiddenDiv);
    // now we can use DOM parsing!
  }
  hiddenDiv.innerHTML = replyPage;

  var els = hiddenDiv.getElementsByTagName('div');
  var replyModDiv = null;
  for (var i=0, n; n = els[i]; i++) {
    if (n.className=='date_header_text' && n.innerHTML=="Comment Moderation") {
      replyModDiv = els[i + 1];
      break;
    }
  }
  if (replyModDiv == null) {
    alert("No moderation found.");
    return;
  }
  /*
  <BR>
  <FONT color="green"><B>Underrated</B></FONT> by <A href="/profile.php/22277">Nihil</A><BR><FONT color="red"><B>Overrated</B></FONT> by <A href="/profile.php/12016">Naruki</A><BR>
  */
  var modArr = replyModDiv.innerHTML.replace(/\s+/g, ' ').split(/<BR>/i);
  /*
  0-
  1-<FONT color="green"><B>Underrated</B></FONT> by <A href="/profile.php/22277">Nihil</A>
  2-<FONT color="red"><B>Overrated</B></FONT> by <A href="/profile.php/12016">Naruki</A>
  3-
  */
  var myMods = new Array();
  var upMods = new Array();
  var dnMods = new Array();
  for (var m, i=0; i<modArr.length; i++) {
    m = modArr[i];
    if (m.length < 5) { continue; }
    var val = (m.indexOf("color=\"green\"")>0)? '+1' : '-1';
    var txt = m.replace(/.+<B>/i, '').replace(/<\/B>.+/i, '');
    var idd = m.replace(/^.+\/profile\.php\//i, '').replace(/\".+/i, '');
    var usr = m.replace(/^.+\/profile\.php\/\d+\">/i, '').replace(/<\/a>.*/i, '');
    var dispTxt = "   " + usr + " thought it was " + val + " " + txt;
    if (idd == myUserId) {
      myMods.push(val + " " + txt);
    }
    else if (val > 0) {
      upMods.push(dispTxt);
    }
    else{
      dnMods.push(dispTxt);
    }
  }
  var disp = '';
  if (myMods.length > 0) disp += "I thought the comment was:\n   " + myMods.join("\n   ") + "\n\n";
  if (upMods.length > 0) disp += "People who liked the comment:\n" + upMods.join("\n") + "\n\n";
  if (dnMods.length > 0) disp += "People who didn't like the comment:\n" + dnMods.join("\n");
  alert(disp);
}

/*------------------------------------------------------------------------------
  get first element-type child node (skips text nodes)

  http://www.w3schools.com/dom/prop_element_firstchild.asp
*/
function getFirstChild(node) {
  x = node.firstChild;
  while (x.nodeType != 1) {
    x = x.nextSibling;
  }
  return x;
}

/*------------------------------------------------------------------------------
  trim whitespace
*/
function trim(string) {
  return string.replace(/^\s+|\s+$/g, '');
}

/*------------------------------------------------------------------------------
  Return array of HTML elements that use the specified class
  Complement to standard functions - getElementById(), getElementsByName(), getElementsByTagName()
  
  searchClass: name of class to search for
  node:        (optional) parent node of elements to search
  tag:         (optional) HTML tag to limit searches to (such as 'A' or 'DIV')
*/
function getElementsByClass(searchClass, node, tag) {
  var classElements = new Array();
  if ( node == null ) node = document;
  if ( tag  == null ) tag = '*';
  var els = node.getElementsByTagName(tag);
  var elsLen = els.length;
  var pattern = new RegExp('(^|\\\\s)'+searchClass+'(\\\\s|$)');
  for (i = 0, j = 0; i < elsLen; i++) {
    if ( pattern.test(els[i].className) ) {
      classElements[j] = els[i];
      j++;
    }
  }
  return classElements;
} 

/*------------------------------------------------------------------------------
<div class="nav_box">
  <table width="100%" border="0" cellspacing="0" cellpadding="0"> <tr>
    <td class="nav_text"> <a href="/">home</a> | <a href="/index.2col.php">home<sup style="font-size:9px">2</sup></a> | <a href="http://sensibleelection.com"><b>Sensible Election</b></a> | <a href="/about.php">about</a> | <a href="/rules">conduct</a> | <a href="/galleries/">galleries</a> <!-- | <a href="http://www.marketbanker.com/mb/commerce/purchase_form.php?opid=9242&afsid=1">advertising</a>--> <br><a href="/admin.php">admin</a> | <a href="/stats.php">stats</a> | <a href="/search.php">search</a> | <a href="/post.php">post</a> </td>
    <td class="nav_text" align="right"> logged in as <a href="/profile.php/12016"> Naruki</a> | <a href="/login.php?action=log%20out">log out</a> </td>
  </tr> </table>
</div>
*/
function getUserId() {
  // get postId  
  var pathArr = document.location.pathname.split("/");
  for (var i = pathArr.length - 1; i >= 0; i--) {
    if (pathArr[i].length < 1) continue;
    postId = pathArr[i];
    break;
  }
  myUserId = false; // default to not logged in
  var navs = getElementsByClass('nav_text', null, 'td');
  if (navs.length > 1) {
    var lnk    = navs[1].getElementsByTagName('a')[0];
    myUserId   = lnk.href.replace(/^.*profile.php\//, '');
    myUserName = lnk.innerHTML.replace(/^\s+/g, "").replace(/\s+$/g, "");
  }
  // if logged in
  myEmail = "user@sensibleerection.com";
  if (myUserId != false) {
    // get email from submit form at the bottom
    // <input type="text" name="email" style="width:200" class="text_12px" value="Naruki@UFie.org">
    inputs = getElementsByClass('text_12px', null, 'input');
    for (var i=0, inp; inp=inputs[i]; i++) {
      if (inp.value.indexOf('@') < 1) continue;
      myEmail = inp.value;
      break;
    }
  }
  return myUserId;
}

function getModSelectHTML(isPostMod) {
  var htmlTxt = '  <select name="' + (isPostMod?"":"comment_") + 'mod_type_id" class="text11px">\n' +
                '    <option value="1"  class="g">+1 Insightful</option>\n'                         +
                '    <option value="2"  class="g">+1 Informative</option>\n'                        +
                '    <option value="3"  class="g">+1 Funny</option>\n'                              +
                '    <option value="4"  class="g">+1 Underrated</option>\n'                         +
                '    <option value="5"  class="g">+1 Original</option>\n'                           +
                '    <option value="12" class="g">+1 Hot Pr0n</option>\n'                           +
                '    <option value="13" class="g">+1 Classy Pr0n</option>\n'                        +
                '    <option value="16" class="g">+1 Interesting</option>\n'                        +
                '    <option value="17" class="g">+1 Good</option>\n'                               +
                '    <option value="20" class="g">+1 WTF</option>\n'                                +
                '    <option value="11">Nobody told me what to think</option>\n'                    +
                '    <option value="6"  class="r">-1 Repost</option>\n'                             +
                '    <option value="7"  class="r">-1 Overrated</option>\n'                          +
                '    <option value="8"  class="r">-1 Unworthy Self Link</option>\n'                 +
                '    <option value="9"  class="r">-1 Troll</option>\n'                              +
                '    <option value="10" class="r">-1 Flamebait</option>\n'                          +
                '    <option value="14" class="r">-1 Bad Pr0n</option>\n'                           +
                '    <option value="15" class="r">-1 Illegal Pr0n</option>\n'                       +
                '    <option value="18" class="r">-1 Old</option>\n'                                +
                '    <option value="19" class="r">-1 Bad</option>\n'                                +
                '    <option value="21" class="r">-1 WTF</option>\n'                                +
                '    <option value="22" class="r">-1 Wrong Category</option>\n'                     +
                '    <option value="23" class="r">-1 Boring</option>\n'                             +
                '  </select>\n';
  return htmlTxt;
}

/*------------------------------------------------------------------------------
  Replace the mod forms with a simple, standardized version.
  Also adjust the comment form.
*/
function adjustForms() {
  // create the replacement mod form
  var simpleModForm = document.createElement('span');
  simpleModForm.setAttribute('class', 'mod');
  var formTxt = '<form name="mod_type" method="post" action="/entry.php/'+postId+'">\n'          +
                getModSelectHTML(true) +
                '  <input name="action" type="submit" value="Moderate" class="text11px">\n' +
                '</form>\n';
  // above escapes the < tag operator
  simpleModForm.innerHTML = formTxt;
  /*
    because of the horrible SE markup, both forms might share names/ids
    whichever it is, they screw up normal DOM processing
  */
  var formNodes = document.getElementsByTagName('form');
  var max = formNodes.length; // inserting forms keeps increasing the length!
  for (var i=0; i<max; i++) {
    // the current form
    var formNode = formNodes[i];
    //for some reason, this doesn't work either
    // if (formNode.wrappedJSObject) formNode = formNode.wrappedJSObject;
    // if it is not one of SEs forms    (where action="/entry.php/74672"> )
    tmp = formNode.getAttribute('action');
    if (tmp.match(/\/entry\.php\/-?[0-9]+/) == null) {
      // Stupid user posted a form
      GM_log("Stupid user posted a form: " + formNode.outerHTML);
      continue;
    }
    // new mod form to be inserted
    var newNode  = simpleModForm.cloneNode(true);
    //var formName = formNode.getAttribute('name');
    var dad      = formNode.parentNode;
    /*
       The mod form at the top of the page has broken markup:
         the FORM tag is in between the TABLE and TR tags
       Replace the whole form with the new version
    */
    if (dad.nodeName == "TABLE") {
      // dad is the surrounding <TABLE> tag, which must also be removed
      var gramps = dad.parentNode;
      gramps.replaceChild(newNode, dad);
    }
    /*
    /   The good form at the bottom of the page is too complicated:
    /     it combines mod & reply, even though only one at a time can be done
    /   Remove the mod portion and add the new mod form above the reply form
    */
    else { //if (dad.nodeName == "DIV") {
      // dad is the surrounding DIV, which holds damn near everything on the page
      // I _told_ you the markup on this page was fucked up
      var s = formNode.getElementsByTagName('select');
      // if you've already modded this post, there is no mod menu to adjust
      if (s.length > 0) {
        var selectNode   = s[0]; // the <SELECT> tag inside the reply form
        var tdNode       = selectNode.parentNode; // the surrounding <TD> tag, which must also be removed
        var ancestorNode = tdNode.parentNode;
        //ancestorNode.removeChild(tdNode);
        tdNode.removeChild(selectNode);
        // now create new mod form section above comment form section
        commentHeader = formNode.previousSibling;
        while (commentHeader.nodeName != 'DIV') {
          // locate the preceding comment header
          commentHeader = commentHeader.previousSibling;
        }
        // create new header for the mod form
        var modFormHeader = document.createElement('div');
        modFormHeader.setAttribute('class', 'date_header_text');
        modFormHeader.innerHTML = 'Moderate the Post';
        // insert new header 
        dad.insertBefore(modFormHeader, commentHeader);
        // insert new mod form
        dad.insertBefore(newNode, commentHeader);
      }
      // put the submit button on a new line
      var submitBtn = formNode.getElementsByTagName('textarea')[0].nextSibling;
      formNode.insertBefore(document.createElement('br'), submitBtn);
      // clean up the comment form
      var c = formNode.getElementsByTagName('input');
      /*
      <span class="text_12px">
      <input type="checkbox" name="email_replies" value="1" class="text_12px">
      email me replies to this entry
      </span> 
      */
      var cBox, newSibling;
      for (var j=0; j<c.length; j++) {
        var n = c[j];
        if (n.name == 'email_replies') {
          // found the email checkbox
          cBox = n.parentNode;
          // kill the class so it doesn't screw up adjustComments() below
          cBox.setAttribute('class', '');
        }
        else if (n.value.indexOf('@') > 0) {
          newSibling = n;
        }
      }
      if (typeof cBox == 'undefined' || typeof newSibling == 'undefined') continue;
      // move the checkbox
      newSibling.parentNode.appendChild(cBox);
    }
  }
}

/*------------------------------------------------------------------------------
  Adjust some general settings for the entire page
*/
function adjustPost() {
  // allow wider screens to use full width
  mainDiv.style.minWidth = (mainDiv.style.width)? mainDiv.style.width : '';
  mainDiv.style.width = '';
  mainDiv.style.padding = '0 0.5em 0 0'; // add right padding

  // don't do this part in the negs
  var entryId = document.location.href.replace(/.*\//g, '');
  if (entryId > 0) {
    // the first <TABLE> is the post content
    var postTableNode = mainDiv.getElementsByTagName('table')[0];
    // create a scrollable <DIV>
    var postDiv = document.createElement('div');
    postDiv.setAttribute('class', 'scrollable underlined');
    // insert it before the <TABLE>
    mainDiv.insertBefore(postDiv, postTableNode);
    // now try to move the <TABLE> into the <DIV>
    postDiv.appendChild(postTableNode);
  }

  // make links open in new page
  var userLinks = mainDiv.getElementsByTagName('a');
  for (var i=0, aTag; aTag = userLinks[i]; i++) {
    if (aTag.target == '') { aTag.target = '_blank'; }
  }
}


/*------------------------------------------------------------------------------
  Extract useful information and tag each comment so adjustments can be done easily.

  <table width="100%" cellpadding="0" cellspacing="0"> <tr>
    <td><img src="/images/spacer.gif" width="10" height="1" border="0"></td>
    <td width="100%" style="border-bottom-style: dashed; border-bottom-width: 1px; border-bottom-color: #999999; border-left-style: dashed; border-left-width: 1px; border-left-color: #999999; padding: 4px; background-color: #FFFFFF">
      <span class="entry_details_text"> <a href="/profile.php/1984">X</a> said @ 4:57pm on 3rd Jan - <a href="/comment.php/74079/1488811">moderate/reply</a> </span> <br>
      <span class="text_12px"> HA HA! I GET IT!! Like in those jokes from yesterday!</span>
    </td>
  </tr> </table>
*/
var months = [ 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec' ];
function adjustComments() {
  // first, create a "root" comment thread toggle
  var divs = getElementsByClass('date_header_text', mainDiv, 'div');
  var rootDiv = null;
  for (var i=0; rootDiv=divs[i]; i++) {
    if (rootDiv.innerHTML == "Comments") {
      break;
    }
  }

  // if no comments yet
  if (rootDiv == null) { return; }

  var YYYY = new Date().getYear();
  // get all comments plus a couple extra items
  var comments = getElementsByClass('text_12px', mainDiv, 'span');
  var max = comments.length;
  for (i=0; i<max; i++) {
    var e = comments[i];
    var tdNode = e.parentNode;
    if (tdNode.nodeName != 'TD') continue; // skip non-comment
    // Opera shows one color format, Firefox another
    var isNew      = tdNode.style.backgroundColor.match(/(#EEEEEE|RGB\(238, 238, 238\))/i);
    // clever trick to make tags lowercase, despite innerHTML forcing them to upper
    var commentTxt = trim(e.innerHTML).replace(/(<\/?[A-Z]+)/gi, function(w){return w.toLowerCase();});
    /*
      Firefox stupidly treats even COMPLETELY NON-EXISTENT nodes as text nodes,
      so we have to bend over backwards to find the TD and IMG nodes for the spacer.gif
    */
    // get width from preceding spacer.gif to determine reply level
    var spaceTD = tdNode.parentNode.firstChild;
    while (spaceTD.nodeName != 'TD') { spaceTD = spaceTD.nextSibling; }
    var spaceImg = spaceTD.firstChild;
    while (spaceImg.nodeName != 'IMG') { spaceImg = spaceImg.nextSibling; }
    var level = spaceImg.getAttribute('width') / 10;
    // the first SPAN inside the table cell
    var olderBrother = getFirstChild(tdNode);
    var links        = olderBrother.getElementsByTagName('a');
    var userId       = links[0].href.replace(/^.+profile.php\//, '');
    var alias        = links[0].innerHTML;

    // ZZZ this timestamp stuff isn't working yet
    var tmp, timeArr, hh, mm, MM, DD;
    // last part normalizes white space
    tmp  = links[0].nextSibling.nodeValue.replace(/\s+/g," ");  // said @ 4:57pm on 3rd Jan -
    tmp  = tmp.replace(/.+@ (.+) [-\[]/, '$1'); // 4:57pm on 3rd Jan
    tmp  = tmp.split(/ /);                  // 4:57pm,on,3rd,Jan
    timeArr = tmp[0].split(':');            // 4,57pm
    hh = parseInt(timeArr[0], 10);
    if (timeArr[1].indexOf("pm")) {
      hh += 12;
    }
    hh = hh % 24;
    mm = parseInt(timeArr[1], 10);
    MM = months.indexOf(tmp[3]);
    DD = parseInt(tmp[2], 10);
    var date = new Date( YYYY, MM, DD, hh, mm, 0);   // is set in local time, which is bad

    /*
      said @ 5:20pm on 7th Mar [<font color="green"><strong>Score:1&nbsp;Informative</strong></font>]
      said @ 6:36am on 8th Mar [<font color="gray">Score:-2</font>]
    */
    var scoreAdj = 0;
    tmp = olderBrother.getElementsByTagName('font');
    if (tmp.length > 0) {
      tmp = tmp[0].innerHTML.split(":");
      scoreAdj = parseInt(tmp[1]);
    }

    // modify the mod/reply link
    var submitLink = links[1].href;
    var ids        = submitLink.replace(/^.+comment\.php\//, '').split('/');
    var commentId  = ids[1]; // 1488811

    // create link to show important info from comment page
    var replyInfoAnchor = document.createElement('a');
    with ( replyInfoAnchor.style ) {
      border  = '2px outset #00F';
      margin  = '0';
      padding = '0 2px';
      color   = '#00F';
      cursor  = 'pointer';
    }
    replyInfoAnchor.addEventListener('click', showReplyInfo, false);
    replyInfoAnchor.id = "replyInfo"+commentId;
    replyInfoAnchor.innerHTML = "^";

    // create element for the mod link
    var modAnchor;
    // if this is someone else's comment
    if (userId != myUserId) {
      // add a nifty mod popup link
      modAnchor = document.createElement('a');
      with (modAnchor.style) {
        border  = '2px outset #00F';
        margin  = '0';
        padding = '0 2px';
        color   = '#00F';
        cursor  = 'pointer';
      }
      modAnchor.addEventListener('click', showMod, false);
      modAnchor.id = "mod"+commentId;
      modAnchor.innerHTML = "moderate...";
    }
    // if this is my comment
    else {
      // not allowed to self-mod
      modAnchor = document.createElement('span');
      modAnchor.innerHTML = "moderate";      
    }

    // create element for the reply link
    var replyAnchor = document.createElement('a');
    with ( replyAnchor.style ) {
      border  = '2px outset #00F';
      margin  = '0';
      padding = '0 2px';
      color   = '#00F';
      cursor  = 'pointer';
    }
    replyAnchor.addEventListener('click', showReply, false);
    //replyAnchor.href = submitLink;
    replyAnchor.id = "reply"+commentId;
    replyAnchor.innerHTML = "reply...";
    // create element for the single comment page link
    refLink = document.createElement('a');
    refLink.href = submitLink;
    refLink.title = "open original Comment Page in new tab";
    refLink.target = "_blank";
    refLink.innerHTML = "comment page"

    // container for the links
    var modReply = document.createElement('span');
    modReply.appendChild(replyInfoAnchor);
    modReply.appendChild(document.createTextNode(" / "));
    modReply.appendChild(modAnchor);
    modReply.appendChild(document.createTextNode(" / "));
    modReply.appendChild(replyAnchor);
    modReply.appendChild(document.createTextNode(" / "));
    modReply.appendChild(refLink);
    // replace with new links
    olderBrother.replaceChild(modReply, links[1]);

    //
    // remember comment details for later manipulation
    commentsArr.push(new CommentObject( userId, alias, commentId, date, scoreAdj, isNew, commentTxt));
  }
}


/*------------------------------------------------------------------------------
  this starts it all off
*/
function main() {
  // if we cannot find the mainDiv, full stop
  if (!(mainDiv = document.getElementById('Layer1'))) {
    return;
  }
  // try to find logged in user id
  getUserId();
  adjustForms();
  adjustPost();
  adjustComments();
}

main();

})();// end anonymous function wrapper
