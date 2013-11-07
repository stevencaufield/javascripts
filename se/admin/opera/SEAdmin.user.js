// ==UserScript==
// @name           SEAdmin
// @author         Naruki Bigglesworth
// @namespace      com.naruki.sensibleerection.admin
// @description    Tweaks entry pages at SensibleErection.com
// @include        http://sensibleerection.com/admin.php?detail=comm*
// @include        http://*sensibleerection.com/admin.php?detail=comm*
// ==/UserScript==

/*==============================================================================
SensibleErection Admin - for organizing the messy comment list. To see
more days, change xxx in this URL:
http:/www.sensibleerection.com/admin.php?detail=comments&show_days=xxx
==============================================================================*/
(function () { // begin anonymous function wrapper

var sortFuncs = [null, byAge, byEntryId, byAlias, byUserId, bySnip];
var sortDirs  = [true, true,  true,      true,    true,     true];
var upArr = "<span class='sortArrow'>\u25B3</span>";
var dnArr = "<span class='sortArrow'>\u25BD</span>";
var toggleState = "*";
var ageLimit = 0;

/*
  Define class & methods before instantiating anything - otherwise, toString() method fails
*/
function AdminCommentObject(idx, age, entryId, alias, userId, snippet) {
  this.idx      = idx; // for resolving re-sort order
  this.age      = toMinutes(age);
  this.entryId = entryId;
  this.alias    = alias;
  this.userId   = userId;
  this.snippet  = snippet + '...';
}
AdminCommentObject.prototype.toString = function () {
  return "age="         + this.age      + ", " +
         "alias="       + this.alias    + "(" + this.userId + "), " +
         "snippet=["    + this.snippet  + "], " +
         "entryId="     + this.entryId;
}
AdminCommentObject.SortAge      = 1;
AdminCommentObject.SortEntryId  = 2;
AdminCommentObject.SortAlias    = 3;
AdminCommentObject.SortUserId   = 4;
AdminCommentObject.SortSnippet  = 5;
AdminCommentObject.groupEntries = true; // group entries by default
AdminCommentObject.srtGroupUp   = true; // sort groups ascending by default
AdminCommentObject.sortCols     = [];
// go ahead and read stored settings
readSettings();

/* If user Ctrl+Clicks the toggle span, cycle through 3 states: (*) everything, (+) topside only, (-) negs only.
Simply clicking won't work, nor will the span indicate what to do.
*/
function toggle(isSubSort, isReversed) {
    if (!isSubSort) { return; }
    var togSpan = document.getElementById('toggle');
    var tog = togSpan.innerHTML;
    if (tog == "*") {
      toggleState = isReversed?"-":"+";
    }
    else if (tog == "+") {
      toggleState = isReversed?"*":"-";
    }
    else if (tog == "-") {
      toggleState = isReversed?"+":"*";
    }
    togSpan.innerHTML = toggleState;
    doSort(-1, false);
}

function doSort(col, isSubSort) {
  // user clicked a column header
  if (col != -1) {
    // reverse sort direction of clicked column
    sortDirs[col] = !sortDirs[col];
    // if single column sort
    if (!isSubSort) {
      // replace any existing sort columns
      AdminCommentObject.sortCols = [col];
    }
    // multi-column sort
    else {
      // rebuild sort list with col as last element
      var newList = [];
      for (var c, i=0; c=AdminCommentObject.sortCols[i]; i++) {
        if (c != col) newList.push(c);
      }
      newList.push(col);
      AdminCommentObject.sortCols = newList;
    }
  }
  // should we group entries?
  var grpNode = document.getElementById('groupEntries');
  AdminCommentObject.groupEntries = (grpNode != null) && grpNode.checked;
  // should we sort entry groups ascending?
  var cols = AdminCommentObject.sortCols.join(" ");
  AdminCommentObject.srtGroupUp = sortDirs[AdminCommentObject.SortEntryId] || (cols.indexOf(AdminCommentObject.SortEntryId) < 0);
  // perform sort
  commentArr.sort(sortFunc);
  // rebuild sorted table
  replaceCommentTable();
}

function sortFunc(a, b) {
  var result = 0;
  // if grouping EntryIDs
  if (AdminCommentObject.groupEntries) {
    // keep same EntryIDs together, regardless of sign
    var x = Math.abs(a.entryId), y = Math.abs(b.entryId);
    result = x-y;
    // same entryId
    if (result == 0) {
      // only one is a neg entry
      if (a.entryId != b.entryId) {
        // always put neg below pos
        result = a.entryId>b.entryId? -1 : 1;
      }
    }
    // different EntryIDs, check for descending
    else if (!AdminCommentObject.srtGroupUp) {
      // swap result
      result *= -1;
    }
  }

  var sIdx = 0;
  while (result == 0 && sIdx < AdminCommentObject.sortCols.length) {
    var sCol = AdminCommentObject.sortCols[sIdx++];
    // if we already sorted by entry id
    if (sCol == AdminCommentObject.SortEntryId && AdminCommentObject.groupEntries) continue;
    result = sortFuncs[sCol](a, b);
    if (result != 0) {
      // same entryId, but only one is a neg entry
      if (sCol == AdminCommentObject.SortEntryId && (Math.abs(a.entryId) == Math.abs(b.entryId))) {
        // always put neg below pos
        result *= -1;
      }
      // check for descending
      else if (!sortDirs[sCol]) {
        // swap result
        result *= -1;
      }
    }
  }
  // if all sorts were identical
  if (result == 0) {
    // last chance this sort is always ascending by server order
    result = a.idx - b.idx;
  }
  return result;
}

function byAge(a, b)   {
  var r = a.age - b.age;
  return r;
}
function byEntryId(a, b) {
  var r = a.entryId - b.entryId;
  return r;
}
function byAlias(a, b) {
  //return a.alias - b.alias;
  var x = a.alias.toLowerCase(), y = b.alias.toLowerCase();
  var r = (x < y)? -1 : (x > y)? 1 : 0;
  return r;
}
function byUserId(a, b) {
  var r = a.userId - b.userId;
  return r;
}
function bySnip(a, b) {
  //return a.alias - b.alias;
  var x = a.snippet.toLowerCase(), y = b.snippet.toLowerCase();
  var r = (x < y)? -1 : (x > y)? 1 : 0;
  return r;
}

function getMyId() {
  var myId = '';
  var divs = document.getElementsByTagName('div');
  for (var i=0, d; d=divs[i]; i++) {
    if (d.className != 'nav_box') { continue; }
    var tds = d.getElementsByTagName('td');
    if (tds.length < 2) { break; }
    lnk    = tds[1].getElementsByTagName('a')[0];
    myId   = lnk.href.replace(/^.*profile.php\//, '');
    myName = lnk.innerHTML.replace(/^\s+|\s+$/g, "");
  }
  return myId;
}

/*
  <tr> 
  <td class="text_12px" nowrap><u>time ago</u></td>
  <td class="text_12px"><u>entry</u></td>
  <td class="text_12px"><u>name</u></td>
  <td class="text_12px"><u>comment preview</u></td>
  </tr>
  <tr> 
  <td class="text_10px"> 1m </td>
  <td class="text_10px"> <a href="/entry.php/74841">74841</a> </td>
  <td class="text_10px"> <a href="/profile.php/20740">sythe</a> </td>
  <td class="text_10px"> "But the newly identified antibodies att <a href="/entry.php/74841">...</a> </td>
  </tr>
*/
function readCommentTable() {
  // make it easy to find commentTable again
  commentTable.id = 'commentTable';
  commentTable.style.width = '100%';

  var styles  = '.btn { font-size:70%; font-weight:bold; cursor:pointer; border-style:none; background-color:transparent; padding:2px; margin:1px; }' +
                '.small { font-size:70%; padding:2px; margin:1px; }' +
                '#toggle { cursor:pointer; }' +
                '.itsmemom { color:purple; font-weight:bold; }' +
                '.sortArrow { color:blue; font-size:50%; }' +
                '.topBorder td { border-top:1px dotted red; }';
  var newSS       = document.createElement('style');
  newSS.type      = 'text/css';
  newSS.innerHTML = styles;
  document.getElementsByTagName("head")[0].appendChild(newSS);

  var rows    = commentTable.getElementsByTagName('tr');
  for (var i=1, r; r=rows[i]; i++) {
    var cells = r.getElementsByTagName('td');

    var age     = shrink(cells[0].firstChild.nodeValue);
    var entryId = shrink(cells[1].getElementsByTagName('a')[0].firstChild.nodeValue);
    var userLnk = cells[2].getElementsByTagName('a')[0];
    var alias   = shrink(userLnk.firstChild.nodeValue);
    var userId  = userLnk.href.replace(/.+\//g, '');
    var snippet    = shrink(cells[3].firstChild.nodeValue);
    commentArr.push(new AdminCommentObject(i, age, entryId, alias, userId, snippet));
  }
  // zero out table
  while (commentTable.rows.length > 0) commentTable.deleteRow(0);
  // create new header row
  var headRow = createColumnHeader();
  commentTable.appendChild(headRow);

  // new feature: limit by age
  var d = document.createElement('div');
  d.action='';//document.location.href;
  d.innerHTML = "<input type='text' id='ageLimit' name='ageLimit' size='5' value='"+ageLimit+"'><button id='doApplyAgeLimit' class='small'>Apply Age Limit</button> <span id='toggle' class='text_10px'>"+toggleState+"</span> <span id='recordCnt' class='text_10px'></span>";
  commentTable.parentNode.insertBefore(d, commentTable);
  d.addEventListener('submit', function(){return false;}, false);

  var tog = document.getElementById('toggle');
  tog.addEventListener('click', function(e) { toggle(e.ctrlKey, e.shiftKey); return false; }, false);

  var b = document.getElementById('doApplyAgeLimit');
  b.addEventListener('click', applyLimit, false);
  var t = b.previousSibling;
  t.addEventListener('keypress', function(e) { if (e.keyCode == 13) applyLimit(); }, false);
  t.focus();
}

/*
  Initial HTML for the table column headers, with grouping set but no sorting
*/
function createColumnHeader() {
  // build column header with links to re-sort
  var tr = document.createElement('tr');
  var sCol, th;

  th = document.createElement('th');
  th.innerHTML = "<button id='sortAge' class='btn'>Age</button>";
  th.addEventListener('click', function(e) { doSort(AdminCommentObject.SortAge, e.ctrlKey); return false; }, false);
  tr.appendChild(th);

  th = document.createElement('th');
  th.innerHTML = "<button id='sortEntryId' class='btn'>Entry</button>&nbsp;<input class='btn' type='checkbox' id='groupEntries' name='groupEntries'>";
  // the EntryID label
  th.firstChild.addEventListener('click', function(e) { doSort(AdminCommentObject.SortEntryId, e.ctrlKey); return false; }, false);
  // the EntryID checkbox
  var cbEntryId = th.lastChild;
  cbEntryId.checked = AdminCommentObject.groupEntries;
  cbEntryId.addEventListener('click', function(e) { doSort(-1, e.ctrlKey); return false; }, false);
  tr.appendChild(th);

  th = document.createElement('th');
  th.innerHTML += "<button id='sortAlias' class='btn'>Alias</button>";
  th.addEventListener('click', function(e) { doSort(AdminCommentObject.SortAlias, e.ctrlKey); return false; }, false);
  tr.appendChild(th);

  th = document.createElement('th');
  th.innerHTML += "<button id='sortUserId' class='btn'>UserID</button>";
  th.addEventListener('click', function(e) { doSort(AdminCommentObject.SortUserId, e.ctrlKey); return false; }, false);
  tr.appendChild(th);

  th = document.createElement('th');
  th.innerHTML += "<button id='sortSnippet' class='btn'>Preview</button>";
  th.addEventListener('click', function(e) { doSort(AdminCommentObject.SortSnippet, e.ctrlKey); return false; }, false);
  tr.appendChild(th);

  return tr;
}

/* parse user entered age limit and redraw table */
function applyLimit() {
  var alNode = document.getElementById('ageLimit');
  var al = parseInt(alNode.value, 10);
  if (al < 1 || isNaN(al)) {
    alNode.value = '';
    al = 0;
  }
  ageLimit = al;
  replaceCommentTable();
  return false;
}

/* remove all data rows and redraw table, skipping any rows that are too old */
function replaceCommentTable() {
  commentTable = document.getElementById('commentTable');
  // rip out existing table data
  while (commentTable.rows.length > 1) commentTable.deleteRow(1);
  // are we grouping entries?
  var cbox = document.getElementById('groupEntries');
  var sortEntryFirst = cbox!=null && cbox.checked;
  // reflect new sorting changes
  adjustColumnHeader(sortEntryFirst);
  // add data rows
  var rows = commentTable.getElementsByTagName('tr');
  var prevEntryId = 0, cnt = 0;
  for (var i=0, r; r=commentArr[i]; i++) {
    // filter old comments
    if (ageLimit > 0 && r.age > ageLimit) continue;
    // filter comments based on toggleState
    if (toggleState == "+" && r.entryId < 0) continue;
    if (toggleState == "-" && r.entryId >= 0) continue;
    // show whatever makes it thru filters   
    var alias = r.alias;
    if (r.userId == myUserId) {
      alias = '<span class="itsmemom">' + alias + '<span>';
    }
    var txt = '<td class="text_10px" align=right>' + r.age + 'm&nbsp;</td>';
    txt    += '<td class="text_10px"><a target="_blank" href="/entry.php/' + r.entryId + '">' + r.entryId + '</a></td>';
    txt    += '<td class="text_10px">' + alias + '</td>';
    txt    += '<td class="text_10px"><a target="_blank" href="/profile.php/' + r.userId + '">' + r.userId + '</a></td>';
    txt    += '<td class="text_10px">' + r.snippet + '</td>';
    var tr = document.createElement('tr');
    if (tr.wrappedJSObject) tr = tr.wrappedJSObject;
    commentTable.appendChild(tr);
    tr.innerHTML = txt;
    if (sortEntryFirst && (prevEntryId != r.entryId)) {
      prevEntryId = r.entryId;
      tr.className = 'topBorder';
    }
    cnt++;
  }
  document.getElementById('recordCnt').innerHTML = cnt + " of " + commentArr.length + " comments shown.";
  saveSettings();
}

/*
  Instance method to generate the HTML table containing the proper table column
  header of this room, including sort direction on the sorting column
*/
function adjustColumnHeader(sortEntryFirst) {
  var sList = AdminCommentObject.sortCols.join(" ");
  var sCol, sArrow, colHead;
  sCol = AdminCommentObject.SortAge;
  sArrow = (sList.indexOf(sCol) > -1)? (sortDirs[sCol]? upArr : dnArr) : "";
  colHead = document.getElementById('sortAge');
  colHead.innerHTML = "Age " + sArrow;

  sCol = AdminCommentObject.SortEntryId;
  sArrow = (sList.indexOf(sCol) > -1)? (sortDirs[sCol]? upArr : dnArr) : "";
  colHead = document.getElementById('sortEntryId');
  colHead.innerHTML = "Entry " + sArrow;

  sCol = AdminCommentObject.SortAlias;
  sArrow = (sList.indexOf(sCol) > -1)? (sortDirs[sCol]? upArr : dnArr) : "";
  colHead = document.getElementById('sortAlias');
  colHead.innerHTML = "Alias " + sArrow;

  sCol = AdminCommentObject.SortUserId;
  sArrow = (sList.indexOf(sCol) > -1)? (sortDirs[sCol]? upArr : dnArr) : "";
  colHead = document.getElementById('sortUserId');
  colHead.innerHTML = "UserID " + sArrow;

  sCol = AdminCommentObject.SortSnippet;
  sArrow = (sList.indexOf(sCol) > -1)? (sortDirs[sCol]? upArr : dnArr) : "";
  colHead = document.getElementById('sortSnippet');
  colHead.innerHTML = "Preview " + sArrow;
}

function dump(header) {
  var sb = header + "\n";
  for (var i=0, c; c=commentArr[i]; i++) {
    sb += '  Comment #' + (i+1) + ': ' + c + "\n";
  }
  GM_log(sb);
}

function toMinutes(age) {
  if (age == '') return 0;
  var bits = age.split(' ');
  var mins = 0;
  for (i in bits) {
    var a = parseInt(bits[i]);
    if (bits[i].indexOf('w') >= 0) {
      a *= 7 * 24 * 60;
    }
    else if (bits[i].indexOf('d') >= 0) {
      a *= 24 * 60;
    }
    else if (bits[i].indexOf('h') >= 0) {
      a *= 60;
    }
    mins += a;
  }
  return mins;
}

function shrink(txt) {
  return txt.replace(/\s{2,}/g, ' ').replace(/^ | $/g, '');
}

/*------------------------------------------------------------------------------
  load GM cookie that contains user preferences and parse settings
*/
function readSettings() {
  var prevSortCols = [0]; // age sort by default
  var prevSortDirs = [true, true,  true, true, true, true]; // ascending by default
  var prevAgeLimit = 0; // no age limit by default
  var prevToggle   = '*'; // show all by default
  var prevGrouping = true; // group by default

  var cookKey = GM_getValue("SEAdminOptions");
  if (cookKey) {
    var optArr = cookKey.split("|");
    for (i=0; option=optArr[i]; i++) {
      var optEntry = option.split(":");
      switch(optEntry[0]) {
        case 'sc': // sort columns
          prevSortCols = optEntry[1].split(',');
          // change strings to ints
          for (var j=0;j<prevSortCols.length; j++) {
            prevSortCols[j] = parseInt(prevSortCols[j], 10); 
          }
          break;
        case 'sd': // sort directions
          prevSortDirs = optEntry[1].split(',');
          // change strings to booleans
          for (var j=0;j<prevSortDirs.length; j++) {
            prevSortDirs[j] = prevSortDirs[j] == 'true'; 
          }
        case 'al': // age limit
          prevAgeLimit = parseInt(optEntry[1], 10);
          break;
        case 'ds': // top/neg/all disp setting
          prevToggle = optEntry[1];
          break;
        case 'eg': // entry grouping
          prevGrouping = (optEntry[1]!='false'); // defaults to true if error
          break;
        default:
          break;
      }
    }
  }
  AdminCommentObject.sortCols = prevSortCols;
  sortDirs  = prevSortDirs;
  ageLimit  = prevAgeLimit;
  toggleState  = prevToggle;
  AdminCommentObject.groupEntries = prevGrouping;
}

/*------------------------------------------------------------------------------
  save preferences
*/
function saveSettings() {
  var options = [];
  options.push('sc:'+ AdminCommentObject.sortCols.join(',') );
  options.push('sd:'+ sortDirs.join(',') );
  options.push('al:'+ ageLimit );
  options.push('ds:'+ toggleState );
  options.push('eg:'+ AdminCommentObject.groupEntries );
  var cookKey = options.join('|');
  GM_setValue("SEAdminOptions", cookKey);
}


/*==============================================================================
  BEGIN MAIN
------------------------------------------------------------------------------*/
// the center column division contains post and replies content
var mainDiv      = document.getElementById('Layer1');
with (mainDiv.style) {
  minWidth = (width)? width : '';
  width = '';
}

var myUserId     = getMyId();
var commentTable = mainDiv.getElementsByTagName('table')[1];
var commentArr   = new Array();
readCommentTable();
doSort(-1, false);

//  var len = commentArr.length;
//  dump(len + " unsorted comments");
//  commentArr.sort(byEntryId); dump(len + " EntryID-sorted comments");
//  commentArr.sort(byAlias  ); dump(len + " Alias-sorted comments");
//  commentArr.sort(byUserId ); dump(len + " UserID-sorted comments");
//  commentArr.sort(byAge    ); dump(len + " Age-sorted comments");

/*------------------------------------------------------------------------------
  END MAIN
==============================================================================*/
})();// end anonymous function wrapper
