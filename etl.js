var _       = require('lodash');
var request = require('request');
var async = require('async');
var colors = require('colors');
var pg = require('pg').native;
var moment = require('moment');
var fs = require('fs');

var nconf   = require('nconf');
nconf.argv();
nconf.env();
nconf.file('config.json', __dirname + '/config.json');

var helpers = require(__dirname + '/lib/helpers.js');


// set some globals
var data = {};
var transformedData = {};
var requests = [];
var queries = [];
var supplementalErrors = [];
var change;

// note - the username and password will be set as environemnt variables
// override them via --username and --password for local testing
var logger = nconf.get('logger');
var max = nconf.get('max_results');

var username = nconf.get('username');
var password = nconf.get('password');

var authorization = username && password && helpers.encode(username, password);
// setting this variable via nconf allows the helper function to reference it
nconf.set('authorization', authorization);

if (!authorization) {
  console.log('Error: Missing credentials for authorization header.');
  process.exit(1);
}

// remove the oldest log (-3 days) to make room for new logs
// example log file: logs/10-25-2016.txt
var oldestStamp = moment().subtract('3', 'days').format('MM-DD-YYYY');
var oldestLog = __dirname + '/logs/' + oldestStamp + '.txt';

if (fs.existsSync(oldestLog)) {
  fs.unlinkSync(oldestLog);
}

// set the new log file in nconf for use in the log functions
var today = moment().format('MM-DD-YYYY');
var logFile = __dirname + '/logs/' + today + '.txt';
nconf.set('log_file', logFile);

/********************************************************************************/
/********************************************************************************/
/********************************************************************************/
/********************************************************************************/
/********************************************************************************/


// execute the ETL

async.series([
  requestFeasibilities,
  requestSupplementalData,
  validateSupplementalData,
  transformData,
  loadData
  ], function (error, results) {
    // script breaking errors
    if (error) {
      console.log(error);
      process.exit(1);
    }
});


/********************************************************************************/
/********************************************************************************/
/********************************************************************************/
/********************************************************************************/
/********************************************************************************/


/*
* Function: requestFeasibilities
* Parameters: callback (Function)
* Usage: Execute the request to retrieve all relevant feasibility reviews.
*/
function requestFeasibilities (callback) {
  var api = nconf.get('jira_api_endpoint');
  var version = nconf.get('jira_api_version');
  var jql = nconf.get('jira_api_jql');

  var uri = api + '/rest/api/' + version + '/search';
  
  var body = {
    jql: jql
  };

  if (max) {
    body.maxResults = max;
  }

  request({
    uri: uri,
    method: 'POST',
    body: body,
    json: true,
    headers: {
      "Authorization" : authorization
    }
  }, function(error, response, json) {
      helpers.networkLog(response);

      if (error) {
        return callback('Error: Error triggered via JIRA API response. Details: ' + error, null);
      } else if (response.statusCode !== 200) {
        return callback('Error: Status code not 200 OK. Status code: ' + response.statusCode, null);
      }

      _.each(json.issues, function (issue, index) {
        
        // grab the data we can from the initial response      
        data[issue.key] = {
          // general info
          'summary': issue.fields.summary,
          'reviewer': issue.fields.customfield_12501 && issue.fields.customfield_12501.name,
          'reporter': issue.fields.reporter.name,
          'project': issue.fields.project.key,

          // dates
          'created': issue.fields.created,
          'resolution date': issue.fields.resolutiondate,

          // estimates
          'design estimate': issue.fields.customfield_14604,
          'development estimate': issue.fields.customfield_14600,
          'development pad estimate': issue.fields.customfield_14607,
          'pe estimate': issue.fields.customfield_14603,
          'pm estimate': issue.fields.customfield_14602,
          'qa estimate': issue.fields.customfield_14601,

          // links
          'links': null
        };
        

        // Queue up the requests for more data..

        // 1. Feasibility worklogs
        requests.push(helpers.requestFactory({
          'type': 'worklog',
          'grandparent': null,
          'parent': issue.key
        }));

        // 2. Issue links
        _.each(issue.fields.issuelinks, function (link) {
          
          // we only care about feasibility links
          if (link.type && link.type.id === '10211') {
            // reverse the null default since we now know we have valid links
            data[issue.key].links = data[issue.key].links || {};

            var details = link.outwardIssue || link.inwardIssue;

            data[issue.key].links[details.key] = {
              'summary': details.fields.summary,
              'status': details.fields.status.name,
              'issuetype': details.fields.issuetype.name
            };

            // 3. Worklogs of the linked issues
            requests.push(helpers.requestFactory({
              'type': 'worklog',
              'grandparent': issue.key,
              'parent': details.key
            }));

            // 4. Misc. details for the linked issue
            requests.push(helpers.requestFactory({
              'type': 'issue',
              'grandparent': issue.key,
              'parent': details.key
            }));
          }    
        });
      });
  
      return callback(null, null);
  });
}


