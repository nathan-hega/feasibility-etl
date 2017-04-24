var request = require('request');
var nconf = require('nconf');
var _ = require('lodash');
var colors = require('colors');
var moment = require('moment');
var fs = require('fs');

var api = nconf.get('jira_api_endpoint');
var version = nconf.get('jira_api_version');

var logger = nconf.get('logger');

module.exports.encode = encode;
module.exports.requestFactory = requestFactory;
module.exports.parseWorklog = parseWorklog;
module.exports.networkLog = networkLog;
module.exports.queryLog = queryLog;
module.exports.percentChangeAbs = percentChangeAbs;
module.exports.linkedTimespent = linkedTimespent;
module.exports.feasibilityEstimateTransform = feasibilityEstimateTransform;
module.exports.delta = delta;
module.exports.queryFactory = queryFactory;


/*
* Function: encode
* Parameters: username (string), password (string)
* Usage: Encode the username and password to use for basic access authentication with the JIRA API.
*/
function encode(username, password) {
  var authorization = "Basic " + new Buffer(username + ":" + password).toString('base64');
  return authorization;
}

/*
* Function: requestFactory
* Parameters: config (Object)
* Usage: Uses closures to create functions that request supplemental data from the JIRA API. Closures 
* enable us to map the supplemental data back to the original feasibility ticket.
*/
function requestFactory (config) {
  // authorization is set in etl.js
  var authorization = nconf.get('authorization');
  var uri;

  if (config.type === 'worklog') {
    uri = api + '/rest/api/' + version + '/issue/' + config.parent + '/worklog';
  
  } else if (config.type === 'issue') {
    uri = api + '/rest/api/' + version + '/issue/' + config.parent;
  }

  return function (callback) {
    request({
      uri: uri,
      json: true,
      headers: {
        "Authorization" : authorization
      }
    }, function(error, response, json) {
      networkLog(response);

      // handle error logging
      if (error || response.statusCode !== 200) {
        var err = {
          uri: uri,
          status: response.statusCode
        };

        if (error) {
          err.details = error;
        } else if (response.statusCode !== 200) {
          err.details = 'Error: status code not 200 OK. Status code: ' + response.statusCode;
        }
      }

        

      // add the resulting data to the config object.
      var state = _.merge(config, {
        data: json,
        error: err || null
      });
      
      return callback(error, state);
    });
  };
}

/*
* Function: queryFactory
* Parameters: config (Object)
* Usage: Uses closures to create functions that execute queries to insert into the DB.
*/
function queryFactory (config) {
  return function (callback) {
    config.client.query(config.query, function (error, results) {
      queryLog(config.query, error);
      
      // we don't want to halt the execution of all queries if an error triggers
      results = results || {};
      results.error = error;

      return callback(null, results);
    });
  };
}

/*
* Function: parseWorklog
* Parameters: worklogs (Array)
* Usage: Consume a worklog array from the JIRA API and reformat the data to contain only what we need.
*/
function parseWorklog (worklogs) {
  if (worklogs.length === 0) {
    return null;
  }

  var parsedLogs = {
    worklog: [],
    total: 0
  };
 
  _.each(worklogs, function (worklog) {
    parsedLogs.worklog.push({
      'author': worklog.author.name,
      'timespent': worklog.timeSpentSeconds,
      'unit': 'seconds',
      'id': worklog.id
    });

    parsedLogs.total += worklog.timeSpentSeconds;
  });

  return parsedLogs;
}

/*
* Function: networkLog
* Parameters: response (from request callback)
* Usage: Logs network output to a file. Log the network requests to console if desired (`logger` option).
*/
function networkLog (response) {
  // "log_file" set in etl.js
  var logFile = nconf.get('log_file');
  var status = parseInt(response.statusCode, 10);
  var href = response.request.uri.href;
  var timestamp = moment().format('dddd, MMMM Do YYYY, h:mm:ss a');

  // log this to a file without the colors
  var logOutput = '---------------------------\n'   + 
                  'timestamp: ' + timestamp + '\n'  + 
                  'URL: ' + href + '\n'             + 
                  'status: ' + status + '\n'        + 
                  '---------------------------\n';
  fs.appendFileSync(logFile, logOutput);

  if (logger) {
    var coloredStatus = status;
    // color code statuses
    switch (true) {
      
      case (status === 200):
        coloredStatus = (coloredStatus + ' - OK').bold.green;
        break;
      
      case (status >= 300 && status <= 399):
        coloredStatus = (coloredStatus + ' - WARNING').bold.yellow;
        break;

      case (status >= 400 && status <= 599):
        coloredStatus = (coloredStatus + ' - ERROR').bold.red;
        break;
    };
    
    console.log(timestamp + '    ' + href.cyan + '    ' + coloredStatus);
  }
}

