// ==UserScript==
// @name           SEButler
// @namespace      http://www.sensibleerection.com/sebutler
// @description    Tweaks entry pages at SensibleErection.com
// @author         Naruki Bigglesworth
// @include        http://sensibleerection.com/entry.php/*
// @include        http://*.sensibleerection.com/entry.php/*
// @exclude        http://*.sensibleerection.com/profile.php/*
// ==/UserScript==
/*==============================================================================
SensibleErection Butler - not exactly based on SensibleFacial by Rojo
==============================================================================*/

/*==============================================================================
  BEGIN OBJECT DEFINITIONS
------------------------------------------------------------------------------*/

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
function asString(c) {
  return c.userId +", "+ c.alias +", "+ c.commentId +", "+ c.date +", "+ c.scoreAdj +", "+ c.isNew +", "+ c.commentTxt +", "+ c.modInfo;
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
  Pseudo-class object to hold info on users on this page
*/
function UserObject( userId, alias ) {
  this.userId  = userId;
  this.aliases = new Array( alias );
}
/*
  Class methods for sorting comparisons. E.g.:
    usersArr.sort(UserObject.compareId);
*/
UserObject.compareId = function(u1, u2) { 
  if (u1 && u2) return u1.userId - u2.userId;
  alert("Error! U1["+u1+"], U2["+u2+"].");
  return false;
}

/* Class object to describe a single moderation */
function ModObject( modderId, modVal, modType ) {
  this.modderId   = modderId;
  this.modVal     = modVal;
  this.modType    = modType;
}

/*------------------------------------------------------------------------------
  END OBJECT DEFINITIONS
==============================================================================*/

(function () { // begin anonymous function wrapper
// the center column division contains post and replies content
var mainDiv;
var postId, myUserId, myUserName, myEmail;
// list of all comments on page
var commentsArr = new Array();
// list of all users on page
var usersArr = new Array();
// wish I could get this to work!
var replyAge = 5 * 60 * 1000; // 5 minutes (in ms)

/*==============================================================================
  BEGIN CONFIG MENU OPTIONS
  These variables are stored locally via cookies. Here we use very permissive
  defaults, so be careful if you are in an intolerant environment.
------------------------------------------------------------------------------*/
var DefaultSettings = "a:1,2,3;b:1,2,3,4,6;c:1;d:;h:400";
// how tall can any comment be in px?
var commentHeightLimit = 0;
// should we collapse old threads (completely invisible) by default?
var flgCollapseOldThreads  = false;
// should we collapse old replies (only byline shows) by default?
var flgCollapseOldComments = false;
// am I egotistical?
var flgShowMyComments      = false;
// show the latest X comments, regardless of age?
var flgShowLatestXComments = false;
var latestXComments        = 10;

// how old should a reply be to be "old"?
var ageThreshholdMinutes = 10;

// should we block certain objects?
var flgShowScripts  = false;
var flgBlockIframes = false;
var flgBlockObjects = false;
var flgBlockEmbeds  = false;
var flgBlockImages  = false;
var flgBlockSEImgs  = false;
// should the notice be the same size as the blocked object?
var flgBlockMatchSize = false;

// should we blacklist, and how
var flgHideHatedUsers = false;
var flgKillHatedUsers = false;
var myHatedUsers      = '';
var boundedBlacklist  = ',' + myHatedUsers + ','; // this is a convenience for searching with indexOf()
/*------------------------------------------------------------------------------
  END CONFIG MENU OPTIONS
==============================================================================*/



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



/*==============================================================================
  BEGIN NORMALIZE CODE
------------------------------------------------------------------------------*/

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
  //simpleModForm.appendChild(document.createTextNode(formTxt));
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
*/
var commentTree = new CommentTreeNode(0, -1);
function CommentTreeNode(commentId, level, userId) {
  this.kids      = new Array();
  this.dad       = null;
  this.commentId = commentId;
  // added userId to reduce lookups
  this.userId    = userId;
  this.level     = level;
}
/*
  Add comment to tree as child of previous higher level comment
  This assumes we are processing the comments from the top down in order
*/
function addComment(parentReply, newReply) {
  if (parentReply == null) {
      alert("Invalid parent level!");
      return;
  }
  var l = parentReply.kids.length;
  // if this parent has no kids yet
  if (l < 1) {
    // if levels are off
    if (parentReply.level + 1 != newReply.level) {
      alert("Invalid child level "+newReply.level+"["+newReply.commentId+"] for parent level "+parentReply.level+"["+parentReply.commentId+"]");
    }
    // go ahead and add it
    newReply.dad = parentReply;
    parentReply.kids.push(newReply);
    return;
  }
  // if levels are just right
  if (parentReply.level + 1 == newReply.level) {
    // add it as last child
    newReply.dad = parentReply;
    parentReply.kids.push(newReply);
    return;
  }
  // try to add it to the last child
  addComment(parentReply.kids[l-1], newReply);
}
/*
  Search tree for given commentId
*/
function findComment(node, cId) {
  if (node == null) return null;
  // is this the right one?
  if (node.commentId == cId) return node;
  // check this node's kids
  for (var i=0, k; k = node.kids[i]; i++) {
    // is it one of the kids?
    var j = findComment(k, cId);
    if (j != null) {
      return j;
    }
  }
  // no luck at this end
  return null;
}

/*
  Add user to list, ignore if already present

  userId: the id of the user
  alias:  the text that could be his name, or could be made up
*/
function addUser(userId, alias) {
  for (i in usersArr) {
    var u = usersArr[i];
    // if this is an existing user id
    if (u.userId == userId) {
      // if this is a new alias
      if (u.aliases.indexOf(alias) < 0) {
        u.aliases.push(alias);
        u.aliases.sort();
      }
      // either way, we're done
      return;
    }
  }
  // new user id
  usersArr.push(new UserObject( userId, alias ));
}
/*
  Find the user object in the list
*/
function getUserById(userId) {
  theUser = null;
  for (i in usersArr) {
    var u = usersArr[i];
    // if this is an existing user id
    if (u.userId == userId) {
      theUser = u;
      break;
    }
  }
  return theUser;
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
  // add a comment thread toggle button (different from single reply toggle)
  treeButton = document.createElement('span');
  treeButton.innerHTML = "-"; // initially uncollapsed
  with (treeButton.style) {
    position      = 'absolute';
    cursor        = 'pointer';
    //verticalAlign = 'top';
    left          = '-9px';
    maxHeight     = '9px';
    width         = '9px';
    color         = 'purple';
    fontSize      = '75%';
  }
  treeButton.addEventListener('click', toggleThread, false);
  treeButton.id = "thread0";
  rootDiv.parentNode.insertBefore(treeButton, rootDiv);

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
    /*
    okay, just lost an _epic_ battle with CSS - I tried to position the +/- signs (for toggling thread display)
    to the left of the comments. I would get it working in Opera, but fail in Firefox. Vice versa.
    
    And then I started getting a situation where setting the + character would force it to shift to the left, 
    but the - character stayed in the right place, giving the impression that it bounced from left to right.
    Adding a border showed a very weird placement problem, and I finally said fuck it.
    
    Now, I simply insert the toggle button as a new TD in between the spacer and the comment. It works perfectly.
    
    Fucking CSS.
    */
    // add a comment thread toggle button (different from single reply toggle)
    treeButton = document.createElement('td');
    treeButton.innerHTML = "-"; // initially uncollapsed
    with (treeButton.style) {
      cursor        = 'pointer';
      verticalAlign = 'top';
      maxHeight     = '9px';
      width         = '9px';
      color         = 'purple';
      fontSize      = '75%';
    }
    treeButton.addEventListener('click', toggleThread, false);
    treeButton.id = "thread"+commentId;
    spaceTD.parentNode.insertBefore(treeButton, tdNode);
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
    // create scrollable, collapsible span around comment
    var commentSpan = document.createElement('div');
    commentSpan.setAttribute('class', 'scrollable');
    // assign unique id for toggling visibility
    commentSpan.id = commentId;
    tdNode.insertBefore(commentSpan, e);
    // now move actual comment inside this wrapper
    commentSpan.appendChild(e);
    //
    // insert toggle button
    var toggleImg          = document.createElement("span");
    toggleImg.innerHTML    = '&there4;';
    toggleImg.className    = 'toggleButton';
    toggleImg.addEventListener('click', toggleSingle, false);
    //toggleImg.setAttribute("toggleId", commentId);
    toggleImg.id = 'toggleFor'+commentId;
    // set up cross-references for quick access
    toggleImg.commentSpan = commentSpan;
    tdNode.insertBefore(toggleImg, olderBrother);
    //
    // remember comment details for later manipulation
    commentsArr.push(new CommentObject( userId, alias, commentId, date, scoreAdj, isNew, commentTxt));
    // add reply to thread tree structure
    addComment(commentTree, new CommentTreeNode(commentId, level, userId));
    // remember user details for later manipulation
    addUser(userId, alias);
  }
//dumpCommentsTime();
//dumpComments();
//dumpUsers();
//dumpThreads();
}

/*------------------------------------------------------------------------------
*/
function normalizePost() {
  adjustForms();
  adjustPost();
  adjustComments();
}
/*------------------------------------------------------------------------------
  END NORMALIZE CODE
==============================================================================*/



/*==============================================================================
  BEGIN COLLAPSE CODE

  This section contains functions for making comments collapsible
------------------------------------------------------------------------------*/

/*------------------------------------------------------------------------------
ZZZ NOT USED?
  Create a drop down menu containing IDs and aliases of all users who replied
  on this page.
*/
function createUsersListPopup() {
//  userIdList.setAttribute('name', 'id');
  var uMax = usersArr.length;
  // first, build the ID list
  var userIdList         = document.createElement('select');
  userIdList.name        = "id";
  userIdList.style.width = "10em";
  usersArr.sort(UserObject.compareId); // sort by ID
  for (i=0; i<uMax; i++) {
    u = usersArr[i];
    var uOpt   = document.createElement('option');
    uOpt.text  = u.userId + " - " + u.aliases.join(", ");
    uOpt.value = u.userId; // it's only the ID we want
    // tooltip should show all aliases
    uOpt.setAttribute('title', u.aliases.join(", "));
    userIdList.appendChild(uOpt);
  }
  // next, build the Alias list
  // to track uniqueness
  var uniqueAliases=[];
  // first, create the unique options
  for (i=0; i<uMax; i++) {
    // it is possible for two different people to post with the same alias, but the ID will be different
    u = usersArr[i];
    var tip = u.aliases.join(", ");
    for (j in u.aliases) {
      var uOpt   = document.createElement('option');
      uOpt.text  = u.aliases[j] + " - " + u.userId;
      uOpt.value = u.userId; // it's only the ID we want
      // tooltip should show all aliases
      uOpt.setAttribute('title', tip);
      // add it
      uniqueAliases.push(uOpt);
    }
  }
  // sort the list
  uniqueAliases.sort(function(o1, o2){
    var a = String(o1.text).toUpperCase(); 
    var b = String(o2.text).toUpperCase(); 
    return (a>b)? 1 : (a<b)? -1 : 0;
  });
  var userAliasList         = document.createElement('select');
  userAliasList.name        = "alias";
  userAliasList.style.width = "10em";
  // now add the sorted alias options
  for (i in uniqueAliases) {
    userAliasList.appendChild(uniqueAliases[i]);
  }
  //
  var submitBtn   = document.createElement('input');
  submitBtn.type  = 'submit';
  submitBtn.value = 'OK';
  //
  var popup = document.createElement('div');
  popup.appendChild(userIdList);
  popup.appendChild(userAliasList);
  popup.appendChild(submitBtn);
  document.body.appendChild(popup);
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
  Is this user on the blacklist, and the blacklist is active?
*/
function isBlackListed(userId) {
  return (flgHideHatedUsers && boundedBlacklist.indexOf(','+userId+',') >= 0);
}

/*------------------------------------------------------------------------------
  Show only comments by specified user.
  (So far, this only works for current user.)

  userId: the userID whose comments should be shown
*/
function showOnly(userId) {
  for (var i=0, reply; reply = commentsArr[i]; i++) {
    toggleReply(reply.commentId, (reply.userId != userId));
  }
}

/*------------------------------------------------------------------------------
  Show/Hide all old comments.
  All new comments are shown.
  Blacklisted user comments are always hidden.
*/
function toggleOldComments(makeHidden) {
  for (var i=0, reply; i<commentsArr.length; i++) {
    reply = commentsArr[i];
    var doHide = makeHidden;
    if (isBlackListed(reply.userId)) {
      doHide = true;
    }
    else if (reply.isNew) {
      // never hide new comments
      doHide = false;
    }
    // if old comment and want to hide it
    else if (makeHidden) {      
      // if I always want to show my own comments
      if (flgShowMyComments && (myUserId == reply.userId)) {
        // don't hide it
        doHide = false;
      }
    }
    toggleReply(reply.commentId, doHide);
  }
}

/*------------------------------------------------------------------------------
  Hide all but the latest comments/threads.

  count: latest X comments to show
*/
function showLatestComments(count) {
  if (!count || count < 1) count = 10;
  // first, collapse all threads
  toggleThreadNode(commentTree, true);
  var toggleButton = document.getElementById("thread0");
  // assume it is collapsed, even though some comments will be shown
  toggleButton.innerHTML = "+";
  // sort comments by descending time (actually using commentId, I'm a cheater)
  commentsArr.sort(CommentObject.compareDate).reverse();
  // now examine all comments
  for (var i=0, reply; reply=commentsArr[i]; i++) {
    var doHide = (i >= count);
    // if user wants to obliterate blacklisted comments...
    if (flgKillHatedUsers && isBlackListed(reply.userId)) {
      doHide = true;
    }
    // if I always want to show my own comments
    else if (doHide && flgShowMyComments && (myUserId == reply.userId)) {
      doHide = false;
    }
    // Hide/Show each comment
    toggleReply(reply.commentId, doHide);
    // if we want to see this comment
    if (!doHide) {
      // make sure its thread is exposed
      var cNode = findComment(commentTree, reply.commentId);
      expandThreadUpwards(cNode);
      // if this node has kids
      if (cNode.kids.length > 0) {
        // mark it as collapsed so the user can easily open it
        toggleButton = document.getElementById('thread'+cNode.commentId);
        toggleButton.innerHTML = "+";
      }
    }
  }
}

/*------------------------------------------------------------------------------
  Hide all but the 10 (or more) highest modded comments/threads.
*/
function showTop10() {
  // first, collapse all threads
  toggleThreadNode(commentTree, true);
  var toggleButton = document.getElementById("thread0");
  // assume it is collapsed, even though some comments will be shown
  toggleButton.innerHTML = "+";
  // sort comments by descending time (actually using commentId, I'm a cheater)
  commentsArr.sort(CommentObject.compareMod);
  var topCnt = 0;
  // now examine all comments
  for (var i=0, reply; reply=commentsArr[i]; i++) {
    var doHide = true; // most will be hidden
    // if user wants to obliterate blacklisted comments...
    if (flgKillHatedUsers && isBlackListed(reply.userId)) {
      doHide = true;
    }
    // show top 10 regardless of score, more if > 10 comments made +5 scores
    else if (topCnt < 10 || reply.scoreAdj > 4) {
      doHide = false;
      topCnt++;
    }
    // if I always want to show my own comments
    else if (doHide && flgShowMyComments && (myUserId == reply.userId)) {
      doHide = false;
    }
    // Hide/Show each comment
    toggleReply(reply.commentId, doHide);
    // if we want to see this comment
    if (!doHide) {
      // make sure its thread is exposed
      var cNode = findComment(commentTree, reply.commentId);
      expandThreadUpwards(cNode);
      // if this node has kids
      if (cNode.kids.length > 0) {
        // mark it as collapsed so the user can easily open it
        toggleButton = document.getElementById('thread'+cNode.commentId);
        toggleButton.innerHTML = "+";
      }
    }
  }
}


/*------------------------------------------------------------------------------
ZZZ NOT USED?

  Hide all 'aged' comments

  NOTE: The SE web server is fucked up. The reported time is completely incomprehensible
        (to my little brain, anyway), so I am abandoning this otherwise perfectly useful
        function. Dammit.
        
        Use the showLatestComments() function instead.

  now: time as reported by the web server
*/
function hideAgedComments(now) {
  var nowMSecs = now.getTime();
  for (var i=0, reply; i<commentsArr.length; i++) {
    reply = commentsArr[i];
    var then = reply.date;
    var thenMSecs = then.getTime();
    var diffMs = nowMSecs - thenMSecs;
    if (diffMs >= replyAge) {
      toggleReply(reply.commentId, true);
    }
    else if (diffMs < 0) {
      toggleReply(reply.commentId, false);
    }
    else {
      toggleReply(reply.commentId, false);
    }
  }
}

/*------------------------------------------------------------------------------
  User clicked comment toggle button
*/
function toggleSingle() {
  var commentId  = this.id.replace("toggleFor", "");
  toggleReply(commentId);
}

/*------------------------------------------------------------------------------
  Collapse/expand a single comment, and change the toggle button indicator. The
  username and mod points will still be visible.
  
  commentId: the ID of the comment, used to locate the HTML span
  hide:      [optional] boolean to set the state explicitly; otherwise, it toggles
*/
function toggleReply(commentId, doHide) {
  var commentSpan  = document.getElementById(commentId);
  var toggleImg    = document.getElementById('toggleFor'+commentId);
  // no new state specified, so toggle
  if (typeof doHide == 'undefined') {
    // if currently visible, we want to hide
    doHide = (commentSpan.style.display != 'none');
  }
  if (doHide) {
    commentSpan.style.display = 'none';
    toggleImg.innerHTML       = '&hellip;';
  }
  else {
    commentSpan.style.display = '';
    toggleImg.innerHTML       = '&there4;';
  }
}

/*------------------------------------------------------------------------------
  On page load, apply all comment/thread hiding preferences
*/
function hideComments() {
  if (flgCollapseOldThreads) {
    showOnlyThreads(null);
  }
  if (flgCollapseOldComments) {
    toggleOldComments(true);
  }
  if (flgShowLatestXComments) {
    showLatestComments(latestXComments);
  }
}

/*------------------------------------------------------------------------------
  Collapse all threads, then expand direct paths to the specified user's comments.
  If userId is null, then show paths to all new comments.
  (For now, only currently logged in user can be specified)

  userId: the ID of the user whose comments you wish to see
*/
function showOnlyThreads(userId) {
  // first, collapse all threads
  toggleThreadNode(commentTree, true);
  var toggleButton = document.getElementById("thread0");
  // assume it is collapsed, even though some comments will be shown
  toggleButton.innerHTML = "+";
  var showNew = (userId == null);
  // get all commentIds matching requirements
  var commentsOfInterest = new Array();
  for (var i=0, reply; reply = commentsArr[i]; i++) {
    if ((showNew && reply.isNew) || (reply.userId == userId) || (flgShowMyComments && reply.userId == myUserId)) {
      commentsOfInterest.push(reply.commentId);
    }
  }
  // now, expose only the threads containing the matching comments
  for (var i=0, cId; cId = commentsOfInterest[i]; i++) {
    cNode = findComment(commentTree, cId);
    expandThreadUpwards(cNode);
    // if this node has kids
    if (cNode.kids.length > 0) {
      // mark it as collapsed so the user can easily open it
      toggleButton = document.getElementById('thread'+cNode.commentId);
      toggleButton.innerHTML = "+";
    }
  }
}

/*------------------------------------------------------------------------------
  Expand all threads (but not blacklisted users' comments).
*/
function showAllThreads() {
  // expand all threads
  expandThreadNode(commentTree);
  var toggleButton = document.getElementById("thread0");
  toggleButton.innerHTML = "-";
}
/*
  Force all threads to expand.
  Can't use toggleThreadNode, since that stops if a subnode is collapsed
*/
function expandThreadNode(node) {
  // if null node or the root node
  if (node == null) return;
  var toggleButton = document.getElementById('thread'+node.commentId);
  // if not root node
  if (node.dad != null) {
    // find the containing <table>
    var reply = toggleButton.parentNode;
    while (reply.tagName != 'TABLE') { reply = reply.parentNode; }
    // never expand blacklisted users
    var doHide = isBlackListed(node.userId)? true : false;
    if (doHide) {
      reply.style.display    = "none";
      // allow user to manually expand it, though
      toggleButton.innerHTML = "+";
    }
    else {
      reply.style.display    = "";
      toggleButton.innerHTML = "-";
    }
  }
  // now expand its kids
  for (var i=0, k; k = node.kids[i]; i++) {
    expandThreadNode(k);
  }
}


/*------------------------------------------------------------------------------
  User clicked a thread's toggleButton (+/-). Initiate the collapse/expansion of
    an entire comment thread, and change the toggleButton indicator.

  This is the only time a blacklisted user thread may be exposed.

  evt: the OnClick event assigned to the toggleButton
*/
function toggleThread(evt) {
  var toggleButton = evt.target;
  var forceToggle = evt.ctrlKey;
  var commentId = toggleButton.id.replace("thread","");
  // if it's expanded (-), then we will doCollapse
  var doCollapse = (toggleButton.innerHTML == "-");
  var startNode = findComment(commentTree, commentId);
  if (startNode == null) {
    GM_log("Could not find commentId "+commentId);
    return;
  }
  toggleButton.innerHTML = doCollapse? "+" : "-";
  // if not the root node
  if (commentId != 0) toggleButton.parentNode.style.width = (startNode.level * 20) + 'px';
  // collapse/expand any kids, but not this node itself
  for (var i=0, k; k = startNode.kids[i]; i++) {
    toggleThreadNode(k, doCollapse, forceToggle);
  }
}

/*------------------------------------------------------------------------------
  Collapse/expand a single comment node and all child nodes.
  This function does _not_ change the toggle button indicator(s).
  The username and mod points will _not_ be visible if collapsed.

  node:        the CommentTreeNode to be collapsed/expanded
  doCollapse:  action to take - expand or collapse
  forceExpand: force subthread expansion (if expanding)
*/
function toggleThreadNode(node, doCollapse, forceExpand) {
  // if null node or the root node
  if (node == null) return;
  var toggleButton = document.getElementById('thread'+node.commentId);

  // if not root node
  if (node.dad != null) {
    // find the containing <table>
    var reply = toggleButton.parentNode;
    while (reply.tagName != 'TABLE') { reply = reply.parentNode; }
    // never auto-expand blacklisted users
    var doHide = isBlackListed(node.userId)? true : doCollapse;
    // hide/show it
    reply.style.display = doHide? "none" : "";
    /* don't expand subthreads that were already collapsed */
    var isCollapsed = (toggleButton.innerHTML == "+");
    if (isCollapsed && !doCollapse && !forceExpand) {
      return;
    }
  }
  // now toggle its kids
  for (var i=0, k; k = node.kids[i]; i++) {
    toggleThreadNode(k, doCollapse, forceExpand);
  }
}

/*------------------------------------------------------------------------------
  Starting from a given subnode, expand it and all parent nodes
  
  node:       the lowest CommentTreeNode to be collapsed/expanded
*/
function expandThreadUpwards(node) {
  // if empty node or root node
  if (node == null || node.dad == null) return;
  var toggleButton = document.getElementById('thread'+node.commentId);
  // find the containing <table>
  var reply = toggleButton.parentNode;
  while (reply.tagName != 'TABLE') { reply = reply.parentNode; }
  // never auto-expand blacklisted users
  if (!isBlackListed(node.userId)) {
    // show it
    reply.style.display = "";
  }
  /* call on daddy, too */
  expandThreadUpwards(node.dad);
}

/*------------------------------------------------------------------------------
  END COLLAPSE CODE
==============================================================================*/



/*==============================================================================
  BEGIN OBJECT HIDING CODE
  This section contains functions for blocking content like images and movies.
------------------------------------------------------------------------------*/

/*------------------------------------------------------------------------------
  redisplay the blocked object
*/
function reshow() {
  var notice = this;
  // show the original object
  var obj = notice.nextSibling;
  obj.style.display = obj.getAttribute('olddisplay');
  obj.setAttribute('wasDsspMod', false);
  // remove the notice
  notice.parentNode.removeChild(notice);
}

/*------------------------------------------------------------------------------
  hide the object, but put a notice of approximately the same size in its place
*/
function block(element) {
  var notice = document.createElement('div');
  notice.setAttribute('class', 'hidden');
//  notice.class = 'hidden';
  notice.appendChild(document.createTextNode(element.tagName + ' hidden. Click here to show.'));
  notice.addEventListener('click', reshow, false);
  // remember the object reference
  notice.actobj = element;
  //
  var hideableNode = element;
  // quick sanity check: if object is linked, hide link as well
  if (element.parentNode.tagName == 'A') {
    hideableNode = element.parentNode;
  }
  //
  // try to match display size for replacement notice
  if (flgBlockMatchSize) {
    var h = element.getAttribute('height');
    var oHeight = 'height:' + ((h? parseInt(h, 10) : (element.offsetHeight? element.offsetHeight : 50)) - 2) + 'px;';
    var w = element.getAttribute('width');
    var oWidth = 'width:' + ((w? parseInt(w, 10) : (element.offsetWidth? element.offsetWidth : 150)) - 2) + 'px;';
    notice.setAttribute('style', oHeight + oWidth);
    //notice.innerHTML = '<div style="padding:0.5em 0">' + notice.innerHTML + '</div>';
  }
  //
  // try to get meaningful display text for the blocked item
  var oTitle =  element.getAttribute('src')?  element.getAttribute('src')  :
              ( element.getAttribute('data')? element.getAttribute('data') :
                element.getAttribute('movie'));
  // if that failed
  if (!oTitle && element.tagName.toLowerCase() == 'object') {
    // look at all child items
    for (var i=0, j; j=element.childNodes[i]; i++) {
      // skip param tags
      if (!j.tagName || j.tagName.toLowerCase() != 'param') { continue; }
      var pName = j.getAttribute('name').toLowerCase();
      if ((pName == 'data') || (pName == 'movie') || (pName == 'src')) {
        oTitle = j.getAttribute('value');
        if (oTitle) { break; }
      }
    }
  }
  // if that failed
  if (!oTitle && (element.codebase || element.code)) {
    oTitle = (element.codebase? element.codebase : '') + (element.code? element.code : '');
  }
  // if any of the above worked
  if (oTitle) {
    // keep the length down
    if (oTitle.length > 70 ) {
      oTitle = oTitle.substr(0,45) + ' ... ' + oTitle.substr(oTitle.length - 25);
    }
    // add the title/tooltip
    notice.setAttribute('title', oTitle);
  }
  //
  // add the notice
  hideableNode.parentNode.insertBefore(notice, hideableNode);
  hideableNode.setAttribute('wasDsspMod', true);
  hideableNode.setAttribute('olddisplay', hideableNode.style.display ? hideableNode.style.display : '');
  // replace the object with the notice
  hideableNode.style.display = 'none';
  return notice;
}

/*------------------------------------------------------------------------------
  scan document for blockable objects and hide them
*/
function blockObjects() {
  if (!flgBlockObjects) return;
  var blockTypes = [];
  if (flgShowScripts)  blockTypes.push('script');
  if (flgBlockIframes) blockTypes.push('iframe');
  if (flgBlockObjects) blockTypes.push('object');
  if (flgBlockEmbeds ) blockTypes.push('embed');
  if (flgBlockImages ) blockTypes.push('img');
  for (i in blockTypes) {
    var oType = blockTypes[i];
    var eNodes = document.getElementsByTagName(oType);
    for (j=0; element=eNodes[j]; j++) {
      // we can't block scripts, but we can make them visible
      if (oType == 'script') {
        // SE entry pages contain 2 javascripts
        tmp = element.innerHTML;
        // if it's an SE script
        if (tmp.indexOf('MM_reloadPage(init)') >= 0 ||
            tmp.indexOf('lusers_toggle (set)') >= 0) {
          // don't mess with these
          continue;    
        }
        // sanitize user scripts and display inline
        var deadScript = document.createElement('span');
        deadScript.style.border = '1px dashed red';
        //deadScript.style.minHeight = '1em';
        deadScript.innerHTML = "Naughty user added script: &lt;script><pre>"+ sanitizeInput(tmp).replace(/\n/g, "//<br>\n//") + "</pre>&lt;/script>";
        pop = element.parentNode;
        pop.insertBefore(deadScript, pop.firstChild);
        //
        // Cannot for the life of me figure out why removing the SCRIPT element kills its siblings
        //pop.removeNode(element);
        //
        // we won't bother to block it, since it's already taken effect before DOM loads
        continue;
      }
      //
      else if (oType == 'img') {
        var iSrc = element.getAttribute('src');
        // images hosted on SE
        // <img src="/images/entry_thumbnails/1231280716_"  border="0" align='left'>
        // <img src="/images/spacer.gif" width="0" height="1" border=0">
        // images with invalid markup that cannot display
        // <img>http://newsimg.bbc.co.uk/media/images/45350000/gif/_45350941_gaza_gedera_map226.gif</img>
        // afrasr did that, swear to grod! SEE: http://www.sensibleerection.com/comment.php/74184/1494363
        //
        // if malformed img tags, images hosted on SE (if flag is off), or the spacer.gif (which indents threads)
        if ((!iSrc) || (!flgBlockSEImgs && iSrc.match('^\/images\/') != null) || (iSrc == '/images/spacer.gif') ) {
          // don't block these
          continue;
        }
      }
      //
      // if the parent was already hidden, don't add an extra layer
      var dadHidden = element.parentNode.getAttribute('wasDsspMod');
      // if style exists and is set to true
      if (typeof dadHidden != 'undefined' && dadHidden) {
        // mainly thinking of <object><embed></embed></object>
        // although, it still fails if the <embed> is a grandchild, say wrapped in <comment> tag or something
        continue;
      }
      // this is it - hide that sucker
      block(element);
    }
  }
}
/*------------------------------------------------------------------------------
  END OBJECT HIDING CODE
==============================================================================*/



/*==============================================================================
  BEGIN POPUP DIALOG CODE
------------------------------------------------------------------------------*/
/*------------------------------------------------------------------------------
  Simulate a popup dialog that shows various configuration options.
  Allow user to change these options, and save settings in a cookie.
  
  a: hide comments
    1 = Hide old comments
    2 = Show my comments
  b: block objects
    1 = iframe
    2 = object
    3 = embed
    4 = img
    5 = also SE-hosted images (i.e., thumbnails)
    6 = try to match size of blocked object
  c: blacklist
    1 = Hide blacklisted users
    2 = Obliterate hidden posts
  d: blacklist
    userid1,userid2,userid3
*/
function showConfigDialog() {

  /*----------------------------------------------------------------------------
    create list of all known users
    (includes only those commenting on this page)
    sort by alias, but userID will be the value
    
    returns select box as HTML text
  */
  function getKnownUsersListHTML() {
    // first pass, build the unique Alias+ID list 
    var uniqueAliases=[];
    for (i=0; u=usersArr[i]; i++) {
      // it is possible for two different people to post with the same alias, but the ID will be different
      var tip = u.aliases.join(", "); // tooltip shows all aliases by same user
      // make new option for each alias, even though same user
      for (j in u.aliases) {
        var opt = '<option value="' + u.userId + '" title="' + tip + '">' + u.aliases[j] + ' - ' + u.userId + '</option>';
        // add it to list
        uniqueAliases.push(opt);
      }
    }
    // now sort the list
    uniqueAliases.sort(function(o1, o2){
      // strip out tag attributes
      var a = String(o1.text).replace(/\<[^\<]+\>/g, '').toUpperCase();
      var b = String(o2.text).replace(/\<[^\<]+\>/g, '').toUpperCase();
      return (a>b)? 1 : (a<b)? -1 : 0;
    });
    var selBox = '<select id="knownUsers" size="10" multiple>';
    // second pass, add sorted options to the select box
    for (i in uniqueAliases) {
      selBox += uniqueAliases[i];
    }
    selBox += "</select>";
    return selBox;
  }

  /*----------------------------------------------------------------------------
    create the HTML text to display various config options
    at this point, no saved settings will be loaded
  */
  function createOptionHTML() {
    // fuck it - CSS just isn't ready for the big time, use <TABLE> tags for formatting
    var contentsH  = "<b title='How tall can any comment be in pixels? (null or 0 disables limit)'>Comment Height Limit</b> ";
    contentsH     += "<input type='text' id='replyHeightLimit' name='replyHeightLimit' size='5'><br/><br/>";
    var contentsA  = "<b>Comment Display</b>";
    contentsA     += "<ul class='options'>";
    contentsA     += "  <li title='On page load, only threads with new (or your own) comments will be expanded.'><input type='checkbox' id='hide3' name='hide' value='3' checked><label for='hide3'> Hide old threads</label></li>";
    contentsA     += "  <li title='On page load, all old comments will be automatically hidden.'                ><input type='checkbox' id='hide1' name='hide' value='1' checked><label for='hide1'> Hide old comments</label></li>";
    contentsA     += "  <li title='On page load, all your comments will be displayed, even if old.'             ><input type='checkbox' id='hide2' name='hide' value='2' checked><label for='hide2'> Show my comments</label></li>";
    contentsA     += "  <li title='On page load, the latest X comments will be displayed, regardless of age.'   ><input type='checkbox' id='hide4' name='hide' value='4' checked><label for='hide4'> Show latest <input type='text' id='latestXComments' name='latestXComments' size='5' value='" + latestXComments + "'> comments</label></li>";
    contentsA     += "</ul>";
    var contentsB  = "<b>Reveal User Scripts</b><br>";
    contentsB     += "<sub>We cannot disable other scripts because this script only runs after DOM load, meaning user scripts have already been parsed and probably run.</sub>";
    contentsB     += "<ul class='options'>";
    contentsB     += "  <li title=\"It's too late to stop it, but at least you can see where it occurred.\"><input type='checkbox' id='block0' name='block' value='0' checked><label for='block0'> show scripts?</label></li>";
    contentsB     += "</ul>";
    contentsB     += "<b>Block Multimedia Objects</b>";
    contentsB     += "<ul class='options'>";
    contentsB     += "  <li title=''                                                                  ><input type='checkbox' id='block1' name='block' value='1' checked><label for='block1'> iframe</label></li>";
    contentsB     += "  <li title=''                                                                  ><input type='checkbox' id='block2' name='block' value='2' checked><label for='block2'> object</label></li>";
    contentsB     += "  <li title=''                                                                  ><input type='checkbox' id='block3' name='block' value='3' checked><label for='block3'> embed</label></li>";
    contentsB     += "  <li title=''                                                                  ><input type='checkbox' id='block4' name='block' value='4' checked><label for='block4'> img</label></li>";
    contentsB     += "  <li title='This will also hide thumbs hosted on SensibleErection'             ><input type='checkbox' id='block5' name='block' value='5'        ><label for='block5'> also SE-hosted images</label></li>";
    contentsB     += "  <li title='If an object includes size dimensions, we will try to match those.'><input type='checkbox' id='block6' name='block' value='6' checked><label for='block6'> try to match size of blocked object</label></li>";
    contentsB     += "</ul>";
    //
    var contentsC  = "<b>Blacklist options</b>";
    contentsC     += "<ul class='options'>";
    contentsC     += "  <li title='On page load, all comments by selected users will be hidden.'><input type='checkbox' id='blacklist1' name='blacklist' value='1' checked><label for='blacklist1'> Hide blacklisted users </label></li>";
    contentsC     += "  <li title=\"Don't just hide them, obliterate them.\"                    ><input type='checkbox' id='blacklist2' name='blacklist' value='2'        ><label for='blacklist2'> Obliterate hidden posts</label></li>";
    contentsC     += "</ul>";
    var contentsD  = "<table border=0>";
    contentsD     += "<caption><b>The Blacklist</b></caption>";
    contentsD     += "  <tr>";
    contentsD     += "    <td>Users on this page</td>";
    contentsD     += "    <td></td>";
    contentsD     += "    <td title='Unknown user IDs means they have not posted on this page yet.'>Users in your blacklist</td>";
    contentsD     += "  </tr>";
    contentsD     += "  <tr>";
    contentsD     += "    <td valign='top'>";
    contentsD     +=        getKnownUsersListHTML();
    contentsD     += "    </td>";
    // to be filled in later with real button objects
    contentsD     += "    <td>";
    contentsD     += "      <span id='IDMoveButtons'></span>";
    contentsD     += "    </td>";
    contentsD     += "    <td valign='top'>";
    contentsD     += "      <select id='theblacklist' name='theblacklist' multiple size='10' style='min-width:10em;'>";
    // by default, you love everyone (please use protection)
    contentsD     += "        <option value='-1'>I love everyone!</option>";
    contentsD     += "      </select>";
    contentsD     += "    </td>";
    contentsD     += "  </tr>";
    contentsD     += "</table>";
    //
    var optionHTML = "<table align='center' border='0' width='100%'>";
    optionHTML    += "  <tr align='center' valign='middle'>";
    optionHTML    += "    <td>";
    optionHTML    += "      <h3>Default SE Viewing Options</h3>";
    optionHTML    += "    </td>";
    optionHTML    += "  </tr>";
    optionHTML    += "  <tr>";
    optionHTML    += "    <td>";
    optionHTML    += "      <form id='SEOptionsForm' name='SEOptionsForm'>";
    optionHTML    += "        <table class='border'>";
    optionHTML    += "          <tr align='left' valign='top'>";
    optionHTML    += "            <td>" + contentsH + contentsA + "</td>";
    optionHTML    += "            <td>" + contentsC + "</td>";
    optionHTML    += "          </tr>";
    optionHTML    += "          <tr align='left' valign='top'>";
    optionHTML    += "            <td>" + contentsB + "</td>";
    optionHTML    += "            <td>" + contentsD + "</td>";
    optionHTML    += "          </tr>";
    optionHTML    += "        </table>";
    optionHTML    += "      </form>";
    optionHTML    += "    </td>";
    optionHTML    += "  </tr>";
    optionHTML    += "  <tr align='center'>";
    optionHTML    += "    <td>";
    // to be filled in later with real button objects
    optionHTML    += "      <div id='SEOptionsFormButtonRow'>";
    optionHTML    += "        <button type='reset'  id='SEOptionsFormResetBtn'>Reset</button>";
    optionHTML    += "        <button type='button' id='SEOptionsFormSaveBtn' >Save</button>";
    optionHTML    += "        <button type='button' id='SEOptionsFormDoneBtn' >Close</button>";
    optionHTML    += "      </div>";
    optionHTML    += "    </td>";
    optionHTML    += "  </tr>";
    optionHTML    += "</table>";
    return optionHTML;
  }

  /*----------------------------------------------------------------------------
    after the form has been created, set form elements using supplied option
    string
  */
  function displayOptions(optionString) {
    var optArrTxt = optionString.split(";");
    var myFrm     = document.getElementById('SEOptionsForm');
    var optsNodes = getAllFormElements(myFrm);
    // for each option in the string
    for (var oneOptTxt, i=0; oneOptTxt=optArrTxt[i]; i++) {
      // get the key/value text
      var oneOptTxtArr = oneOptTxt.split(":");
      var key = oneOptTxtArr[0];
      var val = oneOptTxtArr[1];
      // 0=key, 1=value(s)
      switch(key) {
        case 'a':
          document.getElementById('hide1').checked = (val.match("1") != null);
          document.getElementById('hide2').checked = (val.match("2") != null);
          document.getElementById('hide3').checked = (val.match("3") != null);
          break;
        case 'b':
          document.getElementById('block0').checked = (val.match("0") != null);
          document.getElementById('block1').checked = (val.match("1") != null);
          document.getElementById('block2').checked = (val.match("2") != null);
          document.getElementById('block3').checked = (val.match("3") != null);
          document.getElementById('block4').checked = (val.match("4") != null);
          document.getElementById('block5').checked = (val.match("5") != null);
          document.getElementById('block6').checked = (val.match("6") != null);
          break;
        case 'c':
          document.getElementById('blacklist1').checked = (val.match("1") != null);
          document.getElementById('blacklist2').checked = (val.match("2") != null);
          break;
        case 'd':
          var selBox = document.getElementById('theblacklist');
          while (selBox.length > 0) { selBox.remove(0); }
          var userIdArr = val.split(',');
          userIdArr.sort(function(a, b){ return a - b; });
          for (var uId, j=0; uId=userIdArr[j]; j++) {
            var userObj = getUserById(uId);
            var uText = uId +" - [currently unknown]";
            var newOption = new Option(uText, uId);
            if (userObj != null) {
              newOption.text  = uId + " - " + userObj.aliases[0];
              // this tooltip doesn't work in Opera, only Firefox
              newOption.title = userObj.aliases.join(",");
            }
            selBox.add(newOption, null);
          }
          break;
        case 'h':
          document.getElementById('replyHeightLimit').value = val;
          break;
        case 'm':
          document.getElementById('latestXComments').value = val;
          break;
        default:
          break;
      }
    }
  }

  /*----------------------------------------------------------------------------
    read the checked options from the config dialog and create a compact string
    for the cookie
  */
  function getOptionString() {
    var myFrm = document.getElementById('SEOptionsForm');
    var opts = getAllFormElements(myFrm);
    var hideArr = new Array();
    var blockArr = new Array();
    var blacklistArr = new Array();
    var theblacklist = new Array();
    
    for (var i=0; o=opts[i]; i++) {
      if (o.checked) {
        if (o.name == 'hide') {
          hideArr.push(o.value);
        }
        else if (o.name == 'block') {
          blockArr.push(o.value);
        }
        else if (o.name == 'blacklist') {
          blacklistArr.push(o.value);
        }
        else {
          //GM_log("Checked object "+o+" is unknown.");
        }
      }
      else if (o.id == 'theblacklist') {
        var list=new Array();
        for (var j=0; s=o.options[j]; j++) {
          theblacklist.push(s.value);
        }          
      }
      else if (o.id == 'replyHeightLimit') {
        commentHeightLimit = parseInt(o.value, 10);
        if (isNaN(commentHeightLimit)) commentHeightLimit = 0;
      }
      else if (o.id == 'latestXComments') {
        latestXComments = parseInt(o.value, 10);
        if (isNaN(latestXComments)) latestXComments = 0;
      }
      else {
        GM_log("Unchecked object "+o+" is unknown. id="+o.id+" name="+o.name+" type="+o.type+" val="+o.value);
      }
    }
    hideArr.sort();
    blockArr.sort();
    blacklistArr.sort();
    theblacklist.sort();
    var optionString = 'a:' + hideArr.join(",")      + ";";
    optionString    += 'b:' + blockArr.join(",")     + ";";
    optionString    += 'c:' + blacklistArr.join(",") + ";";
    optionString    += 'd:' + theblacklist.join(",") + ";";
    optionString    += 'h:' + commentHeightLimit     + ";";
    optionString    += 'm:' + latestXComments        + ";";
    return optionString;
  }
  
  /*----------------------------------------------------------------------------
    finally, set initial values based on cookie (fallback to defaults)
  */
  function doReset() {
    optionString = GM_getValue("SEOptions", DefaultSettings);
    displayOptions(optionString);
  }

  var items = document.createElement('span');
  items.innerHTML = createOptionHTML();
  // cannot add the following buttons until the container is part of the document
  // blacklist movement buttons
  var moveRightBtn   = document.createElement('input');
  moveRightBtn.type  = 'button';
  moveRightBtn.value = '>>';
  moveRightBtn.addEventListener('click', function() {
    var leftTA  = document.getElementById('knownUsers');
    var rightTA = document.getElementById('theblacklist');
    // move options to an array so we can easily sort later
    blacklistArr = new Array();
    while (o=rightTA.options[0]) {
      // don't save the filler option
      if (o.value >= 0) blacklistArr.push(o);
      rightTA.remove(0);
    }
    // for all known users
    for (s=0; uOpt=leftTA.options[s]; s++) {
      // if this is not selected
      if (!uOpt.selected) {
        continue;
      }
      // find out if/where to add selected userId
      alreadyAdded = false;
      // for all currently blacklisted userIds
      for (i=0; o=blacklistArr[i]; i++) {
        // already added
        if (o.value == uOpt.value) {
          if (typeof o.title == 'undefined') {
            // remove existing one so we can replace with more useful one
            blacklistArr.remove(i);
          }
          else {
            //
            alreadyAdded = true;
          }
          break;
        }
      }
      if (alreadyAdded) continue;
      // add if it's new
      newOpt = uOpt.cloneNode(true);
      blacklistArr.push(newOpt);
    }
    // now that all selections have been handled, re-sort list numerically
    blacklistArr.sort(function(a, b){ return a.value - b.value; });
    // and rebuild the select
    for (i=0; o=blacklistArr[i]; i++) {
      rightTA.add(o, null);
    }
    return false;
  }, false);
  // doesn't actually move it to the left, just removes from right
  var moveLeftBtn   = document.createElement('input');
  moveLeftBtn.type  = 'button';
  moveLeftBtn.value = '<<';
  moveLeftBtn.addEventListener('click', function() {
    var RightTA = document.getElementById('theblacklist');
    var selIdx = RightTA.selectedIndex;
    if (selIdx < 0) return;
    RightTA.remove(selIdx);
    return false;
  }, false);
  //
  //create the popup frame
  var dlg = document.getElementById('SEOptionsDlg');
  if (dlg) { document.body.removeChild(dlg); }
  dlg = document.createElement('div');
  dlg.id = 'SEOptionsDlg';
  with (dlg.style) {
    border          = '2px solid #000';
    backgroundColor = '#bbf';
    color           = '#000';
    position        = 'fixed';
    zIndex          = '10';
    top             = '5em';
    left            = '5em';
    bottom          = '5em';
    right           = '5em';
    padding         = '1em';
    overflow        = 'auto';
    //height          = '1.3em';
  }
  dlg.appendChild(items);
  // add it to the document
  document.body.appendChild(dlg);
  // now we can add event listeners
  // for the blacklist buttons
  buttonCol = document.getElementById('IDMoveButtons');
  buttonCol.appendChild(moveRightBtn);
  buttonCol.appendChild(document.createElement('br'));
  buttonCol.appendChild(moveLeftBtn);
  //
  // for the overall form buttons
  var resetBtn      = document.getElementById('SEOptionsFormResetBtn');
  resetBtn.addEventListener('click', doReset, false);
  //
  var saveBtn      = document.getElementById('SEOptionsFormSaveBtn');
  saveBtn.addEventListener('click', function() {
    var optionString = getOptionString();
    GM_setValue("SEOptions", optionString);
    document.body.removeChild(dlg);
    applySettings();
    return false;
  }, false);
  //
  var doneBtn      = document.getElementById('SEOptionsFormDoneBtn');
  doneBtn.addEventListener('click', function() {
    document.body.removeChild(dlg);
    return false;
  }, false);
  // finally, set initial values based on cookie (fallback to defaults)
  doReset();
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
  // add blank second TD, because I had to use that for the threadToggle buttons
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
  END POPUP DIALOG CODE
==============================================================================*/



/*==============================================================================
  BEGIN MISCELLANEOUS
------------------------------------------------------------------------------*/

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
<div class="nav_box">
  <table width="100%" border="0" cellspacing="0" cellpadding="0"> <tr>
    <td class="nav_text"> <a href="/">home</a> | <a href="/index.2col.php">home<sup style="font-size:9px">2</sup></a> | <a href="http://sensibleelection.com"><b>Sensible Election</b></a> | <a href="/about.php">about</a> | <a href="/rules">conduct</a> | <a href="/galleries/">galleries</a> <!-- | <a href="http://www.marketbanker.com/mb/commerce/purchase_form.php?opid=9242&afsid=1">advertising</a>--> <br><a href="/admin.php">admin</a> | <a href="/stats.php">stats</a> | <a href="/search.php">search</a> | <a href="/post.php">post</a> </td>
    <td class="nav_text" align="right"> logged in as <a href="/profile.php/12016"> Naruki</a> | <a href="/login.php?action=log%20out">log out</a> </td>
  </tr> </table>
</div>
*/
function getUserId() {
  // get postId  
  pathArr = document.location.pathname.split("/");
  for ( i = pathArr.length - 1; i >= 0; i-- ) {
    if (pathArr[i].length < 1) continue;
    postId = pathArr[i];
    break;
  }
  myUserId = false; // default to not logged in
  navs     = getElementsByClass('nav_text', null, 'td');
  if (navs.length > 1) {
    lnk      = navs[1].getElementsByTagName('a')[0];
    myUserId = lnk.href.replace(/^.*profile.php\//, '');
    myUserName = lnk.innerHTML.replace(/^\s+/g, "").replace(/\s+$/g, "");
  }
  // if logged in
  myEmail = "user@sensibleerection.com";
  if (myUserId != false) {
    // get email from submit form at the bottom
    // <input type="text" name="email" style="width:200" class="text_12px" value="Naruki@UFie.org">
    inputs = getElementsByClass('text_12px', null, 'input');
    for (i=0; inp=inputs[i]; i++) {
      if (inp.value.indexOf('@') < 1) continue;
      myEmail = inp.value;
      break;
    }
  }
  return myUserId;
}

/*------------------------------------------------------------------------------
ZZZ Not useable yet
  convert KS time to local time
*/
function makeMyTime(ksDate) {
  // GMT offset (in milliseconds) of most of Kansas
  var KSTimeZoneOffset = 6 * 60 * 60 * 1000;
  var myTimeZoneOffset = time.getTimezoneOffset() * 60 * 1000; // in milliseconds from GMT
  ksDate.setTime(ksDate.getTime() + (myTimeZoneOffset + KSTimeZoneOffset)); // now == GMT -600, AKA KS time
  return ksDate;
}

/*----------------------------------------------------------------------------
  the text may contain harmful tags, so neutralize any threat
*/
function sanitizeInput(inputTxt) {
  var outputTxt = inputTxt.replace(/</g, "&lt;");
  return outputTxt;
}

/***************************************
  HTTP Response Header Viewer Favelet
  version 2.0 
  last revision: 03.01.2005
  steve@slayeroffice.com
//
  Original version 1.x was done with PHP
//
  Should you improve upon or modify this code
  please let me know so that I can update the
  version hosted at slayeroffice
//
  Please leave this notice in tact!
//
  Thanks to Jim Ley for his article on how
  this could be done with XMLHttpRequest
  http://jibbering.com/2002/4/httprequest.2004.html
//
***************************************/
function requestHTTPHeaders(func) {
  if (!document.getElementById) return;
  conn = new XMLHttpRequest();
  conn.onreadystatechange=function() {
    if (conn.readyState==4) {
      receiveHTTPHeaders(conn.getAllResponseHeaders(), func);
    }
  }
  conn.open("HEAD", "/",true);
  conn.send(null)
}
/* */
function receiveHTTPHeaders(rspStr, func) {
  rspStr = rspStr.replace(/[\r\n]/g, '|');
  rspStr = rspStr.replace(/^.*Date:/, '');
  rspStr = rspStr.replace(/\|.*/, '');
  GM_log("The time in Kansas is now " + rspStr);
  var d = new Date(rspStr);
  d.setTime(d.getTime() - (4*60*60*1000));
  func(d);
}

/*------------------------------------------------------------------------------
ZZZ NOT USED?
  http://ronandowling.com/2006/05/31/find-all-form-elements-with-javascript-dom/
*/
function getAllFormElements( parent_node ) {
  if( parent_node == undefined ) {
    parent_node = document;
  }
  var out = new Array();
  formInputs = parent_node.getElementsByTagName("input");
  for (var i = 0; i < formInputs.length; i++) {
    out.push( formInputs.item(i) );
  }
  formInputs = parent_node.getElementsByTagName("textarea");
  for (var i = 0; i < formInputs.length; i++) {
    out.push( formInputs.item(i) );
  }
  formInputs = parent_node.getElementsByTagName("select");
  for (var i = 0; i < formInputs.length; i++) {
    out.push( formInputs.item(i) );
  }
  formInputs = parent_node.getElementsByTagName("button");
  for (var i = 0; i < formInputs.length; i++) {
    out.push( formInputs.item(i) );
  }
  return out;
}

/*------------------------------------------------------------------------------
  load GM cookie that contains user preferences and parse settings
*/
function readSettings() {
  var optArr = GM_getValue("SEOptions", DefaultSettings).split(";");
  for (i=0; option=optArr[i]; i++) {
    var optEntry = option.split(":");
    switch(optEntry[0]) {
      case 'a': // hiding options
        flgCollapseOldComments = (optEntry[1].match("1") != null);
        flgShowMyComments      = (optEntry[1].match("2") != null);
        flgCollapseOldThreads  = (optEntry[1].match("3") != null);
        flgShowLatestXComments = (optEntry[1].match("4") != null);
        break;
      case 'b': // blocking options
        flgShowScripts    = optEntry[1].match("0") != null;
        flgBlockIframes   = optEntry[1].match("1") != null;
        flgBlockObjects   = optEntry[1].match("2") != null;
        flgBlockEmbeds    = optEntry[1].match("3") != null;
        flgBlockImages    = optEntry[1].match("4") != null;
        flgBlockSEImgs    = optEntry[1].match("5") != null;
        flgBlockMatchSize = optEntry[1].match("6") != null;
        break;
      case 'c': // blacklist options
        flgHideHatedUsers = optEntry[1].match("1") != null;
        flgKillHatedUsers = optEntry[1].match("2") != null;
        break;
      case 'd': // blacklisted userids
        myHatedUsers      = optEntry[1];
        boundedBlacklist  = ',' + myHatedUsers + ',';
        break;
      case 'h': // comment height limit
        commentHeightLimit = parseInt(optEntry[1], 10);
        if (isNaN(commentHeightLimit)) commentHeightLimit = 0;
        break;
      case 'm': // latest X comments to display
        latestXComments = parseInt(optEntry[1], 10);
        if (isNaN(latestXComments)) latestXComments = 0;
        break;
      default:
        break;
    }
  }
}

/*------------------------------------------------------------------------------
  apply the preferences to the current page
*/
function applySettings() {
  //GM_log("About to block objects...");
  doMiscellaneous();
  blockObjects();
  hideComments();
}

function doMiscellaneous() {
  for (var ss, i=0; ss=document.styleSheets[i]; i++) {
    for (var r, j=0; r=ss.cssRules[j]; j++) {
      if ('.scrollable' == r.selectorText) {
        r.style.maxHeight = (commentHeightLimit>0)? commentHeightLimit + 'px' : '';
        return;
      }
    }
  }
}

// ZZZ DEBUG
function dumpComments() {
  var t = "All comments:\n";
  for (var i=0, k; k = commentsArr[i]; i++) {
    t+= "  " + k.date + ": " + 
        k.alias + " (" + k.userId + ") "+ (k.isNew?"new ":"") +
        "cId:" + k.commentId +
        " [" + k.commentTxt.replace(/(\<br\>)?[\r\n]+/g,"<br>") + "]\n";
  }
  GM_log(t);
}
function getTimeDiff(d1, d2) {
  return (d1 - d2)/1000;
}
function dumpCommentsTime() {
  var now = new Date();
  var t = "Current time:" + now + "\n";
  t    += "All comments:\n";
  for (var i=0, k; k = commentsArr[i]; i++) {
    t+= "  " + k.date + " [" + getTimeDiff(now, k.date) + "]:";
    t+= k.alias + " (" + k.userId + ") "+ (k.isNew?"new ":"");
    t+= "cId:" + k.commentId;
    t+= " [" + k.commentTxt.replace(/(\<br\>)?[\r\n]+/g,"<br>").substr(0,30) + "]\n";
  }
  GM_log(t);
}
// ZZZ DEBUG
function dumpUsers() {
  var t = "All users:\n";
  for (var i=0, k; k = usersArr[i]; i++) {
    t+= "  " + k.userId + " (" +  k.aliases.join(", ") + ")\n";
  }
  GM_log(t);
}
// ZZZ DEBUG
function dumpThreads() {
  var t = "All threads:\n";
  for (var i=0, k; k = commentTree.kids[i]; i++) {
    t+= getSubthreads(k);
  }
  GM_log(t);
}
function getSubthreads(node) {
  if (node == null) return null;
  var t = "                              ".substr(0, 2*(node.level+1));
  t+= "["+node.dad.commentId+"] " + node.commentId + "\n";
  for (var i=0, k; k = node.kids[i]; i++) {
    t+= getSubthreads(k);
  }
  return t;
}




/*------------------------------------------------------------------------------
  popup info about selected comment
*/
function showReplyInfo(evt) {
  var replyInfoAnchor = evt.target;
  var replyInfoId = replyInfoAnchor.id; // eg: replyInfo123456
  var commentId = replyInfoId.replace("replyInfo", "");   // eg: 123456
  var reply = null;
  for (var i=0; reply = commentsArr[i]; i++) {
    if (reply.commentId == commentId) {
      break;
    }
  }
  if (reply == null) {
    alert("Could not find comment "+commentId);
    return;
  }
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
//alert("Found " + modArr.length + " mods in [" + replyModDiv.innerHTML + "]");
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
//function uni2ent(snippet) {
//  var uSnip = '';
//  var logTxt = '';
//  for (var c=0; c<snippet.length; c++) {
//    var val = snippet.charCodeAt(c);
//    if (val < 256) {
//      uSnip += snippet[c];
//    }
//    else {
//      uSnip += "&#" + val + ";"
//      logTxt += '   Char['+snippet[c]+'] --> Entity[&#'+val+';]\n';
//    }
//  }
//  if (logTxt != '') {
//    GM_log('UNICODE CHANGES:\n' + logTxt + '\n\n');
//  }
//  return uSnip;
//}

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
  END MISCELLANEOUS
==============================================================================*/



/*==============================================================================
  BEGIN MENU CODE
------------------------------------------------------------------------------*/
/*------------------------------------------------------------------------------
  Comment-level hiding
*/
/* completely show all of my comments */
function mnuShowMyComments() {
  if (myUserId) showOnly(myUserId);
}
/* hide all old comments */
function mnuHideOldComments() {
  toggleOldComments(true);
}
/* show all comments */
function mnuShowAllComments() {  
  toggleOldComments(false);
}
/* hide all comments older than X minutes */
function mnuHideAgedComments() {
  requestHTTPHeaders(hideAgedComments);
}

/*------------------------------------------------------------------------------
  Thread-level hiding
*/
/* show all threads containing my comments */
function mnuShowMyThreads() {  
  showOnlyThreads(myUserId);
}
/* hide all old threads */
function mnuHideOldThreads() {  
  showOnlyThreads(null);
}
/* show all threads */
function mnuShowAllThreads() {  
  showAllThreads();
}

/*------------------------------------------------------------------------------
  A bit of both
*/
/* hide all but last X comments */
function mnuShowLatestXComments() {
  var x = prompt("How many of latest comments to show?", 10)
  showLatestComments(x);
}

/*------------------------------------------------------------------------------
*/
function mnuShowTop10() {
  showTop10();
}

/*------------------------------------------------------------------------------
*/
function mnuShowConfigDialog() {
  showConfigDialog();
}

/*------------------------------------------------------------------------------
*/
function createMenu() {
  GM_registerMenuCommand('Show latest X comments',       mnuShowLatestXComments);
  GM_registerMenuCommand('Show only my comment threads', mnuShowMyThreads);
  GM_registerMenuCommand('Show all threads',             mnuShowAllThreads);
  GM_registerMenuCommand('Show all comments',            mnuShowAllComments);
  GM_registerMenuCommand('Hide old threads',             mnuHideOldThreads);
  GM_registerMenuCommand('Hide old comments',            mnuHideOldComments);
  GM_registerMenuCommand('Change your preferences',      mnuShowConfigDialog);
  GM_registerMenuCommand('Show Top 10 (or so)',          mnuShowTop10);
  GM_registerMenuCommand('Stop here, end of menu.',      function(){showLatestComments(5)});
  //GM_registerMenuCommand('Hide comments >= 5 minutes',  mnuHideAgedComments);
}
/*------------------------------------------------------------------------------
  END MENU CODE
==============================================================================*/



/*==============================================================================
  BEGIN MAIN
------------------------------------------------------------------------------*/

/*------------------------------------------------------------------------------
  this starts it all off
*/
function main() {
  // if we cannot find the mainDiv, full stop
  //GM_log("Getting mainDiv...");
  if (!(mainDiv = document.getElementById('Layer1'))) {
    return;
  }
  // try to find logged in user id
  getUserId();
  //GM_log("About to createMenu...");
  createMenu();
  //GM_log("About to normalizePost...");
  normalizePost();
  // get saved settings
  readSettings();
  // apply them to the current page
  applySettings();
}

/* uncomment following code if Opera file doesn't end with "user.js" */
//  // if this is Opera
//  if (typeof window.opera != "undefined") {
//    // wait until after this fires to start manipulating everything
//    window.addEventListener("DOMContentLoaded", main, false);
//  }
//  // we're not in Opera
//  else {
//    // so DOMContentLoaded already fired, so run immediately
//    main();
//  }
main();

//document.body.style.visibility = 'visible';
//window.scrollTo(0,0);
/*------------------------------------------------------------------------------
  END MAIN
==============================================================================*/

})();// end anonymous function wrapper