/*
* Function: requestSupplementalData
* Parameters: callback (Function)
* Usage: Request, in parallel, all the supplemental data we need for the feasibility reviews.
* This function also attaches supplemental data to the global `data` object.
*/
function requestSupplementalData (callback) {
  // setting a limit here to avoid thrashing the JIRA API
  async.parallelLimit(requests, 5, function (error, results) {
    // attach the data from the requests to the large dataset
    _.each(results, function (supplement) {
      if (supplement.error) {
          // push supplemental data errors to be validated in the next function in the series
          supplementalErrors.push(supplement);
      } else if (supplement.type === 'worklog') {
          var worklogData = helpers.parseWorklog(supplement.data.worklogs);
          
          // figure out where to attach the worklogs
          if (supplement.grandparent) {
            data[supplement.grandparent].links[supplement.parent].worklog = worklogData;
          } else {
            data[supplement.parent].worklog = worklogData;
          }
      } else if (supplement.type === 'issue') {
          // issue (safely) assumes it's a linked issue and has a valid parent and grandparent
          data[supplement.grandparent].links[supplement.parent] = _.merge(data[supplement.grandparent].links[supplement.parent], {
            // general info
            'reviewer': supplement.data.fields.customfield_12501 && supplement.data.fields.customfield_12501.name,
            'reporter': supplement.data.fields.reporter.name,
            'project': supplement.data.fields.project.key,

            // dates
            'created': supplement.data.fields.created,
            'resolution': supplement.data.fields.resolution && supplement.data.fields.resolution.name,
            'resolution date': supplement.data.fields.resolutiondate,
          });

      }
    });
    
    return callback(null, null);
  });
}


/*
* Function: validateSupplementalData
* Parameters: callback (Function)
* Usage: Some supplemental requests could fail while others succeed. This function will analyze the failures
* and determine how to proceed. 
*/
function validateSupplementalData (callback) {
  if (supplementalErrors.length) {
    var percentage;
    var threshold = parseInt(nconf.get('supplemental_threshold_percentage'), 10);
    var oldLength = _.keys(data).length;
    var uris = '';

    _.each(supplementalErrors, function (supplement) {
      // delete the feasibility data associated with the errorneous supplemental data
      var parent = supplement.grandparent || supplement.parent;
      delete data[parent];

      // add uri to the string to log for later
      uris += supplement.error.uri + ' - ' + supplement.error.status + '\n';
    });

    // if the data set has been reduced by anything greater than or equal to the 'error_threshold', throw an error and abort
    var newLength = _.keys(data).length;
    change = helpers.percentChangeAbs(oldLength, newLength);
        
    if (change >= threshold) {
      var error = 'Error: Excessive supplemental data requests failed.'
      + 'Percent failure: ' + change + '. Error Threshold: ' + threshold + '\nFailed Requests: \n'.red.bold + uris;
      
      return callback(error, null);
    }
  }

  return callback(null, null);
}

/*
* Function: transformData
* Parameters: callback (Function)
* Usage: Transform the data in `data` to be in a format that can be easily imported into the Fesaibility Database.
*/
function transformData (callback) {
  _.each(data, function (feasibility, key) {
    // copy the majority of the data over
    transformedData[key] = _.cloneDeep(feasibility);
    
    // timespent and estimate conversion
    transformedData[key]['feasibility timespent'] = transformedData[key].worklog && transformedData[key].worklog.total;
    transformedData[key]['linked timespent'] = transformedData[key].links && helpers.linkedTimespent(transformedData[key].links);
    transformedData[key]['feasibility estimate total'] = helpers.feasibilityEstimateTransform(transformedData[key]);

    // compress nested structures for storage
    transformedData[key].worklog = transformedData[key].worklog && JSON.stringify(transformedData[key].worklog);
    transformedData[key].links = feasibility.links && JSON.stringify(transformedData[key].links);

    // calculate the delta (feasibilityEstimateTransform must run first)
    helpers.delta(transformedData[key]);
  });

  return callback(null, null);
}

/*
* Function: loadData
* Parameters: callback (Function)
* Usage: Load transformed data into the database.
*/
function loadData (callback) {
  var conString = nconf.get('constring');
  var client = new pg.Client(conString);
  var insert;
  var config;

  client.connect(function (connectionError) {
    if (connectionError) {
      return callback(connectionError, null);
    }

    // prepare the query functions
    _.each(transformedData, function (feasibility, key) {
      // this is a prepared statement despite the fact it doesn't look like one
      // https://github.com/brianc/node-postgres/wiki/Prepared-Statements
      insert = {
        name: 'feasibility_insert',
        text: 'INSERT INTO v_feasibility (key, summary, reviewer_name, reporter_name, project_name, created, resolution_date, design_estimate, development_estimate, development_pad_estimate, pe_estimate, pm_estimate, qa_estimate, issue_links, worklog, feasibility_timespent, issue_links_timespent, feasibility_estimate_total, delta, delta_percentage) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20);',
        values: [
          key,
          feasibility.summary,
          feasibility.reviewer,
          feasibility.reporter,
          feasibility.project,
          feasibility.created,
          feasibility['resolution date'],
          feasibility['design estimate'],
          feasibility['development estimate'],
          feasibility['development pad estimate'],
          feasibility['pe estimate'],
          feasibility['pm estimate'],
          feasibility['qa estimate'],
          feasibility['links'],
          feasibility['worklog'],
          feasibility['feasibility timespent'],
          feasibility['linked timespent'],
          feasibility['feasibility estimate total'],
          feasibility['delta'],
          feasibility['delta_percentage']
        ]
      };

      config = {
        client: client,
        query: insert
      }

      queries.push(helpers.queryFactory(config));
    });


    // execute the queries
    async.parallel(queries, function (error, results) {
      // close the client once we are done
      client.end();

      return callback(error, null);
    });
  });
}