/*
* Function: queryLog
* Parameters: response (from request callback)
* Usage: Logs query output to a file. Log the query requests to console if desired (`logger` option).
*/
function queryLog (query, error) {
  var logFile = nconf.get('log_file');
  var text = query.text;
  var success = error ? false : true;
  var timestamp = moment().format('dddd, MMMM Do YYYY, h:mm:ss a');

  // log this to a file without the colors
  var logOutput = '---------------------------\n'   + 
                  'timestamp: ' + timestamp + '\n'  + 
                  'query: ' + text + '\n' + 
                  'success: ' + success + '\n';

  if (success === false) {
    logOutput += 'error: ' + (error.messagePrimary || 'messagePrimary does not exist, unable to log error details') + '\n';
  }
  logOutput += '---------------------------\n';
  fs.appendFileSync(logFile, logOutput);

  // output log details to the console if the user desires
  if (logger) {
    var coloredText = query.text;
    // Hardcoded for now, I'd like a dynamic way to do this so if the columns change, we can adjust with them.. the value highlighting IS dynamic so we should be able to match here..
    coloredText = coloredText.replace('key, summary, reviewer_name, reporter_name, project_name, created, resolution_date, design_estimate, development_estimate, development_pad_estimate, pe_estimate, pm_estimate, qa_estimate, issue_links, worklog, feasibility_timespent, issue_links_timespent, feasibility_estimate_total, delta, delta_percentage', 'key, summary, reviewer_name, reporter_name, project_name, created, resolution_date, design_estimate, development_estimate, development_pad_estimate, pe_estimate, pm_estimate, qa_estimate, issue_links, worklog, feasibility_timespent, issue_links_timespent, feasibility_estimate_total, delta, delta_percentage'.cyan)
    // iterate through the query.text and do some replace statements for each $\d
    // add color coding as well to make it easier to read.
    _.each(query.values, function (value, index) {
      var needle = '$' + (index + 1).toString();
      var replace = (value + '');
      replace = replace.magenta;

      coloredText = coloredText.replace(needle, replace);
    });

    console.log('---------------------------');
    console.log('timestamp: '.bold + timestamp);
    console.log('query: '.bold + coloredText);
    console.log('success: '.bold + (success ? 'true'.green.bold : 'false'.red.bold));
    if (success === false) {
      console.log('error: '.bold + error.messagePrimary || 'messagePrimary does not exist, unable to log error details');
    }
    console.log('---------------------------');
  }
}

/*
* Function: percentChangeAbs
* Parameters: oldValue (int), newValue (int)
* Usage: Calculate absolute percent change between two values.
*/
function percentChangeAbs (oldValue, newValue) {
  oldValue = parseInt(oldValue, 10);
  newValue = parseInt(newValue, 10);
  
  var result = Math.abs((newValue - oldValue)/(Math.abs(oldValue)) * 100);  
  return result;
}

/*
* Function: linkedTimespent
* Parameters: links (collection of issue links)
* Usage: Calculate the total timespent for all the linked issues.
*/
function linkedTimespent (links) {
  var total = 0;
  _.each(links, function (link, key) {
    if (link.worklog) {
      total += parseFloat(link.worklog.total, 10);
    }
  });

  return total;
}

/*
* Function: feasibilityEstimateTransform
* Parameters: feasibility (a feasibility review object)
* Usage: Calculate the total feasibility estimate and return the result.
* note - this function also converts the estimate fields from hours to seconds
*/
function feasibilityEstimateTransform (feasibility) {
  var total = 0;
  var hours;
  var estimateKeys = [
    'design estimate',
    'development estimate',
    'development pad estimate',
    'pe estimate',
    'pm estimate',
    'qa estimate'
  ];

  _.each(feasibility, function (data, key) {
    if (estimateKeys.indexOf(key) !== -1) {
      var seconds = parseFloat(data || 0, 10) * 3600;

      // set the estimate fields to seconds while we are iterating through the fields
      feasibility[key] = seconds;

      // convert hours to seconds (some estimates could be null)
      total += seconds;
    }
  });

  return total;
}

/*
* Function: percentDifference
* Parameters: value1 (int), value2 (int)
* Usage: Calculate the percent difference between two values.
*/
function percentDifference (value1, value2) {
  value1 = parseFloat(value1, 10);
  value2 = parseFloat(value2, 10);
  
  var result = ((value1 - value2)/((value1 + value2)/2))*100;  
  return result;
}

/*
* Function: delta
* Parameters: feasibility (a transformed feasibility review object)
* Usage: Calculate the delta between estimate and actual fields.
*/
function delta (feasibility) {
  var estimated = feasibility['feasibility estimate total'];
  var actual = feasibility['linked timespent'];


  if (!estimated || !actual) {
    feasibility['delta'] = null;
    feasibility['delta_percentage'] = null;
  } else {
    feasibility['delta'] = estimated - actual;
    feasibility['delta_percentage'] = percentDifference(estimated, actual);
  }
}
