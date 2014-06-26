var $ = require('jquery');
var CodeMirror = require('codemirror');
var io = require('socket.io-client');

var Growl = require('./growl');

// Include modes
require('codemirror/mode/javascript/javascript');
require('codemirror/mode/htmlmixed/htmlmixed');
require('codemirror/mode/clike/clike');
require('codemirror/mode/ruby/ruby');
require('codemirror/mode/python/python');

// Session log
var log = [];

// Selections
var marks = [];

// Questions placeholders
var questions = [
  {
    name: 'Interview',
    code: '\n',
    video: false
  }
];

// Operations to transmit
var editorOperations = [
  '+input',
  '+delete',
  'cut',
  'paste',
  'undo',
  'redo'
];

var resourceDescription = window.location.search.slice(1) || 'interviewer@interviewer';

var parts = resourceDescription.split('@');

// Set user
var ourUser = parts[0] || 'interviewer';

// Set room
var room = parts[1] || 'interviewer';

// Set ondomready
var startTime = 0;

// Browser detection, uhg
var isFirefox = navigator.userAgent.toLowerCase().indexOf('firefox') > -1;

var keyframeChangedSinceLastReport = false;

var currentKeyframe = null;

window.getLog = function() { return log };

function init() {
  startTime = getTime();

  var editor = CodeMirror.fromTextArea(document.getElementById('cc-Code'), {
    dragDrop: false, // Too hard to sync between clients
    mode: 'javascript',
    lineNumbers: true,
    indentUnit: 2,
    theme: 'ambiance',
    viewportMargin: Infinity
  });

  track('sessionStarted');
  track('collaborator.joined', { user: ourUser });
  track('showQuestion', {
    user: ourUser,
    question: questions[0],
    questionIndex: 0
  });

  storeKeyframe();
  setInterval(function() {
    if (keyframeChangedSinceLastReport) {
      track('keyframe', currentKeyframe);
      keyframeChangedSinceLastReport = false;
    }
  }, 1000);

  var socket = io.connect();

  socket.on('refresh', function(data) {
    var body = data.body;
    editor.setValue(body);

    track('editor.refreshed', {
      user: data.user,
      body: body
    });

    questions[0].code = editor.getValue();
  });

  socket.on('change', function(data) {
    var change = data.change;
    editor.replaceRange(change.text, change.from, change.to);

    track('editor.changed', {
      user: data.user,
      change: change
    });

    questions[0].code = editor.getValue();
    storeKeyframe();
  });

  socket.on('selection', function(data) {
    var selections = data.selections;
    highlightSelections(selections);

    track('editor.selection', {
      user: data.user,
      selections: selections
    });
  });

  socket.on('hello', function(data) {
    new Growl(data.user+' has joined.');
    track('collaborator.joined', { user: data.user });
  });

  socket.emit('hello', {
    user: ourUser,
    room: room
  });

  socket.on('changeLanguage', function(data) {
    setLanguage(data.language, data.user);
  });

  editor.on('change', function(i, op) {
    if (editorOperations.indexOf(op.origin) !== -1) {
      // Send the change event for rebroadcast
      socket.emit('change', {
        user: ourUser,
        change: op
      });

      // Send the whole contents to the server
      socket.emit('refresh', {
        user: ourUser,
        body: editor.getValue()
      });

      track('editor.changed', {
        user: ourUser,
        change: op
      });

      questions[0].code = editor.getValue();
      storeKeyframe();
    }
  });

  editor.on('cursorActivity', function() {
    var selections = editor.doc.listSelections();

    socket.emit('selection', {
      user: ourUser,
      selections: selections
    });

    track('editor.selection', {
      user: ourUser,
      selections: selections
    });
  });

  $(document.body).on('click', '.js-downloadSession', handleDownloadSession);

  // Handle language changes
  $('#cc-Language').on('change', function(event) {
    var language = event.currentTarget.value;

    setLanguage(language, ourUser);

    socket.emit('changeLanguage', {
      user: ourUser,
      language: language
    });
  });

  function setLanguage(language, user) {
    // Update dropdown
    $('#cc-Language').val(language);

    // Switch editor the laguage
    editor.setOption('mode', language);

    // Store language on the question
    // Hardcoded
    questions[0].language = language;

    track('editor.languageChange', {
      user: user,
      language: language
    });

    storeKeyframe();
  }

  function storeKeyframe() {
    keyframeChangedSinceLastReport = true;
    currentKeyframe = {
      question: questions[0],
      questionIndex: 0
    };
  }

  function highlightSelections(selections) {
    // Clear previous marks
    while (marks.length) {
      marks.pop().clear();
    }

    // Highlight each selection
    for (var i = 0; i < selections.length; i++) {
      var selection = selections[i];
      if (selection.head.line === selection.anchor.line && selection.head.ch === selection.anchor.ch) {
        // Cursor
        var el = document.createElement('span');
        el.className = 'cc-Cursor';
        marks.push(editor.doc.setBookmark(selection.head, { widget: el }));
      }
      else {
        // Selection

        // Correct order
        var start = selection.head;
        var end = selection.anchor;
        if (selection.head.line > selection.anchor.line || (selection.head.line === selection.anchor.line && selection.head.ch > selection.anchor.ch)) {
          start = selection.anchor;
          end = selection.head;
        }

        marks.push(editor.doc.markText(start, end, { className: 'cc-Highlight' }));
      }
    }
  }

  function handleDownloadSession(event) {
    event.preventDefault();
    downloadSession();
  }

  function downloadSession() {
    track('sessionEnded');

    var session = {
      log: log,
      questions: questions,
      name: room,
      duration: getTime()
    };

    // Download the interview log first, ignoring any video.stopped events
    // This is to work around a Chrome issue where the download name is not supported
    // Create a blob from the session
    var blob = new Blob(JSON.stringify(session).split(''));

    // Convert the blob to an object URL
    var objectURL = URL.createObjectURL(blob);

    // Download the session JSON
    downloadURL(objectURL, 'interview.json');
  }

  function downloadURL(url, fileName) {
    // Check for anchor with download ability
    var downloadAttrSupported = !isFirefox && ('download' in document.createElement('a'));

    if (downloadAttrSupported) {
      var a = document.createElement('a');
      a.download = fileName;
      a.href = url;
      a.target = '_blank';
      a.click();
    }
    else {
      // Open the image in a popup
      window.open(url, fileName);
    }
  }

  function track(eventName, data) {
    var obj = {
      time: getTime(),
      event: eventName
    };

    // Log events as originating from self by default
    if (typeof data !== 'undefined') {
      var user = data.user;
      data.user = undefined;

      // Copy peer property from data object
      obj.data = JSON.parse(JSON.stringify(data)); // @todo keep as JSON for @perf?
      obj.user = user;
    }
    else {
      obj.user = ourUser;
    }

    log.push(obj);

    // console.log('%s: %s', eventName, JSON.stringify(obj));
  }

  function getTime() {
    return Date.now() - startTime;
  }
}

$(init);
